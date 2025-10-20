from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    AtomDeploymentMutation,
    AtomDeploymentRecord,
    AtomDeploymentResponse,
    AtomRepositoryNode,
    AtomRepositoryResponse,
    AtomSummaryCard,
    AtomSummaryResponse,
    AtomSummaryScope,
)


ATOM_CATEGORY_LABELS: Dict[str, str] = {
    "actors": "Actors",
    "materials": "Materials & Elements",
    "machinery": "Machinery",
    "consumables": "Consumables",
    "tools": "Tools",
    "equipment": "Equipment",
    "systems": "Systems",
    "technologies": "Technologies",
    "financials": "Financials",
}


CACHE_TTL_SECONDS = 45.0
_REPOSITORY_CACHE: Dict[tuple, tuple[float, AtomRepositoryResponse]] = {}
_SUMMARY_CACHE: Dict[tuple, tuple[float, AtomSummaryResponse]] = {}
_DEPLOYMENT_CACHE: Dict[tuple, tuple[float, AtomDeploymentResponse]] = {}


def _cache_get(cache: Dict, key: tuple):
    entry = cache.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > CACHE_TTL_SECONDS:
        cache.pop(key, None)
        return None
    return payload


def _cache_set(cache: Dict, key: tuple, payload):
    cache[key] = (time.time(), payload)


def _ensure_feature_enabled() -> None:
    if not settings.feature_atom_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Atom Manager API is disabled")


def _normalise_tenant(raw: Optional[str]) -> str:
    if not raw:
        return "default"
    normalised = raw.strip()
    return normalised or "default"


def _resolve_entity(code: str, level: str, tenant_id: str) -> Dict:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT entity_id, level, parent_id, code, name
                FROM dipgos.entities
                WHERE code = %s AND level = %s
                """,
                (code, level),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{level.title()} not found")
    return row


def _resolve_scope(tenant_id: str, project_id: str, contract_id: Optional[str], sow_id: Optional[str], process_id: Optional[str]) -> AtomSummaryScope:
    project_row = _resolve_entity(project_id, "project", tenant_id)
    entity_id = project_row["entity_id"]
    contract_row = None
    sow_row = None
    process_row = None

    if contract_id:
        contract_row = _resolve_entity(contract_id, "contract", tenant_id)
        entity_id = contract_row["entity_id"]
    if sow_id:
        sow_row = _resolve_entity(sow_id, "sow", tenant_id)
        entity_id = sow_row["entity_id"]
    if process_id:
        process_row = _resolve_entity(process_id, "process", tenant_id)
        entity_id = process_row["entity_id"]

    level = "project"
    if process_row:
        level = "process"
    elif sow_row:
        level = "sow"
    elif contract_row:
        level = "contract"

    return AtomSummaryScope(
        entityId=str(entity_id),
        level=level,
        projectId=project_row["code"],
        contractId=contract_row["code"] if contract_row else None,
        sowId=sow_row["code"] if sow_row else None,
        processId=process_row["code"] if process_row else None,
    )


def get_repository_tree(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
) -> AtomRepositoryResponse:
    _ensure_feature_enabled()
    tenant = _normalise_tenant(tenant_id)
    project_scope = _resolve_entity(project_id, "project", tenant)
    entity_scope = project_scope
    if contract_id:
        entity_scope = _resolve_entity(contract_id, "contract", tenant)

    cache_key = (tenant, entity_scope["entity_id"])
    cached = _cache_get(_REPOSITORY_CACHE, cache_key)
    if cached:
        return cached

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT node_id, parent_id, node_type, category, name, total, engaged, idle
                FROM dipgos.vw_repository_tree
                WHERE tenant_id = %s AND entity_id = %s
                """,
                (tenant, entity_scope["entity_id"]),
            )
            rows = cur.fetchall()

            cur.execute(
                """
                SELECT category, total, engaged, idle
                FROM dipgos.vw_atom_counts
                WHERE tenant_id = %s AND entity_id = %s
                """,
                (tenant, entity_scope["entity_id"]),
            )
            category_rows = {row["category"]: row for row in cur.fetchall()}

    nodes: List[AtomRepositoryNode] = []

    # Add category roots first
    for category, label in ATOM_CATEGORY_LABELS.items():
        metrics = category_rows.get(category, {"total": 0, "engaged": 0, "idle": 0})
        nodes.append(
            AtomRepositoryNode(
                id=f"category:{category}",
                parentId=None,
                level="category",
                name=label,
                category=category,  # type: ignore[arg-type]
                total=int(metrics["total"]),
                engaged=int(metrics["engaged"]),
                idle=int(metrics["idle"]),
            )
        )

    for row in rows:
        parent_id = row["parent_id"]
        if parent_id is None:
            parent_id = f"category:{row['category']}"
        nodes.append(
            AtomRepositoryNode(
                id=str(row["node_id"]),
                parentId=str(parent_id),
                level=row["node_type"],
                name=row["name"],
                category=row["category"],  # type: ignore[arg-type]
                total=int(row["total"]),
                engaged=int(row["engaged"]),
                idle=int(row["idle"]),
            )
        )

    response = AtomRepositoryResponse(asOf=datetime.now(timezone.utc), nodes=nodes)
    _cache_set(_REPOSITORY_CACHE, cache_key, response)
    return response


