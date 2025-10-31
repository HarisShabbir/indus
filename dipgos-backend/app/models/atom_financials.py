from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AtomFinancialRange(BaseModel):
    start: date
    end: date
    preset: Optional[str] = None


class AtomFinancialFilters(BaseModel):
    basis: List[str] = Field(default_factory=list)
    location: Optional[str] = None
    atomType: Optional[str] = None
    shift: Optional[str] = None
    billable: Optional[str] = None
    groupBy: Optional[str] = None


class AtomFinancialFilterOption(BaseModel):
    id: str
    label: str
    count: Optional[int] = None


class AtomFinancialAvailableFilters(BaseModel):
    basis: List[AtomFinancialFilterOption] = Field(default_factory=list)
    locations: List[AtomFinancialFilterOption] = Field(default_factory=list)
    atomTypes: List[AtomFinancialFilterOption] = Field(default_factory=list)
    shifts: List[AtomFinancialFilterOption] = Field(default_factory=list)
    statuses: List[AtomFinancialFilterOption] = Field(default_factory=list)


class AtomFinancialKpis(BaseModel):
    busyHours: float = 0.0
    idleHours: float = 0.0
    billableHours: float = 0.0
    nonBillableHours: float = 0.0
    utilizationPct: float = 0.0
    earned: float = 0.0
    timeEarned: float = 0.0
    volumeEarned: float = 0.0
    sensorEarned: float = 0.0
    averageRate: Optional[float] = None
    volumeBilled: float = 0.0


class AtomFinancialBasisBreakdown(BaseModel):
    basis: str
    earned: float = 0.0
    billableHours: float = 0.0
    busyHours: float = 0.0
    idleHours: float = 0.0
    utilizationPct: float = 0.0
    volume: Optional[float] = None
    allocationCount: int = 0


class AtomFinancialGroupingRow(BaseModel):
    key: str
    code: Optional[str] = None
    name: Optional[str] = None
    earned: float = 0.0
    billableHours: float = 0.0
    busyHours: float = 0.0
    idleHours: float = 0.0
    utilizationPct: float = 0.0
    volume: Optional[float] = None
    atomCount: int = 0
    allocationCount: int = 0


class AtomFinancialTrendPoint(BaseModel):
    date: date
    earned: float = 0.0
    billableHours: float = 0.0
    busyHours: float = 0.0
    idleHours: float = 0.0
    utilizationPct: float = 0.0


class AtomFinancialTrend(BaseModel):
    earnedVsBillable: List[AtomFinancialTrendPoint] = Field(default_factory=list)
    utilization: List[AtomFinancialTrendPoint] = Field(default_factory=list)


class AtomFinancialReconciliation(BaseModel):
    plannedEarned: float = 0.0
    actualEarned: float = 0.0
    variance: float = 0.0
    variancePct: Optional[float] = None
    plannedHours: Optional[float] = None
    actualHours: Optional[float] = None
    messages: List[str] = Field(default_factory=list)


class AtomFinancialFlags(BaseModel):
    missingRates: List[str] = Field(default_factory=list)
    zeroDuration: List[str] = Field(default_factory=list)
    overlaps: List[str] = Field(default_factory=list)
    highlights: List[str] = Field(default_factory=list)


class AtomFinancialAllocation(BaseModel):
    allocationId: str = Field(alias="id")
    allocationDate: date
    atomId: str
    atomName: str
    atomType: str
    atomCategory: str
    contractCode: Optional[str] = None
    sowCode: Optional[str] = None
    processCode: Optional[str] = None
    processName: Optional[str] = None
    basis: str
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    busyHours: float = 0.0
    idleHours: float = 0.0
    billableHours: float = 0.0
    nonBillableHours: float = 0.0
    quantity: Optional[float] = None
    quantityUnit: Optional[str] = None
    rate: Optional[float] = None
    rateUnit: Optional[str] = None
    standbyRate: Optional[float] = None
    overtimeMultiplier: Optional[float] = None
    surchargeMultiplier: Optional[float] = None
    earned: float = 0.0
    plannedEarned: Optional[float] = None
    utilizationPct: Optional[float] = None
    location: Optional[str] = None
    shift: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    nonBillableReason: Optional[str] = None
    sensorCondition: Optional[str] = None
    billable: bool = False
    overlap: bool = False
    formula: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class AtomFinancialAllocationsPayload(BaseModel):
    items: List[AtomFinancialAllocation] = Field(default_factory=list)
    total: int = 0


class AtomFinancialScopeInfo(BaseModel):
    level: str
    id: Optional[str] = None
    code: Optional[str] = None
    name: Optional[str] = None


class AtomFinancialScopeBlock(BaseModel):
    scope: AtomFinancialScopeInfo
    kpis: AtomFinancialKpis
    basisBreakdown: List[AtomFinancialBasisBreakdown] = Field(default_factory=list)
    groupings: Dict[str, List[AtomFinancialGroupingRow]] = Field(default_factory=dict)
    trend: AtomFinancialTrend = Field(default_factory=AtomFinancialTrend)
    reconciliation: AtomFinancialReconciliation = Field(default_factory=AtomFinancialReconciliation)
    allocations: AtomFinancialAllocationsPayload = Field(default_factory=AtomFinancialAllocationsPayload)
    flags: AtomFinancialFlags = Field(default_factory=AtomFinancialFlags)


class AtomFinancialViewResponse(BaseModel):
    generatedAt: datetime
    range: AtomFinancialRange
    scopeOrder: List[str] = Field(default_factory=list)
    selectedAtomId: Optional[str] = None
    selectedAtomName: Optional[str] = None
    filters: AtomFinancialFilters = Field(default_factory=AtomFinancialFilters)
    availableFilters: AtomFinancialAvailableFilters = Field(default_factory=AtomFinancialAvailableFilters)
    scopes: Dict[str, AtomFinancialScopeBlock] = Field(default_factory=dict)
