from __future__ import annotations

import re
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from ..data import fallback_contracts, fallback_insights, fallback_project_by_id, fallback_projects, fallback_sows
from ..db import pool
from ..services.geocode import geocode_address

router = APIRouter()

ALLOWED_PHASES = {"Construction", "O&M", "Planning & Design"}


class Project(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    status_pct: float
    phase: str
    alerts: int
    status_label: Optional[str] = None
    image: Optional[str] = None
    address: Optional[str] = None
    geofence_radius_m: Optional[float] = Field(default=None, description="Radius in metres for the monitored zone")


class ProjectCreate(BaseModel):
    name: str
    phase: str
    status_pct: float = Field(ge=0, le=100)
    alerts: int = Field(default=0, ge=0)
    status_label: Optional[str] = None
    image: Optional[str] = None
    address: Optional[str] = Field(default=None, description="Physical site address for auto geocoding")
    geofence_radius_m: Optional[float] = Field(default=None, ge=0)
    lat: Optional[float] = None
    lng: Optional[float] = None

    @field_validator("phase")
    @classmethod
    def validate_phase(cls, value: str) -> str:
        if value not in ALLOWED_PHASES:
            raise ValueError(f"phase must be one of {', '.join(sorted(ALLOWED_PHASES))}")
        return value


class ProjectAnalytics(BaseModel):
    total_projects: int
    phase_breakdown: Dict[str, int]
    average_progress: float
    alerts_total: int


class ContractSite(BaseModel):
    id: str
    project_id: str
    name: str
    phase: str
    discipline: Optional[str] = None
    lat: float
    lng: float
    status_pct: float
    status_label: Optional[str] = None
    alerts: int
    image: Optional[str] = None


class WorkOutputMetric(BaseModel):
    label: str
    status: str
    percent: Optional[float] = None


class ConstructionMetric(BaseModel):
    label: str
    status: str
    actual: float
    planned: float


class ProductivityMetrics(BaseModel):
    design: List[WorkOutputMetric] = Field(default_factory=list)
    preparatory: List[WorkOutputMetric] = Field(default_factory=list)
    construction: List[ConstructionMetric] = Field(default_factory=list)


class MilestoneMetric(BaseModel):
    label: str
    status: str


class QualityBreakdown(BaseModel):
    closed: int
    open: int
    issued: int


class QualityInsight(BaseModel):
    label: str
    status: str
    description: Optional[str] = None


class QualityMetrics(BaseModel):
    ncr: QualityBreakdown
    qaor: QualityBreakdown
    conformance: List[QualityInsight] = Field(default_factory=list)


class WorkInProgressMetric(BaseModel):
    contract: str
    status: str
    percent: float


class SpiTask(BaseModel):
    label: str
    impact: str
    status: str


class SpiMetric(BaseModel):
    value: float
    status: str
    runway_days: int
    burn_rate_days: int
    cash_flow: float
    tasks: List[SpiTask] = Field(default_factory=list)


class ProjectInsightPayload(BaseModel):
    alerts: int
    physical: Dict[str, float]
    productivity: ProductivityMetrics
    milestones: List[MilestoneMetric] = Field(default_factory=list)
    quality: QualityMetrics
    workInProgress: List[WorkInProgressMetric] = Field(default_factory=list)
    spi: SpiMetric


class ContractSowClause(BaseModel):
    id: str
    title: str
    status: Optional[str] = None
    lead: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    progress: float
    sequence: int


class ContractSow(BaseModel):
    id: str
    title: str
    status: Optional[str] = None
    progress: float
    clauses: List[ContractSowClause] = Field(default_factory=list)


class ContractSowGroup(BaseModel):
    contract_id: str
    contract_name: str
    sections: List[ContractSow] = Field(default_factory=list)


class ProjectControlCenter(BaseModel):
    project: Project
    contracts: List[ContractSite]
    metrics: ProjectInsightPayload
    sow_tree: List[ContractSowGroup]




def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or f"project-{uuid4().hex[:8]}"


def _row_to_project(row) -> Project:
    return Project(
        id=row[0],
        name=row[1],
        lat=float(row[2]),
        lng=float(row[3]),
        status_pct=float(row[4]),
        phase=row[5],
        alerts=int(row[6]),
        status_label=row[7],
        image=row[8],
        address=row[9],
        geofence_radius_m=float(row[10]) if row[10] is not None else None,
    )


def _load_project(project_id: str) -> Optional[Project]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, lat, lng, status_pct, phase, alerts, status_label, image, address, geofence_radius_m
            FROM dipgos.projects WHERE id = %s
            """,
            (project_id,),
        )
        row = cur.fetchone()

    if row:
        return _row_to_project(row)

    fallback = fallback_project_by_id(project_id)
    if fallback:
        return Project(**fallback)

    return None


def _load_contracts(project_id: str) -> List[ContractSite]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, project_id, name, phase, discipline, lat, lng, status_pct, status_label, alerts, image
            FROM dipgos.contracts
            WHERE project_id = %s
            ORDER BY phase, name
            """,
            (project_id,),
        )
        rows = cur.fetchall()

    if rows:
        return [
            ContractSite(
                id=row[0],
                project_id=row[1],
                name=row[2],
                phase=row[3],
                discipline=row[4],
                lat=float(row[5]),
                lng=float(row[6]),
                status_pct=float(row[7]),
                status_label=row[8],
                alerts=int(row[9]),
                image=row[10],
            )
            for row in rows
        ]

    return [ContractSite(**record) for record in fallback_contracts(project_id)]


