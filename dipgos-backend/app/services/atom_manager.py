from __future__ import annotations

import logging
import time
import uuid
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from psycopg.errors import UndefinedTable
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    AtomDeploymentMutation,
    AtomDeploymentRecord,
    AtomDeploymentResponse,
    AtomDetailResponse,
    AtomDetailInfo,
    AtomMobilizationRecord,
    AtomAttribute,
    AtomProductivityResponse,
    AtomProductivityTrendPoint,
    AtomRepositoryNode,
    AtomRepositoryResponse,
    AtomResource,
    AtomResourceResponse,
    AtomSummaryCard,
    AtomSummaryResponse,
    AtomSummaryScope,
    AtomScheduleResponse,
    AtomScheduleDailyResponse,
    AtomScheduleDailyRecord,
    AtomScheduleDailySummary,
    AtomScheduleSensorSlot,
    AtomScheduleTimeSlot,
    AtomScheduleVolumeSlot,
    AtomPaymentResponse,
    AtomScheduleItem,
    AtomScheduleSummary,
    AtomScheduleUpcoming,
    AtomScheduleConflict,
    AtomScheduleUpdateRequest,
    AtomScheduleCreateRequest,
    AtomPaymentCategorySummary,
    AtomPaymentRecord,
    AtomPaymentSummary,
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
_RESOURCE_CACHE: Dict[tuple, tuple[float, AtomResourceResponse]] = {}
_PRODUCTIVITY_CACHE: Dict[tuple, tuple[float, AtomProductivityResponse]] = {}
_DETAIL_CACHE: Dict[tuple, tuple[float, AtomDetailResponse]] = {}
_SCHEDULE_CACHE: Dict[tuple, tuple[float, AtomScheduleResponse]] = {}
_DAILY_SCHEDULE_CACHE: Dict[tuple, tuple[float, AtomScheduleDailyResponse]] = {}
_PAYMENT_CACHE: Dict[tuple, tuple[float, AtomPaymentResponse]] = {}

logger = logging.getLogger(__name__)


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


def _invalidate_schedule_cache():
    _SCHEDULE_CACHE.clear()
    _DAILY_SCHEDULE_CACHE.clear()
    _SUMMARY_CACHE.clear()
    _PAYMENT_CACHE.clear()


def _parse_time_label(label: Optional[str]) -> tuple[str, Optional[int]]:
    if not label:
        return "", None
    value = str(label).strip()
    try:
        parsed = datetime.strptime(value, "%H:%M")
        return value, parsed.hour * 60 + parsed.minute
    except ValueError:
        return value, None


def _duration_minutes(start_min: Optional[int], end_min: Optional[int]) -> int:
    if start_min is None or end_min is None:
        return 0
    duration = end_min - start_min
    if duration < 0:
        duration += 24 * 60
    return max(duration, 0)


def _ensure_feature_enabled() -> None:
    if not settings.feature_atom_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Atom Manager API is disabled")


