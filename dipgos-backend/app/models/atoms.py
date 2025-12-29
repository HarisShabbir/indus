from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

AtomCategory = Literal[
    "actors",
    "materials",
    "machinery",
    "consumables",
    "tools",
    "equipment",
    "systems",
    "technologies",
    "financials",
]


class AtomRepositoryNode(BaseModel):
    id: str
    parent_id: Optional[str] = Field(default=None, alias="parentId")
    level: Literal["category", "group", "type", "atom"]
    name: str
    category: AtomCategory
    total: int
    engaged: int
    idle: int


class AtomRepositoryResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    nodes: list[AtomRepositoryNode]


class AtomSummaryCard(BaseModel):
    category: AtomCategory
    label: str
    total: int
    engaged: int
    idle: int
    trend: list[float] = Field(default_factory=list)
    total_cost: Optional[float] = Field(default=None, alias="totalCost")
    engaged_cost: Optional[float] = Field(default=None, alias="engagedCost")


class AtomSummaryScope(BaseModel):
    level: Literal["project", "contract", "sow", "process"]
    entity_id: str = Field(alias="entityId")
    project_id: str = Field(alias="projectId")
    contract_id: Optional[str] = Field(default=None, alias="contractId")
    sow_id: Optional[str] = Field(default=None, alias="sowId")
    process_id: Optional[str] = Field(default=None, alias="processId")


class AtomSummaryResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    scope: AtomSummaryScope
    cards: list[AtomSummaryCard]


class AtomDeploymentRecord(BaseModel):
    deployment_id: str = Field(alias="deploymentId")
    atom_id: str = Field(alias="atomId")
    atom_name: str = Field(alias="atomName")
    atom_type: str = Field(alias="atomType")
    category: AtomCategory
    process_id: str = Field(alias="processId")
    process_name: str = Field(alias="processName")
    start_ts: datetime = Field(alias="startTs")
    end_ts: Optional[datetime] = Field(default=None, alias="endTs")
    status: str


class AtomDeploymentResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    deployments: list[AtomDeploymentRecord]


class AtomDeploymentMutation(BaseModel):
    atom_id: str = Field(alias="atomId")
    process_id: str = Field(alias="processId")
    action: Literal['assign', 'unassign']
    start_ts: Optional[datetime] = Field(default=None, alias="startTs")
    end_ts: Optional[datetime] = Field(default=None, alias="endTs")


class AtomJourneyEvent(BaseModel):
    status: Literal['warehouse', 'in_transit', 'on_site', 'engaged']
    ts: datetime


class AtomDeploymentItemReport(BaseModel):
    atom_id: str = Field(alias="atomId")
    serial: Optional[str] = None
    deployment_start: Optional[datetime] = Field(alias="deploymentStart", default=None)
    hours_completed: Optional[float] = Field(alias="hoursCompleted", default=None)
    latest_telemetry: Optional[dict] = Field(alias="latestTelemetry", default=None)
    journey: list[AtomJourneyEvent] = Field(default_factory=list)
    unit_cost: Optional[float] = Field(alias="unitCost", default=None)


class AtomDeploymentGroupReport(BaseModel):
    atom_type: str = Field(alias="atomType")
    model: str
    vendor: Optional[str] = None
    capacity: Optional[Dict[str, Any]] = None
    count: int
    deployment_start_earliest: Optional[datetime] = Field(alias="deploymentStartEarliest", default=None)
    hours_completed: Optional[float] = Field(alias="hoursCompleted", default=None)
    work_completed: Optional[dict] = Field(alias="workCompleted", default=None)
    journey_status: Optional[str] = Field(alias="journeyStatus", default=None)
    deployment_status: Optional[str] = Field(alias="deploymentStatus", default=None)
    items: list[AtomDeploymentItemReport] = Field(default_factory=list)
    process_id: Optional[str] = Field(default=None, alias="processId")
    process_code: Optional[str] = Field(default=None, alias="processCode")
    process_name: Optional[str] = Field(default=None, alias="processName")
    sow_id: Optional[str] = Field(default=None, alias="sowId")
    sow_code: Optional[str] = Field(default=None, alias="sowCode")
    sow_name: Optional[str] = Field(default=None, alias="sowName")
    contract_id: Optional[str] = Field(default=None, alias="contractId")
    contract_code: Optional[str] = Field(default=None, alias="contractCode")
    contract_name: Optional[str] = Field(default=None, alias="contractName")
    value: Optional[float] = None


