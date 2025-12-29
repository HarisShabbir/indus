from __future__ import annotations

import argparse
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, List, Sequence

from psycopg import connect
from psycopg.types.json import Json

from app.config import settings


@dataclass(frozen=True)
class ScopeProfile:
    project_id: str
    project_name: str
    contract_id: str
    contract_name: str
    sow_id: str
    sow_name: str
    process_id: str
    process_name: str
    location: str


SCOPE_PROFILES: dict[str, list[ScopeProfile]] = {
    "diamer-basha": [
        ScopeProfile(
            project_id="diamer-basha",
            project_name="Diamer Basha Dam Program",
            contract_id="mw-01-main-dam",
            contract_name="MW-01 Main Dam",
            sow_id="mw-01-rcc",
            sow_name="RCC Dam Works",
            process_id="mw-01-dam-pit",
            process_name="Dam Pit Excavation",
            location="Dam pit staging pad",
        ),
        ScopeProfile(
            project_id="diamer-basha",
            project_name="Diamer Basha Dam Program",
            contract_id="mw-01-main-dam",
            contract_name="MW-01 Main Dam",
            sow_id="mw-01-struct",
            sow_name="Structural Works",
            process_id="mw-01-formwork",
            process_name="Formwork & Rebar",
            location="Formwork yard",
        ),
        ScopeProfile(
            project_id="diamer-basha",
            project_name="Diamer Basha Dam Program",
            contract_id="mw-02-powerhouse",
            contract_name="MW-02 Powerhouse",
            sow_id="mw-02-power",
            sow_name="Powerhouse Works",
            process_id="mw-02-electro",
            process_name="Electromechanical Install",
            location="Powerhouse service bay",
        ),
    ],
    "mohmand-dam": [
        ScopeProfile(
            project_id="mohmand-dam",
            project_name="Mohmand Dam Hydropower Project",
            contract_id="cw-01-civil-works",
            contract_name="CW-01 Civil Works",
            sow_id="cw-01-diversion",
            sow_name="Diversion Tunnel Works",
            process_id="cw-01-tunnel-exc",
            process_name="Tunnel Excavation",
            location="Diversion tunnel face",
        ),
        ScopeProfile(
            project_id="mohmand-dam",
            project_name="Mohmand Dam Hydropower Project",
            contract_id="cw-01-civil-works",
            contract_name="CW-01 Civil Works",
            sow_id="cw-01-embankment",
            sow_name="Embankment Construction",
            process_id="cw-01-fill",
            process_name="Zonated Fill Placement",
            location="Fill zone A3",
        ),
    ],
    "dasu-hpp": [
        ScopeProfile(
            project_id="dasu-hpp",
            project_name="Dasu Hydropower Project",
            contract_id="mw-01-main-works",
            contract_name="MW-01 Main Works",
            sow_id="mw-01-river-diversion",
            sow_name="River Diversion",
            process_id="mw-01-diversion",
            process_name="Diversion Channel",
            location="River diversion cofferdam",
        ),
        ScopeProfile(
            project_id="dasu-hpp",
            project_name="Dasu Hydropower Project",
            contract_id="mw-01-main-works",
            contract_name="MW-01 Main Works",
            sow_id="mw-01-spillway",
            sow_name="Spillway Construction",
            process_id="mw-01-gates",
            process_name="Radial Gate Fabrication",
            location="Steel fabrication shed",
        ),
    ],
}


@dataclass
class AlarmContent:
    category: str
    severity: str
    title: str
    activity: str
    owner: str
    root_cause: str
    recommendation: str
    metadata: dict
    items: list[tuple[str, str, str]]
    location: str


