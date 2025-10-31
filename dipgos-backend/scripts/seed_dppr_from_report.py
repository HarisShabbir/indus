from __future__ import annotations

import argparse
import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable, Optional

from app.db import close_pool, open_pool, pool

DEFAULT_REPORT = """
1 - Excavation (Quantities in m3)
Location/Structure          Designed   Day 0   Night   Total/day   Excavated   Remain    Completion
DTs & Power Intake Structures  2,136,492    0       0       0           1,550,990   585,502   73%
RB Power Tunnel Outlets        1,113,905    0       0       0           1,099,135    14,770   99%
Dam Right Abutment             2,520,686    0       0       0           1,478,855  1,042,010  59%
Dam Foundation Pit*            2,157,680    0    5,847   13,599        1,692,284   465,396  78%
LB Flushing & Power Outlet       439,529    0       0       0             313,124   126,405  71%
LB Flushing Tunnel & Power Intake 1,452,197 483   432      914         1,243,921   208,276  86%
"""

TARGET_NAME = "dam foundation pit"
DEFAULT_ENTITY_CODE = "mw-01-dam-pit"
DEFAULT_PROJECT_CODE = "diamer-basha"
DEFAULT_CONTRACT_CODE = "mw-01-main-dam"
DEFAULT_SOW_CODE = "mw-01-rcc"
COST_PER_CUBIC_M = 115.0
RANDOM_SEED = 42


def _coerce_number(value: str) -> float:
    value = value.strip().replace(",", "")
    if not value or value.lower() in {"na", "n/a", "--"}:
        return 0.0
    value = value.replace("%", "")
    try:
        return float(value)
    except ValueError:  # pragma: no cover - defensive
        return 0.0


@dataclass
class ReportRow:
    name: str
    designed: float
    total_day: float
    cumulative_excavated: float
    remaining: float
    completion_pct: float


def parse_daily_report(text: str) -> list[ReportRow]:
    rows: list[ReportRow] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Split on two-or-more spaces to capture columns broadly
        parts = re.split(r"\s{2,}", line)
        if len(parts) < 7:
            continue
        name = parts[0].strip().lower()
        designed = _coerce_number(parts[1])
        total_day = _coerce_number(parts[3])
        excavated = _coerce_number(parts[4 if len(parts) == 7 else 5])
        remaining_idx = 5 if len(parts) == 7 else 6
        completion_idx = 6 if len(parts) == 7 else 7
        remaining = _coerce_number(parts[remaining_idx])
        completion = _coerce_number(parts[completion_idx])
        rows.append(
            ReportRow(
                name=name,
                designed=designed,
                total_day=total_day,
                cumulative_excavated=excavated,
                remaining=remaining,
                completion_pct=completion,
            )
        )
    return rows


@dataclass
class SyntheticDay:
    report_date: date
    qty_done: float
    qty_planned: float
    ev: float
    pv: float
    ac: float


def generate_time_series(
    designed_total: float,
    final_excavated: float,
    end_date: date,
    months: int,
    rng: random.Random,
) -> list[SyntheticDay]:
    end_date = end_date
    start_date = end_date - timedelta(days=months * 30)
    total_days = (end_date - start_date).days + 1

    cumulative = 0.0
    series: list[SyntheticDay] = []
    planned_increment = designed_total / max(total_days, 1)

    for offset in range(total_days):
        current_date = start_date + timedelta(days=offset)
        days_left = total_days - offset
        remaining_volume = max(final_excavated - cumulative, 0.0)
        base_step = remaining_volume / max(days_left, 1)
        noise = base_step * 0.25 * (rng.random() - 0.5)
        daily_progress = max(0.0, base_step + noise)

        if offset == total_days - 1:
            # Force exact final value on the last day
            daily_progress = remaining_volume

        cumulative += daily_progress
        planned_cumulative = min(designed_total, planned_increment * (offset + 1))

        ev_value = cumulative * COST_PER_CUBIC_M
        pv_value = planned_cumulative * COST_PER_CUBIC_M
        ac_value = cumulative * COST_PER_CUBIC_M * (0.92 + 0.12 * rng.random())

        series.append(
            SyntheticDay(
                report_date=current_date,
                qty_done=cumulative,
                qty_planned=planned_cumulative,
                ev=ev_value,
                pv=pv_value,
                ac=ac_value,
            )
        )

    return series


