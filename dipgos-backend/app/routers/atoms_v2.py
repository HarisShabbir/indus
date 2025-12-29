from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from ..models import (
    AtomDeploymentMutation,
    AtomDeploymentResponse,
    AtomDetailResponse,
    AtomProductivityResponse,
    AtomRepositoryResponse,
    AtomResourceResponse,
    AtomSummaryResponse,
    AtomScheduleResponse,
    AtomScheduleDailyResponse,
    AtomPaymentResponse,
    AtomScheduleItem,
    AtomScheduleCreateRequest,
    AtomScheduleUpdateRequest,
)
from ..services.atom_manager import (
    get_atom_deployments,
    get_atom_detail,
    get_atom_productivity,
    get_atom_resources,
    get_atom_summary,
    get_atom_schedule,
    get_atom_daily_schedule,
    get_atom_payments,
    get_repository_tree,
    mutate_deployment,
    create_atom_schedule_entry,
    update_atom_schedule_entry,
    delete_atom_schedule_entry,
)

router = APIRouter(prefix="/api/v2/atoms", tags=["atoms-v2"])


def _role_from_header(x_user_role: str | None = Header(default=None)) -> str:
    return (x_user_role or "client").lower()


@router.get("/repository", response_model=AtomRepositoryResponse)
def repository_tree(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
) -> AtomRepositoryResponse:
    return get_repository_tree(tenant_id=tenant_id, project_id=project_id, contract_id=contract_id)


@router.get("/resources", response_model=AtomResourceResponse)
def atom_resources(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
    category: str | None = Query(default=None, alias="category"),
    search: str | None = Query(default=None, alias="search"),
    only_idle: bool = Query(default=False, alias="onlyIdle"),
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    limit: int = Query(default=200, ge=10, le=500),
) -> AtomResourceResponse:
    return get_atom_resources(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
        category=category,
        search=search,
        only_idle=only_idle,
        include_inactive=include_inactive,
        limit=limit,
    )


@router.get("/productivity", response_model=AtomProductivityResponse)
def atom_productivity(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
    category: str | None = Query(default=None, alias="category"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    limit: int = Query(default=250, ge=25, le=500),
) -> AtomProductivityResponse:
    return get_atom_productivity(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
        category=category,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )


@router.get("/summary", response_model=AtomSummaryResponse)
def atom_summary(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> AtomSummaryResponse:
    return get_atom_summary(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )


@router.get("/schedule", response_model=AtomScheduleResponse)
def atom_schedule(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> AtomScheduleResponse:
    return get_atom_schedule(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )


@router.post("/schedule", response_model=AtomScheduleItem, status_code=status.HTTP_201_CREATED)
def atom_schedule_create(
    payload: AtomScheduleCreateRequest,
    actor: str | None = Header(default=None, alias="X-User-Id"),
) -> AtomScheduleItem:
    return create_atom_schedule_entry(payload, actor=actor or "atom-manager")


@router.patch("/schedule/{schedule_id}", response_model=AtomScheduleItem)
def atom_schedule_update(
    schedule_id: str,
    payload: AtomScheduleUpdateRequest,
    actor: str | None = Header(default=None, alias="X-User-Id"),
) -> AtomScheduleItem:
    return update_atom_schedule_entry(schedule_id, payload, actor=actor or "atom-manager")


@router.delete("/schedule/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def atom_schedule_delete(
    schedule_id: str,
    actor: str | None = Header(default=None, alias="X-User-Id"),
) -> None:
    delete_atom_schedule_entry(schedule_id, actor=actor or "atom-manager")


@router.get("/{atom_id}/schedule/daily", response_model=AtomScheduleDailyResponse)
def atom_schedule_daily(
    atom_id: str,
    tenant_id: str = Query(default="default", alias="tenantId"),
    limit: int = Query(default=14, ge=1, le=30),
) -> AtomScheduleDailyResponse:
    return get_atom_daily_schedule(
        tenant_id=tenant_id,
        atom_id=atom_id,
        limit=limit,
    )


@router.get("/payments", response_model=AtomPaymentResponse)
def atom_payments(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> AtomPaymentResponse:
    return get_atom_payments(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )


@router.get("/deployments", response_model=AtomDeploymentResponse)
def atom_deployments(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
) -> AtomDeploymentResponse:
    return get_atom_deployments(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
    )


@router.post("/deployments", response_model=AtomDeploymentResponse, status_code=status.HTTP_202_ACCEPTED)
def mutate_atom_deployment(
    payload: AtomDeploymentMutation,
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: str | None = Query(default=None, alias="contractId"),
    sow_id: str | None = Query(default=None, alias="sowId"),
    process_id: str | None = Query(default=None, alias="processId"),
    role: str = Depends(_role_from_header),
) -> AtomDeploymentResponse:
    return mutate_deployment(
        tenant_id=tenant_id,
        project_id=project_id,
        contract_id=contract_id,
        sow_id=sow_id,
        process_id=process_id,
        payload=payload,
        role=role,
    )


@router.get("/{atom_id}", response_model=AtomDetailResponse)
def atom_detail(
    atom_id: str,
    tenant_id: str = Query(default="default", alias="tenantId"),
) -> AtomDetailResponse:
    return get_atom_detail(tenant_id=tenant_id, atom_id=atom_id)