def build_schedule_alert(scope: ScopeProfile, rng: random.Random) -> AlarmContent:
    slip_hours = round(rng.uniform(1.5, 6.5), 1)
    severity = "critical" if slip_hours >= 4.5 else "major"
    crews_blocked = rng.randint(1, 4)
    metadata = {
        "summary": f"{scope.process_name} running {slip_hours}h behind plan.",
        "signals": {
            "type": "schedule_variance",
            "value": slip_hours,
            "unit": "h",
            "threshold": 1.0,
        },
        "impact": {
            "schedule_slip_hours": slip_hours,
            "crews_blocked": crews_blocked,
        },
    }
    items = [
        ("process", "Process", scope.process_name),
        ("schedule", "Variance", f"{slip_hours}h late"),
        ("impact", "Crews waiting", f"{crews_blocked} workfronts blocked"),
    ]
    return AlarmContent(
        category="Schedule",
        severity=severity,
        title=f"{scope.process_name} slip vs plan",
        activity=f"{scope.sow_name} · Sequence {rng.randint(11, 38)}",
        owner="Construction Control Room",
        root_cause="Crew turnover and pump downtime stretched the placement window.",
        recommendation="Re-sequence lifts, pull standby pump, extend QC coverage.",
        metadata=metadata,
        items=items,
        location=scope.location,
    )


def build_sensor_alert(scope: ScopeProfile, rng: random.Random) -> AlarmContent:
    drift = round(rng.uniform(3.0, 11.0), 1)
    severity = "major" if drift >= 6 else "minor"
    metadata = {
        "summary": f"Sensor drift of {drift}σ detected on {scope.process_name}.",
        "signals": {
            "type": "vibration",
            "value": drift,
            "unit": "σ",
            "threshold": 2.5,
        },
        "impact": {
            "inspection_required": True,
            "panels_flagged": rng.randint(2, 6),
        },
    }
    items = [
        ("sensor", "Channel", f"VT-{rng.randint(200, 240)}"),
        ("signal", "Drift", f"{drift}σ vs baseline"),
        ("action", "Watch", "Assign technician to re-zero mesh"),
    ]
    return AlarmContent(
        category="Sensor",
        severity=severity,
        title=f"Telemetry drift on {scope.process_name}",
        activity="Field instrumentation mesh",
        owner="Field Instrumentation",
        root_cause="Differential temps introduced sustained bias into the piezo mesh.",
        recommendation="Re-zero affected nodes and validate trending at the control room.",
        metadata=metadata,
        items=items,
        location=f"{scope.location} sensors",
    )


def build_safety_alert(scope: ScopeProfile, rng: random.Random) -> AlarmContent:
    incidents = rng.randint(0, 2)
    severity = "critical" if incidents else "major"
    stop_minutes = rng.randint(25, 90)
    metadata = {
        "summary": f"Safety stand-down triggered – {stop_minutes}min lost time.",
        "impact": {
            "stop_minutes": stop_minutes,
            "incidents": incidents,
        },
        "signals": {
            "type": "safety_stop",
            "value": stop_minutes,
            "unit": "min",
            "threshold": 15,
        },
    }
    items = [
        ("safety", "Event", "Proximity alarm at lifting zone"),
        ("action", "Response", "Crew stood down, HSE engaged"),
        ("follow_up", "Next", "Audit rigging plan before restart"),
    ]
    return AlarmContent(
        category="Safety",
        severity=severity,
        title="Safety stand-down at lifting zone",
        activity=f"HSE sweep · {scope.contract_name}",
        owner="Site HSE Lead",
        root_cause="Spotter lost visual contact when gantry slewed into the exclusion zone.",
        recommendation="Refresh toolbox talk, add secondary spotter for congested lifts.",
        metadata=metadata,
        items=items,
        location=f"{scope.location} lift zone",
    )


def build_daor_alert(scope: ScopeProfile, rng: random.Random) -> AlarmContent:
    backlog_days = round(rng.uniform(1.0, 4.2), 1)
    severity = "major" if backlog_days < 3 else "critical"
    open_pos = rng.randint(2, 5)
    metadata = {
        "summary": f"{open_pos} DAOR packages aging {backlog_days}d.",
        "impact": {
            "backlog_days": backlog_days,
            "open_pos": open_pos,
        },
        "signals": {
            "type": "daor_backlog",
            "value": backlog_days,
            "unit": "d",
            "threshold": 1.0,
        },
    }
    items = [
        ("supply", "Open DAOR", f"{open_pos} packages"),
        ("schedule", "Risk window", f"{backlog_days}d aging"),
        ("action", "Next step", "Escalate to procurement war room"),
    ]
    return AlarmContent(
        category="DAOR",
        severity=severity,
        title="DAOR backlog trending high",
        activity=f"Procurement · {scope.contract_name}",
        owner="SCM War Room",
        root_cause="Counter-signed DAORs stalled waiting for vendor compliance updates.",
        recommendation="Clear compliance holds and secure alternate logistics slot.",
        metadata=metadata,
        items=items,
        location="Procurement control tower",
    )


