from __future__ import annotations

from fastapi import APIRouter, Body, status

from ..services.atom_journey import record_journey_event

router = APIRouter(prefix="/api/v2/atoms", tags=["atom-journey-v2"])


@router.post("/journey", status_code=status.HTTP_202_ACCEPTED)
def record_journey(payload: dict = Body(...)):
    return record_journey_event(
        atom_id=payload["atomId"],
        status=payload["status"],
        ts=payload.get("ts"),
    )

