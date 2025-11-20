from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..models.rcc import AlarmRuleList, AlarmRuleModel, RccBlockProgress, RccEnvironmentMetric, RccProcessTree
from ..services import rcc as rcc_service
from ..services.rcc_rules import alarm_ws_manager

router = APIRouter(prefix="/api/rcc", tags=["rcc"])


class AlarmRulePayload(BaseModel):
    id: Optional[str] = None
    category: str
    condition: str
    severity: str
    action: Optional[str] = None
    message: Optional[str] = None
    enabled: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    operation_id: Optional[str] = Field(default=None, description="Link rule to process operation")


class BlockProgressPayload(BaseModel):
    id: Optional[str] = None
    block_no: int
    lift_no: int
    percent_complete: float = 0
    status: str = "planned"
    temperature: Optional[float] = None
    density: Optional[float] = None
    batch_id: Optional[str] = None
    vendor: Optional[str] = None
    ipc_value: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.get("/process/{sow_id}", response_model=RccProcessTree)
def rcc_process_view(sow_id: str) -> RccProcessTree:
    return rcc_service.get_process_tree(sow_id)


@router.get("/rules", response_model=AlarmRuleList)
def list_rules(sow_id: Optional[str] = Query(default=None, alias="sowId")) -> AlarmRuleList:
    return rcc_service.list_alarm_rules(sow_id)


@router.post("/rules", response_model=AlarmRuleModel)
def upsert_rule(payload: AlarmRulePayload) -> AlarmRuleModel:
    return rcc_service.upsert_alarm_rule(payload.model_dump())


@router.get("/progress/{sow_id}", response_model=List[RccBlockProgress])
def block_progress(sow_id: str) -> List[RccBlockProgress]:
    return rcc_service.list_block_progress(sow_id)


@router.post("/progress/{sow_id}", response_model=RccBlockProgress)
def record_block_progress(sow_id: str, payload: BlockProgressPayload) -> RccBlockProgress:
    return rcc_service.upsert_block_progress(sow_id, payload.model_dump())


@router.get("/metrics/{sow_id}", response_model=List[RccEnvironmentMetric])
def environment_metrics(sow_id: str) -> List[RccEnvironmentMetric]:
    return rcc_service.list_environment_metrics(sow_id)


@router.websocket("/ws/alarms")
async def alarm_socket(websocket: WebSocket) -> None:
    await alarm_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await alarm_ws_manager.disconnect(websocket)


@router.websocket("/ws/progress")
async def progress_socket(websocket: WebSocket, sow_id: Optional[str] = Query(default=None, alias="sowId")) -> None:
    await rcc_service.progress_ws_manager.connect(websocket, sow_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await rcc_service.progress_ws_manager.disconnect(websocket)
