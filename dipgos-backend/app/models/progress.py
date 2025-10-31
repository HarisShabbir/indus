from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict


class DPPRIngestRow(BaseModel):
    entity_id: str = Field(alias="entityId")
    report_date: date = Field(alias="reportDate")
    qty_done: Optional[float] = Field(default=None, alias="qtyDone")
    qty_planned: Optional[float] = Field(default=None, alias="qtyPlanned")
    ev: Optional[float] = None
    pv: Optional[float] = None
    ac: Optional[float] = None
    notes: Optional[str] = None


class DPPRBulkRequest(BaseModel):
    tenant_id: str = Field(alias="tenantId")
    rows: List[DPPRIngestRow]


class DPPRBulkResponse(BaseModel):
    updated: int
    as_of: datetime = Field(alias="asOf")


class NextActivity(BaseModel):
    process_id: str = Field(alias="processId")
    name: str
    planned_start: Optional[date] = Field(default=None, alias="plannedStart")
    ready: bool


class ProgressSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    ev: float = 0.0
    pv: float = 0.0
    ac: float = 0.0
    spi: Optional[float] = None
    cpi: Optional[float] = None
    percent_complete: Optional[float] = Field(default=None, alias="percentComplete")
    slips: float = 0.0
    next_activities: List[NextActivity] = Field(default_factory=list, alias="nextActivities")
    as_of: datetime = Field(alias="asOf")


class ScheduleSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    scope_level: str = Field(alias="scopeLevel")
    scope_code: str = Field(alias="scopeCode")
    planned_start: Optional[date] = Field(default=None, alias="plannedStart")
    planned_finish: Optional[date] = Field(default=None, alias="plannedFinish")
    actual_start: Optional[date] = Field(default=None, alias="actualStart")
    actual_finish: Optional[date] = Field(default=None, alias="actualFinish")
    duration_variance_days: Optional[float] = Field(default=None, alias="durationVarianceDays")
    percent_complete: Optional[float] = Field(default=None, alias="percentComplete")
    as_of: datetime = Field(alias="asOf")
    next_activities: List[NextActivity] = Field(default_factory=list, alias="nextActivities")


class FinancialSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    ev: float = 0.0
    pv: float = 0.0
    ac: float = 0.0
    spi: Optional[float] = None
    cpi: Optional[float] = None
    cost_variance: Optional[float] = Field(default=None, alias="costVariance")
    schedule_variance: Optional[float] = Field(default=None, alias="scheduleVariance")
    burn_rate: Optional[float] = Field(default=None, alias="burnRate")
    as_of: datetime = Field(alias="asOf")


class ProgressHierarchyProcess(BaseModel):
    code: str
    name: str


class ProgressHierarchySow(BaseModel):
    code: str
    name: str
    processes: List[ProgressHierarchyProcess] = Field(default_factory=list)


class ProgressHierarchyContract(BaseModel):
    code: str
    name: str
    sows: List[ProgressHierarchySow] = Field(default_factory=list)


class ProgressHierarchyProject(BaseModel):
    code: str
    name: str
    contracts: List[ProgressHierarchyContract] = Field(default_factory=list)


class ProgressHierarchyResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    projects: List[ProgressHierarchyProject] = Field(default_factory=list)
    as_of: datetime = Field(alias="asOf")
