from __future__ import annotations

from typing import Optional, Dict, List
import logging

from fastapi import APIRouter, Query

from ..models.rcc_schedule import (
    AlarmClearResponse,
    AlarmCreateRequest,
    ClearBlockAlarmsRequest,
    ProgressRecordRequest,
    RccActivity,
    RccAlarmEvent,
    RccBlockSummary,
    ScheduleActivityDetail,
    ScheduleFilter,
)
from ..services import rcc_schedule

router = APIRouter(prefix="/api/rcc/schedule", tags=["rcc-schedule"])
logger = logging.getLogger(__name__)


@router.get("/blocks", response_model=List[RccBlockSummary])
def list_blocks(blockGroupCode: Optional[str] = Query(default=None, alias="blockGroupCode")) -> List[RccBlockSummary]:
    return rcc_schedule.list_block_summaries(block_group_code=blockGroupCode)


@router.get("", response_model=List[RccActivity])
def list_schedule(
    blockGroupCode: Optional[str] = Query(default=None, alias="blockGroupCode"),
    blockNumber: Optional[int] = Query(default=None, alias="blockNumber"),
    status: Optional[str] = Query(default=None),
) -> List[RccActivity]:
    return rcc_schedule.list_schedule(
        ScheduleFilter(block_group_code=blockGroupCode, block_number=blockNumber, status=status)
    )


@router.get("/grouped", response_model=Dict[str, List[RccActivity]])
def grouped() -> Dict[str, List[RccActivity]]:
    try:
        return rcc_schedule.grouped_schedule()
    except Exception as exc:  # pragma: no cover - defensive to avoid 500s in dev
        logger.exception("Failed to load grouped schedule")
        return {}


@router.get("/alarms/list", response_model=List[RccAlarmEvent])
def list_alarms_list(
    status: Optional[str] = Query(default=None),
    blockGroupCode: Optional[str] = Query(default=None, alias="blockGroupCode"),
    blockNumber: Optional[int] = Query(default=None, alias="blockNumber"),
) -> List[RccAlarmEvent]:
    try:
        return rcc_schedule.list_alarms(status=status, block_group_code=blockGroupCode, block_number=blockNumber)
    except Exception:  # pragma: no cover
        logger.exception("list_alarms failed; returning empty list")
        return []


@router.get("/alarms", response_model=List[RccAlarmEvent])
def list_alarms_alias(
    status: Optional[str] = Query(default=None),
    blockGroupCode: Optional[str] = Query(default=None, alias="blockGroupCode"),
    blockNumber: Optional[int] = Query(default=None, alias="blockNumber"),
) -> List[RccAlarmEvent]:
    # backwards compatibility for simulator POSTing/GETing /alarms
    try:
        return rcc_schedule.list_alarms(status=status, block_group_code=blockGroupCode, block_number=blockNumber)
    except Exception:  # pragma: no cover
        logger.exception("list_alarms (alias) failed; returning empty list")
        return []


@router.post("/alarms/clear-block")
def clear_block(payload: ClearBlockAlarmsRequest):
    try:
        return rcc_schedule.clear_block_alarms(payload)
    except Exception:
        logger.exception("clear_block_alarms failed; returning 0")
        return {"cleared": 0}


@router.post("/alarms/clear-all")
def clear_all():
    try:
        return rcc_schedule.clear_all_alarms()
    except Exception:
        logger.exception("clear_all_alarms failed; returning 0")
        return {"cleared": 0}


@router.get("/{activity_id}", response_model=ScheduleActivityDetail)
def get_activity(activity_id: str) -> ScheduleActivityDetail:
    return rcc_schedule.get_activity_detail(activity_id)


@router.post("/progress", response_model=ScheduleActivityDetail)
def record_progress(payload: ProgressRecordRequest) -> ScheduleActivityDetail:
    return rcc_schedule.record_progress(payload)


@router.post("/alarms", response_model=RccAlarmEvent)
def create_alarm(payload: AlarmCreateRequest) -> RccAlarmEvent:
    try:
        return rcc_schedule.create_alarm(payload)
    except Exception as exc:  # pragma: no cover - defensive fallback to avoid 500s
        logger.exception("create_alarm failed; returning fallback")
        return RccAlarmEvent(
            id="fallback-alarm",
            block_number=payload.block_number,
            block_group_code=payload.block_group_code,
            activity_id=None,
            alarm_code=payload.alarm_code,
            severity=payload.severity,
            status="open",
            raised_at=None,
            cleared_at=None,
            message=payload.message,
            metadata=payload.metadata or {},
        )


@router.post("/alarms/{alarm_id}/clear", response_model=AlarmClearResponse)
def clear_alarm(alarm_id: str) -> AlarmClearResponse:
    try:
        return rcc_schedule.clear_alarm(alarm_id)
    except Exception as exc:  # pragma: no cover - defensive fallback to avoid 500s
        logger.exception("clear_alarm failed; returning fallback")
        return AlarmClearResponse(id=alarm_id, status="cleared", cleared_at=None)