class AtomDeploymentPagination(BaseModel):
    page: int
    size: int
    total_groups: int = Field(alias="totalGroups")


class AtomDeploymentReportResponse(BaseModel):
    scope: AtomSummaryScope
    status: Literal['active', 'idle']
    groups: list[AtomDeploymentGroupReport]
    totals: dict[str, int]
    as_of: datetime = Field(alias="asOf")
    pagination: Optional[AtomDeploymentPagination] = None


class AtomResourceEngagement(BaseModel):
    deployment_id: Optional[str] = Field(default=None, alias="deploymentId")
    process_id: Optional[str] = Field(default=None, alias="processId")
    process_name: Optional[str] = Field(default=None, alias="processName")
    status: Optional[str] = None
    start_ts: Optional[datetime] = Field(default=None, alias="startTs")
    end_ts: Optional[datetime] = Field(default=None, alias="endTs")
    days_active: Optional[float] = Field(default=None, alias="daysActive")


class AtomResource(BaseModel):
    id: str = Field(alias="atomId")
    name: str
    category: AtomCategory
    type_name: str = Field(alias="typeName")
    group_name: str = Field(alias="groupName")
    unit: Optional[str] = None
    contractor_name: Optional[str] = Field(default=None, alias="contractor")
    availability: Literal["idle", "engaged", "inactive"]
    home_level: str = Field(alias="homeLevel")
    home_code: str = Field(alias="homeCode")
    spec: Dict[str, Any] = Field(default_factory=dict)
    utilization: float = 0.0
    engagement: Optional[AtomResourceEngagement] = None


class AtomResourceSummary(BaseModel):
    total: int
    engaged: int
    idle: int


class AtomResourceResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    scope: AtomSummaryScope
    summary: AtomResourceSummary
    atoms: list[AtomResource]


class AtomProductivityLog(BaseModel):
    log_id: str = Field(alias="logId")
    atom_id: str = Field(alias="atomId")
    atom_name: str = Field(alias="atomName")
    atom_type: str = Field(alias="atomType")
    category: AtomCategory
    scope_level: str = Field(alias="scopeLevel")
    scope_code: str = Field(alias="scopeCode")
    log_date: date = Field(alias="logDate")
    shift: str
    productive_hours: float = Field(alias="productiveHours")
    idle_hours: float = Field(alias="idleHours")
    total_hours: float = Field(alias="totalHours")
    utilisation_ratio: Optional[float] = Field(alias="utilisationRatio", default=None)
    output_quantity: Optional[float] = Field(alias="outputQuantity", default=None)
    output_unit: Optional[str] = Field(alias="outputUnit", default=None)
    quality_score: Optional[float] = Field(alias="qualityScore", default=None)
    notes: Optional[str] = None


class AtomProductivityTrendPoint(BaseModel):
    log_date: date = Field(alias="logDate")
    productive_hours: float = Field(alias="productiveHours")
    idle_hours: float = Field(alias="idleHours")
    output_quantity: Optional[float] = Field(alias="outputQuantity", default=None)


class AtomProductivitySummary(BaseModel):
    total_logs: int = Field(alias="totalLogs")
    total_productive_hours: float = Field(alias="totalProductiveHours")
    total_idle_hours: float = Field(alias="totalIdleHours")
    average_utilisation: Optional[float] = Field(alias="averageUtilisation", default=None)
    total_output_quantity: Optional[float] = Field(alias="totalOutputQuantity", default=None)


class AtomProductivityResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    scope: AtomSummaryScope
    summary: AtomProductivitySummary
    logs: list[AtomProductivityLog]
    trend: list[AtomProductivityTrendPoint]


class AtomAttribute(BaseModel):
    id: str
    label: str
    value: Dict[str, Any] = Field(default_factory=dict)