def _to_float(value: Optional[object]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalise_tenant(raw: Optional[str]) -> str:
    if not raw:
        return "default"
    normalised = raw.strip()
    if not normalised:
        return "default"
    try:
        return str(uuid.UUID(normalised))
    except (ValueError, TypeError):
        return normalised.lower()


def _parse_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _tenant_from_row(row: Optional[Dict], fallback: Optional[str]) -> Optional[str]:
    if row and row.get("tenant_id"):
        return str(row["tenant_id"])
    return fallback


def _resolve_entity(code: str, level: str, tenant_id: str) -> Dict:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            query = """
                SELECT entity_id, level, parent_id, code, name, tenant_id
                FROM dipgos.entities
                WHERE code = %s AND level = %s
            """
            params: List = [code, level]
            tenant_uuid = _parse_uuid(tenant_id)
            if tenant_uuid:
                query += " AND tenant_id = %s"
                params.append(tenant_uuid)
            cur.execute(query, params)
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{level.title()} not found")
    return row


def _resolve_scope(
    tenant_hint: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> Tuple[AtomSummaryScope, str]:
    project_row = _resolve_entity(project_id, "project", tenant_hint)
    tenant_uuid = _tenant_from_row(project_row, None)
    if tenant_uuid and tenant_hint not in ("default", tenant_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")

    entity_id = project_row["entity_id"]
    contract_row = None
    sow_row = None
    process_row = None

    if contract_id:
        contract_row = _resolve_entity(contract_id, "contract", tenant_hint)
        entity_id = contract_row["entity_id"]
        tenant_uuid = _tenant_from_row(contract_row, tenant_uuid)
    if sow_id:
        sow_row = _resolve_entity(sow_id, "sow", tenant_hint)
        entity_id = sow_row["entity_id"]
        tenant_uuid = _tenant_from_row(sow_row, tenant_uuid)
    if process_id:
        process_row = _resolve_entity(process_id, "process", tenant_hint)
        entity_id = process_row["entity_id"]
        tenant_uuid = _tenant_from_row(process_row, tenant_uuid)

    level = "project"
    if process_row:
        level = "process"
    elif sow_row:
        level = "sow"
    elif contract_row:
        level = "contract"

    scope = AtomSummaryScope(
        entityId=str(entity_id),
        level=level,
        projectId=project_row["code"],
        contractId=contract_row["code"] if contract_row else None,
        sowId=sow_row["code"] if sow_row else None,
        processId=process_row["code"] if process_row else None,
    )
    resolved_tenant = tenant_uuid or tenant_hint

    return scope, resolved_tenant


def _resolve_scope_entity_ids(scope: AtomSummaryScope, tenant: str, tenant_hint: str) -> Dict[str, Optional[uuid.UUID]]:
    def _resolve_with_fallback(code: Optional[str], level: str) -> Optional[uuid.UUID]:
        if not code:
            return None

        candidates: List[str] = []
        for candidate in (tenant, tenant_hint, "default", ""):
            if candidate is None:
                continue
            if candidate in candidates:
                continue
            candidates.append(candidate)

        last_404: Optional[HTTPException] = None
        for candidate in candidates:
            try:
                row = _resolve_entity(code, level, candidate)
                return uuid.UUID(str(row["entity_id"]))
            except HTTPException as exc:
                if exc.status_code != status.HTTP_404_NOT_FOUND:
                    raise
                last_404 = exc
        if last_404 is not None:
            raise last_404
        return None

    return {
        "project": _resolve_with_fallback(scope.project_id, "project"),
        "contract": _resolve_with_fallback(scope.contract_id, "contract"),
        "sow": _resolve_with_fallback(scope.sow_id, "sow"),
        "process": _resolve_with_fallback(scope.process_id, "process"),
    }


def get_atom_resources(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
    category: Optional[str],
    search: Optional[str],
    only_idle: bool,
    include_inactive: bool,
    limit: int,
) -> AtomResourceResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)
    scope_uuid = uuid.UUID(scope.entity_id)
    category_filter = (category or "").strip().lower()
    search_filter = (search or "").strip()
    limit = max(10, min(limit or 200, 500))

    cache_key = (
        tenant,
        scope.entity_id,
        category_filter,
        search_filter.lower(),
        only_idle,
        include_inactive,
        limit,
    )
    cached = _cache_get(_RESOURCE_CACHE, cache_key)
    if cached:
        return cached

    params: List = [scope_uuid, scope_uuid, tenant, tenant]
    query = """
        WITH RECURSIVE ancestors AS (
          SELECT entity_id, parent_id
          FROM dipgos.entities
          WHERE entity_id = %s
          UNION ALL
          SELECT parent.entity_id, parent.parent_id
          FROM dipgos.entities parent
          JOIN ancestors child ON child.parent_id = parent.entity_id
        ),
        descendants AS (
          SELECT entity_id, parent_id
          FROM dipgos.entities
          WHERE entity_id = %s
          UNION ALL
          SELECT child.entity_id, child.parent_id
          FROM dipgos.entities child
          JOIN descendants parent ON child.parent_id = parent.entity_id
        ),
        scope_entities AS (
          SELECT DISTINCT entity_id FROM ancestors
          UNION
          SELECT DISTINCT entity_id FROM descendants
        ),
        latest_deployments AS (
          SELECT DISTINCT ON (d.atom_id)
            d.atom_id,
            d.id,
            d.process_id,
            d.start_ts,
            d.end_ts,
            d.status
          FROM dipgos.atom_deployments d
          WHERE d.tenant_id = %s
          ORDER BY d.atom_id, d.start_ts DESC
        )
        SELECT
          a.id AS atom_id,
          a.name,
          t.category,
          t.name AS type_name,
          g.name AS group_name,
          a.unit,
          a.spec,
          a.active,
          c.name AS contractor_name,
          home.level AS home_level,
          home.code AS home_code,
          latest.id AS deployment_id,
          latest.process_id,
          latest.status,
          latest.start_ts,
          latest.end_ts,
          proc.name AS process_name
        FROM dipgos.atoms a
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        JOIN dipgos.atom_groups g ON g.id = t.group_id
        JOIN scope_entities se ON se.entity_id = a.home_entity_id
        LEFT JOIN dipgos.contractors c ON c.id = a.contractor_id
        JOIN dipgos.entities home ON home.entity_id = a.home_entity_id
        LEFT JOIN latest_deployments latest ON latest.atom_id = a.id
        LEFT JOIN dipgos.entities proc ON proc.entity_id = latest.process_id
        WHERE a.tenant_id = %s
    """

    if not include_inactive:
        query += " AND a.active"
    if category_filter:
        query += " AND t.category = %s"
        params.append(category_filter)
    if search_filter:
        like = f"%{search_filter}%"
        query += " AND (a.name ILIKE %s OR t.name ILIKE %s OR g.name ILIKE %s)"
        params.extend([like, like, like])
    if only_idle:
        query += " AND (latest.id IS NULL OR latest.status NOT IN ('active', 'planned') OR (latest.end_ts IS NOT NULL AND latest.end_ts <= NOW()))"

    query += " ORDER BY t.category, a.name LIMIT %s"
    params.append(limit)

    now_ts = datetime.now(timezone.utc)
    rows: List[Dict] = []
    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
    except UndefinedTable:
        logger.warning("atom_schedule_entries missing; returning empty schedule for scope %s", scope.entity_id)
        rows = []

    total = len(rows)
    engaged = 0
    resources = []
    for row in rows:
        deployment = row.get("deployment_id")
        start_ts = row.get("start_ts")
        end_ts = row.get("end_ts")
        status = row.get("status")
        active = bool(row.get("active"))

        availability = "inactive"
        days_active: Optional[float] = None
        utilization = 0.0
        if active:
            if deployment and status in {"active", "planned"} and (end_ts is None or end_ts > now_ts):
                availability = "engaged"
                engaged += 1
                if start_ts:
                    days_active = (now_ts - start_ts).total_seconds() / 86400
                    utilization = min(1.0, max(0.0, days_active / 14.0))
            else:
                availability = "idle"
                if end_ts:
                    days_since_release = (now_ts - end_ts).total_seconds() / 86400
                    utilization = max(0.05, 1.0 - min(days_since_release / 30.0, 1.0))

        engagement = None
        if deployment:
            engagement = {
                "deploymentId": str(deployment),
                "processId": row.get("process_id"),
                "processName": row.get("process_name"),
                "startTs": start_ts,
                "endTs": end_ts,
                "status": status,
                "daysActive": days_active,
            }

        resources.append(
            {
                "atomId": str(row["atom_id"]),
                "name": row["name"],
                "category": row["category"],
                "typeName": row["type_name"],
                "groupName": row["group_name"],
                "unit": row.get("unit"),
                "contractor": row.get("contractor_name"),
                "availability": availability,
                "homeLevel": row["home_level"],
                "homeCode": row["home_code"],
                "spec": row.get("spec") or {},
                "utilization": round(utilization, 3),
                "engagement": engagement,
            }
        )

    response = AtomResourceResponse(
        asOf=now_ts,
        scope=scope,
        summary={"total": total, "engaged": engaged, "idle": total - engaged},
        atoms=resources,
    )
    _cache_set(_RESOURCE_CACHE, cache_key, response)
    return response


def get_atom_detail(tenant_id: str, atom_id: str) -> AtomDetailResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    tenant_uuid = _parse_uuid(tenant_hint)
    try:
        atom_uuid = uuid.UUID(atom_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")

    cache_key = (tenant_uuid or tenant_hint or "default", str(atom_uuid))
    cached = _cache_get(_DETAIL_CACHE, cache_key)
    if cached:
        return cached

    query = """
        SELECT
          a.id,
          a.name,
          a.unit,
          a.spec,
          a.tenant_id,
          t.category,
          t.name AS type_name,
          g.name AS group_name,
          c.name AS contractor_name,
          home.level AS home_level,
          home.code AS home_code
        FROM dipgos.atoms a
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        LEFT JOIN dipgos.atom_groups g ON g.id = t.group_id
        LEFT JOIN dipgos.contractors c ON c.id = a.contractor_id
        JOIN dipgos.entities home ON home.entity_id = a.home_entity_id
        WHERE a.id = %s
    """
    params: List = [atom_uuid]
    if tenant_uuid:
        query += " AND a.tenant_id = %s"
        params.append(tenant_uuid)

    attributes: List[AtomAttribute] = []
    mobilization: List[AtomMobilizationRecord] = []
    productivity: List[AtomProductivityTrendPoint] = []

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            info_row = cur.fetchone()
            if not info_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")

            cur.execute(
                """
                SELECT id, label, value
                FROM dipgos.atom_attributes
                WHERE atom_id = %s
                ORDER BY label
                """,
                (atom_uuid,),
            )
            for row in cur.fetchall():
                attributes.append(
                    AtomAttribute(
                        id=str(row["id"]),
                        label=row["label"],
                        value=row.get("value") or {},
                    )
                )

            cur.execute(
                """
                SELECT id, mobilized_on, demobilized_on, location, status, metadata
                FROM dipgos.atom_mobilization
                WHERE atom_id = %s
                ORDER BY mobilized_on DESC
                """,
                (atom_uuid,),
            )
            for row in cur.fetchall():
                mobilization.append(
                    AtomMobilizationRecord(
                        id=str(row["id"]),
                        mobilizedOn=row["mobilized_on"],
                        demobilizedOn=row["demobilized_on"],
                        location=row.get("location"),
                        status=row["status"],
                        metadata=row.get("metadata") or {},
                    )
                )

            cur.execute(
                """
                SELECT log_date, productive_hours, idle_hours, output_quantity
                FROM dipgos.atom_productivity_logs
                WHERE atom_id = %s
                ORDER BY log_date DESC
                LIMIT 30
                """,
                (atom_uuid,),
            )
            for row in cur.fetchall():
                productivity.append(
                    AtomProductivityTrendPoint(
                        logDate=row["log_date"],
                        productiveHours=float(row["productive_hours"] or 0.0),
                        idleHours=float(row["idle_hours"] or 0.0),
                        outputQuantity=float(row["output_quantity"]) if row.get("output_quantity") is not None else None,
                    )
                )

    info = AtomDetailInfo(
        atomId=str(info_row["id"]),
        name=info_row["name"],
        category=info_row["category"],
        typeName=info_row["type_name"],
        groupName=info_row.get("group_name"),
        unit=info_row.get("unit"),
        contractor=info_row.get("contractor_name"),
        homeCode=info_row.get("home_code"),
        homeLevel=info_row.get("home_level"),
        spec=info_row.get("spec") or {},
    )

    response = AtomDetailResponse(
        asOf=datetime.now(timezone.utc),
        info=info,
        attributes=attributes,
        mobilization=mobilization,
        productivity=productivity,
    )
    _cache_set(_DETAIL_CACHE, cache_key, response)
    return response


def get_atom_productivity(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
    category: Optional[str],
    start_date: Optional[date],
    end_date: Optional[date],
    limit: int,
) -> AtomProductivityResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)
    scope_uuid = uuid.UUID(scope.entity_id)

    category_filter = (category or "").strip().lower()
    limit = max(25, min(limit or 250, 500))
    start = start_date or (date.today() - timedelta(days=30))
    end = end_date or date.today()
    if start > end:
        start, end = end, start

    cache_key = (
        tenant,
        scope.entity_id,
        category_filter,
        start.isoformat(),
        end.isoformat(),
        limit,
    )
    cached = _cache_get(_PRODUCTIVITY_CACHE, cache_key)
    if cached:
        return cached

    params: List = [scope_uuid, scope_uuid, tenant, start, end]
    query = """
        WITH RECURSIVE ancestors AS (
          SELECT entity_id, parent_id
          FROM dipgos.entities
          WHERE entity_id = %s
          UNION ALL
          SELECT parent.entity_id, parent.parent_id
          FROM dipgos.entities parent
          JOIN ancestors child ON child.parent_id = parent.entity_id
        ),
        descendants AS (
          SELECT entity_id, parent_id
          FROM dipgos.entities
          WHERE entity_id = %s
          UNION ALL
          SELECT child.entity_id, child.parent_id
          FROM dipgos.entities child
          JOIN descendants parent ON child.parent_id = parent.entity_id
        ),
        scope_entities AS (
          SELECT DISTINCT entity_id FROM ancestors
          UNION
          SELECT DISTINCT entity_id FROM descendants
        )
        SELECT
          logs.id,
          logs.atom_id,
          a.name AS atom_name,
          t.name AS atom_type,
          t.category,
          scope_ref.level AS scope_level,
          scope_ref.code AS scope_code,
          logs.log_date,
          logs.shift,
          logs.productive_hours,
          logs.idle_hours,
          (logs.productive_hours + logs.idle_hours) AS total_hours,
          CASE
            WHEN (logs.productive_hours + logs.idle_hours) = 0 THEN NULL
            ELSE logs.productive_hours / NULLIF(logs.productive_hours + logs.idle_hours, 0)
          END AS utilisation_ratio,
          logs.output_quantity,
          logs.output_unit,
          logs.quality_score,
          logs.notes
        FROM dipgos.atom_productivity_logs logs
        JOIN dipgos.atoms a ON a.id = logs.atom_id
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        JOIN scope_entities se ON se.entity_id = logs.scope_entity_id
        JOIN dipgos.entities scope_ref ON scope_ref.entity_id = logs.scope_entity_id
        WHERE logs.tenant_id = %s
          AND logs.log_date BETWEEN %s AND %s
    """

    if category_filter:
        query += " AND t.category = %s"
        params.append(category_filter)

    query += """
        ORDER BY logs.log_date DESC, logs.shift, logs.created_at DESC
        LIMIT %s
    """
    params.append(limit)

    rows: List[Dict] = []
    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
    except UndefinedTable:
        logger.warning("atom_payment_records missing; returning empty payments for scope %s", scope.entity_id)
        rows = []

    total_logs = len(rows)
    total_productive = 0.0
    total_idle = 0.0
    total_output = 0.0
    utilisation_sum = 0.0
    utilisation_count = 0

    logs_payload = []
    trend_map: Dict[date, Dict[str, float]] = defaultdict(lambda: {"productive": 0.0, "idle": 0.0, "output": 0.0})

    for row in rows:
        productive = float(row.get("productive_hours") or 0)
        idle = float(row.get("idle_hours") or 0)
        total_productive += productive
        total_idle += idle
        output_qty = row.get("output_quantity")
        if output_qty is not None:
            total_output += float(output_qty)

        utilisation = row.get("utilisation_ratio")
        if utilisation is not None:
            utilisation_sum += float(utilisation)
            utilisation_count += 1

        log_date_val = row["log_date"]
        trend_entry = trend_map[log_date_val]
        trend_entry["productive"] += productive
        trend_entry["idle"] += idle
        if output_qty is not None:
            trend_entry["output"] += float(output_qty)

        logs_payload.append(
            {
                "logId": str(row["id"]),
                "atomId": str(row["atom_id"]),
                "atomName": row["atom_name"],
                "atomType": row["atom_type"],
                "category": row["category"],
                "scopeLevel": row["scope_level"],
                "scopeCode": row["scope_code"],
                "logDate": row["log_date"],
                "shift": row["shift"],
                "productiveHours": productive,
                "idleHours": idle,
                "totalHours": float(row.get("total_hours") or (productive + idle)),
                "utilisationRatio": float(utilisation) if utilisation is not None else None,
                "outputQuantity": float(output_qty) if output_qty is not None else None,
                "outputUnit": row.get("output_unit"),
                "qualityScore": float(row["quality_score"]) if row.get("quality_score") is not None else None,
                "notes": row.get("notes"),
            }
        )

    trend_points = [
        {
            "logDate": day,
            "productiveHours": round(values["productive"], 2),
            "idleHours": round(values["idle"], 2),
            "outputQuantity": round(values["output"], 2) if values["output"] else None,
        }
        for day, values in sorted(trend_map.items())
    ]

    average_utilisation = None
    if utilisation_count:
        average_utilisation = utilisation_sum / utilisation_count

    response = AtomProductivityResponse(
        asOf=datetime.now(timezone.utc),
        scope=scope,
        summary={
            "totalLogs": total_logs,
            "totalProductiveHours": round(total_productive, 2),
            "totalIdleHours": round(total_idle, 2),
            "averageUtilisation": round(average_utilisation, 4) if average_utilisation is not None else None,
            "totalOutputQuantity": round(total_output, 2) if total_output else None,
        },
        logs=logs_payload,
        trend=trend_points,
    )
    _cache_set(_PRODUCTIVITY_CACHE, cache_key, response)
    return response


def get_repository_tree(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
) -> AtomRepositoryResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    project_scope = _resolve_entity(project_id, "project", tenant_hint)
    entity_scope = project_scope
    tenant = _tenant_from_row(project_scope, tenant_hint)
    if contract_id:
        contract_scope = _resolve_entity(contract_id, "contract", tenant_hint)
        tenant = _tenant_from_row(contract_scope, tenant)
        entity_scope = contract_scope

    tenant = tenant or tenant_hint
    entity_uuid = str(entity_scope["entity_id"])

    cache_key = (tenant, entity_uuid)
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
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)

    cache_key = (tenant, scope.entity_id)
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
                (tenant, scope.entity_id),
            )
            rows = cur.fetchall()

            cur.execute(
                """
                WITH RECURSIVE closure AS (
                  SELECT entity_id AS descendant_id, entity_id AS ancestor_id
                  FROM dipgos.entities
                  UNION ALL
                  SELECT child.entity_id, closure.ancestor_id
                  FROM dipgos.entities child
                  JOIN closure ON child.parent_id = closure.descendant_id
                ),
                scope_descendants AS (
                  SELECT descendant_id
                  FROM closure
                  WHERE ancestor_id = %s
                ),
                scope_processes AS (
                  SELECT closure.descendant_id
                  FROM closure
                  JOIN dipgos.entities e ON e.entity_id = closure.descendant_id
                  WHERE closure.ancestor_id = %s
                    AND e.level = 'process'
                ),
                scoped_atoms AS (
                  SELECT DISTINCT
                    a.id AS atom_id,
                    t.category,
                    COALESCE((a.spec->>'unit_cost')::numeric, 0) AS unit_cost
                  FROM dipgos.atoms a
                  JOIN dipgos.atom_types t ON t.id = a.atom_type_id
                  WHERE a.active
                    AND a.tenant_id = %s
                    AND (
                      a.home_entity_id IN (SELECT descendant_id FROM scope_descendants)
                      OR EXISTS (
                        SELECT 1
                        FROM dipgos.atom_deployments d
                        WHERE d.atom_id = a.id
                          AND COALESCE(d.end_ts, NOW()) >= NOW()
                          AND d.process_id IN (SELECT descendant_id FROM scope_processes)
                      )
                    )
                ),
                active_atoms AS (
                  SELECT DISTINCT d.atom_id
                  FROM dipgos.atom_deployments d
                  WHERE COALESCE(d.end_ts, NOW()) >= NOW()
                    AND d.process_id IN (SELECT descendant_id FROM scope_processes)
                )
                SELECT
                  scoped_atoms.category,
                  SUM(scoped_atoms.unit_cost) AS total_cost,
                  SUM(CASE WHEN active_atoms.atom_id IS NOT NULL THEN scoped_atoms.unit_cost ELSE 0 END) AS engaged_cost
                FROM scoped_atoms
                LEFT JOIN active_atoms ON active_atoms.atom_id = scoped_atoms.atom_id
                GROUP BY scoped_atoms.category
                """,
                (scope.entity_id, scope.entity_id, tenant),
            )
            cost_rows = cur.fetchall()

    metrics = {row["category"]: row for row in rows}
    cost_lookup = {row["category"]: row for row in cost_rows}
    total_portfolio_value = sum(float(row["total_cost"] or 0) for row in cost_rows)
    total_engaged_value = sum(float(row["engaged_cost"] or 0) for row in cost_rows)
    cards: List[AtomSummaryCard] = []
    for key, label in ATOM_CATEGORY_LABELS.items():
        entry = metrics.get(key, {"total": 0, "engaged": 0, "idle": 0})
        total = int(entry["total"])
        engaged = int(entry["engaged"])
        idle = int(entry["idle"])
        ratio = total and engaged / total or 0
        cost_entry = cost_lookup.get(key)
        total_cost = None
        engaged_cost = None
        if key == "financials":
            total_cost = total_portfolio_value
            engaged_cost = total_engaged_value
        elif cost_entry:
            total_cost = float(cost_entry["total_cost"]) if cost_entry["total_cost"] is not None else None
            engaged_cost = float(cost_entry["engaged_cost"]) if cost_entry["engaged_cost"] is not None else None
        cards.append(
            AtomSummaryCard(
                category=key,  # type: ignore[arg-type]
                label=label,
                total=total,
                engaged=engaged,
                idle=idle,
                trend=[round(max(0.0, min(1.0, ratio * factor)), 2) for factor in (0.6, 0.8, 1.0)],
                totalCost=total_cost,
                engagedCost=engaged_cost,
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
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)

    cache_key = (tenant, scope.entity_id)
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
                (scope.entity_id, tenant),
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


def get_atom_schedule(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> AtomScheduleResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)
    tenant_uuid = _parse_uuid(tenant)
    if tenant_uuid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant identifier")

    scope_ids = _resolve_scope_entity_ids(scope, tenant, tenant_hint)
    cache_key = (
        str(tenant_uuid),
        str(scope_ids["project"]),
        scope.contract_id or "",
        scope.sow_id or "",
        scope.process_id or "",
    )
    cached = _cache_get(_SCHEDULE_CACHE, cache_key)
    if cached:
        return cached

    params: List = [tenant_uuid, scope_ids["project"]]
    filters: List[str] = []
    if scope_ids["contract"]:
        filters.append("s.contract_id = %s")
        params.append(scope_ids["contract"])
    if scope_ids["sow"]:
        filters.append("s.sow_id = %s")
        params.append(scope_ids["sow"])
    if scope_ids["process"]:
        filters.append("s.process_id = %s")
        params.append(scope_ids["process"])

    filter_sql = ""
    if filters:
        filter_sql = " AND " + " AND ".join(filters)

    query = f"""
        SELECT
            s.id,
            s.milestone,
            s.status,
            s.criticality,
            s.percent_complete,
            s.variance_days,
            s.planned_start,
            s.planned_finish,
            s.actual_start,
            s.actual_finish,
            s.notes,
            s.project_id,
            s.contract_id,
            s.sow_id,
            s.process_id,
            s.tenant_id,
            a.id AS atom_id,
            a.name AS atom_name,
            t.category,
            t.name AS atom_type,
            g.name AS group_name,
            contract.code AS contract_code,
            sow.code AS sow_code,
            process.code AS process_code,
            process.name AS process_name
        FROM dipgos.atom_schedule_entries s
        JOIN dipgos.atoms a ON a.id = s.atom_id
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        LEFT JOIN dipgos.atom_groups g ON g.id = t.group_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = s.contract_id
        LEFT JOIN dipgos.entities sow ON sow.entity_id = s.sow_id
        LEFT JOIN dipgos.entities process ON process.entity_id = s.process_id
        WHERE s.tenant_id = %s
          AND s.project_id = %s
          {filter_sql}
        ORDER BY s.planned_start NULLS LAST, s.milestone NULLS LAST
    """

    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
    except UndefinedTable:
        logger.warning("atom_schedule_entries missing; returning empty schedule for scope %s", scope.entity_id)
        rows = []

    today = date.today()
    next_seven = today + timedelta(days=7)
    progress_values: List[float] = []
    variance_values: List[float] = []
    upcoming_candidates: List[tuple[Optional[date], AtomScheduleUpcoming]] = []
    rows_data: List[dict] = []
    process_tracks: Dict[str, List[dict]] = defaultdict(list)
    on_track = at_risk = delayed = completed = 0
    starts_next_seven = finishes_next_seven = risks_next_seven = 0

    for row in rows:
        status_raw = (row.get("status") or "").strip()
        status_key = status_raw.lower()
        percent = _to_float(row.get("percent_complete"))
        variance = _to_float(row.get("variance_days"))
        planned_start: Optional[date] = row.get("planned_start")
        planned_finish: Optional[date] = row.get("planned_finish") or planned_start
        actual_start: Optional[date] = row.get("actual_start")
        actual_finish: Optional[date] = row.get("actual_finish")

        if percent is not None:
            progress_values.append(percent)
        if variance is not None:
            variance_values.append(variance)

        if status_key in {"completed", "done"} or (percent is not None and percent >= 0.999) or actual_finish is not None:
            completed += 1
        elif status_key in {"delayed", "late"} or (variance is not None and variance > 2):
            delayed += 1
        elif status_key in {"at_risk", "risk", "warning"} or (variance is not None and variance > 0):
            at_risk += 1
        else:
            on_track += 1

        if planned_start and planned_start >= today and status_key not in {"completed", "done"}:
            days_to_start = (planned_start - today).days
            upcoming_candidates.append(
                (
                    planned_start,
                    AtomScheduleUpcoming(
                        scheduleId=str(row["id"]),
                        label=(row.get("milestone") or row.get("atom_name") or "Upcoming activity"),
                        plannedStart=planned_start,
                        plannedFinish=planned_finish,
                        daysToStart=days_to_start,
                    ),
                )
            )

        if planned_start and today <= planned_start <= next_seven:
            starts_next_seven += 1
        if planned_finish and today <= planned_finish <= next_seven:
            finishes_next_seven += 1
            if status_key in {"delayed", "late", "at_risk", "risk", "warning"}:
                risks_next_seven += 1

        data = {
            "row": row,
            "id": str(row["id"]),
            "atom_id": str(row["atom_id"]),
            "status_raw": status_raw,
            "status_key": status_key,
            "percent": percent,
            "variance": variance,
            "planned_start": planned_start,
            "planned_finish": planned_finish,
            "actual_start": actual_start,
            "actual_finish": actual_finish,
        }
        track_key = row.get("process_id") or row.get("process_code") or row.get("process_name") or row["id"]
        process_tracks[str(track_key)].append(data)
        rows_data.append(data)

    dependency_map: Dict[str, List[str]] = defaultdict(list)
    for track in process_tracks.values():
        ordered = sorted(track, key=lambda entry: (entry["planned_start"] or date.max, entry["id"]))
        for idx in range(1, len(ordered)):
            dependency_map[ordered[idx]["id"]].append(ordered[idx - 1]["id"])

    def _overlaps(first: dict, second: dict) -> bool:
        start_a, end_a = first["planned_start"], first["planned_finish"]
        start_b, end_b = second["planned_start"], second["planned_finish"]
        if not start_a or not end_a or not start_b or not end_b:
            return False
        return start_a <= end_b and start_b <= end_a

    conflict_records: List[AtomScheduleConflict] = []
    conflict_map: Dict[str, set] = defaultdict(set)
    seen_pairs: set[tuple] = set()

    for idx, current in enumerate(rows_data):
        for other in rows_data[idx + 1 :]:
            if not _overlaps(current, other):
                continue
            pair_ids = tuple(sorted([current["id"], other["id"]]))
            if pair_ids in seen_pairs:
                continue
            seen_pairs.add(pair_ids)
            conflict_type = None
            message = ""
            if current["atom_id"] == other["atom_id"]:
                conflict_type = "atom-double-booked"
                message = "Atom allocated to overlapping windows."
            elif current["row"].get("process_code") and current["row"].get("process_code") == other["row"].get("process_code"):
                conflict_type = "process-overlap"
                message = "Process scheduled twice in the same window."
            elif current["row"].get("contract_code") and current["row"].get("contract_code") == other["row"].get("contract_code"):
                conflict_type = "contract-overlap"
                message = "Contract window collision detected."
            if conflict_type:
                conflict_map[current["id"]].add(conflict_type)
                conflict_map[other["id"]].add(conflict_type)
                conflict_records.append(
                    AtomScheduleConflict(
                        conflictType=conflict_type,
                        scheduleIds=[current["id"], other["id"]],
                        message=message,
                    )
                )

    average_progress = sum(progress_values) / len(progress_values) if progress_values else None
    average_variance = sum(variance_values) / len(variance_values) if variance_values else None
    upcoming_candidates.sort(key=lambda item: (item[0] or date.max))
    upcoming = [entry for _, entry in upcoming_candidates[:3]]

    items: List[AtomScheduleItem] = []
    durations: Dict[str, int] = {}
    for entry in rows_data:
        row = entry["row"]
        duration_days = 1
        if entry["planned_start"] and entry["planned_finish"]:
            duration_days = max(1, (entry["planned_finish"] - entry["planned_start"]).days + 1)
        durations[entry["id"]] = duration_days
        items.append(
            AtomScheduleItem(
                scheduleId=entry["id"],
                atomId=str(row["atom_id"]),
                atomName=row.get("atom_name"),
                atomType=row.get("atom_type"),
                category=row.get("category"),
                groupName=row.get("group_name"),
                contractCode=row.get("contract_code"),
                sowCode=row.get("sow_code"),
                processCode=row.get("process_code"),
                processName=row.get("process_name"),
                plannedStart=entry["planned_start"],
                plannedFinish=entry["planned_finish"],
                actualStart=entry["actual_start"],
                actualFinish=entry["actual_finish"],
                percentComplete=entry["percent"],
                varianceDays=entry["variance"],
                status=entry["status_raw"] or None,
                criticality=row.get("criticality"),
                milestone=row.get("milestone"),
                notes=row.get("notes"),
                dependencies=dependency_map.get(entry["id"], []),
                conflictTypes=sorted(conflict_map.get(entry["id"], set())),
                processId=str(row["process_id"]) if row.get("process_id") else None,
            )
        )

    memo: Dict[str, int] = {}
    path_trace: Dict[str, List[str]] = {}

    def _longest_path(node: str) -> Tuple[int, List[str]]:
        cached = memo.get(node)
        if cached is not None:
            return cached, path_trace[node]
        preds = dependency_map.get(node, [])
        best_length = 0
        best_path: List[str] = []
        for pred in preds:
            length, trail = _longest_path(pred)
            if length > best_length:
                best_length = length
                best_path = trail
        total_length = durations.get(node, 1) + best_length
        memo[node] = total_length
        path_trace[node] = best_path + [node]
        return total_length, path_trace[node]

    critical_path: List[str] = []
    best_total = 0
    for entry in rows_data:
        node_id = entry["id"]
        total, trail = _longest_path(node_id)
        if total > best_total:
            best_total = total
            critical_path = trail

    summary = AtomScheduleSummary(
        total=len(items),
        onTrack=on_track,
        atRisk=at_risk,
        delayed=delayed,
        completed=completed,
        averageProgress=average_progress,
        averageVariance=average_variance,
        asOf=datetime.now(timezone.utc),
        upcoming=upcoming,
        startsNextSeven=starts_next_seven,
        finishesNextSeven=finishes_next_seven,
        risksNextSeven=risks_next_seven,
    )

    response = AtomScheduleResponse(scope=scope, summary=summary, items=items, conflicts=conflict_records, criticalPath=critical_path)
    _cache_set(_SCHEDULE_CACHE, cache_key, response)
    return response


def _fetch_schedule_row(schedule_uuid: uuid.UUID) -> Optional[dict]:
    query = """
        SELECT
            s.id,
            s.milestone,
            s.status,
            s.criticality,
            s.percent_complete,
            s.variance_days,
            s.planned_start,
            s.planned_finish,
            s.actual_start,
            s.actual_finish,
            s.notes,
            s.project_id,
            s.contract_id,
            s.sow_id,
            s.process_id,
            s.tenant_id,
            a.id AS atom_id,
            a.name AS atom_name,
            t.category,
            t.name AS atom_type,
            g.name AS group_name,
            contract.code AS contract_code,
            sow.code AS sow_code,
            process.code AS process_code,
            process.name AS process_name
        FROM dipgos.atom_schedule_entries s
        JOIN dipgos.atoms a ON a.id = s.atom_id
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        LEFT JOIN dipgos.atom_groups g ON g.id = t.group_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = s.contract_id
        LEFT JOIN dipgos.entities sow ON sow.entity_id = s.sow_id
        LEFT JOIN dipgos.entities process ON process.entity_id = s.process_id
        WHERE s.id = %s
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (schedule_uuid,))
            return cur.fetchone()


def _serialize_schedule_row(row: dict) -> AtomScheduleItem:
    percent = _to_float(row.get("percent_complete"))
    variance = _to_float(row.get("variance_days"))
    return AtomScheduleItem(
        scheduleId=str(row["id"]),
        atomId=str(row["atom_id"]),
        atomName=row.get("atom_name"),
        atomType=row.get("atom_type"),
        category=row.get("category"),
        groupName=row.get("group_name"),
        contractCode=row.get("contract_code"),
        sowCode=row.get("sow_code"),
        processCode=row.get("process_code"),
        processName=row.get("process_name"),
        plannedStart=row.get("planned_start"),
        plannedFinish=row.get("planned_finish"),
        actualStart=row.get("actual_start"),
        actualFinish=row.get("actual_finish"),
        percentComplete=percent,
        varianceDays=variance,
        status=(row.get("status") or "").strip() or None,
        criticality=row.get("criticality"),
        milestone=row.get("milestone"),
        notes=row.get("notes"),
        dependencies=[],
        conflictTypes=[],
        processId=str(row["process_id"]) if row.get("process_id") else None,
    )


def _record_schedule_audit(schedule_id: uuid.UUID, change_type: str, payload: dict, actor: str = "atom-manager") -> None:
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO dipgos.atom_schedule_audit (schedule_id, changed_by, change_type, payload)
                    VALUES (%s, %s, %s, %s::jsonb)
                    """,
                    (schedule_id, actor, change_type, json.dumps(payload or {}, default=str)),
                )
            conn.commit()
    except UndefinedTable:
        logger.debug("atom_schedule_audit table missing; skipping audit trail for %s", schedule_id)


