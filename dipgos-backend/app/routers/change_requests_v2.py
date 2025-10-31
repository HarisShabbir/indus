from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Query, status

from ..services.change_requests import create_change_request, list_change_requests

router = APIRouter(prefix="/api/v2/change-requests", tags=["change-requests-v2"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_change_request_endpoint(payload: dict = Body(...)):
    return create_change_request(
        tenant_id=payload.get("tenantId", "default"),
        project_id=payload["projectId"],
        contract_id=payload.get("contractId"),
        sow_id=payload.get("sowId"),
        process_id=payload.get("processId"),
        atom_type=payload["atomType"],
        model=payload["model"],
        requested_units=payload.get("requestedUnits", 1),
        est_cost=payload.get("estCost"),
        reason=payload.get("reason"),
        created_by=payload.get("createdBy", "contractor"),
    )


@router.get("", status_code=status.HTTP_200_OK)
def list_change_requests_endpoint(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
    sow_id: Optional[str] = Query(default=None, alias="sowId"),
    process_id: Optional[str] = Query(default=None, alias="processId"),
):
    return list_change_requests(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )

