from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProcessInputModel(BaseModel):
    id: str
    label: str
    unit: Optional[str] = None
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    thresholds: Dict[str, Any] = Field(default_factory=dict)
    current_value: Optional[float] = None
    last_observed: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: str
    status_message: Optional[str] = None


class AlarmRuleModel(BaseModel):
    id: str
    category: str
    condition: str
    severity: str
    action: Optional[str] = None
    message: Optional[str] = None
    enabled: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    last_evaluated_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_payload: Dict[str, Any] = Field(default_factory=dict)
    last_fired_at: Optional[datetime] = None
    operation_id: Optional[str] = None
    stage_id: Optional[str] = None
    operation_name: Optional[str] = None
    stage_name: Optional[str] = None


class ProcessOperationModel(BaseModel):
    id: str
    name: str
    type: str
    sequence: int
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: str
    status_message: Optional[str] = None
    rule: Optional[AlarmRuleModel] = None
    inputs: List[ProcessInputModel] = Field(default_factory=list)
    children: List["ProcessOperationModel"] = Field(default_factory=list)


class ProcessStageModel(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    sequence: int
    operations: List[ProcessOperationModel] = Field(default_factory=list)
    alarm_count: int = 0
    rule_alarm_count: int = 0
    status: str = "unknown"
    worst_severity: Optional[str] = None
    last_updated: Optional[datetime] = None


class RccProcessTree(BaseModel):
    sow_id: str
    sow_name: str
    as_of: datetime
    stages: List[ProcessStageModel] = Field(default_factory=list)


class AlarmRuleList(BaseModel):
    rules: List[AlarmRuleModel] = Field(default_factory=list)

class ProcessWorkflowSimulateRequest(BaseModel):
    sow_id: str
    reason: Optional[str] = None


class RccBlockProgress(BaseModel):
    id: str
    sow_id: str
    block_no: int
    lift_no: int
    status: str
    percent_complete: float
    temperature: Optional[float] = None
    density: Optional[float] = None
    batch_id: Optional[str] = None
    vendor: Optional[str] = None
    ipc_value: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    observed_at: Optional[datetime] = None


class RccEnvironmentMetric(BaseModel):
    id: str
    sow_id: str
    metric: str
    label: str
    unit: Optional[str] = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    status: str
    thresholds: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[datetime] = None


ProcessOperationModel.model_rebuild()