def create_atom_schedule_entry(payload: AtomScheduleCreateRequest, actor: str = "atom-manager") -> AtomScheduleItem:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(payload.tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, payload.project_id, payload.contract_id, payload.sow_id, payload.process_id)
    tenant_uuid = _parse_uuid(tenant)
    if tenant_uuid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant identifier")

    scope_ids = _resolve_scope_entity_ids(scope, tenant, tenant_hint)
    process_uuid: Optional[uuid.UUID] = None
    if payload.process_id:
        process_row = _resolve_entity(payload.process_id, "process", tenant)
        process_uuid = uuid.UUID(str(process_row["entity_id"]))

    atom_uuid = uuid.UUID(payload.atom_id)
    schedule_uuid = uuid.uuid4()

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dipgos.atom_schedule_entries (
                    id, tenant_id, project_id, contract_id, sow_id, process_id,
                    atom_id, milestone, status, criticality,
                    planned_start, planned_finish, percent_complete, notes
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    schedule_uuid,
                    tenant_uuid,
                    scope_ids["project"],
                    scope_ids["contract"],
                    scope_ids["sow"],
                    process_uuid,
                    atom_uuid,
                    payload.milestone,
                    payload.status,
                    payload.criticality,
                    payload.planned_start,
                    payload.planned_finish,
                    payload.percent_complete,
                    payload.notes,
                ),
            )
        conn.commit()

    _record_schedule_audit(schedule_uuid, "create", payload.model_dump(by_alias=True, exclude_none=True), actor=actor)
    _invalidate_schedule_cache()
    row = _fetch_schedule_row(schedule_uuid)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found after creation")
    return _serialize_schedule_row(row)


