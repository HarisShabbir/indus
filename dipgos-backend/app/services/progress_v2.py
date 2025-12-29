from __future__ import annotations

import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models.progress import (
    DPPRBulkRequest,
    DPPRBulkResponse,
    FinancialSummaryResponse,
    NextActivity,
    ProgressHierarchyProcess,
    ProgressHierarchyResponse,
    ProgressHierarchyContract,
    ProgressHierarchyProject,
    ProgressHierarchySow,
    ProgressSummaryResponse,
    ScheduleSummaryResponse,
)


TTL_SECONDS = 45.0
_CACHE: Dict[Tuple, Tuple[float, object]] = {}


@dataclass
class _Scope:
    tenant_id: Optional[uuid.UUID]
    project: dict
    contract: Optional[dict]
    sow: Optional[dict]
    process: Optional[dict]

    @property
    def target_entity_id(self) -> uuid.UUID:
        if self.process:
            return self.process["entity_id"]
        if self.sow:
            return self.sow["entity_id"]
        if self.contract:
            return self.contract["entity_id"]
        return self.project["entity_id"]

    @property
    def scope_level(self) -> str:
        if self.process:
            return "process"
        if self.sow:
            return "sow"
        if self.contract:
            return "contract"
        return "project"

    @property
    def scope_code(self) -> str:
        if self.process:
            return self.process["code"]
        if self.sow:
            return self.sow["code"]
        if self.contract:
            return self.contract["code"]
        return self.project["code"]


# Public alias used by other services
ProgressScope = _Scope


def _ensure_feature_enabled() -> None:
    if not settings.feature_progress_v2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Progress v2 API is disabled")


def _cache_get(key: Tuple):
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: Tuple, payload):
    _CACHE[key] = (time.time(), payload)


def _clear_cache():
    _CACHE.clear()


