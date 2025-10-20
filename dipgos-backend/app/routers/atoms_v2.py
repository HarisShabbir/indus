from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from ..models import (
    AtomDeploymentMutation,
    AtomDeploymentResponse,
    AtomRepositoryResponse,
    AtomSummaryResponse,
)
from ..services.atom_manager import (
    get_atom_deployments,
    get_atom_summary,
    get_repository_tree,
    mutate_deployment,
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