def _load_insights(project: Project) -> ProjectInsightPayload:
    project_id = project.id
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT payload FROM dipgos.project_insights WHERE project_id = %s",
            (project_id,),
        )
        row = cur.fetchone()

    payload = row[0] if row else fallback_insights(project_id)
    if not payload:
        payload = {}

    payload.setdefault("alerts", project.alerts)
    payload.setdefault("physical", {"actual": 0.0, "planned": 0.0})

    productivity = payload.setdefault("productivity", {})
    productivity.setdefault("design", [])
    productivity.setdefault("preparatory", [])
    productivity.setdefault("construction", [])

    payload.setdefault("milestones", [])

    quality = payload.setdefault("quality", {
        "ncr": {"closed": 0, "open": 0, "issued": 0},
        "qaor": {"closed": 0, "open": 0, "issued": 0},
        "conformance": [],
    })
    quality.setdefault("ncr", {"closed": 0, "open": 0, "issued": 0})
    quality.setdefault("qaor", {"closed": 0, "open": 0, "issued": 0})
    quality.setdefault("conformance", [])

    payload.setdefault("workInProgress", [])

    spi = payload.setdefault("spi", {
        "value": 1.0,
        "status": "Green",
        "runway_days": 0,
        "burn_rate_days": 0,
        "cash_flow": 0,
        "tasks": [],
    })
    spi.setdefault("tasks", [])

    return ProjectInsightPayload.model_validate(payload)