class AtomMobilizationRecord(BaseModel):
    id: str
    location: Optional[str] = None
    status: str
    mobilized_on: date = Field(alias="mobilizedOn")
    demobilized_on: Optional[date] = Field(default=None, alias="demobilizedOn")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AtomDetailInfo(BaseModel):
    atom_id: str = Field(alias="atomId")
    name: str
    category: AtomCategory
    type_name: str = Field(alias="typeName")
    group_name: Optional[str] = Field(default=None, alias="groupName")
    unit: Optional[str] = None
    contractor: Optional[str] = None
    home_code: Optional[str] = Field(default=None, alias="homeCode")
    home_level: Optional[str] = Field(default=None, alias="homeLevel")
    spec: Dict[str, Any] = Field(default_factory=dict)


class AtomDetailResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    info: AtomDetailInfo
    attributes: list[AtomAttribute] = Field(default_factory=list)
    mobilization: list[AtomMobilizationRecord] = Field(default_factory=list)
    productivity: list[AtomProductivityTrendPoint] = Field(default_factory=list)


class AtomManifestationAttribute(BaseModel):
    id: str
    vendor: str
    machine_type: str = Field(alias="machineType")
    model: str
    name: str
    value: Optional[str] = None
    units: Optional[str] = None
    validation: Optional[str] = None


class AtomManifestationResponse(BaseModel):
    vendor: str
    machine_type: str = Field(alias="machineType")
    model: str
    attributes: list[AtomManifestationAttribute] = Field(default_factory=list)
    count: int
    as_of: datetime = Field(alias="asOf")


class AtomStatusTile(BaseModel):
    id: str
    label: str
    value: str
    caption: Optional[str] = None
    change: Optional[float] = None
    change_direction: Literal["up", "down", "flat"] = Field(alias="changeDirection", default="flat")
    severity: Literal["good", "warning", "critical", "neutral"] = "neutral"


class AtomTrendPointCompact(BaseModel):
    date: date
    value: float


class AtomTrendSeries(BaseModel):
    id: str
    label: str
    unit: Optional[str] = None
    points: list[AtomTrendPointCompact] = Field(default_factory=list)


class AtomExecutionMetric(BaseModel):
    id: str
    label: str
    value: float
    unit: Optional[str] = None
    formatted: str
    change: Optional[float] = None
    change_direction: Literal["up", "down", "flat"] = Field(alias="changeDirection", default="flat")
    sparkline: Optional[AtomTrendSeries] = None


class AtomExecutionCallouts(BaseModel):
    positives: list[str] = Field(default_factory=list)
    watch: list[str] = Field(default_factory=list)


class AtomMobilizationExperience(BaseModel):
    records: list[AtomMobilizationRecord] = Field(default_factory=list)
    tiles: list[AtomStatusTile] = Field(default_factory=list)
    trend: Optional[AtomTrendSeries] = None


class AtomExecutionExperience(BaseModel):
    metrics: list[AtomExecutionMetric] = Field(default_factory=list)
    trend_highlights: list[AtomTrendSeries] = Field(alias="trendHighlights", default_factory=list)
    callouts: AtomExecutionCallouts = Field(default_factory=AtomExecutionCallouts)


class AtomExperienceResponse(BaseModel):
    as_of: datetime = Field(alias="asOf")
    info: AtomDetailInfo
    attributes: list[AtomAttribute] = Field(default_factory=list)
    mobilization: AtomMobilizationExperience = Field(default_factory=AtomMobilizationExperience)
    execution: AtomExecutionExperience = Field(default_factory=AtomExecutionExperience)


class AtomScheduleUpcoming(BaseModel):
    schedule_id: str = Field(alias="scheduleId")
    label: str
    planned_start: Optional[date] = Field(alias="plannedStart", default=None)
    planned_finish: Optional[date] = Field(alias="plannedFinish", default=None)
    days_to_start: Optional[int] = Field(alias="daysToStart", default=None)


