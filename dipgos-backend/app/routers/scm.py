from __future__ import annotations

from typing import List, Mapping, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..models.scm import ScmDashboardResponse, ScmProcessCanvasResponse, ScmProcessStageResponse
from ..services.scm import (
    engage_procurement_action,
    get_process_canvas,
    get_process_stage_summary,
    get_scm_dashboard,
    update_stage_transition,
)

router = APIRouter(prefix="/api/v2/scm", tags=["scm"])


@router.get("/process/canvas", response_model=ScmProcessCanvasResponse)
def process_canvas(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str = Query(..., alias="processId"),
) -> ScmProcessCanvasResponse:
    """
    Return the process SCM canvas (requirements, procurement, logistics, inventory, metrics).
    """
    return get_process_canvas(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )


class EngageProcurementRequest(BaseModel):
    tenantId: Optional[str] = None
    projectId: Optional[str] = None
    contractId: Optional[str] = None
    sowId: Optional[str] = None
    processId: Optional[str] = None
    purchaseOrders: List[Mapping[str, object]] = Field(default_factory=list)
    note: Optional[str] = None


class EngageProcurementResponse(BaseModel):
    status: str
    alertId: Optional[str] = None
    message: str


@router.post("/actions/engage-procurement", response_model=EngageProcurementResponse)
def scm_engage_procurement(payload: EngageProcurementRequest) -> EngageProcurementResponse:
    result = engage_procurement_action(
        tenant_id=payload.tenantId,
        project_code=payload.projectId,
        contract_code=payload.contractId,
        sow_code=payload.sowId,
        process_code=payload.processId,
        purchase_orders=[dict(item) for item in payload.purchaseOrders],
        note=payload.note,
    )
    return EngageProcurementResponse(**result)


@router.get("/process/stages", response_model=ScmProcessStageResponse)
def process_stage_summary(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str = Query(..., alias="processId"),
) -> ScmProcessStageResponse:
    return get_process_stage_summary(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )


class StageTransitionRequest(BaseModel):
    tenantId: Optional[str] = None
    projectId: Optional[str] = None
    contractId: Optional[str] = None
    sowId: Optional[str] = None
    processId: Optional[str] = None
    resourceId: str
    stage: str


class StageTransitionResponse(BaseModel):
    status: str
    message: str


@router.post("/process/stage-transition", response_model=StageTransitionResponse)
def stage_transition(payload: StageTransitionRequest) -> StageTransitionResponse:
    result = update_stage_transition(
        tenant_id=payload.tenantId,
        project_code=payload.projectId,
        contract_code=payload.contractId,
        sow_code=payload.sowId,
        process_code=payload.processId,
        resource_id=payload.resourceId,
        stage=payload.stage,
    )
    return StageTransitionResponse(**result)


@router.get("/dashboard", response_model=ScmDashboardResponse)
def scm_dashboard(
    scope_level: str = Query(default="process", alias="scopeLevel"),
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str | None = Query(default=None, alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> ScmDashboardResponse:
    """
    Aggregate SCM KPIs for the requested scope level.
    """
    return get_scm_dashboard(
        scope_level=scope_level,
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
    )