def _load_sows(project_id: str) -> List[ContractSowGroup]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT cs.id, cs.contract_id, cs.title, cs.status, cs.progress, cs.sequence, c.name
            FROM dipgos.contract_sows cs
            JOIN dipgos.contracts c ON c.id = cs.contract_id
            WHERE c.project_id = %s
            ORDER BY c.phase, cs.sequence
            """,
            (project_id,),
        )
        sow_rows = cur.fetchall()

        cur.execute(
            """
            SELECT id, sow_id, title, status, lead, start_date, due_date, progress, sequence
            FROM dipgos.contract_sow_clauses
            WHERE sow_id = ANY(%s)
            ORDER BY sequence
            """,
            ([row[0] for row in sow_rows] or ['__empty__'],),
        )
        clause_rows = cur.fetchall()

    if sow_rows:
        clauses_by_sow: Dict[str, List[ContractSowClause]] = {}
        for row in clause_rows:
            clause = ContractSowClause(
                id=row[0],
                title=row[2],
                status=row[3],
                lead=row[4],
                start_date=row[5].isoformat() if row[5] else None,
                due_date=row[6].isoformat() if row[6] else None,
                progress=float(row[7] or 0),
                sequence=int(row[8] or 0),
            )
            clauses_by_sow.setdefault(row[1], []).append(clause)

        grouped: Dict[str, Dict[str, object]] = {}
        for row in sow_rows:
            sow = ContractSow(
                id=row[0],
                title=row[2],
                status=row[3],
                progress=float(row[4] or 0),
                clauses=clauses_by_sow.get(row[0], []),
            )
            contract_id = row[1]
            contract_name = row[6]
            entry = grouped.setdefault(contract_id, {"contract_id": contract_id, "contract_name": contract_name, "sections": []})
            entry["sections"].append(sow)

        return [ContractSowGroup(**value) for value in grouped.values()]

    fallback = fallback_sows(project_id)
    groups: List[ContractSowGroup] = []
    for item in fallback:
        sections = [ContractSow(**section) for section in item.get("sections", [])]
        groups.append(ContractSowGroup(contract_id=item["contract_id"], contract_name=item["contract_name"], sections=sections))
    return groups


@router.get("/", response_model=List[Project])
def list_projects(phase: Optional[str] = Query(None, description="Filter by phase")):
    sql = """
        SELECT id, name, lat, lng, status_pct, phase, alerts, status_label, image, address, geofence_radius_m
        FROM dipgos.projects
    """
    params: List[object] = []
    if phase:
        sql += " WHERE lower(phase) = lower(%s)"
        params.append(phase)
    sql += " ORDER BY name"

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    if rows:
        return [_row_to_project(row) for row in rows]

    records = fallback_projects()
    if phase:
        records = [record for record in records if str(record["phase"]).lower() == phase.lower()]
    return [Project(**record) for record in records]


@router.get("/analytics", response_model=ProjectAnalytics)
def analytics_snapshot():
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) AS total,
                COALESCE(AVG(status_pct), 0) AS avg_progress,
                COALESCE(SUM(alerts), 0) AS total_alerts
            FROM dipgos.projects
            """
        )
        total, avg_progress, total_alerts = cur.fetchone()

        cur.execute(
            """
            SELECT phase, COUNT(*)
            FROM dipgos.projects
            GROUP BY phase
            """
        )
        phase_rows = cur.fetchall()

    total_projects = int(total or 0)
    if total_projects:
        return ProjectAnalytics(
            total_projects=total_projects,
            phase_breakdown={row[0]: int(row[1]) for row in phase_rows},
            average_progress=float(avg_progress or 0),
            alerts_total=int(total_alerts or 0),
        )

    fallback = fallback_projects()
    phase_breakdown: Dict[str, int] = {}
    alerts_acc = 0
    progress_acc = 0.0
    for record in fallback:
        phase = str(record["phase"])
        phase_breakdown[phase] = phase_breakdown.get(phase, 0) + 1
        alerts_acc += int(record["alerts"])
        progress_acc += float(record["status_pct"])

    total_projects = len(fallback)
    return ProjectAnalytics(
        total_projects=total_projects,
        phase_breakdown=phase_breakdown,
        average_progress=progress_acc / total_projects if total_projects else 0.0,
        alerts_total=alerts_acc,
    )


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    project = _load_project(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/{project_id}/control-center", response_model=ProjectControlCenter)
def get_project_control_center(project_id: str):
    project = _load_project(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    contracts = _load_contracts(project_id)
    metrics = _load_insights(project)
    sow_tree = _load_sows(project_id)

    return ProjectControlCenter(project=project, contracts=contracts, metrics=metrics, sow_tree=sow_tree)


@router.post("/", response_model=Project, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate):
    project_id = _slugify(payload.name)

    lat = payload.lat
    lng = payload.lng
    if (lat is None or lng is None) and payload.address:
        coordinates = geocode_address(payload.address)
        if coordinates:
            lat, lng = coordinates
    if lat is None or lng is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to determine site coordinates. Provide latitude/longitude or a geocodable address.",
        )

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO dipgos.projects (
                id, name, lat, lng, status_pct, phase, status_label,
                alerts, image, address, geofence_radius_m
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                lat = EXCLUDED.lat,
                lng = EXCLUDED.lng,
                status_pct = EXCLUDED.status_pct,
                phase = EXCLUDED.phase,
                status_label = EXCLUDED.status_label,
                alerts = EXCLUDED.alerts,
                image = EXCLUDED.image,
                address = EXCLUDED.address,
                geofence_radius_m = COALESCE(EXCLUDED.geofence_radius_m, dipgos.projects.geofence_radius_m),
                updated_at = NOW()
            RETURNING id, name, lat, lng, status_pct, phase, alerts, status_label, image, address, geofence_radius_m
            """,
            (
                project_id,
                payload.name.strip(),
                lat,
                lng,
                payload.status_pct,
                payload.phase,
                payload.status_label,
                payload.alerts,
                payload.image,
                payload.address,
                payload.geofence_radius_m,
            ),
        )
        row = cur.fetchone()
        conn.commit()

    return _row_to_project(row)