class AtomScheduleItem(BaseModel):
    schedule_id: str = Field(alias="scheduleId")
    atom_id: str = Field(alias="atomId")
    atom_name: str = Field(alias="atomName")
    atom_type: str = Field(alias="atomType")
    category: AtomCategory
    group_name: Optional[str] = Field(alias="groupName", default=None)
    contract_code: Optional[str] = Field(alias="contractCode", default=None)
    sow_code: Optional[str] = Field(alias="sowCode", default=None)
    process_code: Optional[str] = Field(alias="processCode", default=None)
    process_name: Optional[str] = Field(alias="processName", default=None)
    planned_start: Optional[date] = Field(alias="plannedStart", default=None)
    planned_finish: Optional[date] = Field(alias="plannedFinish", default=None)
    actual_start: Optional[date] = Field(alias="actualStart", default=None)
    actual_finish: Optional[date] = Field(alias="actualFinish", default=None)
    percent_complete: Optional[float] = Field(alias="percentComplete", default=None)
    variance_days: Optional[float] = Field(alias="varianceDays", default=None)
    status: Optional[str] = None
    criticality: Optional[str] = None
    milestone: Optional[str] = None
    notes: Optional[str] = None
    dependencies: list[str] = Field(default_factory=list)
    conflict_types: list[str] = Field(default_factory=list, alias="conflictTypes")
    process_id: Optional[str] = Field(alias="processId", default=None)


class AtomScheduleSummary(BaseModel):
    total: int
    on_track: int = Field(alias="onTrack")
    at_risk: int = Field(alias="atRisk")
    delayed: int
    completed: int
    average_progress: Optional[float] = Field(alias="averageProgress", default=None)
    average_variance: Optional[float] = Field(alias="averageVariance", default=None)
    as_of: datetime = Field(alias="asOf")
    upcoming: list[AtomScheduleUpcoming] = Field(default_factory=list)
    starts_next_seven: int = Field(alias="startsNextSeven", default=0)
    finishes_next_seven: int = Field(alias="finishesNextSeven", default=0)
    risks_next_seven: int = Field(alias="risksNextSeven", default=0)


class AtomScheduleConflict(BaseModel):
    conflict_type: str = Field(alias="conflictType")
    schedule_ids: list[str] = Field(alias="scheduleIds")
    message: str


class AtomScheduleUpdateRequest(BaseModel):
    planned_start: Optional[date] = Field(default=None, alias="plannedStart")
    planned_finish: Optional[date] = Field(default=None, alias="plannedFinish")
    actual_start: Optional[date] = Field(default=None, alias="actualStart")
    actual_finish: Optional[date] = Field(default=None, alias="actualFinish")
    percent_complete: Optional[float] = Field(default=None, alias="percentComplete")
    status: Optional[str] = None
    notes: Optional[str] = None
    criticality: Optional[str] = None
    milestone: Optional[str] = None
    atom_id: Optional[str] = Field(default=None, alias="atomId")
    process_id: Optional[str] = Field(default=None, alias="processId")


class AtomScheduleCreateRequest(BaseModel):
    tenant_id: str = Field(alias="tenantId")
    project_id: str = Field(alias="projectId")
    contract_id: Optional[str] = Field(default=None, alias="contractId")
    sow_id: Optional[str] = Field(default=None, alias="sowId")
    process_id: Optional[str] = Field(default=None, alias="processId")
    atom_id: str = Field(alias="atomId")
    milestone: Optional[str] = None
    status: Optional[str] = None
    criticality: Optional[str] = None
    planned_start: date = Field(alias="plannedStart")
    planned_finish: date = Field(alias="plannedFinish")
    notes: Optional[str] = None
    percent_complete: Optional[float] = Field(default=None, alias="percentComplete")


class AtomScheduleResponse(BaseModel):
    scope: AtomSummaryScope
    summary: AtomScheduleSummary
    items: list[AtomScheduleItem]
    conflicts: list[AtomScheduleConflict] = Field(default_factory=list)
    critical_path: list[str] = Field(default_factory=list, alias="criticalPath")


class AtomScheduleTimeSlot(BaseModel):
    start: str
    end: str
    process: Optional[str] = None
    location: Optional[str] = None
    status: Literal["busy", "idle", "monitoring", "completed", "extended"] = "busy"
    duration_minutes: int = Field(alias="durationMinutes")
    start_minutes: Optional[int] = Field(alias="startMinutes", default=None)
    end_minutes: Optional[int] = Field(alias="endMinutes", default=None)
    notes: Optional[str] = None


