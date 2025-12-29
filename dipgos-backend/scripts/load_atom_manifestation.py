from __future__ import annotations

import argparse
import csv
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from psycopg import connect

DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@dataclass
class ManifestationRow:
    vendor: str
    machine_type: str
    model: str
    attribute_name: str
    attribute_value: str | None
    units: str | None
    validation: str | None

    @classmethod
    def from_csv(cls, row: dict[str, str]) -> "ManifestationRow":
        return cls(
            vendor=row["vendor"].strip(),
            machine_type=row["machine_type"].strip(),
            model=row["model"].strip(),
            attribute_name=row["attribute_name"].strip(),
            attribute_value=row.get("attribute_value", "").strip() or None,
            units=row.get("units", "").strip() or None,
            validation=row.get("validation", "").strip() or None,
        )


def load_rows(path: Path) -> list[ManifestationRow]:
    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [ManifestationRow.from_csv(row) for row in reader]


def upsert_rows(database_url: str, tenant_id: uuid.UUID, rows: Iterable[ManifestationRow]) -> None:
    statement = """
        INSERT INTO dipgos.atom_manifestation (
            id,
            tenant_id,
            vendor,
            machine_type,
            model,
            attribute_name,
            attribute_value,
            units,
            validation
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (tenant_id, vendor, machine_type, model, attribute_name)
        DO UPDATE SET
          attribute_value = EXCLUDED.attribute_value,
          units = EXCLUDED.units,
          validation = EXCLUDED.validation,
          created_at = NOW()
    """
    with connect(database_url) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(
                    statement,
                    (
                        uuid.uuid4(),
                        tenant_id,
                        row.vendor,
                        row.machine_type,
                        row.model,
                        row.attribute_name,
                        row.attribute_value,
                        row.units,
                        row.validation,
                    ),
                )
        conn.commit()


def resolve_database_url(explicit: str | None) -> str:
    if explicit:
        return explicit
    from app.config import settings

    return settings.database_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Load atom manifestation attributes from CSV.")
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "atom_manifestation.csv",
        help="Path to the manifestation CSV (defaults to packaged dataset).",
    )
    parser.add_argument("--tenant-id", type=uuid.UUID, default=DEFAULT_TENANT_ID, help="Tenant UUID to associate with the data.")
    parser.add_argument("--database-url", dest="database_url", help="Postgres connection string (defaults to app config).")
    args = parser.parse_args()

    rows = load_rows(args.source)
    if not rows:
        raise SystemExit("No manifestation rows found in CSV.")

    database_url = resolve_database_url(args.database_url)
    upsert_rows(database_url, args.tenant_id, rows)
    print(f"Upserted {len(rows)} manifestation attributes for tenant {args.tenant_id}.")


if __name__ == "__main__":
    main()