def _normalise_tenant(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except ValueError:
        lowered = raw.lower()
        return lowered or None


def _parse_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _fetch_entity(identifier: str, level: Optional[str], tenant_hint: Optional[str]) -> Optional[dict]:
    tenant_uuid = _parse_uuid(tenant_hint)
    params: List = []
    query = """
        SELECT entity_id, level, code, name, parent_id, tenant_id
        FROM dipgos.entities
        WHERE 1=1
    """
    entity_uuid = _parse_uuid(identifier)
    if entity_uuid:
        query += " AND entity_id = %s"
        params.append(entity_uuid)
    else:
        query += " AND code = %s"
        params.append(identifier)
    if level:
        query += " AND level = %s"
        params.append(level)
    if tenant_uuid:
        query += " AND tenant_id = %s"
        params.append(tenant_uuid)

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            return cur.fetchone()


def _resolve_scope(
    tenant_hint: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> _Scope:
    project_row = _fetch_entity(project_code, "project", tenant_hint)
    if not project_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    tenant_uuid = _parse_uuid(project_row["tenant_id"])

    contract_row = None
    if contract_code:
        contract_row = _fetch_entity(contract_code, "contract", str(tenant_uuid))
        if not contract_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
        if contract_row["parent_id"] != project_row["entity_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Contract outside project scope")

    sow_row = None
    if sow_code:
        sow_row = _fetch_entity(sow_code, "sow", str(tenant_uuid))
        if not sow_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOW not found")
        expected_parent = contract_row["entity_id"] if contract_row else None
        if expected_parent and sow_row["parent_id"] != expected_parent:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SOW outside contract scope")

    process_row = None
    if process_code:
        process_row = _fetch_entity(process_code, "process", str(tenant_uuid))
        if not process_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
        expected_parent = sow_row["entity_id"] if sow_row else None
        if expected_parent and process_row["parent_id"] != expected_parent:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Process outside SOW scope")

    return _Scope(
        tenant_id=tenant_uuid,
        project=project_row,
        contract=contract_row,
        sow=sow_row,
        process=process_row,
    )


def progress_normalise_tenant(raw: Optional[str]) -> Optional[str]:
    """Expose tenant normaliser for modules that need shared behaviour."""

    return _normalise_tenant(raw)


def resolve_scope_with_fallback(
    tenant_hint: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ProgressScope:
    """Attempt to resolve the requested scope, backing off to broader levels when entities are missing."""

    current_contract = contract_code
    current_sow = sow_code
    current_process = process_code

    while True:
        try:
            return _resolve_scope(
                tenant_hint,
                project_code,
                current_contract,
                current_sow,
                current_process,
            )
        except HTTPException as exc:
            detail = str(exc.detail or "").lower()
            if exc.status_code != status.HTTP_404_NOT_FOUND:
                raise

            if current_process and "process not found" in detail:
                current_process = None
                continue
            if current_sow and "sow not found" in detail:
                current_sow = None
                current_process = None
                continue
            if current_contract and "contract not found" in detail:
                current_contract = None
                current_sow = None
                current_process = None
                continue
            raise


def get_progress_hierarchy(tenant_id: Optional[str]) -> ProgressHierarchyResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(tenant_id)
    params: List = []
    query = """
        SELECT entity_id, level, code, name, parent_id, tenant_id
        FROM dipgos.entities
        WHERE level IN ('project', 'contract', 'sow', 'process')
    """
    tenant_uuid = _parse_uuid(tenant_hint) if tenant_hint else None
    if tenant_uuid:
        query += " AND tenant_id = %s"
        params.append(tenant_uuid)
    query += """
        ORDER BY
          CASE level
            WHEN 'project' THEN 1
            WHEN 'contract' THEN 2
            WHEN 'sow' THEN 3
            ELSE 4
          END,
          name
    """

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    projects: "OrderedDict[uuid.UUID, dict]" = OrderedDict()
    contracts: Dict[uuid.UUID, dict] = {}
    sows: Dict[uuid.UUID, dict] = {}

    for row in rows:
        level = row["level"]
        entity_id = row["entity_id"]
        parent_id = row["parent_id"]

        if level == "project":
            projects[entity_id] = {
                "code": row["code"],
                "name": row["name"],
                "contracts": [],
            }
        elif level == "contract":
            parent = projects.get(parent_id)
            if not parent:
                continue
            node = {
                "code": row["code"],
                "name": row["name"],
                "sows": [],
            }
            parent["contracts"].append(node)
            contracts[entity_id] = node
        elif level == "sow":
            parent = contracts.get(parent_id)
            if not parent:
                continue
            node = {
                "code": row["code"],
                "name": row["name"],
                "processes": [],
            }
            parent["sows"].append(node)
            sows[entity_id] = node
        elif level == "process":
            parent = sows.get(parent_id)
            if not parent:
                continue
            parent["processes"].append(
                {
                    "code": row["code"],
                    "name": row["name"],
                }
            )

    return ProgressHierarchyResponse(
        projects=list(projects.values()),
        asOf=datetime.now(timezone.utc),
    )


def _resolve_entity_for_ingest(identifier: str, tenant_hint: Optional[str]) -> dict:
    row = _fetch_entity(identifier, None, tenant_hint)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Entity '{identifier}' not found")
    if row["level"] not in {"process", "sow"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="DPPR rows must target SOW or Process level")
    return row


def _fetch_progress_row(entity_id: uuid.UUID) -> dict:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT ev, pv, ac, spi, cpi, percent_complete, slip_days, as_of
                FROM dipgos.vw_progress_rollup
                WHERE entity_id = %s
                """,
                (entity_id,),
            )
            row = cur.fetchone()
            return row or {
                "ev": 0,
                "pv": 0,
                "ac": 0,
                "spi": None,
                "cpi": None,
                "percent_complete": None,
                "slip_days": 0,
                "as_of": datetime.now(timezone.utc).date(),
            }


def _collect_next_activities(scope: _Scope, limit: int = 10) -> List[NextActivity]:
    clauses: List[str] = ["process.tenant_id = %s"]
    params: List = [scope.tenant_id or scope.project["tenant_id"]]

    if scope.process:
        clauses.append("na.process_id = %s")
        params.append(scope.process["entity_id"])
    elif scope.sow:
        clauses.append("na.sow_id = %s")
        params.append(scope.sow["entity_id"])
    elif scope.contract:
        clauses.append("na.contract_id = %s")
        params.append(scope.contract["entity_id"])
    else:
        clauses.append("contract.parent_id = %s")
        params.append(scope.project["entity_id"])

    query = f"""
        SELECT na.process_id, na.name, na.planned_start, na.ready
        FROM dipgos.vw_next_activities na
        JOIN dipgos.entities process ON process.entity_id = na.process_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = na.contract_id
        WHERE {' AND '.join(clauses)}
        ORDER BY na.planned_start NULLS LAST, na.process_id
        LIMIT %s
    """
    params.append(limit)

    results: List[NextActivity] = []
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            for row in cur.fetchall():
                results.append(
                    NextActivity(
                        processId=str(row["process_id"]),
                        name=row["name"],
                        plannedStart=row["planned_start"],
                        ready=bool(row["ready"]),
                    )
                )
    return results


def _collect_schedule_data(scope: _Scope) -> Tuple[Optional[date], Optional[date], Optional[date], Optional[date]]:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                WITH RECURSIVE descendants AS (
                  SELECT entity_id, level, tenant_id
                  FROM dipgos.entities
                  WHERE entity_id = %s
                  UNION ALL
                  SELECT child.entity_id, child.level, child.tenant_id
                  FROM dipgos.entities child
                  JOIN descendants d ON child.parent_id = d.entity_id
                )
                SELECT
                  MIN(ps.planned_start)::date AS planned_start,
                  MAX(ps.planned_finish)::date AS planned_finish,
                  MIN(dp.report_date)::date AS actual_start,
                  MAX(dp.report_date)::date AS actual_finish
                FROM descendants d
                LEFT JOIN dipgos.process_schedule ps ON ps.process_id = d.entity_id
                LEFT JOIN dipgos.dppr dp ON dp.entity_id = d.entity_id
                WHERE d.tenant_id = %s
                  AND d.level = 'process'
                """,
                (scope.target_entity_id, scope.tenant_id or scope.project["tenant_id"]),
            )
            row = cur.fetchone() or {}
            return (
                row.get("planned_start"),
                row.get("planned_finish"),
                row.get("actual_start"),
                row.get("actual_finish"),
            )


def _ensure_evm_row(cur, entity_id: uuid.UUID, report_date: date, ev: float, pv: float, ac: float) -> None:
    spi = None if pv in (None, 0) else float(ev) / float(pv or 1)
    cpi = None if ac in (None, 0) else float(ev) / float(ac or 1)
    cur.execute(
        """
        INSERT INTO dipgos.evm_metrics (entity_id, period_date, ev, pv, ac, spi, cpi, percent_complete)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (entity_id, period_date)
        DO UPDATE SET ev = EXCLUDED.ev,
                      pv = EXCLUDED.pv,
                      ac = EXCLUDED.ac,
                      spi = EXCLUDED.spi,
                      cpi = EXCLUDED.cpi,
                      percent_complete = EXCLUDED.percent_complete
        """,
        (
            entity_id,
            report_date,
            ev,
            pv,
            ac,
            spi,
            cpi,
            spi,
        ),
    )


def upsert_progress(payload: DPPRBulkRequest) -> DPPRBulkResponse:
    _ensure_feature_enabled()
    tenant_hint = _normalise_tenant(payload.tenant_id)
    if not payload.rows:
        return DPPRBulkResponse(updated=0, asOf=datetime.now(timezone.utc))

    updated = 0
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            for row in payload.rows:
                entity = _resolve_entity_for_ingest(row.entity_id, tenant_hint)
                entity_id = entity["entity_id"]
                qty_done = row.qty_done or 0.0
                qty_planned = row.qty_planned or 0.0
                ev = row.ev if row.ev is not None else qty_done
                pv = row.pv if row.pv is not None else qty_planned
                ac = row.ac if row.ac is not None else qty_done
                cur.execute(
                    """
                    INSERT INTO dipgos.dppr (id, entity_id, report_date, qty_done, qty_planned, ev, pv, ac, notes)
                    VALUES (COALESCE(uuid_generate_v4(), uuid_generate_v4()), %s, %s, %s, %s, %s, %s, %s, %s)
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
                        entity_id,
                        row.report_date,
                        qty_done,
                        qty_planned,
                        ev,
                        pv,
                        ac,
                        row.notes,
                    ),
                )
                _ensure_evm_row(cur, entity_id, row.report_date, ev, pv, ac)
                updated += 1
        conn.commit()

    _clear_cache()
    return DPPRBulkResponse(updated=updated, asOf=datetime.now(timezone.utc))


def get_progress_summary(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ProgressSummaryResponse:
    _ensure_feature_enabled()
    scope = _resolve_scope(_normalise_tenant(tenant_id), project_code, contract_code, sow_code, process_code)
    cache_key = ("progress", scope.scope_level, scope.scope_code, tenant_id or "")
    cached = _cache_get(cache_key)
    if cached:
        return cached

    row = _fetch_progress_row(scope.target_entity_id)
    as_of_date = row.get("as_of") or datetime.now(timezone.utc).date()
    as_of = datetime.combine(as_of_date, datetime.min.time(), tzinfo=timezone.utc)
    ev = float(row.get("ev") or 0.0)
    pv = float(row.get("pv") or 0.0)
    ac = float(row.get("ac") or 0.0)
    spi = float(row["spi"]) if row.get("spi") is not None else None
    cpi = float(row["cpi"]) if row.get("cpi") is not None else None
    percent_complete = float(row["percent_complete"]) if row.get("percent_complete") is not None else None
    slips = float(row.get("slip_days") or 0.0)
    activities = _collect_next_activities(scope)

    response = ProgressSummaryResponse(
        ev=ev,
        pv=pv,
        ac=ac,
        spi=spi,
        cpi=cpi,
        percent_complete=percent_complete,
        slips=slips,
        next_activities=activities,
        as_of=as_of,
    )
    _cache_set(cache_key, response)
    return response


def get_schedule_summary(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ScheduleSummaryResponse:
    _ensure_feature_enabled()
    scope = _resolve_scope(_normalise_tenant(tenant_id), project_code, contract_code, sow_code, process_code)
    cache_key = ("schedule", scope.scope_level, scope.scope_code, tenant_id or "")
    cached = _cache_get(cache_key)
    if cached:
        return cached

    planned_start, planned_finish, actual_start, actual_finish = _collect_schedule_data(scope)
    progress = get_progress_summary(tenant_id, project_code, contract_code, sow_code, process_code)

    duration_variance = None
    if planned_start and planned_finish and actual_start and actual_finish:
        planned_duration = (planned_finish - planned_start).days
        actual_duration = (actual_finish - actual_start).days
        duration_variance = float(actual_duration - planned_duration)

    response = ScheduleSummaryResponse(
        scope_level=scope.scope_level,
        scope_code=scope.scope_code,
        planned_start=planned_start,
        planned_finish=planned_finish,
        actual_start=actual_start,
        actual_finish=actual_finish,
        duration_variance_days=duration_variance,
        percent_complete=progress.percent_complete,
        as_of=progress.as_of,
        next_activities=_collect_next_activities(scope),
    )
    _cache_set(cache_key, response)
    return response


def get_financial_summary(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
) -> FinancialSummaryResponse:
    _ensure_feature_enabled()
    scope = _resolve_scope(_normalise_tenant(tenant_id), project_code, contract_code, None, None)
    cache_key = ("financial", scope.scope_level, scope.scope_code, tenant_id or "")
    cached = _cache_get(cache_key)
    if cached:
        return cached

    progress = get_progress_summary(tenant_id, project_code, contract_code, None, None)
    planned_start, planned_finish, actual_start, actual_finish = _collect_schedule_data(scope)

    cost_variance = progress.ev - progress.ac
    schedule_variance = progress.ev - progress.pv

    burn_rate = None
    if actual_start and actual_finish and actual_start <= actual_finish:
        days = (actual_finish - actual_start).days + 1
        if days > 0:
            burn_rate = progress.ac / float(days)

    response = FinancialSummaryResponse(
        ev=progress.ev,
        pv=progress.pv,
        ac=progress.ac,
        spi=progress.spi,
        cpi=progress.cpi,
        cost_variance=cost_variance,
        schedule_variance=schedule_variance,
        burn_rate=burn_rate,
        as_of=progress.as_of,
    )
    _cache_set(cache_key, response)
    return response
