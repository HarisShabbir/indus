from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status

from ..models import AtomDeploymentReportResponse
from ..services.atom_report import get_deployment_report

router = APIRouter(prefix="/api/v2/atoms", tags=["atoms-v2-reporting"])


@router.get("/deployments/report", response_model=AtomDeploymentReportResponse, status_code=status.HTTP_200_OK)
def deployments_report(
    status_filter: str = Query(default="active", alias="status"),
    tenant_id: Optional[str] = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
   sow_id: Optional[str] = Query(default=None, alias="sowId"),
   process_id: Optional[str] = Query(default=None, alias="processId"),
    category: Optional[str] = Query(default=None, alias="category"),
   page: int = Query(default=1, ge=1),
   size: int = Query(default=50, ge=1, le=200),
   sort: Optional[str] = Query(default=None),
) -> AtomDeploymentReportResponse:
    """
    Returns a grouped deployment report for the given scope.
    """
    return get_deployment_report(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
        status=status_filter,
        category=category,
        page=page,
        size=size,
        sort=sort,
    )