class AtomScheduleVolumeSlot(BaseModel):
    material: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    process: Optional[str] = None
    window: Optional[str] = None
    status: Optional[str] = None


class AtomScheduleSensorSlot(BaseModel):
    label: str
    state: Optional[str] = None
    elapsed_hours: Optional[float] = Field(alias="elapsedHours", default=None)
    target_hours: Optional[float] = Field(alias="targetHours", default=None)
    status: Optional[str] = None


class AtomScheduleDailyRecord(BaseModel):
    schedule_id: str = Field(alias="scheduleId")
    schedule_date: date = Field(alias="scheduleDate")
    total_busy_minutes: int = Field(alias="totalBusyMinutes")
    total_idle_minutes: int = Field(alias="totalIdleMinutes")
    total_allocations: int = Field(alias="totalAllocations")
    volume_committed: Optional[float] = Field(alias="volumeCommitted", default=None)
    volume_unit: Optional[str] = Field(alias="volumeUnit", default=None)
    notes: Optional[str] = None
    time_slots: list[AtomScheduleTimeSlot] = Field(alias="timeSlots", default_factory=list)
    volume_slots: list[AtomScheduleVolumeSlot] = Field(alias="volumeSlots", default_factory=list)
    sensor_slots: list[AtomScheduleSensorSlot] = Field(alias="sensorSlots", default_factory=list)


class AtomScheduleDailySummary(BaseModel):
    schedule_date: date = Field(alias="scheduleDate")
    total_busy_minutes: int = Field(alias="totalBusyMinutes")
    total_idle_minutes: int = Field(alias="totalIdleMinutes")
    total_allocations: int = Field(alias="totalAllocations")
    volume_committed: Optional[float] = Field(alias="volumeCommitted", default=None)
    volume_unit: Optional[str] = Field(alias="volumeUnit", default=None)


class AtomScheduleDailyResponse(BaseModel):
    atom_id: str = Field(alias="atomId")
    atom_name: str = Field(alias="atomName")
    category: Optional[AtomCategory] = None
    records: list[AtomScheduleDailyRecord] = Field(default_factory=list)
    available_dates: list[str] = Field(alias="availableDates", default_factory=list)
    summary: Optional[AtomScheduleDailySummary] = None


class AtomPaymentCategorySummary(BaseModel):
    category: AtomCategory
    label: str
    committed: float
    paid: float
    outstanding: float
    overdue: int


class AtomPaymentRecord(BaseModel):
    payment_id: str = Field(alias="paymentId")
    atom_id: str = Field(alias="atomId")
    atom_name: str = Field(alias="atomName")
    atom_type: str = Field(alias="atomType")
    category: AtomCategory
    group_name: Optional[str] = Field(alias="groupName", default=None)
    vendor: Optional[str] = None
    invoice_number: Optional[str] = Field(alias="invoiceNumber", default=None)
    payment_milestone: Optional[str] = Field(alias="paymentMilestone", default=None)
    contract_code: Optional[str] = Field(alias="contractCode", default=None)
    sow_code: Optional[str] = Field(alias="sowCode", default=None)
    process_code: Optional[str] = Field(alias="processCode", default=None)
    due_date: Optional[date] = Field(alias="dueDate", default=None)
    paid_date: Optional[date] = Field(alias="paidDate", default=None)
    amount: float
    currency: str
    status: str
    variance_days: Optional[float] = Field(alias="varianceDays", default=None)
    notes: Optional[str] = None


class AtomPaymentSummary(BaseModel):
    committed: float
    paid: float
    outstanding: float
    overdue_count: int = Field(alias="overdueCount")
    pending_count: int = Field(alias="pendingCount")
    average_payment_days: Optional[float] = Field(alias="averagePaymentDays", default=None)
    latest_payment_date: Optional[date] = Field(alias="latestPaymentDate", default=None)
    as_of: datetime = Field(alias="asOf")


class AtomPaymentResponse(BaseModel):
    scope: AtomSummaryScope
    summary: AtomPaymentSummary
    categories: list[AtomPaymentCategorySummary]
    records: list[AtomPaymentRecord]
