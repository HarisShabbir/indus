from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query

from ..models import AtomFinancialViewResponse
from ..services.atom_financial_view import get_atom_financial_view

router = APIRouter(prefix="/api/v2/atoms/financial", tags=["atoms-financial"])


@router.get("/view", response_model=AtomFinancialViewResponse)
def atom_financial_view(
    tenant_id: str = Query(default="default", alias="tenantId"),
    project_id: str = Query(..., alias="projectId"),
    contract_id: Optional[str] = Query(default=None, alias="contractId"),
    sow_id: Optional[str] = Query(default=None, alias="sowId"),
    process_id: Optional[str] = Query(default=None, alias="processId"),
    atom_id: Optional[str] = Query(default=None, alias="atomId"),
    start_date: Optional[str] = Query(default=None, alias="startDate"),
    end_date: Optional[str] = Query(default=None, alias="endDate"),
    basis: Optional[str] = Query(default=None),
    location: Optional[str] = Query(default=None),
    atom_type: Optional[str] = Query(default=None, alias="atomType"),
    shift: Optional[str] = Query(default=None),
    billable: Optional[str] = Query(default=None),
    group_by: Optional[str] = Query(default=None, alias="groupBy"),
) -> AtomFinancialViewResponse:
    basis_filter: Optional[List[str]] = None
    if basis:
        basis_filter = [value.strip().lower() for value in basis.split(",") if value.strip()]

    return get_atom_financial_view(
        tenant_id=tenant_id,
        project_code=project_id,
        contract_code=contract_id,
        sow_code=sow_id,
        process_code=process_id,
        atom_id=atom_id,
        start_date_str=start_date,
        end_date_str=end_date,
        basis_filter=basis_filter,
        location_filter=location,
        atom_type_filter=atom_type,
        shift_filter=shift,
        billable_filter=billable,
        group_by=group_by,
    )
