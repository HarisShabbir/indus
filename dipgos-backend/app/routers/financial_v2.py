from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..models import FinancialSummaryResponse
from ..services.progress_v2 import get_financial_summary

router = APIRouter(prefix="/api/v2/financial", tags=["financial-v2"])


@router.get("/summary", response_model=FinancialSummaryResponse)
def financial_summary(
    tenant_id: Optional[str] = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
) -> FinancialSummaryResponse:
    return get_financial_summary(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
    )
