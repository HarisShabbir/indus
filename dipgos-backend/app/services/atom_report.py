from __future__ import annotations

import json
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import DefaultDict, Dict, Iterable, Optional, Tuple

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    AtomDeploymentGroupReport,
    AtomDeploymentItemReport,
    AtomDeploymentReportResponse,
    AtomJourneyEvent,
    AtomSummaryScope,
)
from .progress_v2 import _normalise_tenant as progress_normalise_tenant
from .progress_v2 import _resolve_scope as progress_resolve_scope

REPORT_CACHE_TTL = 45.0
_REPORT_CACHE: Dict[Tuple, Tuple[float, AtomDeploymentReportResponse]] = {}


def _cache_get(key: Tuple) -> Optional[AtomDeploymentReportResponse]:
    entry = _REPORT_CACHE.get(key)
    if not entry:
        return None
    timestamp, payload = entry
    if time.time() - timestamp > REPORT_CACHE_TTL:
        _REPORT_CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: Tuple, payload: AtomDeploymentReportResponse) -> None:
    _REPORT_CACHE[key] = (time.time(), payload)


def _normalise_status(raw: Optional[str]) -> str:
    value = (raw or "active").strip().lower()
    if value in {"active", "idle"}:
        return value
    if value == "completed":
        # Completed groups are delivered through the idle channel so re-use that tab.
        return "idle"
    return "active"


def _capacity_key(payload: Optional[dict]) -> Optional[str]:
    if payload is None:
        return None
    try:
        return json.dumps(payload, sort_keys=True)
    except TypeError:
        return str(payload)


def _fetch_scope_rows(scope) -> list[dict]:
    params: list = [scope.project["tenant_id"], scope.project["entity_id"]]
    where_clauses = [
        "d.tenant_id = %s",
        "project.entity_id = %s",
    ]

    if scope.contract:
        where_clauses.append("contract.entity_id = %s")
        params.append(scope.contract["entity_id"])
    if scope.sow:
        where_clauses.append("sow.entity_id = %s")
        params.append(scope.sow["entity_id"])
    if scope.process:
        where_clauses.append("process.entity_id = %s")
        params.append(scope.process["entity_id"])

    condition = " AND ".join(where_clauses)
    query = """
        WITH scope_deployments AS (
          SELECT
            d.id               AS deployment_id,
            d.atom_id,
            d.process_id,
            d.start_ts,
            d.end_ts,
            d.status           AS deployment_status,
            process.entity_id  AS process_entity_id,
            process.code       AS process_code,
            process.name       AS process_name,
            sow.entity_id      AS sow_entity_id,
            sow.code           AS sow_code,
            sow.name           AS sow_name,
            contract.entity_id AS contract_entity_id,
            contract.code      AS contract_code,
            contract.name      AS contract_name
          FROM dipgos.atom_deployments d
          JOIN dipgos.entities process  ON process.entity_id  = d.process_id
          JOIN dipgos.entities sow      ON sow.entity_id      = process.parent_id
          JOIN dipgos.entities contract ON contract.entity_id = sow.parent_id
          JOIN dipgos.entities project  ON project.entity_id  = contract.parent_id
          WHERE {condition}
        ),
        latest_journey AS (
          SELECT DISTINCT ON (j.atom_id)
            j.atom_id,
            j.status,
            j.ts
          FROM dipgos.atom_journey j
          ORDER BY j.atom_id, j.ts DESC
        )
        SELECT
          sd.deployment_id,
          sd.atom_id,
          a.name AS atom_name,
          atype.category AS atom_type,
          atype.name AS model,
          COALESCE(a.spec->>'vendor', atype.spec->>'vendor') AS vendor,
          COALESCE(NULLIF(a.spec, '{}'::jsonb), atype.spec)   AS capacity,
          COALESCE((a.spec->>'unit_cost')::numeric, 0) AS unit_cost,
          sd.process_entity_id,
          sd.process_code,
          sd.process_name,
          sd.sow_entity_id,
          sd.sow_code,
          sd.sow_name,
          sd.contract_entity_id,
          sd.contract_code,
          sd.contract_name,
          sd.start_ts,
          sd.end_ts,
          EXTRACT(EPOCH FROM (COALESCE(sd.end_ts, NOW()) - sd.start_ts)) / 3600.0 AS hours_completed,
          latest_journey.status AS journey_status,
          latest_journey.ts     AS journey_ts,
          sd.deployment_status
        FROM scope_deployments sd
        JOIN dipgos.atoms a       ON a.id = sd.atom_id
        JOIN dipgos.atom_types atype ON atype.id = a.atom_type_id
        LEFT JOIN latest_journey ON latest_journey.atom_id = sd.atom_id
        ORDER BY sd.start_ts DESC
    """
    query = query.replace("{condition}", condition)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            return cur.fetchall()


