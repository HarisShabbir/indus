from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

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
