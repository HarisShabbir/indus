from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..models import (
    ExpenseRow,
    FinancialSummary,
    FundAllocationResponse,
    FundFlowResponse,
    IncomingFundsResponse,
    OutgoingFundsResponse,
)
from ..services.financial import (
    get_expenses,
    get_financial_summary,
    get_fund_allocation,
    get_fund_flow,
    get_incoming,
    get_outgoing,
)

router = APIRouter(prefix="/api/v2/financial", tags=["financial-view"])


@router.get("/summary", response_model=FinancialSummary)
def financial_summary(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
) -> FinancialSummary:
    return get_financial_summary(project_code=project_id, contract_code=contract_id, tenant_id=tenant_id)


@router.get("/fund-allocation", response_model=FundAllocationResponse)
def financial_fund_allocation(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
) -> FundAllocationResponse:
    return get_fund_allocation(project_code=project_id, tenant_id=tenant_id)


@router.get("/expenses", response_model=list[ExpenseRow])
def financial_expenses(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
) -> list[ExpenseRow]:
    rows = get_expenses(project_code=project_id, contract_code=contract_id, tenant_id=tenant_id)
    return list(rows)


@router.get("/fund-flow", response_model=FundFlowResponse)
def financial_fund_flow(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
) -> FundFlowResponse:
    return get_fund_flow(project_code=project_id, contract_code=contract_id, tenant_id=tenant_id)


@router.get("/incoming", response_model=IncomingFundsResponse)
def financial_incoming(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
) -> IncomingFundsResponse:
    return get_incoming(project_code=project_id, tenant_id=tenant_id)


@router.get("/outgoing", response_model=OutgoingFundsResponse)
def financial_outgoing(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
) -> OutgoingFundsResponse:
    return get_outgoing(project_code=project_id, contract_code=contract_id, tenant_id=tenant_id)