def _fetch_work_completed(process_entity_ids: Iterable[uuid.UUID]) -> Dict[uuid.UUID, dict]:
    ids = {uuid.UUID(str(entity_id)) for entity_id in process_entity_ids if entity_id}
    if not ids:
        return {}
    placeholders = ",".join(["%s"] * len(ids))
    query = f"""
        SELECT entity_id, qty_done, percent_complete, ev, pv, ac
        FROM dipgos.vw_work_completed
        WHERE entity_id IN ({placeholders})
    """
    result: Dict[uuid.UUID, dict] = {}
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, list(ids))
            for row in cur.fetchall():
                entity_id = row["entity_id"]
                result[entity_id] = {
                    "qtyDone": float(row["qty_done"]) if row["qty_done"] is not None else None,
                    "percentComplete": float(row["percent_complete"]) if row["percent_complete"] is not None else None,
                    "ev": float(row["ev"]) if row["ev"] is not None else None,
                    "pv": float(row["pv"]) if row["pv"] is not None else None,
                    "ac": float(row["ac"]) if row["ac"] is not None else None,
                }
    return result


def _fetch_journeys_map(atom_ids: Iterable[uuid.UUID]) -> Dict[uuid.UUID, list[AtomJourneyEvent]]:
    ids = {uuid.UUID(str(atom_id)) for atom_id in atom_ids if atom_id}
    if not ids:
        return {}
    placeholders = ",".join(["%s"] * len(ids))
    query = f"""
        SELECT atom_id, status, ts
        FROM dipgos.atom_journey
        WHERE atom_id IN ({placeholders})
        ORDER BY atom_id, ts ASC
    """
    journeys: DefaultDict[uuid.UUID, list[AtomJourneyEvent]] = defaultdict(list)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, list(ids))
            for row in cur.fetchall():
                journeys[row["atom_id"]].append(AtomJourneyEvent(status=row["status"], ts=row["ts"]))
    return journeys


def _fetch_latest_telemetry_map(atom_ids: Iterable[uuid.UUID]) -> Dict[uuid.UUID, dict]:
    ids = {uuid.UUID(str(atom_id)) for atom_id in atom_ids if atom_id}
    if not ids:
        return {}
    placeholders = ",".join(["%s"] * len(ids))
    query = f"""
        SELECT DISTINCT ON (atom_id)
          atom_id,
          payload
        FROM dipgos.atom_telemetry
        WHERE atom_id IN ({placeholders})
        ORDER BY atom_id, ts DESC
    """
    telemetry: Dict[uuid.UUID, dict] = {}
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            try:
                cur.execute(query, list(ids))
            except Exception:
                # Table may not exist in dev environments yet.
                conn.rollback()
                return {}
            for row in cur.fetchall():
                telemetry[row["atom_id"]] = row["payload"]
    return telemetry


def _classify_row(journey_status: Optional[str], deployment_status: Optional[str], end_ts: Optional[datetime]) -> str:
    if end_ts is not None:
        return "completed"
    status_token = (journey_status or "").lower()
    deployment_token = (deployment_status or "").lower()
    if "engaged" in status_token or deployment_token in {"active", "engaged"}:
        return "active"
    if status_token in {"completed", "complete"} or deployment_token in {"completed", "complete", "closed"}:
        return "completed"
    return "idle"