def get_atom_summary(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> AtomSummaryResponse:
    _ensure_feature_enabled()
    tenant = _normalise_tenant(tenant_id)
    scope = _resolve_scope(tenant, project_id, contract_id, sow_id, process_id)

    cache_key = (tenant, scope.entityId)
    cached = _cache_get(_SUMMARY_CACHE, cache_key)
    if cached:
        return cached

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT category, total, engaged, idle
                FROM dipgos.vw_atom_counts
                WHERE tenant_id = %s AND entity_id = %s
                """,
                (tenant, scope.entityId),
            )
            rows = cur.fetchall()

    metrics = {row["category"]: row for row in rows}
    cards: List[AtomSummaryCard] = []
    for key, label in ATOM_CATEGORY_LABELS.items():
        entry = metrics.get(key, {"total": 0, "engaged": 0, "idle": 0})
        total = int(entry["total"])
        engaged = int(entry["engaged"])
        idle = int(entry["idle"])
        ratio = total and engaged / total or 0
        cards.append(
            AtomSummaryCard(
                category=key,  # type: ignore[arg-type]
                label=label,
                total=total,
                engaged=engaged,
                idle=idle,
                trend=[round(max(0.0, min(1.0, ratio * factor)), 2) for factor in (0.6, 0.8, 1.0)],
            )
        )

    response = AtomSummaryResponse(asOf=datetime.now(timezone.utc), scope=scope, cards=cards)
    _cache_set(_SUMMARY_CACHE, cache_key, response)
    return response


def get_atom_deployments(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> AtomDeploymentResponse:
    _ensure_feature_enabled()
    tenant = _normalise_tenant(tenant_id)
    scope = _resolve_scope(tenant, project_id, contract_id, sow_id, process_id)

    cache_key = (tenant, scope.entityId)
    cached = _cache_get(_DEPLOYMENT_CACHE, cache_key)
    if cached:
        return cached

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                WITH RECURSIVE entity_closure AS (
                  SELECT entity_id AS descendant_id, entity_id AS ancestor_id
                  FROM dipgos.entities
                  UNION ALL
                  SELECT child.entity_id, entity_closure.ancestor_id
                  FROM dipgos.entities child
                  JOIN entity_closure ON child.parent_id = entity_closure.descendant_id
                )
                SELECT
                  d.id AS deployment_id,
                  a.id AS atom_id,
                  a.name AS atom_name,
                  t.name AS atom_type,
                  t.category::text AS category,
                  p.entity_id AS process_entity_id,
                  p.name AS process_name,
                  d.start_ts,
                  d.end_ts,
                  d.status
                FROM dipgos.atom_deployments d
                JOIN dipgos.atoms a ON a.id = d.atom_id
                JOIN dipgos.atom_types t ON t.id = a.atom_type_id
                JOIN dipgos.entities p ON p.entity_id = d.process_id
                JOIN entity_closure ON d.process_id = entity_closure.descendant_id
                WHERE entity_closure.ancestor_id = %s
                  AND d.tenant_id = %s
                ORDER BY d.start_ts DESC
                """,
                (scope.entityId, tenant),
            )
            rows = cur.fetchall()

    deployments = [
        AtomDeploymentRecord(
            deploymentId=str(row["deployment_id"]),
            atomId=str(row["atom_id"]),
            atomName=row["atom_name"],
            atomType=row["atom_type"],
            category=row["category"],
            processId=str(row["process_entity_id"]),
            processName=row["process_name"],
            startTs=row["start_ts"],
            endTs=row["end_ts"],
            status=row["status"],
        )
        for row in rows
    ]

    response = AtomDeploymentResponse(asOf=datetime.now(timezone.utc), deployments=deployments)
    _cache_set(_DEPLOYMENT_CACHE, cache_key, response)
    return response


