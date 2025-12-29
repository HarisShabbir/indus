from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..models import CCCSelection, CccSummary, RightPanelKpiPayload
from ..services.ccc import get_ccc_summary, get_right_panel_kpis

router = APIRouter(prefix="/api/v2/ccc", tags=["ccc-v2"])


def _selection_from_query(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> CCCSelection:
    return CCCSelection(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )


@router.get("/summary", response_model=CccSummary)
def ccc_summary(selection: CCCSelection = Depends(_selection_from_query)) -> CccSummary:
    """Return map markers and WIP dials for the Construction Control Center."""
    return get_ccc_summary(selection)


@router.get("/kpis/right-panel", response_model=RightPanelKpiPayload)
def right_panel_kpis(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
) -> RightPanelKpiPayload:
    """Return KPI cards for the right rail of the Construction Control Center."""
    return get_right_panel_kpis(project_id=project_id, contract_id=contract_id, sow_id=sow_id, tenant_id=tenant_id)
