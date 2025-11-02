from __future__ import annotations

import time
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    ExpectedFundRow,
    ExpectedOutgoingFundRow,
    ExpenseRow,
    FinancialSummary,
    FundAllocationResponse,
    FundAllocationRow,
    FundFlowResponse,
    IncomingFundRow,
    IncomingFundsResponse,
    OutgoingFundRow,
    OutgoingFundsResponse,
    SankeyLink,
    SankeyNode,
)
from ..models.financial import FundAllocationRow as FundAllocationRowModel
from ..services.progress_v2 import (
    ProgressScope,
    progress_normalise_tenant,
    resolve_scope_with_fallback,
)

CACHE_TTL_SECONDS = 45.0

_SummaryKey = Tuple[str, str, Optional[str]]
_AllocationKey = Tuple[str, str]
_ExpensesKey = Tuple[str, str, Optional[str]]
_FlowKey = Tuple[str, str, Optional[str]]
_IncomingKey = Tuple[str, str]
_OutgoingKey = Tuple[str, str, Optional[str]]

_summary_cache: Dict[_SummaryKey, Tuple[float, FinancialSummary]] = {}
_allocation_cache: Dict[_AllocationKey, Tuple[float, FundAllocationResponse]] = {}
_expenses_cache: Dict[_ExpensesKey, Tuple[float, Tuple[ExpenseRow, ...]]] = {}
_flow_cache: Dict[_FlowKey, Tuple[float, FundFlowResponse]] = {}
_incoming_cache: Dict[_IncomingKey, Tuple[float, IncomingFundsResponse]] = {}
_outgoing_cache: Dict[_OutgoingKey, Tuple[float, OutgoingFundsResponse]] = {}


def clear_financial_cache() -> None:
    _summary_cache.clear()
    _allocation_cache.clear()
    _expenses_cache.clear()
    _flow_cache.clear()
    _incoming_cache.clear()
    _outgoing_cache.clear()


def _cache_get(cache: Dict, key: Tuple) -> Optional[object]:
    entry = cache.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > CACHE_TTL_SECONDS:
        cache.pop(key, None)
        return None
    return payload


def _cache_set(cache: Dict, key: Tuple, payload: object) -> None:
    cache[key] = (time.time(), payload)


def _ensure_feature_enabled() -> None:
    if not settings.feature_financial_view:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Financial view is disabled")


