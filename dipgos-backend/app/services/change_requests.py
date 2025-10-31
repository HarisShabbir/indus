from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..db import pool
from .progress_v2 import _normalise_tenant as progress_normalise_tenant
from .progress_v2 import _resolve_scope as progress_resolve_scope


def _uuid(value) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _resolve_scope_entities(
    tenant_id: Optional[str],
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
):
    tenant_hint = progress_normalise_tenant(tenant_id)
    scope = progress_resolve_scope(
        tenant_hint=tenant_hint,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )
    tenant_uuid = _uuid(scope.project["tenant_id"])
    project_uuid = _uuid(scope.project["entity_id"])
    contract_uuid = _uuid(scope.contract["entity_id"]) if scope.contract else None
    sow_uuid = _uuid(scope.sow["entity_id"]) if scope.sow else None
    process_uuid = _uuid(scope.process["entity_id"]) if scope.process else None
    return scope, tenant_uuid, project_uuid, contract_uuid, sow_uuid, process_uuid


def create_change_request(
    *,
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
    atom_type: str,
    model: str,
    requested_units: int,
    est_cost: Optional[float],
    reason: Optional[str],
    created_by: str,
) -> dict:
    if requested_units <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="requestedUnits must be greater than zero")

    scope, tenant_uuid, project_uuid, contract_uuid, sow_uuid, process_uuid = _resolve_scope_entities(
        tenant_id,
        project_id,
        contract_id,
        sow_id,
        process_id,
    )

    cr_id = uuid.uuid4()
    alert_id = f"change-{cr_id}"
    now = datetime.now(timezone.utc)
    due_at = (now + timedelta(days=2)).replace(microsecond=0)
    raised_at = now.replace(microsecond=0)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO dipgos.change_requests (
                    id, tenant_id, project_id, contract_id, sow_id, process_id,
                    atom_type, model, requested_units, est_cost, reason, status,
                    created_by, created_at
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending_pm_approval',%s,%s)
                RETURNING *
                """,
                (
                    cr_id,
                    tenant_uuid,
                    project_uuid,
                    contract_uuid,
                    sow_uuid,
                    process_uuid,
                    atom_type,
                    model,
                    requested_units,
                    est_cost,
                    reason,
                    created_by or "contractor",
                    now,
                ),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create change request")

            scope_metadata = {
                "scope": {
                    "level": scope.scope_level,
                    "project": {"code": scope.project["code"], "name": scope.project["name"]},
                    "contract": {"code": scope.contract["code"], "name": scope.contract["name"]} if scope.contract else None,
                    "sow": {"code": scope.sow["code"], "name": scope.sow["name"]} if scope.sow else None,
                    "process": {"code": scope.process["code"], "name": scope.process["name"]} if scope.process else None,
                },
                "workflow": {
                    "changeRequestId": str(cr_id),
                    "submittedBy": created_by or "contractor",
                    "requestedUnits": requested_units,
                    "model": model,
                    "atomType": atom_type,
                },
            }
            alert_payload = {
                "id": alert_id,
                "project_id": scope.project["code"],
                "title": f"Change submitted · {atom_type}",
                "location": scope.process["name"] if scope.process else scope.contract["name"] if scope.contract else scope.project["name"],
                "activity": f"Atom onboarding · {model}" if model else "Atom onboarding",
                "severity": "major" if requested_units >= 5 else "minor",
                "category": "Change Management",
                "status": "open",
                "owner": created_by or "contractor",
                "root_cause": reason or "Atom capacity gap identified via change request workflow.",
                "recommendation": f"Review change package {str(cr_id)[:8]} and align deployment plan.",
                "acknowledged_at": None,
                "due_at": due_at,
                "cleared_at": None,
                "raised_at": raised_at,
                "metadata": json.dumps(scope_metadata),
            }
            cur.execute(
                """
                INSERT INTO dipgos.alerts (
                    id, project_id, title, location, activity, severity,
                    category, status, owner, root_cause, recommendation,
                    acknowledged_at, due_at, cleared_at, raised_at, metadata
                )
                VALUES (
                    %(id)s, %(project_id)s, %(title)s, %(location)s, %(activity)s, %(severity)s,
                    %(category)s, %(status)s, %(owner)s, %(root_cause)s, %(recommendation)s,
                    %(acknowledged_at)s, %(due_at)s, %(cleared_at)s, %(raised_at)s, %(metadata)s::jsonb
                )
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    location = EXCLUDED.location,
                    activity = EXCLUDED.activity,
                    severity = EXCLUDED.severity,
                    category = EXCLUDED.category,
                    status = EXCLUDED.status,
                    owner = EXCLUDED.owner,
                    root_cause = EXCLUDED.root_cause,
                    recommendation = EXCLUDED.recommendation,
                    acknowledged_at = EXCLUDED.acknowledged_at,
                    due_at = EXCLUDED.due_at,
                    cleared_at = EXCLUDED.cleared_at,
                    metadata = EXCLUDED.metadata,
                    raised_at = EXCLUDED.raised_at
                """,
                alert_payload,
            )
            cur.execute("DELETE FROM dipgos.alert_items WHERE alert_id = %s", (alert_id,))
            alert_items = [
                ("workflow", "Change Workflow", f"Request {str(cr_id)[:8].upper()} awaiting PM approval"),
                ("scope", "Scope Target", scope.scope_level.title()),
                ("atom", "Atom Demand", f"{requested_units} × {atom_type}{f' ({model})' if model else ''}"),
            ]
            for item_type, label, detail in alert_items:
                cur.execute(
                    """
                    INSERT INTO dipgos.alert_items (alert_id, item_type, label, detail)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (alert_id, item_type, label, detail),
                )
            conn.commit()
            created = dict(row)
            created["alert_id"] = alert_id
            return created


def list_change_requests(
    *,
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> List[dict]:
    _, tenant_uuid, project_uuid, contract_uuid, sow_uuid, process_uuid = _resolve_scope_entities(
        tenant_id,
        project_id,
        contract_id,
        sow_id,
        process_id,
    )

    filters = ["tenant_id = %s", "project_id = %s"]
    params: List = [tenant_uuid, project_uuid]

    if contract_uuid:
        filters.append("contract_id = %s")
        params.append(contract_uuid)
    if sow_uuid:
        filters.append("sow_id = %s")
        params.append(sow_uuid)
    if process_uuid:
        filters.append("process_id = %s")
        params.append(process_uuid)

    query = f"""
        SELECT *
        FROM dipgos.change_requests
        WHERE {' AND '.join(filters)}
        ORDER BY created_at DESC
        LIMIT 200
    """

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]
