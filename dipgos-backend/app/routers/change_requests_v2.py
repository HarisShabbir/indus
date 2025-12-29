from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Query, status
from pydantic import BaseModel, Field

from ..services.change_requests import create_change_request, list_change_requests, record_change_decision

router = APIRouter(prefix="/api/v2/change-requests", tags=["change-requests-v2"])


class ChangeDecisionPayload(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|returned|hold)$")
    actorGroup: str
    actorName: str
    notes: Optional[str] = None


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


@router.post("/{change_id}/decision", status_code=status.HTTP_200_OK)
def change_request_decision(change_id: str, payload: ChangeDecisionPayload):
    return record_change_decision(
        change_request_id=change_id,
        decision=payload.decision,
        actor_group=payload.actorGroup,
        actor_name=payload.actorName,
        notes=payload.notes,
    )