def mutate_deployment(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
    payload: AtomDeploymentMutation,
    role: str,
) -> AtomDeploymentResponse:
    _ensure_feature_enabled()
    tenant = _normalise_tenant(tenant_id)
    if role.lower() != 'contractor':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only contractors can modify deployments")

    scope = _resolve_scope(tenant, project_id, contract_id, sow_id, process_id)
    atom_uuid = uuid.UUID(payload.atom_id)
    process_uuid = uuid.UUID(payload.process_id)
    now_ts = datetime.now(timezone.utc)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Verify atom exists
            cur.execute(
                """
                SELECT a.id, a.tenant_id, t.category, t.name
                FROM dipgos.atoms a
                JOIN dipgos.atom_types t ON t.id = a.atom_type_id
                WHERE a.id = %s AND a.tenant_id = %s AND a.active
                """,
                (atom_uuid, tenant),
            )
            atom_row = cur.fetchone()
            if not atom_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found or inactive")

            if payload.action == 'assign':
                cur.execute(
                    """
                    SELECT id FROM dipgos.atom_deployments
                    WHERE atom_id = %s AND tenant_id = %s AND (end_ts IS NULL OR end_ts >= NOW())
                    """,
                    (atom_uuid, tenant),
                )
                existing = cur.fetchone()
                if existing:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Atom already engaged")

                deployment_id = uuid.uuid4()
                start_ts = payload.start_ts or now_ts
                cur.execute(
                    """
                    INSERT INTO dipgos.atom_deployments (id, atom_id, process_id, start_ts, end_ts, status, tenant_id)
                    VALUES (%s, %s, %s, %s, NULL, 'active', %s)
                    RETURNING id
                    """,
                    (deployment_id, atom_uuid, process_uuid, start_ts, tenant),
                )

            elif payload.action == 'unassign':
                cur.execute(
                    """
                    SELECT id FROM dipgos.atom_deployments
                    WHERE atom_id = %s AND process_id = %s AND tenant_id = %s AND (end_ts IS NULL OR end_ts >= NOW())
                    ORDER BY start_ts DESC
                    LIMIT 1
                    """,
                    (atom_uuid, process_uuid, tenant),
                )
                deployment_row = cur.fetchone()
                if not deployment_row:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active deployment to close")

                end_ts = payload.end_ts or now_ts
                cur.execute(
                    """
                    UPDATE dipgos.atom_deployments
                    SET end_ts = %s, status = 'completed'
                    WHERE id = %s
                    """,
                    (end_ts, deployment_row["id"]),
                )
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported action")

            conn.commit()

    return get_atom_deployments(
        tenant,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id or scope.processId,
    )
