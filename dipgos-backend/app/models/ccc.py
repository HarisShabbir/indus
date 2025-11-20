from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, List, Dict, Any

from pydantic import BaseModel, Field


class CCCSelection(BaseModel):
    tenant_id: str = Field(default="default", description="Tenant identifier")
    project_id: str
    contract_id: Optional[str] = None
    sow_id: Optional[str] = None
    process_id: Optional[str] = None


class MapMarker(BaseModel):
    id: str
    type: Literal["contract", "sow", "process"]
    name: str
    lat: float
    lon: float
    status: Literal["on-track", "monitoring", "risk"]
    percent_complete: float = Field(ge=0.0, le=100.0)
    spi: Optional[float] = None
    cpi: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WipDial(BaseModel):
    id: str
    level: Literal["project", "contract", "sow", "process"]
    code: Optional[str] = None
    name: str
    percent_complete: float = Field(ge=0.0, le=100.0)
    ev: Optional[float] = None
    pv: Optional[float] = None
    ac: Optional[float] = None
    spi: Optional[float] = None
    cpi: Optional[float] = None


class CccSummary(BaseModel):
    selection: CCCSelection
    map: List[MapMarker]
    wip: List[WipDial]
    as_of: datetime


class PhysicalWorksCard(BaseModel):
    actual_percent: Optional[float] = None
    planned_percent: Optional[float] = None
    variance_percent: Optional[float] = None
    trend_actual: List[float] = Field(default_factory=list)
    trend_planned: List[float] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class WorkInProgressCategory(BaseModel):
  name: str
  count: int = 0
  planned_percent: Optional[float] = None
  actual_percent: Optional[float] = None
  variance_percent: Optional[float] = None


class WorkInProgressCard(BaseModel):
    categories: List[WorkInProgressCategory] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class WorkOutputItem(BaseModel):
    name: str
    planned_percent: Optional[float] = None
    actual_percent: Optional[float] = None
    variance_percent: Optional[float] = None


class WorkOutputCard(BaseModel):
    items: List[WorkOutputItem] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class QualitySummaryCard(BaseModel):
    ncr_open: int = 0
    ncr_closed: int = 0
    qaor_open: int = 0
    qaor_closed: int = 0
    quality_conformance: Optional[float] = None


class PerformanceSnapshotCard(BaseModel):
    spi: Optional[float] = None
    cpi: Optional[float] = None
    ev: Optional[float] = None
    pv: Optional[float] = None
    ac: Optional[float] = None
    burn_rate_days: Optional[float] = None
    runway_days: Optional[float] = None
    cash_flow: Optional[float] = None
    trend_spi: List[float] = Field(default_factory=list)
    trend_cpi: List[float] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class RightPanelKpiPayload(BaseModel):
    selection: CCCSelection
    as_of: datetime
    physical: PhysicalWorksCard
    work_in_progress: WorkInProgressCard
    work_output: WorkOutputCard
    performance: PerformanceSnapshotCard
    preparatory: WorkOutputCard
    quality_summary: Optional[QualitySummaryCard] = None
