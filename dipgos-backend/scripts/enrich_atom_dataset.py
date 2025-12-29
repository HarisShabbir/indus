from __future__ import annotations

import argparse
import json
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from psycopg import connect

TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
PROJECT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
CONTRACT_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
SOW_RCC_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
SOW_STEEL_ID = uuid.UUID("33333333-3333-3333-3333-333333333334")
SOW_EMBANK_ID = uuid.UUID("33333333-3333-3333-3333-333333333335")
PROC_RCC_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
PROC_STEEL_ERECTION_ID = uuid.UUID("44444444-4444-4444-4444-444444444445")
PROC_STEEL_WELD_ID = uuid.UUID("44444444-4444-4444-4444-444444444446")
PROC_EMBANK_FILL_ID = uuid.UUID("44444444-4444-4444-4444-444444444447")
PROC_EMBANK_COMPACT_ID = uuid.UUID("44444444-4444-4444-4444-444444444448")
CONTRACTOR_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

GROUP_SEEDS = [
    ("b1000000-0000-0000-0000-000000000001", "machinery", "Tower Cranes", None),
    ("b1000000-0000-0000-0000-000000000002", "machinery", "Shotcrete Rigs", None),
    ("b1000000-0000-0000-0000-000000000010", "consumables", "Concrete Admixtures", None),
    ("b1000000-0000-0000-0000-000000000011", "consumables", "Aggregate Lots", None),
    ("b1000000-0000-0000-0000-000000000020", "tools", "Precision Instruments", None),
    ("b1000000-0000-0000-0000-000000000030", "equipment", "Mobile Batching", None),
    ("b1000000-0000-0000-0000-000000000040", "systems", "IoT Sensor Nets", None),
    ("b1000000-0000-0000-0000-000000000050", "technologies", "Reality Capture", None),
    ("b1000000-0000-0000-0000-000000000060", "financials", "Risk Allowances", None),
    ("b1000000-0000-0000-0000-000000000070", "actors", "Concrete Works Crews", "b0000000-0000-0000-0000-000000000003"),
]

TYPE_SEEDS = [
    ("machinery", "c1000000-0000-0000-0000-000000000001", "b1000000-0000-0000-0000-000000000001", "Tower Crane TC-45", {"reach_m": 45, "capacity_t": 18}, (CONTRACT_ID,)),
    ("machinery", "c1000000-0000-0000-0000-000000000002", "b1000000-0000-0000-0000-000000000002", "Shotcrete Rig SR-70", {"pump_rate_m3h": 70}, (SOW_STEEL_ID,)),
    ("consumables", "c1000000-0000-0000-0000-000000000010", "b1000000-0000-0000-0000-000000000010", "Superplasticizer Lot", {"batch_liters": 1200}, (SOW_RCC_ID,)),
    ("consumables", "c1000000-0000-0000-0000-000000000011", "b1000000-0000-0000-0000-000000000011", "Crushed Aggregate Lot", {"gradation": "three-quarter minus"}, (SOW_EMBANK_ID,)),
    ("tools", "c1000000-0000-0000-0000-000000000020", "b1000000-0000-0000-0000-000000000020", "Laser Level Set", {"accuracy_mm": 1.5}, (SOW_EMBANK_ID, SOW_STEEL_ID)),
    ("equipment", "c1000000-0000-0000-0000-000000000030", "b1000000-0000-0000-0000-000000000030", "Mobile Batch Plant MP-60", {"output_m3h": 60}, (CONTRACT_ID,)),
    ("systems", "c1000000-0000-0000-0000-000000000040", "b1000000-0000-0000-0000-000000000040", "Vibration Sensor Mesh", {"nodes": 24}, (CONTRACT_ID,)),
    ("technologies", "c1000000-0000-0000-0000-000000000050", "b1000000-0000-0000-0000-000000000050", "LiDAR Capture Kit", {"range_m": 300}, (CONTRACT_ID,)),
    ("financials", "c1000000-0000-0000-0000-000000000060", "b1000000-0000-0000-0000-000000000060", "Equipment Contingency", {"currency": "USD"}, (CONTRACT_ID,)),
    ("actors", "c1000000-0000-0000-0000-000000000070", "b1000000-0000-0000-0000-000000000070", "Concrete Pour Crew", {"crew_size": 8, "shift_hours": 10}, (SOW_RCC_ID, SOW_STEEL_ID)),
]

PROCESS_CHOICES = [
    PROC_RCC_ID,
    PROC_STEEL_ERECTION_ID,
    PROC_STEEL_WELD_ID,
    PROC_EMBANK_FILL_ID,
    PROC_EMBANK_COMPACT_ID,
]