def upsert_series(entity_code: str, series: Iterable[SyntheticDay]) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT entity_id FROM dipgos.entities WHERE code = %s",
                (entity_code,),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Entity with code {entity_code!r} not found. Run migrations first.")
            entity_id = row[0]

            for entry in series:
                spi = None if entry.pv in (0, None) else entry.ev / entry.pv if entry.pv else None
                cpi = None if entry.ac in (0, None) else entry.ev / entry.ac if entry.ac else None
                percent_complete = None if entry.pv in (0, None) else entry.ev / entry.pv if entry.pv else None

                cur.execute(
                    """
                    INSERT INTO dipgos.dppr
                        (id, entity_id, report_date, qty_done, qty_planned, ev, pv, ac, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (entity_id, report_date)
                    DO UPDATE SET
                        qty_done = EXCLUDED.qty_done,
                        qty_planned = EXCLUDED.qty_planned,
                        ev = EXCLUDED.ev,
                        pv = EXCLUDED.pv,
                        ac = EXCLUDED.ac,
                        notes = EXCLUDED.notes
                    """,
                    (
                        uuid.uuid4(),
                        entity_id,
                        entry.report_date,
                        entry.qty_done,
                        entry.qty_planned,
                        entry.ev,
                        entry.pv,
                        entry.ac,
                        "Synthetic DPPR ingestion",
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO dipgos.evm_metrics (entity_id, period_date, ev, pv, ac, spi, cpi, percent_complete)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (entity_id, period_date)
                    DO UPDATE SET
                        ev = EXCLUDED.ev,
                        pv = EXCLUDED.pv,
                        ac = EXCLUDED.ac,
                        spi = EXCLUDED.spi,
                        cpi = EXCLUDED.cpi,
                        percent_complete = EXCLUDED.percent_complete
                    """,
                    (
                        entity_id,
                        entry.report_date,
                        entry.ev,
                        entry.pv,
                        entry.ac,
                        spi,
                        cpi,
                        percent_complete,
                    ),
                )
        conn.commit()


def load_report_text(path: Optional[Path]) -> str:
    if path is None:
        return DEFAULT_REPORT
    return path.read_text(encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DPPR data by parsing a Diamer Basha daily report.")
    parser.add_argument("--report", type=Path, help="Path to a plain-text daily report extracted from the PDF.")
    parser.add_argument("--entity", default=DEFAULT_ENTITY_CODE, help="Process code to target (default: mw-01-dam-pit).")
    parser.add_argument("--months", type=int, default=6, help="Number of months of history to synthesize (default: 6).")
    parser.add_argument(
        "--as-of",
        type=lambda value: date.fromisoformat(value),
        default=date.today(),
        help="Report date to treat as the current snapshot (ISO date).",
    )
    args = parser.parse_args()

    text = load_report_text(args.report)
    rows = parse_daily_report(text)

    target_row = next((row for row in rows if TARGET_NAME in row.name), None)
    if not target_row:
        raise SystemExit(f"Could not locate '{TARGET_NAME}' row in supplied report.")

    rng = random.Random(RANDOM_SEED)
    series = generate_time_series(
        designed_total=target_row.designed,
        final_excavated=target_row.cumulative_excavated,
        end_date=args.as_of,
        months=args.months,
        rng=rng,
    )

    open_pool()
    try:
        upsert_series(args.entity, series)
        print(f"Seeded {len(series)} DPPR rows for entity {args.entity} through {args.as_of}.")
    finally:
        close_pool()


if __name__ == "__main__":
    main()