def _to_float(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_tenant(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None


def _as_datetime(value: Optional[object]) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)
    return None


def _entity_row(conn, level: str, code: str) -> Optional[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT entity_id, level, code, name, parent_id, tenant_id
            FROM dipgos.entities
            WHERE level = %s AND code = %s
            LIMIT 1
            """,
            (level, code),
        )
        return cur.fetchone()


def _resolve_scope(conn, project_code: str, contract_code: Optional[str], tenant_id: str):
    project = _entity_row(conn, "project", project_code)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not registered for financial view")

    tenant_uuid = _normalize_tenant(tenant_id)
    project_tenant = str(project["tenant_id"]) if project.get("tenant_id") is not None else None
    if tenant_uuid and project_tenant and tenant_uuid != project_tenant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")

    contract = None
    if contract_code:
        contract = _entity_row(conn, "contract", contract_code)
        if not contract:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not registered for financial view")
        if contract.get("parent_id") != project["entity_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract does not belong to project")
        contract_tenant = str(contract["tenant_id"]) if contract.get("tenant_id") is not None else None
        if tenant_uuid and contract_tenant and tenant_uuid != contract_tenant:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")

    return project, contract


def _schedule_rollup_rows(
    conn,
    tenant_uuid: str,
    project_entity_id: UUID,
) -> List[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
              level,
              entity_id,
              project_id,
              contract_id,
              sow_id,
              process_id,
              planned_value,
              actual_cost,
              percent_complete,
              earned_value
            FROM dipgos.vw_atom_schedule_financial_rollup
            WHERE tenant_id = %s
              AND project_id = %s
            """,
            (tenant_uuid, project_entity_id),
        )
        return list(cur.fetchall())


def _entity_details(conn, entity_ids: Iterable[UUID]) -> Dict[UUID, dict]:
    ids = [eid for eid in entity_ids if eid is not None]
    if not ids:
        return {}
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT entity_id, level, name, code
            FROM dipgos.entities
            WHERE entity_id = ANY(%s)
            """,
            (ids,),
        )
        return {row["entity_id"]: row for row in cur.fetchall()}


def _ratio(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator if denominator else None


def _status_for_budget(actual: Optional[float], planned: Optional[float]) -> str:
    if planned in (None, 0):
        return "unbudgeted" if (actual or 0) > 0 else "unallocated"
    ratio = (actual or 0) / planned if planned else 0
    if ratio < 0.85:
        return "under-budget"
    if ratio <= 1.1:
        return "on-budget"
    return "over-budget"


def get_financial_summary(project_code: str, contract_code: Optional[str], tenant_id: str) -> FinancialSummary:
    _ensure_feature_enabled()
    cache_key: _SummaryKey = (tenant_id, project_code, contract_code or "")
    cached = _cache_get(_summary_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, contract = _resolve_scope(conn, project_code, contract_code, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])

    target_id = contract["entity_id"] if contract else project["entity_id"]
    target_level = "contract" if contract else "project"
    target_row = next(
        (row for row in rows if row["level"] == target_level and row["entity_id"] == target_id),
        None,
    )

    if not target_row:
        summary = FinancialSummary()
        _cache_set(_summary_cache, cache_key, summary)
        return summary

    pv = _to_float(target_row.get("planned_value"))
    ac = _to_float(target_row.get("actual_cost"))
    ev = _to_float(target_row.get("earned_value"))
    percent_complete = _to_float(target_row.get("percent_complete"))
    spi = _ratio(ev, pv)
    cpi = _ratio(ev, ac)

    variance_abs = None
    variance_pct = None
    burn_rate = None
    if ev is not None and pv is not None:
        variance_abs = ev - pv
        if pv not in (0, None):
            variance_pct = (ev - pv) / pv if pv != 0 else None
    if ev is not None and ac is not None:
        burn_rate = ac - ev

    summary = FinancialSummary(
        ev=ev,
        pv=pv,
        ac=ac,
        spi=spi,
        cpi=cpi,
        burn_rate=burn_rate,
        variance_abs=variance_abs,
        variance_pct=variance_pct,
        as_of=datetime.now(timezone.utc),
    )
    _cache_set(_summary_cache, cache_key, summary)
    return summary


def get_fund_allocation(project_code: str, tenant_id: str) -> FundAllocationResponse:
    _ensure_feature_enabled()
    cache_key: _AllocationKey = (tenant_id, project_code)
    cached = _cache_get(_allocation_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, _ = _resolve_scope(conn, project_code, None, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])
        contract_rows = [row for row in rows if row["level"] == "contract"]
        entity_ids = [project["entity_id"]] + [row["entity_id"] for row in contract_rows if row["entity_id"]]
        entity_map = _entity_details(conn, entity_ids)

    project_meta = entity_map.get(project["entity_id"], {"name": project["name"]})
    project_data = next((row for row in rows if row["level"] == "project" and row["entity_id"] == project["entity_id"]), None)
    project_amount = _to_float(project_data["planned_value"]) if project_data else None
    project_status = _status_for_budget(
        _to_float(project_data["actual_cost"]) if project_data else None,
        project_amount,
    ) if project_data else None
    project_row = FundAllocationRow(
        description=project_meta.get("name") or project_code,
        amount=project_amount,
        status=project_status,
    )

    contracts: list[FundAllocationRow] = []
    for row in contract_rows:
        entity_id: UUID = row["entity_id"]
        meta = entity_map.get(entity_id, {})
        planned = _to_float(row.get("planned_value"))
        actual = _to_float(row.get("actual_cost"))
        contracts.append(
            FundAllocationRow(
                description=meta.get("name") or meta.get("code") or "—",
                amount=planned,
                status=_status_for_budget(actual, planned),
                contractId=meta.get("code"),
            )
        )

    response = FundAllocationResponse(project=project_row, contracts=contracts)
    _cache_set(_allocation_cache, cache_key, response)
    return response


def get_expenses(project_code: str, contract_code: Optional[str], tenant_id: str) -> Tuple[ExpenseRow, ...]:
    _ensure_feature_enabled()
    cache_key: _ExpensesKey = (tenant_id, project_code, contract_code or "")
    cached = _cache_get(_expenses_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, contract = _resolve_scope(conn, project_code, contract_code, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])

    contract_entity_id = contract["entity_id"] if contract else None
    process_rows = [
        row
        for row in rows
        if row["level"] == "process" and (not contract_entity_id or row["contract_id"] == contract_entity_id)
    ]

    if not process_rows:
        result: Tuple[ExpenseRow, ...] = ()
        _cache_set(_expenses_cache, cache_key, result)
        return result

    entity_ids = set()
    for row in process_rows:
        if row["process_id"]:
            entity_ids.add(row["process_id"])
        if row["sow_id"]:
            entity_ids.add(row["sow_id"])
        if row["contract_id"]:
            entity_ids.add(row["contract_id"])
    entity_map = _entity_details(conn, entity_ids)

    contracts_map: Dict[UUID, ExpenseRow] = {}
    sow_map: Dict[Tuple[UUID, UUID], ExpenseRow] = {}
    response: list[ExpenseRow] = []

    grouped_by_contract: Dict[UUID, List[dict]] = defaultdict(list)
    for row in process_rows:
        contract_id = row["contract_id"]
        if contract_id is None:
            continue
        grouped_by_contract[contract_id].append(row)

    for contract_id, contract_rows in grouped_by_contract.items():
        meta = entity_map.get(contract_id, {})
        contract_name = meta.get("name") or meta.get("code") or "—"
        planned = sum(_to_float(r.get("planned_value")) or 0 for r in contract_rows)
        actual = sum(_to_float(r.get("actual_cost")) or 0 for r in contract_rows)
        contract_expense = ExpenseRow(
            description=contract_name,
            contractCode=meta.get("code"),
            actual=actual,
            paid=actual,
            balance=(planned or 0) - (actual or 0),
            status=_status_for_budget(actual, planned),
            children=[],
        )
        contracts_map[contract_id] = contract_expense
        response.append(contract_expense)

        grouped_by_sow: Dict[UUID, List[dict]] = defaultdict(list)
        for row in contract_rows:
            if row["sow_id"]:
                grouped_by_sow[row["sow_id"]].append(row)

        for sow_id, sow_rows in grouped_by_sow.items():
            sow_meta = entity_map.get(sow_id, {})
            sow_name = sow_meta.get("name") or sow_meta.get("code") or "—"
            sow_planned = sum(_to_float(r.get("planned_value")) or 0 for r in sow_rows)
            sow_actual = sum(_to_float(r.get("actual_cost")) or 0 for r in sow_rows)
            sow_row = ExpenseRow(
                description=sow_name,
                contractCode=sow_meta.get("code") or meta.get("code"),
                actual=sow_actual,
                paid=sow_actual,
                balance=(sow_planned or 0) - (sow_actual or 0),
                status=_status_for_budget(sow_actual, sow_planned),
                children=[],
            )
            sow_map[(contract_id, sow_id)] = sow_row
            contract_expense.children.append(sow_row)

            for process_row in sow_rows:
                process_id = process_row["process_id"]
                proc_meta = entity_map.get(process_id, {})
                proc_name = proc_meta.get("name") or proc_meta.get("code") or "—"
                proc_planned = _to_float(process_row.get("planned_value")) or 0
                proc_actual = _to_float(process_row.get("actual_cost")) or 0
                sow_row.children.append(
                    ExpenseRow(
                        description=proc_name,
                        contractCode=proc_meta.get("code") or sow_meta.get("code") or meta.get("code"),
                        actual=proc_actual,
                        paid=proc_actual,
                        balance=proc_planned - proc_actual,
                        status=_status_for_budget(proc_actual, proc_planned),
                        children=[],
                    )
                )

    result = tuple(response)
    _cache_set(_expenses_cache, cache_key, result)
    return result


def get_fund_flow(project_code: str, contract_code: Optional[str], tenant_id: str) -> FundFlowResponse:
    _ensure_feature_enabled()
    cache_key: _FlowKey = (tenant_id, project_code, contract_code or "")
    cached = _cache_get(_flow_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, contract = _resolve_scope(conn, project_code, contract_code, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])
        entity_ids: List[UUID] = [project["entity_id"]]
        for row in rows:
            if row.get("entity_id"):
                entity_ids.append(row["entity_id"])
            for key in ("contract_id", "sow_id", "process_id"):
                value = row.get(key)
                if value:
                    entity_ids.append(value)
        entity_map = _entity_details(conn, entity_ids)

    contract_entity_id = contract["entity_id"] if contract else None
    process_rows = [
        row
        for row in rows
        if row["level"] == "process" and (not contract_entity_id or row["contract_id"] == contract_entity_id)
    ]

    if not process_rows:
        response = FundFlowResponse(nodes=[], links=[])
        _cache_set(_flow_cache, cache_key, response)
        return response

    nodes: Dict[str, SankeyNode] = {}
    links: List[SankeyLink] = []
    sow_totals: Dict[UUID, float] = defaultdict(float)
    contract_totals: Dict[UUID, float] = defaultdict(float)

    project_node_id = str(project["entity_id"])
    project_meta = entity_map.get(project["entity_id"], {"name": project.get("name") or project_code})
    nodes[project_node_id] = SankeyNode(id=project_node_id, label=project_meta.get("name") or project_code, type="project")

    for row in process_rows:
        process_id: Optional[UUID] = row.get("process_id")
        sow_id: Optional[UUID] = row.get("sow_id")
        contract_id: Optional[UUID] = row.get("contract_id")
        actual = _to_float(row.get("actual_cost")) or 0.0
        if actual <= 0 or not process_id:
            continue
        process_node_id = str(process_id)
        meta = entity_map.get(process_id, {})
        nodes.setdefault(
            process_node_id,
            SankeyNode(id=process_node_id, label=meta.get("name") or meta.get("code") or "Process", type="process"),
        )

        if sow_id:
            sow_node_id = str(sow_id)
            sow_meta = entity_map.get(sow_id, {})
            nodes.setdefault(
                sow_node_id,
                SankeyNode(id=sow_node_id, label=sow_meta.get("name") or sow_meta.get("code") or "SOW", type="sow"),
            )
            links.append(SankeyLink(source=process_node_id, target=sow_node_id, value=actual))
            sow_totals[sow_id] += actual
        elif contract_id:
            contract_node_id = str(contract_id)
            contract_meta = entity_map.get(contract_id, {})
            nodes.setdefault(
                contract_node_id,
                SankeyNode(id=contract_node_id, label=contract_meta.get("name") or contract_meta.get("code") or "Contract", type="contract"),
            )
            links.append(SankeyLink(source=process_node_id, target=contract_node_id, value=actual))
            contract_totals[contract_id] += actual

        if sow_id and contract_id:
            sow_totals[sow_id] += 0  # ensure key exists
            contract_totals[contract_id] += actual

    for sow_id, value in sow_totals.items():
        contract_id = next(
            (row["contract_id"] for row in process_rows if row.get("sow_id") == sow_id and row.get("contract_id")),
            None,
        )
        if not contract_id:
            continue
        sow_node_id = str(sow_id)
        contract_node_id = str(contract_id)
        contract_meta = entity_map.get(contract_id, {})
        nodes.setdefault(
            contract_node_id,
            SankeyNode(id=contract_node_id, label=contract_meta.get("name") or contract_meta.get("code") or "Contract", type="contract"),
        )
        if value > 0:
            links.append(SankeyLink(source=sow_node_id, target=contract_node_id, value=value))
            contract_totals[contract_id] += 0

    for contract_id, value in contract_totals.items():
        contract_node_id = str(contract_id)
        if value <= 0:
            continue
        if contract_entity_id and contract_id != contract_entity_id:
            continue
        links.append(SankeyLink(source=contract_node_id, target=project_node_id, value=value))

    response = FundFlowResponse(nodes=list(nodes.values()), links=links)
    _cache_set(_flow_cache, cache_key, response)
    return response


def get_incoming(project_code: str, tenant_id: str) -> IncomingFundsResponse:
    _ensure_feature_enabled()
    cache_key: _IncomingKey = (tenant_id, project_code)
    cached = _cache_get(_incoming_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, _ = _resolve_scope(conn, project_code, None, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])
        contract_rows = [row for row in rows if row["level"] == "contract"]
        entity_map = _entity_details(conn, [row["entity_id"] for row in contract_rows if row["entity_id"]])

    available: List[IncomingFundRow] = []
    expected: List[ExpectedFundRow] = []

    for row in contract_rows:
        entity_id: UUID = row["entity_id"]
        meta = entity_map.get(entity_id, {})
        label = meta.get("name") or meta.get("code") or "Contract"
        code = meta.get("code") or str(entity_id)
        planned = _to_float(row.get("planned_value")) or 0.0
        actual = _to_float(row.get("actual_cost")) or 0.0
        remaining = max(planned - actual, 0.0)
        if actual > 0:
            available.append(
                IncomingFundRow(
                    id=str(entity_id),
                    accountName=label,
                    fundsDeposited=actual,
                    dateOfDeposit=None,
                )
            )
        if remaining > 0:
            expected.append(
                ExpectedFundRow(
                    id=f"{entity_id}-remaining",
                    accountName=label,
                    fundsExpected=remaining,
                    expectedDateOfDeposit=None,
                )
            )

    response = IncomingFundsResponse(available=available, expected=expected)
    _cache_set(_incoming_cache, cache_key, response)
    return response


def get_outgoing(project_code: str, contract_code: Optional[str], tenant_id: str) -> OutgoingFundsResponse:
    _ensure_feature_enabled()
    cache_key: _OutgoingKey = (tenant_id, project_code, contract_code or "")
    cached = _cache_get(_outgoing_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, contract = _resolve_scope(conn, project_code, contract_code, tenant_id)
        tenant_uuid = str(project["tenant_id"])
        rows = _schedule_rollup_rows(conn, tenant_uuid, project["entity_id"])
        entity_ids = [row["entity_id"] for row in rows if row["level"] == "contract" and row["entity_id"]]
        entity_map = _entity_details(conn, entity_ids)

    contract_entity_id = contract["entity_id"] if contract else None
    contract_rows = [
        row
        for row in rows
        if row["level"] == "contract" and (not contract_entity_id or row["entity_id"] == contract_entity_id)
    ]

    actual_rows: List[OutgoingFundRow] = []
    expected_rows: List[ExpectedOutgoingFundRow] = []

    for row in contract_rows:
        entity_id: UUID = row["entity_id"]
        meta = entity_map.get(entity_id, {})
        label = meta.get("name") or meta.get("code") or "Contract"
        actual = _to_float(row.get("actual_cost")) or 0.0
        planned = _to_float(row.get("planned_value")) or 0.0
        remaining = max(planned - actual, 0.0)
        if actual > 0:
            actual_rows.append(
                OutgoingFundRow(
                    id=str(entity_id),
                    accountName=label,
                    expenseValue=actual,
                    dateOfExpense=None,
                )
            )
        if remaining > 0:
            expected_rows.append(
                ExpectedOutgoingFundRow(
                    id=f"{entity_id}-expected",
                    accountName=label,
                    expectedExpenseValue=remaining,
                    expectedDateOfExpense=None,
                )
            )

    response = OutgoingFundsResponse(actual=actual_rows, expected=expected_rows)
    _cache_set(_outgoing_cache, cache_key, response)
    return response