JOURNEY_TEMPLATES = {
    "active": ("warehouse", "in_transit", "on_site", "engaged"),
    "planned": ("warehouse", "in_transit", "on_site"),
    "completed": ("warehouse", "in_transit", "on_site", "engaged"),
}

CATEGORY_COST_RANGES = {
    "machinery": (250_000, 1_350_000),
    "equipment": (80_000, 420_000),
    "tools": (900, 7_500),
    "consumables": (1_200, 20_000),
    "systems": (12_000, 95_000),
    "technologies": (18_000, 160_000),
    "financials": (50_000, 250_000),
    "actors": (18_000, 75_000),
    "materials": (8_000, 45_000),
}

CATEGORY_VENDORS = {
    "machinery": ["Caterpillar Inc.", "John Deere", "Komatsu Ltd.", "Hitachi Construction Machinery"],
    "tools": ["Hilti", "Bosch Professional", "Milwaukee Tool", "Makita"],
    "equipment": ["Putzmeister", "Cemen Tech", "Wirtgen Group"],
    "systems": ["Trimble", "Topcon", "Honeywell"],
    "technologies": ["Leica Geosystems", "Bentley Systems", "Matterport"],
    "consumables": ["Sika AG", "BASF Master Builders", "Mapei"],
    "financials": ["Capital Projects Fund", "Equipment Lease Pool"],
    "actors": ["Nevada Heavy Equipment Rentals", "Rio Grande Construction Staffing", "Blue Lake Equipment Services"],
    "materials": ["Holcim Aggregates", "Martin Marietta"],
}

CATEGORY_OWNERS = [
    "Nevada Heavy Equipment Rentals",
    "Frontier Earthworks JV",
    "High Sierra Logistics",
    "HydroBuild Operations",
    "SiteWorks Partners",
]


@dataclass
class AtomSeed:
    atom_id: uuid.UUID
    type_id: uuid.UUID
    name: str
    unit: str
    home_entity_id: uuid.UUID
    spec: dict
    contractor_id: Optional[uuid.UUID]


@dataclass
class DeploymentSeed:
    deployment_id: uuid.UUID
    atom_id: uuid.UUID
    process_id: uuid.UUID
    start_ts: datetime
    end_ts: Optional[datetime]
    status: str


@dataclass
class JourneySeed:
    atom_id: uuid.UUID
    status: str
    ts: datetime


def decide_unit(category: str) -> str:
    return {
        "machinery": "unit",
        "tools": "kit",
        "equipment": "unit",
        "actors": "crew",
        "financials": "budget",
        "systems": "set",
        "technologies": "set",
        "consumables": "lot",
    }.get(category, "unit")


def build_atoms(count: int, rng: random.Random) -> list[AtomSeed]:
    atoms: list[AtomSeed] = []
    for index in range(count):
        category, type_id_str, _, base_name, base_spec, home_options = TYPE_SEEDS[index % len(TYPE_SEEDS)]
        atom_id = uuid.uuid4()
        suffix = f"{index + 1:04d}"
        name = f"{base_name} {suffix}"
        spec = dict(base_spec)

        if category == "actors":
            spec["competency"] = rng.choice(["high", "medium", "low"])
        elif category == "machinery":
            spec["fleet_id"] = f"FLT-{suffix}"
        elif category == "equipment":
            spec["status"] = rng.choice(["mobilized", "commissioned", "standby"])
        elif category == "consumables":
            spec["batch"] = f"LOT-{suffix}"

        vendor_choices = CATEGORY_VENDORS.get(category, ["Project Supply Consortium"])
        spec["vendor"] = rng.choice(vendor_choices)
        spec["owner"] = rng.choice(CATEGORY_OWNERS)
        min_cost, max_cost = CATEGORY_COST_RANGES.get(category, (1_000, 10_000))
        spec["unit_cost"] = round(rng.uniform(min_cost, max_cost), 2)
        spec["currency"] = "USD"

        atoms.append(
            AtomSeed(
                atom_id=atom_id,
                type_id=uuid.UUID(type_id_str),
                name=name,
                unit=decide_unit(category),
                home_entity_id=rng.choice(home_options),
                spec=spec,
                contractor_id=CONTRACTOR_ID if category in {"machinery", "equipment", "tools", "actors"} else None,
            )
        )
    return atoms


