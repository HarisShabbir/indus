from __future__ import annotations

from fastapi import APIRouter, Query

from ..models import AtomManifestationResponse
from ..services.atom_manifestation import get_manifestation_attributes

router = APIRouter(prefix="/api/v2/atoms", tags=["atoms-v2"])


@router.get("/manifestation", response_model=AtomManifestationResponse)
def atom_manifestation(
    tenant_id: str = Query(default="default", alias="tenantId"),
    vendor: str = Query(...),
    machine_type: str = Query(..., alias="machineType"),
    model: str = Query(...),
) -> AtomManifestationResponse:
    return get_manifestation_attributes(
        tenant_id=tenant_id,
        vendor=vendor,
        machine_type=machine_type,
        model=model,
    )