def build_ucr_alert(scope: ScopeProfile, rng: random.Random) -> AlarmContent:
    exposure = round(rng.uniform(2.8, 6.0), 1)
    severity = "critical"
    metadata = {
        "summary": f"Unplanned change request exposes ${exposure}M.",
        "impact": {
            "cost_exposure_musd": exposure,
            "affected_units": rng.randint(3, 7),
        },
        "signals": {
            "type": "ucr",
            "value": exposure,
            "unit": "MUSD",
            "threshold": 1.5,
        },
    }
    items = [
        ("scope", "Change scope", f"Additional {rng.randint(2, 4)} pours in {scope.sow_name}"),
        ("cost", "Exposure", f"${exposure}M at risk"),
        ("action", "Required", "Route through change board"),
    ]
    return AlarmContent(
        category="UCR",
        severity=severity,
        title="Unplanned change request raised",
        activity=f"Change board · {scope.project_name}",
        owner="Change Control Board",
        root_cause="Design tweak to flood protection walls requires additional pour sequence.",
        recommendation="Confirm funding split, then baseline the revised quantities.",
        metadata=metadata,
        items=items,
        location="Project control room",
    )


ALARM_BUILDERS: Sequence[Callable[[ScopeProfile, random.Random], AlarmContent]] = (
    build_schedule_alert,
    build_sensor_alert,
    build_safety_alert,
    build_daor_alert,
    build_ucr_alert,
)


@dataclass
class AlertRecord:
    id: str
    project_id: str
    title: str
    location: str
    activity: str
    severity: str
    category: str
    status: str
    owner: str
    root_cause: str
    recommendation: str
    due_at: datetime | None
    acknowledged_at: datetime | None
    cleared_at: datetime | None
    metadata: dict
    raised_at: datetime
    items: list[tuple[str, str, str]]


def choose_status(ts: datetime, now: datetime, rng: random.Random) -> tuple[str, datetime | None, datetime | None]:
    age_hours = (now - ts).total_seconds() / 3600
    if age_hours < 6:
        status = rng.choice(["open", "acknowledged"])
    elif age_hours < 24:
        status = rng.choice(["open", "acknowledged", "in_progress"])
    elif age_hours < 48:
        status = rng.choice(["acknowledged", "in_progress", "mitigated"])
    else:
        status = rng.choice(["mitigated", "closed"])

    ack_at = None
    cleared_at = None
    if status != "open":
        ack_at = ts + timedelta(hours=rng.uniform(0.5, 6))
    if status in {"mitigated", "closed"}:
        cleared_at = ack_at + timedelta(hours=rng.uniform(2, 18)) if ack_at else ts + timedelta(hours=8)
    return status, ack_at, cleared_at


def attach_scope_metadata(metadata: dict, scope: ScopeProfile, seed_tag: str) -> dict:
    enriched = dict(metadata)
    enriched["scope"] = {
        "project": {"code": scope.project_id, "name": scope.project_name},
        "contract": {"code": scope.contract_id, "name": scope.contract_name},
        "sow": {"code": scope.sow_id, "name": scope.sow_name},
        "process": {"code": scope.process_id, "name": scope.process_name},
    }
    enriched["historic_seed"] = seed_tag
    enriched["seed_tag"] = seed_tag
    return enriched