def build_deployments(atoms: Iterable[AtomSeed], rng: random.Random, active_ratio: float) -> tuple[list[DeploymentSeed], list[JourneySeed]]:
    deployments: list[DeploymentSeed] = []
    journeys: list[JourneySeed] = []
    now = datetime.now(timezone.utc)

    for atom in atoms:
        if rng.random() > active_ratio:
            continue
        status = rng.choice(["active", "active", "active", "planned", "completed"])
        start_ts = now - timedelta(days=rng.randint(5, 60))
        end_ts = None
        if status == "completed":
            end_ts = start_ts + timedelta(days=rng.randint(5, 18))
        deployments.append(
            DeploymentSeed(
                deployment_id=uuid.uuid4(),
                atom_id=atom.atom_id,
                process_id=rng.choice(PROCESS_CHOICES),
                start_ts=start_ts,
                end_ts=end_ts,
                status="active" if status == "planned" else status,
            )
        )
        steps = JOURNEY_TEMPLATES[status]
        for offset, step in enumerate(steps):
            journeys.append(
                JourneySeed(
                    atom_id=atom.atom_id,
                    status=step,
                    ts=start_ts - timedelta(days=len(steps) - offset),
                )
            )
    return deployments, journeys


def seed_groups_and_types(cur) -> None:
    for group_id, category, name, parent in GROUP_SEEDS:
        cur.execute(
            """
            INSERT INTO dipgos.atom_groups (id, category, name, parent_id, tenant_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                parent_id = EXCLUDED.parent_id
            """,
            (uuid.UUID(group_id), category, name, uuid.UUID(parent) if parent else None, TENANT_ID),
        )
    for category, type_id, group_id, name, spec, _ in TYPE_SEEDS:
        cur.execute(
            """
            INSERT INTO dipgos.atom_types (id, group_id, category, name, spec, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                spec = EXCLUDED.spec
            """,
            (uuid.UUID(type_id), uuid.UUID(group_id), category, name, json.dumps(spec), TENANT_ID),
        )


def seed_atoms(cur, atoms: Iterable[AtomSeed]) -> None:
    for atom in atoms:
        cur.execute(
            """
            INSERT INTO dipgos.atoms (id, atom_type_id, name, unit, contractor_id, home_entity_id, spec, tenant_id, active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                spec = EXCLUDED.spec,
                home_entity_id = EXCLUDED.home_entity_id,
                contractor_id = EXCLUDED.contractor_id,
                active = TRUE
            """,
            (
                atom.atom_id,
                atom.type_id,
                atom.name,
                atom.unit,
                atom.contractor_id,
                atom.home_entity_id,
                json.dumps(atom.spec),
                TENANT_ID,
            ),
        )


def seed_deployments(cur, deployments: Iterable[DeploymentSeed]) -> None:
    for deployment in deployments:
        cur.execute(
            """
            INSERT INTO dipgos.atom_deployments (id, atom_id, process_id, start_ts, end_ts, status, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET process_id = EXCLUDED.process_id,
                start_ts = EXCLUDED.start_ts,
                end_ts = EXCLUDED.end_ts,
                status = EXCLUDED.status
            """,
            (
                deployment.deployment_id,
                deployment.atom_id,
                deployment.process_id,
                deployment.start_ts,
                deployment.end_ts,
                deployment.status,
                TENANT_ID,
            ),
        )


def seed_journeys(cur, journeys: Iterable[JourneySeed]) -> None:
    for journey in journeys:
        cur.execute(
            """
            INSERT INTO dipgos.atom_journey (atom_id, status, ts)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (journey.atom_id, journey.status, journey.ts),
        )


def resolve_database_url(explicit: Optional[str]) -> str:
    if explicit:
        return explicit
    from app.config import settings

    return settings.database_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich Atom Manager dataset with synthetic atoms/deployments.")
    parser.add_argument("--database-url", dest="database_url", help="Postgres connection string (defaults to app config)")
    parser.add_argument("--atoms", type=int, default=1000, help="Target number of atom records to upsert (default: 1000)")
    parser.add_argument("--active-ratio", type=float, default=0.75, help="Fraction of atoms that receive deployments (default: 0.75)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility (default: 42)")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    atoms = build_atoms(args.atoms, rng)
    deployments, journeys = build_deployments(atoms, rng, args.active_ratio)

    database_url = resolve_database_url(args.database_url)
    with connect(database_url) as conn:
        with conn.cursor() as cur:
            seed_groups_and_types(cur)
            seed_atoms(cur, atoms)
            seed_deployments(cur, deployments)
            seed_journeys(cur, journeys)
        conn.commit()

    print("Atom dataset enrichment complete.")
    print(f"Atoms upserted: {len(atoms)}")
    print(f"Deployments upserted: {len(deployments)}")
    print(f"Journey events inserted: {len(journeys)}")


if __name__ == "__main__":
    main()
