from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..models import ScheduleSummaryResponse
from ..services.progress_v2 import get_schedule_summary

router = APIRouter(prefix="/api/v2/schedule", tags=["schedule-v2"])


@router.get("/summary", response_model=ScheduleSummaryResponse)
def schedule_summary(
    tenant_id: Optional[str] = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
    sow_id: Optional[str] = Query(default=None, alias="sowId"),
    process_id: Optional[str] = Query(default=None, alias="processId"),
) -> ScheduleSummaryResponse:
    return get_schedule_summary(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )
