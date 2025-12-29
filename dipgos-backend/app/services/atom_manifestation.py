from __future__ import annotations

from datetime import datetime, timezone

from psycopg.rows import dict_row

from ..db import pool
from ..models import AtomManifestationAttribute, AtomManifestationResponse
from .atom_manager import _normalise_tenant, _parse_uuid


def get_manifestation_attributes(
    tenant_id: str,
    vendor: str,
    machine_type: str,
    model: str,
) -> AtomManifestationResponse:
    tenant_hint = _normalise_tenant(tenant_id)
    tenant_uuid = _parse_uuid(tenant_hint)

    where_clauses = [
        "vendor = %s",
        "machine_type = %s",
        "model = %s",
    ]
    params = [vendor, machine_type, model]

    if tenant_uuid:
        where_clauses.insert(0, "tenant_id = %s")
        params.insert(0, tenant_uuid)
    elif tenant_hint not in ("default", "public"):
        where_clauses.insert(0, "tenant_id::text = %s")
        params.insert(0, tenant_hint)

    query = f"""
        SELECT
            id,
            vendor,
            machine_type,
            model,
            attribute_name,
            attribute_value,
            units,
            validation
        FROM dipgos.atom_manifestation
        WHERE {' AND '.join(where_clauses)}
        ORDER BY attribute_name
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    attributes = [
        AtomManifestationAttribute(
            id=str(row["id"]),
            vendor=row["vendor"],
            machineType=row["machine_type"],
            model=row["model"],
            name=row["attribute_name"],
            value=row["attribute_value"],
            units=row["units"],
            validation=row["validation"],
        )
        for row in rows
    ]

    return AtomManifestationResponse(
        vendor=vendor,
        machineType=machine_type,
        model=model,
        attributes=attributes,
        count=len(attributes),
        asOf=datetime.now(timezone.utc),
    )