def _choose_status_label(counter: Counter) -> Optional[str]:
    if not counter:
        return None
    label, _ = counter.most_common(1)[0]
    return label


def get_deployment_report(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
    status: str,
    category: Optional[str] = None,
    *,
    page: int = 1,
    size: int = 50,
    sort: Optional[str] = None,
) -> AtomDeploymentReportResponse:
    if not settings.feature_atom_manager or not settings.feature_progress_v2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Atom Manager reporting is disabled")

    normalised_status = _normalise_status(status)
    tenant_hint = progress_normalise_tenant(tenant_id)
    scope = progress_resolve_scope(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )

    scope_identifier = AtomSummaryScope(
        entityId=str(scope.target_entity_id),
        level=scope.scope_level,
        projectId=scope.project["code"],
        contractId=scope.contract["code"] if scope.contract else None,
        sowId=scope.sow["code"] if scope.sow else None,
        processId=scope.process["code"] if scope.process else None,
    )

    cache_key = (
        scope_identifier.entity_id,
        scope_identifier.level,
        tenant_hint or "default",
        normalised_status,
        (category or "").lower(),
        page,
        size,
        sort or "",
    )
    cached = _cache_get(cache_key)
    if cached:
        return cached

    rows = _fetch_scope_rows(scope)
    atom_ids = [row["atom_id"] for row in rows]
    journeys_map = _fetch_journeys_map(atom_ids)
    telemetry_map = _fetch_latest_telemetry_map(atom_ids)
    work_map = _fetch_work_completed(row["process_entity_id"] for row in rows)

    buckets_by_status: Dict[str, Dict[Tuple, dict]] = {
        "active": {},
        "idle": {},
        "completed": {},
    }
    totals = {"active": 0, "idle": 0, "completed": 0}
    category_filter = (category or "").strip().lower() or None

    for row in rows:
        atom_category = (row["atom_type"] or "").lower()
        if category_filter and atom_category != category_filter:
            continue
        classification = _classify_row(row.get("journey_status"), row.get("deployment_status"), row.get("end_ts"))
        bucket_map = buckets_by_status[classification]

        capacity = row.get("capacity")
        key = (
            row["atom_type"],
            row["model"],
            row.get("vendor"),
            _capacity_key(capacity),
            row.get("process_entity_id"),
        )

        bucket = bucket_map.get(key)
        if not bucket:
            bucket = {
                "atom_type": row["atom_type"],
                "model": row["model"],
                "vendor": row.get("vendor"),
                "capacity": capacity,
                "process_entity_id": row.get("process_entity_id"),
                "process_code": row.get("process_code"),
                "process_name": row.get("process_name"),
                "sow_entity_id": row.get("sow_entity_id"),
                "sow_code": row.get("sow_code"),
                "sow_name": row.get("sow_name"),
                "contract_entity_id": row.get("contract_entity_id"),
                "contract_code": row.get("contract_code"),
                "contract_name": row.get("contract_name"),
                "deployment_statuses": Counter(),
                "journey_counts": Counter(),
                "deployment_start": None,
                "hours": 0.0,
                "items": [],
                "value": 0.0,
            }
            bucket_map[key] = bucket

        start_ts = row.get("start_ts")
        hours_completed = max(0.0, float(row.get("hours_completed") or 0.0))
        unit_cost = float(row.get("unit_cost") or 0.0)

        bucket["hours"] += hours_completed
        bucket["value"] += unit_cost
        if start_ts is not None:
            if bucket["deployment_start"] is None or start_ts < bucket["deployment_start"]:
                bucket["deployment_start"] = start_ts

        journey_label = (row.get("journey_status") or "").lower() or classification
        deployment_label = (row.get("deployment_status") or "").lower()
        bucket["journey_counts"][journey_label] += 1
        if deployment_label:
            bucket["deployment_statuses"][deployment_label] += 1

        atom_uuid = uuid.UUID(str(row["atom_id"]))
        item = AtomDeploymentItemReport(
            atomId=str(atom_uuid),
            serial=row.get("atom_name"),
            deploymentStart=start_ts,
            hoursCompleted=hours_completed,
            latestTelemetry=telemetry_map.get(atom_uuid),
            journey=journeys_map.get(atom_uuid, []),
            unitCost=unit_cost if unit_cost else None,
        )
        bucket["items"].append(item)

        totals[classification] += 1

    def build_groups(source: Dict[Tuple, dict]) -> list[AtomDeploymentGroupReport]:
        groups: list[AtomDeploymentGroupReport] = []
        for info in source.values():
            process_entity_id = info.get("process_entity_id")
            work_completed = None
            if process_entity_id:
                try:
                    work_completed = work_map.get(uuid.UUID(str(process_entity_id)))
                except ValueError:
                    work_completed = work_map.get(process_entity_id)

            journey_status = _choose_status_label(info["journey_counts"])
            deployment_status = _choose_status_label(info["deployment_statuses"])

            groups.append(
                AtomDeploymentGroupReport(
                    atomType=info["atom_type"],
                    model=info["model"],
                    vendor=info.get("vendor"),
                    capacity=info.get("capacity"),
                    count=len(info["items"]),
                    deploymentStartEarliest=info["deployment_start"],
                    hoursCompleted=info["hours"],
                    workCompleted=work_completed,
                    journeyStatus=journey_status,
                    deploymentStatus=deployment_status,
                    items=info["items"],
                    processId=str(process_entity_id) if process_entity_id else None,
                    processCode=info.get("process_code"),
                    processName=info.get("process_name"),
                    sowId=str(info.get("sow_entity_id")) if info.get("sow_entity_id") else None,
                    sowCode=info.get("sow_code"),
                    sowName=info.get("sow_name"),
                    contractId=str(info.get("contract_entity_id")) if info.get("contract_entity_id") else None,
                    contractCode=info.get("contract_code"),
                    contractName=info.get("contract_name"),
                    value=float(info.get("value") or 0.0),
                )
            )
        return groups

    active_groups = build_groups(buckets_by_status["active"])
    idle_groups = build_groups(buckets_by_status["idle"])
    completed_groups = build_groups(buckets_by_status["completed"])

    if normalised_status == "active":
        groups = active_groups
    else:
        groups = idle_groups + completed_groups

    def sort_groups(payload: list[AtomDeploymentGroupReport], spec: Optional[str]) -> list[AtomDeploymentGroupReport]:
        if not payload:
            return payload
        field = "count"
        descending = True
        if spec:
            parts = spec.split(":")
            if parts:
                field = parts[0] or "count"
            if len(parts) > 1:
                descending = parts[1].lower() != "asc"

        def key_fn(group: AtomDeploymentGroupReport):
            if field == "model":
                return group.model.lower()
            if field == "vendor":
                return (group.vendor or "").lower()
            if field == "hours":
                return group.hoursCompleted or 0.0
            if field == "start":
                return group.deploymentStartEarliest or datetime.max.replace(tzinfo=timezone.utc)
            if field == "journey":
                return (group.journeyStatus or "")
            return group.count

        return sorted(payload, key=key_fn, reverse=descending)

    sorted_groups = sort_groups(groups, sort)
    size = max(1, min(size, 200))
    page = max(1, page)
    start_index = (page - 1) * size
    end_index = start_index + size
    paged_groups = sorted_groups[start_index:end_index]

    response = AtomDeploymentReportResponse(
        scope=scope_identifier,
        status=normalised_status,
        groups=paged_groups,
        totals=totals,
        asOf=datetime.now(timezone.utc),
        pagination={
            "page": page,
            "size": size,
            "totalGroups": len(sorted_groups),
        },
    )
    _cache_set(cache_key, response)
    return response