def build_alert_records(
    scope_profiles: Sequence[ScopeProfile],
    days: int,
    per_day: int,
    now: datetime,
    seed_tag: str,
    rng: random.Random,
) -> List[AlertRecord]:
    records: list[AlertRecord] = []
    for day in range(days):
        day_start = (now - timedelta(days=day)).replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(per_day):
            minute_offset = rng.randint(0, (24 * 60) - 1)
            ts = day_start + timedelta(minutes=minute_offset)
            if ts > now:
                ts = now - timedelta(minutes=rng.randint(5, 120))
            scope = rng.choice(scope_profiles)
            builder = rng.choice(ALARM_BUILDERS)
            content = builder(scope, rng)
            status, ack_at, cleared_at = choose_status(ts, now, rng)
            due_at = ts + timedelta(hours=rng.uniform(4, 24))
            metadata = attach_scope_metadata(content.metadata, scope, seed_tag)
            record = AlertRecord(
                id=str(uuid.uuid4()),
                project_id=scope.project_id,
                title=content.title,
                location=content.location,
                activity=content.activity,
                severity=content.severity,
                category=content.category,
                status=status,
                owner=content.owner,
                root_cause=content.root_cause,
                recommendation=content.recommendation,
                due_at=due_at,
                acknowledged_at=ack_at,
                cleared_at=cleared_at,
                metadata=metadata,
                raised_at=ts,
                items=content.items,
            )
            records.append(record)
    return records


def persist_records(records: Sequence[AlertRecord], seed_tag: str, dry_run: bool = False) -> None:
    if not records:
        print("No records to persist.")
        return

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
            if dry_run:
                print(f"[dry-run] Would delete existing alerts tagged {seed_tag}")
            else:
                cur.execute(
                    """
                    DELETE FROM alert_items
                    WHERE alert_id IN (
                        SELECT id FROM alerts WHERE metadata->>'seed_tag' = %s
                    )
                    """,
                    (seed_tag,),
                )
                cur.execute("DELETE FROM alerts WHERE metadata->>'seed_tag' = %s", (seed_tag,))

            insert_sql = """
                INSERT INTO alerts (
                    id, project_id, title, location, activity, severity, category,
                    status, owner, root_cause, recommendation, due_at,
                    acknowledged_at, cleared_at, metadata, raised_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            item_sql = """
                INSERT INTO alert_items (alert_id, item_type, label, detail)
                VALUES (%s, %s, %s, %s)
            """

            if dry_run:
                print(f"[dry-run] Would insert {len(records)} alerts.")
                return

            for record in records:
                cur.execute(
                    insert_sql,
                    (
                        record.id,
                        record.project_id,
                        record.title,
                        record.location,
                        record.activity,
                        record.severity,
                        record.category,
                        record.status,
                        record.owner,
                        record.root_cause,
                        record.recommendation,
                        record.due_at,
                        record.acknowledged_at,
                        record.cleared_at,
                        Json(record.metadata),
                        record.raised_at,
                    ),
                )
                cur.executemany(
                    item_sql,
                    [(record.id, item_type, label, detail) for item_type, label, detail in record.items],
                )
        conn.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed synthetic historical alarm data.")
    parser.add_argument("--project-id", default="diamer-basha", help="Project code to seed (default: diamer-basha).")
    parser.add_argument("--days", type=int, default=7, help="How many trailing days to populate.")
    parser.add_argument("--per-day", type=int, default=18, help="Alerts per day (default: 18).")
    parser.add_argument("--seed", type=int, default=None, help="Seed for deterministic output.")
    parser.add_argument("--dry-run", action="store_true", help="Preview actions without writing to the database.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    profiles = SCOPE_PROFILES.get(args.project_id)
    if not profiles:
        raise SystemExit(f"No scope profiles configured for project '{args.project_id}'.")
    if args.days <= 0 or args.per_day <= 0:
        raise SystemExit("Days and per-day counts must be positive.")

    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc)
    seed_tag = f"alarm-history::{args.project_id}"

    records = build_alert_records(
        scope_profiles=profiles,
        days=args.days,
        per_day=args.per_day,
        now=now,
        seed_tag=seed_tag,
        rng=rng,
    )
    records.sort(key=lambda record: record.raised_at)
    persist_records(records, seed_tag=seed_tag, dry_run=args.dry_run)
    print(f"Seeded {len(records)} alerts for {args.project_id} (tag={seed_tag}).")


if __name__ == "__main__":
    main()