def update_atom_schedule_entry(schedule_id: str, payload: AtomScheduleUpdateRequest, actor: str = "atom-manager") -> AtomScheduleItem:
    _ensure_feature_enabled()
    try:
        schedule_uuid = uuid.UUID(schedule_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid schedule identifier")

    current_row = _fetch_schedule_row(schedule_uuid)
    if not current_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found")

    update_fields: List[str] = []
    params: List = []

    if payload.planned_start is not None:
        update_fields.append("planned_start = %s")
        params.append(payload.planned_start)
    if payload.planned_finish is not None:
        update_fields.append("planned_finish = %s")
        params.append(payload.planned_finish)
    if payload.actual_start is not None:
        update_fields.append("actual_start = %s")
        params.append(payload.actual_start)
    if payload.actual_finish is not None:
        update_fields.append("actual_finish = %s")
        params.append(payload.actual_finish)
    if payload.percent_complete is not None:
        update_fields.append("percent_complete = %s")
        params.append(payload.percent_complete)
    if payload.status is not None:
        update_fields.append("status = %s")
        params.append(payload.status)
    if payload.notes is not None:
        update_fields.append("notes = %s")
        params.append(payload.notes)
    if payload.criticality is not None:
        update_fields.append("criticality = %s")
        params.append(payload.criticality)
    if payload.milestone is not None:
        update_fields.append("milestone = %s")
        params.append(payload.milestone)

    tenant_str = str(current_row["tenant_id"])

    if payload.atom_id is not None:
        try:
            new_atom_uuid = uuid.UUID(payload.atom_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid atom identifier")
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT tenant_id FROM dipgos.atoms WHERE id = %s",
                    (new_atom_uuid,),
                )
                atom_row = cur.fetchone()
        if not atom_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")
        if str(atom_row[0]) != tenant_str:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Atom belongs to a different tenant")
        update_fields.append("atom_id = %s")
        params.append(new_atom_uuid)

    if payload.process_id is not None:
        if payload.process_id == "":
            update_fields.append("process_id = NULL")
        else:
            process_row = _resolve_entity(payload.process_id, "process", tenant_str)
            process_uuid = uuid.UUID(str(process_row["entity_id"]))
            update_fields.append("process_id = %s")
            params.append(process_uuid)

    if not update_fields:
        return _serialize_schedule_row(current_row)

    update_fields.append("updated_at = NOW()")
    params.append(schedule_uuid)

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE dipgos.atom_schedule_entries
                SET {', '.join(update_fields)}
                WHERE id = %s
                """,
                params,
            )
        conn.commit()

    _record_schedule_audit(schedule_uuid, "update", payload.model_dump(by_alias=True, exclude_none=True), actor=actor)
    _invalidate_schedule_cache()
    updated_row = _fetch_schedule_row(schedule_uuid)
    if not updated_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found after update")
    return _serialize_schedule_row(updated_row)


def delete_atom_schedule_entry(schedule_id: str, actor: str = "atom-manager") -> None:
    _ensure_feature_enabled()
    try:
        schedule_uuid = uuid.UUID(schedule_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid schedule identifier")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM dipgos.atom_schedule_entries WHERE id = %s RETURNING id",
                (schedule_uuid,),
            )
            deleted = cur.fetchone()
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found")

    _record_schedule_audit(schedule_uuid, "delete", {"scheduleId": schedule_id}, actor=actor)
    _invalidate_schedule_cache()


def get_atom_daily_schedule(tenant_id: str, atom_id: str, limit: int = 14) -> AtomScheduleDailyResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    try:
        atom_uuid = uuid.UUID(atom_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")

    tenant_uuid_hint = _parse_uuid(tenant_hint)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            atom_query = [
                "SELECT a.id, a.name, t.category, a.tenant_id",
                "FROM dipgos.atoms a",
                "JOIN dipgos.atom_types t ON t.id = a.atom_type_id",
                "WHERE a.id = %s",
            ]
            atom_params: List = [atom_uuid]
            if tenant_uuid_hint:
                atom_query.append("AND a.tenant_id = %s")
                atom_params.append(tenant_uuid_hint)
            cur.execute("\n".join(atom_query), atom_params)
            atom_row = cur.fetchone()
            if not atom_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")

            tenant_uuid = uuid.UUID(str(atom_row["tenant_id"]))

            cache_key = (str(tenant_uuid), str(atom_uuid))
            cached = _cache_get(_DAILY_SCHEDULE_CACHE, cache_key)
            if cached:
                return cached

            cur.execute(
                """
                SELECT id,
                       schedule_date,
                       total_busy_minutes,
                       total_idle_minutes,
                       total_allocations,
                       volume_committed,
                       volume_unit,
                       notes,
                       payload
                FROM dipgos.atom_schedule_daily
                WHERE tenant_id = %s AND atom_id = %s
                ORDER BY schedule_date DESC
                LIMIT %s
                """,
                (tenant_uuid, atom_uuid, max(1, min(limit, 30))),
            )
            rows = cur.fetchall()

    records: List[AtomScheduleDailyRecord] = []

    for row in rows:
        payload = row.get("payload") or {}
        if not isinstance(payload, dict):
            payload = {}

        time_slots_raw = payload.get("timeSlots") or []
        volume_slots_raw = payload.get("volumeSlots") or []
        sensor_slots_raw = payload.get("sensorSlots") or []

        time_slots: List[AtomScheduleTimeSlot] = []
        for slot in time_slots_raw:
            if not isinstance(slot, dict):
                continue
            start_label, start_minutes = _parse_time_label(slot.get("start"))
            end_label, end_minutes = _parse_time_label(slot.get("end"))
            duration = _duration_minutes(start_minutes, end_minutes)
            status_value = (slot.get("status") or "busy").lower()
            if status_value not in {"busy", "idle", "monitoring", "completed", "extended"}:
                status_value = "busy"
            time_slots.append(
                AtomScheduleTimeSlot(
                    start=start_label or "--",
                    end=end_label or "--",
                    process=slot.get("process"),
                    location=slot.get("location"),
                    status=status_value,  # type: ignore[arg-type]
                    durationMinutes=duration,
                    startMinutes=start_minutes,
                    endMinutes=end_minutes,
                    notes=slot.get("notes"),
                )
            )

        volume_slots: List[AtomScheduleVolumeSlot] = []
        for slot in volume_slots_raw:
            if not isinstance(slot, dict):
                continue
            quantity = slot.get("quantity")
            quantity_value = float(quantity) if quantity is not None else None
            volume_slots.append(
                AtomScheduleVolumeSlot(
                    material=slot.get("material"),
                    quantity=quantity_value,
                    unit=slot.get("unit"),
                    process=slot.get("process"),
                    window=slot.get("window"),
                    status=slot.get("status"),
                )
            )

        sensor_slots: List[AtomScheduleSensorSlot] = []
        for slot in sensor_slots_raw:
            if not isinstance(slot, dict):
                continue
            elapsed = slot.get("elapsedHours")
            target = slot.get("targetHours")
            sensor_slots.append(
                AtomScheduleSensorSlot(
                    label=str(slot.get("label") or "Sensor"),
                    state=slot.get("state"),
                    elapsedHours=float(elapsed) if elapsed is not None else None,
                    targetHours=float(target) if target is not None else None,
                    status=slot.get("status"),
                )
            )

        records.append(
            AtomScheduleDailyRecord(
                scheduleId=str(row["id"]),
                scheduleDate=row["schedule_date"],
                totalBusyMinutes=int(row.get("total_busy_minutes") or 0),
                totalIdleMinutes=int(row.get("total_idle_minutes") or 0),
                totalAllocations=int(row.get("total_allocations") or 0),
                volumeCommitted=float(row.get("volume_committed")) if row.get("volume_committed") is not None else None,
                volumeUnit=row.get("volume_unit"),
                notes=row.get("notes"),
                timeSlots=time_slots,
                volumeSlots=volume_slots,
                sensorSlots=sensor_slots,
            )
        )

    summary = None
    if records:
        head = records[0]
        summary = AtomScheduleDailySummary(
            scheduleDate=head.schedule_date,
            totalBusyMinutes=head.total_busy_minutes,
            totalIdleMinutes=head.total_idle_minutes,
            totalAllocations=head.total_allocations,
            volumeCommitted=head.volume_committed,
            volumeUnit=head.volume_unit,
        )

    response = AtomScheduleDailyResponse(
        atomId=str(atom_row["id"]),
        atomName=atom_row["name"],
        category=atom_row.get("category"),
        records=records,
        availableDates=[record.schedule_date.isoformat() for record in records],
        summary=summary,
    )
    _cache_set(_DAILY_SCHEDULE_CACHE, cache_key, response)
    return response


def get_atom_payments(
    tenant_id: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    process_id: Optional[str],
) -> AtomPaymentResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)
    tenant_uuid = _parse_uuid(tenant)
    if tenant_uuid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant identifier")

    scope_ids = _resolve_scope_entity_ids(scope, tenant, tenant_hint)
    cache_key = (
        str(tenant_uuid),
        str(scope_ids["project"]),
        scope.contract_id or "",
        scope.sow_id or "",
        scope.process_id or "",
    )
    cached = _cache_get(_PAYMENT_CACHE, cache_key)
    if cached:
        return cached

    params: List = [tenant_uuid, scope_ids["project"]]
    filters: List[str] = []
    if scope_ids["contract"]:
        filters.append("r.contract_id = %s")
        params.append(scope_ids["contract"])
    if scope_ids["sow"]:
        filters.append("r.sow_id = %s")
        params.append(scope_ids["sow"])
    if scope_ids["process"]:
        filters.append("r.process_id = %s")
        params.append(scope_ids["process"])

    filter_sql = ""
    if filters:
        filter_sql = " AND " + " AND ".join(filters)

    query = f"""
        SELECT
            r.id,
            r.vendor,
            r.invoice_number,
            r.payment_milestone,
            r.amount,
            r.currency,
            r.status,
            r.due_date,
            r.paid_date,
            r.variance_days,
            r.notes,
            a.id AS atom_id,
            a.name AS atom_name,
            t.category,
            t.name AS atom_type,
            g.name AS group_name,
            contract.code AS contract_code,
            sow.code AS sow_code,
            process.code AS process_code
        FROM dipgos.atom_payment_records r
        JOIN dipgos.atoms a ON a.id = r.atom_id
        JOIN dipgos.atom_types t ON t.id = a.atom_type_id
        LEFT JOIN dipgos.atom_groups g ON g.id = t.group_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = r.contract_id
        LEFT JOIN dipgos.entities sow ON sow.entity_id = r.sow_id
        LEFT JOIN dipgos.entities process ON process.entity_id = r.process_id
        WHERE r.tenant_id = %s
          AND r.project_id = %s
          {filter_sql}
        ORDER BY r.due_date NULLS LAST, r.created_at DESC
    """

    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
    except UndefinedTable:
        logger.warning("atom_payment_records missing; returning empty payments for scope %s", scope.entity_id)
        rows = []

    today = date.today()
    committed_total = 0.0
    paid_total = 0.0
    outstanding_total = 0.0
    overdue_count = 0
    pending_count = 0
    payment_deltas: List[int] = []
    latest_payment_date: Optional[date] = None
    category_rollup: Dict[str, Dict[str, float | int | str]] = {}
    records: List[AtomPaymentRecord] = []

    for row in rows:
        amount = _to_float(row.get("amount")) or 0.0
        committed_total += amount

        status_raw = (row.get("status") or "").strip()
        status_key = status_raw.lower()
        paid_date: Optional[date] = row.get("paid_date")
        due_date: Optional[date] = row.get("due_date")
        is_paid = status_key in {"paid", "settled"} or paid_date is not None

        if is_paid:
            paid_total += amount
            if paid_date and due_date:
                payment_deltas.append((paid_date - due_date).days)
            if paid_date and (latest_payment_date is None or paid_date > latest_payment_date):
                latest_payment_date = paid_date
        else:
            if due_date and due_date < today:
                overdue_count += 1
            if status_key in {"pending", "submitted", "in_review"}:
                pending_count += 1

        if not is_paid:
            outstanding_total += amount

        category = row.get("category")
        label = ATOM_CATEGORY_LABELS.get(category, (category or "").title())
        rollup = category_rollup.setdefault(
            category,
            {"label": label, "committed": 0.0, "paid": 0.0, "outstanding": 0.0, "overdue": 0},
        )
        rollup["committed"] += amount
        if is_paid:
            rollup["paid"] += amount
        else:
            rollup["outstanding"] += amount
            if due_date and due_date < today:
                rollup["overdue"] += 1

        variance = _to_float(row.get("variance_days"))

        records.append(
            AtomPaymentRecord(
                paymentId=str(row["id"]),
                atomId=str(row["atom_id"]),
                atomName=row.get("atom_name"),
                atomType=row.get("atom_type"),
                category=category,
                groupName=row.get("group_name"),
                vendor=row.get("vendor"),
                invoiceNumber=row.get("invoice_number"),
                paymentMilestone=row.get("payment_milestone"),
                contractCode=row.get("contract_code"),
                sowCode=row.get("sow_code"),
                processCode=row.get("process_code"),
                dueDate=due_date,
                paidDate=paid_date,
                amount=amount,
                currency=row.get("currency") or "USD",
                status=status_raw or "pending",
                varianceDays=variance,
                notes=row.get("notes"),
            )
        )

    average_payment_days = None
    if payment_deltas:
        average_payment_days = sum(payment_deltas) / len(payment_deltas)

    summary = AtomPaymentSummary(
        committed=committed_total,
        paid=paid_total,
        outstanding=max(outstanding_total, 0.0),
        overdueCount=overdue_count,
        pendingCount=pending_count,
        averagePaymentDays=average_payment_days,
        latestPaymentDate=latest_payment_date,
        asOf=datetime.now(timezone.utc),
    )

    categories = [
        AtomPaymentCategorySummary(
            category=category,
            label=data["label"],
            committed=data["committed"],
            paid=data["paid"],
            outstanding=data["outstanding"],
            overdue=int(data["overdue"]),
        )
        for category, data in category_rollup.items()
    ]

    response = AtomPaymentResponse(scope=scope, summary=summary, categories=categories, records=records)
    _cache_set(_PAYMENT_CACHE, cache_key, response)
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
    tenant_hint = _normalise_tenant(tenant_id)
    if role.lower() != 'contractor':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only contractors can modify deployments")

    scope, tenant = _resolve_scope(tenant_hint, project_id, contract_id, sow_id, process_id)
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
        process_id=process_id or scope.process_id,
    )
