#!/usr/bin/env python3
"""
Seed synthetic daily process reports and KPI facts for the DiPGOS demo database.

The script is idempotent – existing reports are reused via the UNIQUE constraint
on (process_id, report_date). It generates at least 1,000 reports/items spread
across the last ~90 days and then runs dipgos.ingest_daily_kpis to populate
the rollup tables.
"""
from __future__ import annotations

import random
import argparse
from datetime import date, timedelta
from pathlib import Path
from typing import List, Tuple

import psycopg
from psycopg.types.json import Json

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "dipgos-backend"

import sys

sys.path.append(str(BACKEND_DIR))

from app.db import initialize_database, open_pool, close_pool, pool  # type: ignore  # noqa: E402


RANDOM = random.Random(42)
TARGET_REPORTS = 1000
DAYS_RANGE = 90

ACTIVITIES = [
    "excavation",
    "tunneling",
    "structure",
    "quality",
    "schedule",
    "finance",
    "other",
]


def _fetch_scope_tree() -> List[Tuple[str, str, str, str]]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
            cur.execute(
                """
                SELECT project_id, contract_id, sow_id, process_id
                FROM dipgos.v_scope_tree
                """
            )
            return cur.fetchall()


def _generate_schedule(target: int, scope_rows: List[Tuple[str, str, str, str]]) -> List[Tuple[str, str, str, str, date]]:
    today = date.today()
    picks: Dict[Tuple[str, date], Tuple[str, str, str, str, date]] = {}
    attempts = 0
    max_attempts = target * 6

    while len(picks) < target and attempts < max_attempts:
        project_id, contract_id, sow_id, process_id = RANDOM.choice(scope_rows)
        report_date = today - timedelta(days=RANDOM.randint(0, DAYS_RANGE))
        key = (process_id, report_date)
        if key not in picks:
            picks[key] = (project_id, contract_id, sow_id, process_id, report_date)
        attempts += 1
    return list(picks.values())


def _random_metrics(activity: str, designed_total: float) -> Dict[str, float]:
    cumulative_planned = min(designed_total, RANDOM.uniform(0.3, 0.95) * designed_total)
    cumulative_actual = min(designed_total, cumulative_planned * RANDOM.uniform(0.8, 1.05))
    completion_pct = min(100.0, (cumulative_actual / designed_total) * 100.0 if designed_total else RANDOM.uniform(10, 90))
    produced_day = RANDOM.uniform(0, 400)
    produced_night = RANDOM.uniform(0, 250)
    produced_total = produced_day + produced_night
    remaining = max(0.0, designed_total - cumulative_actual)

    cost_planned = RANDOM.uniform(1000, 50000)
    cost_actual = cost_planned * RANDOM.uniform(0.8, 1.2)

    quality_conf = min(100.0, RANDOM.uniform(70, 99))
    schedule_progress = min(100.0, RANDOM.uniform(50, 98))
    spi = round(RANDOM.uniform(0.8, 1.15), 2)
    ev = cost_planned * RANDOM.uniform(0.7, 1.1)
    pv = cost_planned

    extra = {
        "ncr_open": int(RANDOM.uniform(0, 5)),
        "ncr_closed": int(RANDOM.uniform(0, 5)),
        "qaor_open": int(RANDOM.uniform(0, 4)),
        "qaor_closed": int(RANDOM.uniform(0, 4)),
        "quality_conf": quality_conf,
        "schedule_progress_pct": schedule_progress,
        "spi": spi,
        "ev": ev,
        "pv": pv,
    }

    if activity == "finance":
        extra["qaor_open"] = 0
        extra["qaor_closed"] = 0

    return {
        "designed_total": designed_total,
        "produced_day": produced_day,
        "produced_night": produced_night,
        "produced_total": produced_total,
        "cumulative_actual": cumulative_actual,
        "cumulative_planned": cumulative_planned,
        "remaining": remaining,
        "completion_pct": completion_pct,
        "cost_actual": cost_actual,
        "cost_planned": cost_planned,
        "extra": extra,
    }


def seed_reports(schedule: List[Tuple[str, str, str, str, date]]) -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
            for project_id, contract_id, sow_id, process_id, report_date in schedule:
                # Debug
                # print('report insert', report_date, project_id, contract_id, sow_id, process_id)
                cur.execute(
                    """
                    INSERT INTO dipgos.process_daily_report (report_date, project_id, contract_id, sow_id, process_id, notes)
                    VALUES (%s, %s, %s, %s, %s, 'seed')
                    ON CONFLICT (process_id, report_date) DO UPDATE
                      SET notes = EXCLUDED.notes
                    RETURNING id
                    """,
                    (report_date, project_id, contract_id, sow_id, process_id),
                )
                (report_id,) = cur.fetchone()

                activity_label = RANDOM.choice(ACTIVITIES)
                metrics = _random_metrics(activity_label, RANDOM.uniform(5000, 30000))
                unit = 'currency' if activity_label == 'finance' else 'm3'

                activity_id = 1
                sql = """
                    INSERT INTO dipgos.process_daily_item (
                        report_id, activity, metric_label, unit,
                        designed_total, produced_day, produced_night, produced_total,
                        cumulative_actual, cumulative_planned, remaining, completion_pct,
                        cost_actual, cost_planned, extra
                    )
                    VALUES (
                        %s,
                        (SELECT a FROM dipgos.activity a WHERE a.activity_id = %s),
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s
                    )
                    ON CONFLICT DO NOTHING
                    """
                # Debug print once to verify SQL
                # print(sql)
                cur.execute(
                    sql,
                    (
                        report_id,
                        activity_id,
                        "Daily Progress",
                        unit,
                        metrics["designed_total"],
                        metrics["produced_day"],
                        metrics["produced_night"],
                        metrics["produced_total"],
                        metrics["cumulative_actual"],
                        metrics["cumulative_planned"],
                        metrics["remaining"],
                        metrics["completion_pct"],
                        metrics["cost_actual"],
                        metrics["cost_planned"],
                        Json(metrics["extra"] | {"activity_label": activity_label}),
                    ),
                )
        conn.commit()


def ingest_range() -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
            cur.execute("SELECT MIN(report_date), MAX(report_date) FROM dipgos.process_daily_report")
            min_date, max_date = cur.fetchone()
            if min_date and max_date:
                cur.execute("SELECT dipgos.ingest_daily_kpis(%s, %s)", (min_date, max_date))
                cur.execute("SELECT dipgos.refresh_kpi_rollups()")
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args()
    open_pool()
    try:
        initialize_database()
        if args.inspect:
            from psycopg.rows import dict_row
            with pool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cur:
                    cur.execute("SELECT t.typtype, t.typcategory, pg_typeof(activity) AS activity_type FROM information_schema.columns c JOIN pg_type t ON t.typname = c.udt_name WHERE c.table_schema='dipgos' AND c.table_name='process_daily_item' AND c.column_name='activity' LIMIT 1")
                    print(cur.fetchone())
            return

        scope_rows = _fetch_scope_tree()
        if not scope_rows:
            print("No scope tree rows found; ensure contracts and SOW data are seeded.")
            return

        schedule = _generate_schedule(TARGET_REPORTS, scope_rows)
        seed_reports(schedule)
        ingest_range()

        print(f"Seeded at least {len(schedule)} process_daily_report rows and ingested KPIs.")
    finally:
        close_pool()


if __name__ == "__main__":
    main()
