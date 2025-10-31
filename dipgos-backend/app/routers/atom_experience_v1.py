from __future__ import annotations

from fastapi import APIRouter, Query

from ..models.atoms import AtomExperienceResponse
from ..services.atom_experience import get_atom_experience

router = APIRouter(prefix="/api/v3/atoms", tags=["atoms-experience"])


@router.get("/{atom_id}/experience", response_model=AtomExperienceResponse)
def atom_experience(
    atom_id: str,
    tenant_id: str = Query(default="default", alias="tenantId"),
) -> AtomExperienceResponse:
    return get_atom_experience(tenant_id=tenant_id, atom_id=atom_id)
