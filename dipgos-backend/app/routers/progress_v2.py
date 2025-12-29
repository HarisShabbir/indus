from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Query, status

from ..models import DPPRBulkRequest, DPPRBulkResponse, ProgressHierarchyResponse, ProgressSummaryResponse
from ..services.progress_v2 import get_progress_hierarchy, get_progress_summary, upsert_progress

router = APIRouter(prefix="/api/v2/progress", tags=["progress-v2"])


@router.post("/bulk", response_model=DPPRBulkResponse, status_code=status.HTTP_202_ACCEPTED)
def bulk_ingest(payload: DPPRBulkRequest) -> DPPRBulkResponse:
    return upsert_progress(payload)


@router.get("/hierarchy", response_model=ProgressHierarchyResponse)
def progress_hierarchy(
    tenant_id: Optional[str] = Query(default="default", alias="tenantId"),
) -> ProgressHierarchyResponse:
    return get_progress_hierarchy(tenant_id=tenant_id)


@router.get("/summary", response_model=ProgressSummaryResponse)
def progress_summary(
    tenant_id: Optional[str] = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
    sow_id: Optional[str] = Query(default=None, alias="sowId"),
    process_id: Optional[str] = Query(default=None, alias="processId"),
    as_of: Optional[date] = Query(default=None, alias="asOf"),
) -> ProgressSummaryResponse:
    # as_of parameter accepted for future use; current summary is always latest
    return get_progress_summary(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )
