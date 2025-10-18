from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from ..data import alerts  # uses your existing in-memory sample

router = APIRouter()

class AlertItem(BaseModel):
    type: str
    label: str
    detail: str

class Alert(BaseModel):
    id: str
    project_id: str
    title: str
    location: str
    activity: str
    severity: str
    raised_at: str
    items: List[AlertItem]

@router.get("/", response_model=List[Alert])
def list_alerts(project_id: Optional[str] = Query(None)):
    if project_id:
        return [Alert(**a) for a in alerts if a["project_id"] == project_id]
    return [Alert(**a) for a in alerts]

@router.get("/{alert_id}", response_model=Alert)
def get_alert(alert_id: str):
    for a in alerts:
        if a["id"] == alert_id:
            return Alert(**a)
    raise HTTPException(404, detail="Alert not found")

