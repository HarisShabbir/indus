from __future__ import annotations

import time
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, Optional, Tuple
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


def get_financial_summary(project_code: str, contract_code: Optional[str], tenant_id: str) -> FinancialSummary:
    _ensure_feature_enabled()
    cache_key: _SummaryKey = (tenant_id, project_code, contract_code or "")
    cached = _cache_get(_summary_cache, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    with pool.connection() as conn:
        project, contract = _resolve_scope(conn, project_code, contract_code, tenant_id)
        target_entity = contract["entity_id"] if contract else project["entity_id"]
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT ev, pv, ac, spi, cpi, percent_complete, as_of
                FROM dipgos.vw_evm_rollup
                WHERE entity_id = %s
                """,
                (target_entity,),
            )
            row = cur.fetchone()

    if not row:
        summary = FinancialSummary()
        _cache_set(_summary_cache, cache_key, summary)
        return summary

    ev = _to_float(row.get("ev"))
    pv = _to_float(row.get("pv"))
    ac = _to_float(row.get("ac"))
    spi = _to_float(row.get("spi"))
    cpi = _to_float(row.get("cpi"))

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
        as_of=_as_datetime(row.get("as_of")),
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
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT level, entity_id, description, amount, status, code
                FROM dipgos.vw_financial_allocation
                WHERE project_id = %s
                ORDER BY CASE WHEN level = 'project' THEN 0 ELSE 1 END, description
                """,
                (project["entity_id"],),
            )
            rows = cur.fetchall()

    project_row = FundAllocationRow(description=project["name"], amount=None, status=None)
    contracts: list[FundAllocationRow] = []

    for row in rows:
        amount = _to_float(row.get("amount"))
        status = row.get("status") or None
        description = row.get("description") or "—"
        if row.get("level") == "project":
            project_row = FundAllocationRow(description=description, amount=amount, status=status)
        else:
            contracts.append(
                FundAllocationRow(
                    description=description,
                    amount=amount,
                    status=status,
                    contractId=row.get("code"),
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
        contract_entity_id = contract["entity_id"] if contract else None
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT level, entity_id, parent_id, description, contract_code, code, actual, paid, balance, status
                FROM dipgos.vw_expenses_rollup
                WHERE project_id = %s
                ORDER BY CASE WHEN level = 'contract' THEN 0 ELSE 1 END, description
                """,
                (project["entity_id"],),
            )
            rows = cur.fetchall()

    contracts_map: Dict[UUID, ExpenseRow] = {}
    response: list[ExpenseRow] = []

    for row in rows:
        level = row.get("level")
        entity_id = row.get("entity_id")
        parent_id = row.get("parent_id")
        contract_code_value = row.get("contract_code") or row.get("code")
        item = ExpenseRow(
            description=row.get("description") or "—",
            contractCode=contract_code_value,
            actual=_to_float(row.get("actual")),
            paid=_to_float(row.get("paid")),
            balance=_to_float(row.get("balance")),
            status=row.get("status") or None,
            children=[],
        )

        if level == "contract":
            if contract_entity_id and entity_id != contract_entity_id:
                continue
            contracts_map[entity_id] = item
            response.append(item)
        elif level == "sow":
            if contract_entity_id and parent_id != contract_entity_id:
                continue
            parent = contracts_map.get(parent_id)
            if parent:
                parent.children.append(item)

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
        contract_entity_id = contract["entity_id"] if contract else None
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT node_id, node_label, node_type, parent_node_id, amount, project_id
                FROM dipgos.vw_fund_flow
                WHERE project_id = %s
                """,
                (project["entity_id"],),
            )
            rows = cur.fetchall()

    nodes: Dict[str, SankeyNode] = {}
    links: list[SankeyLink] = []

    for row in rows:
        node_id = row.get("node_id")
        parent_id = row.get("parent_node_id")
        node_type = row.get("node_type") or "unknown"
        label = row.get("node_label") or "—"

        if contract_entity_id and node_type == "contract" and parent_id:
            # Skip contracts outside scope
            if node_id != str(contract_entity_id):
                continue
        if contract_entity_id and node_type.startswith("outflow"):
            parent_match = row.get("parent_node_id")
            if parent_match and parent_match != str(contract_entity_id):
                continue

        if node_id not in nodes:
            nodes[node_id] = SankeyNode(id=node_id, label=label, type=node_type)

        amount_value = _to_float(row.get("amount")) or 0.0
        if parent_id and amount_value and amount_value > 0:
            links.append(SankeyLink(source=node_id, target=parent_id, value=amount_value))

    if not links:
        allocation = get_fund_allocation(project_code=project_code, tenant_id=tenant_id)
        fallback_nodes: Dict[str, SankeyNode] = {}
        fallback_links: list[SankeyLink] = []
        selected_contract_code = contract["code"] if contract else None

        project_code_str = project["code"]
        project_label = project.get("name") or project_code_str
        fallback_nodes[project_code_str] = SankeyNode(id=project_code_str, label=project_label, type="project")

        total_allocation = 0.0
        contract_rows = []
        for row in allocation.contracts:
            if not row.contract_id:
                continue
            if selected_contract_code and row.contract_id != selected_contract_code:
                continue
            summary = get_financial_summary(project_code=project_code, contract_code=row.contract_id, tenant_id=tenant_id)
            spent_value = _to_float(summary.ac) or _to_float(summary.ev) or 0.0
            amount_value = _to_float(row.amount) or 0.0
            if amount_value <= 0 and spent_value > 0:
                amount_value = spent_value
            contract_rows.append(
                (row.contract_id, row.description or row.contract_id, amount_value, spent_value),
            )

        for _, _, amount_value, _ in contract_rows:
            total_allocation += max(0.0, amount_value)

        if selected_contract_code and not contract_rows:
            summary = get_financial_summary(project_code=project_code, contract_code=selected_contract_code, tenant_id=tenant_id)
            amount_value = _to_float(summary.pv) or _to_float(summary.ev) or 0.0
            spent_value = _to_float(summary.ac) or _to_float(summary.ev) or 0.0
            label = contract.get("name") if contract else selected_contract_code
            contract_rows.append((selected_contract_code, label or selected_contract_code, amount_value, spent_value))
            total_allocation = max(total_allocation, max(0.0, amount_value))

        funding_node_id = f"{project_code_str}-funding"
        fallback_nodes[funding_node_id] = SankeyNode(id=funding_node_id, label="Funding Pool", type="inflow")
        if total_allocation > 0:
            fallback_links.append(SankeyLink(source=funding_node_id, target=project_code_str, value=total_allocation))

        for contract_code, description, amount, spent_value in contract_rows:
            if not contract_code:
                continue
            label = description or contract_code
            contract_node_id = contract_code
            fallback_nodes[contract_node_id] = SankeyNode(id=contract_node_id, label=label, type="contract")
            if amount and amount > 0:
                fallback_links.append(SankeyLink(source=project_code_str, target=contract_node_id, value=amount))

            if spent_value and spent_value > 0:
                spent_node_id = f"{contract_node_id}-spent"
                fallback_nodes[spent_node_id] = SankeyNode(
                    id=spent_node_id,
                    label=f"{label} Spend",
                    type="outflow",
                )
                fallback_links.append(SankeyLink(source=contract_node_id, target=spent_node_id, value=spent_value))

        if fallback_links:
            nodes = fallback_nodes
            links = fallback_links

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
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, account, amount, txn_date
                FROM dipgos.fund_inflows
                WHERE project_id = %s
                ORDER BY txn_date DESC
                """,
                (project["entity_id"],),
            )
            inflow_rows = cur.fetchall()
            cur.execute(
                """
                SELECT id, account, amount, expected_date
                FROM dipgos.fund_expected
                WHERE project_id = %s
                ORDER BY expected_date DESC
                """,
                (project["entity_id"],),
            )
            expected_rows = cur.fetchall()

    available = [
        IncomingFundRow(
            id=str(row["id"]),
            accountName=row.get("account") or "—",
            fundsDeposited=_to_float(row.get("amount")),
            dateOfDeposit=row.get("txn_date").isoformat() if row.get("txn_date") else None,
        )
        for row in inflow_rows
    ]

    expected = [
        ExpectedFundRow(
            id=str(row["id"]),
            accountName=row.get("account") or "—",
            fundsExpected=_to_float(row.get("amount")),
            expectedDateOfDeposit=row.get("expected_date").isoformat() if row.get("expected_date") else None,
        )
        for row in expected_rows
    ]

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
        contract_entity_id = contract["entity_id"] if contract else None
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, category, amount, txn_date
                FROM dipgos.fund_outflows
                WHERE project_id = %s AND (%s::uuid IS NULL OR contract_id = %s::uuid)
                ORDER BY txn_date DESC
                """,
                (project["entity_id"], contract_entity_id, contract_entity_id),
            )
            actual_rows = cur.fetchall()
            cur.execute(
                """
                SELECT id, category, amount, expected_date
                FROM dipgos.expense_expected
                WHERE project_id = %s AND (%s::uuid IS NULL OR contract_id = %s::uuid)
                ORDER BY expected_date DESC
                """,
                (project["entity_id"], contract_entity_id, contract_entity_id),
            )
            expected_rows = cur.fetchall()

    actual = [
        OutgoingFundRow(
            id=str(row["id"]),
            accountName=row.get("category") or "—",
            expenseValue=_to_float(row.get("amount")),
            dateOfExpense=row.get("txn_date").isoformat() if row.get("txn_date") else None,
        )
        for row in actual_rows
    ]

    expected = [
        ExpectedOutgoingFundRow(
            id=str(row["id"]),
            accountName=row.get("category") or "—",
            expectedExpenseValue=_to_float(row.get("amount")),
            expectedDateOfExpense=row.get("expected_date").isoformat() if row.get("expected_date") else None,
        )
        for row in expected_rows
    ]

    response = OutgoingFundsResponse(actual=actual, expected=expected)
    _cache_set(_outgoing_cache, cache_key, response)
    return response
