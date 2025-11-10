from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ScmScopeInfo(BaseModel):
    level: str
    id: Optional[str] = None
    code: Optional[str] = None
    name: Optional[str] = None


class ScmCanvasCard(BaseModel):
    id: str
    title: str
    subtitle: Optional[str] = None
    status: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    neededDate: Optional[date] = None
    eta: Optional[date] = None
    progress: Optional[float] = None
    risk: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, object] = Field(default_factory=dict)


class ScmCanvasLane(BaseModel):
    title: str
    cards: List[ScmCanvasCard] = Field(default_factory=list)


class ScmInventoryCard(BaseModel):
    id: str
    itemCode: str
    itemName: str
    location: Optional[str] = None
    onHand: float = 0.0
    reserved: float = 0.0
    available: float = 0.0
    unitCost: Optional[float] = None
    snapshotDate: date


class ScmProcessMetrics(BaseModel):
    coveragePct: float = 0.0
    requiredQty: float = 0.0
    committedQty: float = 0.0
    openRequisitions: int = 0
    openPurchaseOrders: int = 0
    openShipments: int = 0
    inventoryValue: float = 0.0
    riskLevel: str = "normal"
    riskReasons: List[str] = Field(default_factory=list)


class ScmProcessCanvasResponse(BaseModel):
    generatedAt: datetime
    scope: ScmScopeInfo
    requirements: List[ScmCanvasCard] = Field(default_factory=list)
    inputs: List[ScmCanvasCard] = Field(default_factory=list)
    outputs: List[ScmCanvasCard] = Field(default_factory=list)
    timeline: List[ScmCanvasLane] = Field(default_factory=list)
    procurement: List[ScmCanvasLane] = Field(default_factory=list)
    logistics: List[ScmCanvasCard] = Field(default_factory=list)
    inventory: List[ScmInventoryCard] = Field(default_factory=list)
    metrics: ScmProcessMetrics = Field(default_factory=ScmProcessMetrics)


class ScmDashboardKpi(BaseModel):
    title: str
    value: float
    unit: Optional[str] = None
    trend: Optional[float] = None
    status: Optional[str] = None


class ScmInsightAction(BaseModel):
    label: str
    href: Optional[str] = None
    description: Optional[str] = None
    intent: Optional[str] = None


class ScmInsight(BaseModel):
    metric: str
    headline: str
    summary: str
    severity: str = "info"
    details: List[str] = Field(default_factory=list)
    actions: List[ScmInsightAction] = Field(default_factory=list)


class ScmDashboardResponse(BaseModel):
    generatedAt: datetime
    scope: ScmScopeInfo
    kpis: List[ScmDashboardKpi] = Field(default_factory=list)
    totals: Dict[str, float] = Field(default_factory=dict)
    insights: List[ScmInsight] = Field(default_factory=list)


class ScmStageResource(BaseModel):
    id: str
    resourceId: str
    kind: str
    name: str
    code: Optional[str] = None
    unit: Optional[str] = None
    stage: str
    status: str
    required: float = 0.0
    committed: float = 0.0
    inTransit: float = 0.0
    available: float = 0.0
    eta: Optional[date] = None
    metadata: Dict[str, object] = Field(default_factory=dict)


class ScmStageNode(BaseModel):
    id: str
    title: str
    status: str
    requiredTotal: float = 0.0
    committedTotal: float = 0.0
    inTransitTotal: float = 0.0
    availableTotal: float = 0.0
    resources: List[ScmStageResource] = Field(default_factory=list)


class ScmProcessStageResponse(BaseModel):
    generatedAt: datetime
    scope: ScmScopeInfo
    stages: List[ScmStageNode] = Field(default_factory=list)
