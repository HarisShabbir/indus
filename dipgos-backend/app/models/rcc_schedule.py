from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RccBlockLayer(BaseModel):
    id: str
    block_number: int
    block_group_code: str
    elevation_m: float
    width_m: Optional[float] = None
    length_m: Optional[float] = None
    height_m: Optional[float] = None
    volume_m3: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RccBlockSummary(BaseModel):
    block_number: int
    block_group_code: str
    total_volume_m3: float
    planned_volume_m3: float
    actual_volume_m3: float
    percent_complete: float
    status: str
    open_alarms: int | None = 0
    min_elevation_m: float | None = None
    max_elevation_m: float | None = None


class RccActivity(BaseModel):
    id: str
    activity_code: str
    activity_name: str
    block_group_code: str
    block_number: Optional[int] = None
    original_duration_days: int
    baseline_start: date
    baseline_finish: date
    total_float_days: int
    status: str
    planned_volume_m3: Optional[float] = None
    actual_volume_m3: Optional[float] = None
    percent_complete: float
    variance_days: int
    planned_start: Optional[date] = None
    planned_finish: Optional[date] = None
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RccProgressLog(BaseModel):
    id: str
    reported_at: datetime
    reported_by: Optional[str] = None
    volume_placed_m3: Optional[float] = None
    percent_complete: Optional[float] = None
    note: Optional[str] = None


class RccAlarmEvent(BaseModel):
    id: str
    block_number: int
    block_group_code: str
    activity_id: Optional[str] = None
    alarm_code: Optional[str] = None
    severity: Optional[str] = None
    status: str
    raised_at: datetime
    cleared_at: Optional[datetime] = None
    message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScheduleActivityDetail(BaseModel):
    activity: RccActivity
    progress: List[RccProgressLog] = Field(default_factory=list)
    alarms: List[RccAlarmEvent] = Field(default_factory=list)


class ProgressRecordRequest(BaseModel):
    activity_id: str
    reported_by: Optional[str] = None
    volume_placed_m3: Optional[float] = None
    percent_complete: Optional[float] = None
    reported_at: Optional[datetime] = None
    note: Optional[str] = None


class AlarmCreateRequest(BaseModel):
    block_number: int
    block_group_code: str
    activity_code: Optional[str] = None
    alarm_code: Optional[str] = None
    severity: Optional[str] = None
    message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AlarmClearResponse(BaseModel):
    id: str
    status: str
    cleared_at: datetime


class ClearBlockAlarmsRequest(BaseModel):
    block_number: int
    block_group_code: str
    alarm_code: Optional[str] = None


class ScheduleFilter(BaseModel):
    block_group_code: Optional[str] = None
    block_number: Optional[int] = None
    status: Optional[str] = None
