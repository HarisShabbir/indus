from __future__ import annotations

from datetime import datetime, timedelta, time
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..repos.contract_kpi_repo import ContractKpiRepo, SeriesPoint
from ..repos.schedule_repo import ScheduleRepo, ScheduleTask

router = APIRouter(prefix="/api", tags=["contract-schedule"])


def get_repo() -> ScheduleRepo:
    return ScheduleRepo()


def get_kpi_repo() -> ContractKpiRepo:
    return ContractKpiRepo()


class TrendPoint(BaseModel):
    date: datetime
    spi: Optional[float] = None


class ProcessItem(BaseModel):
    id: str
    sowId: str = Field(..., alias="sowId")
    name: str
    startPlanned: datetime
    endPlanned: datetime
    startActual: Optional[datetime] = None
    endActual: Optional[datetime] = None
    percentComplete: float
    spi: Optional[float] = None
    cpi: Optional[float] = None
    milestones: List[Dict[str, str]] = Field(default_factory=list)


class SOWItem(BaseModel):
    id: str
    contractId: str
    code: str
    name: str
    startPlanned: datetime
    endPlanned: datetime
    percentComplete: float
    spi: Optional[float] = None
    cpi: Optional[float] = None
    processes: List[ProcessItem]


class PeerContract(BaseModel):
    id: str
    code: str
    name: str


class ContractSchedule(BaseModel):
    id: str
    code: str
    name: str
    updatedAt: datetime
    baselineVersion: Optional[str] = None
    sows: List[SOWItem]
    peerContracts: List[PeerContract] = Field(default_factory=list)


class KPIResponse(BaseModel):
    spi: Optional[float] = None
    cpi: Optional[float] = None
    ev: Optional[float] = None
    pv: Optional[float] = None
    ac: Optional[float] = None
    progressActual: Optional[float] = None
    progressPlanned: Optional[float] = None
    trend: List[TrendPoint] = Field(default_factory=list)


def _parse_identifier(identifier: str) -> Tuple[str, str]:
    if ":" not in identifier:
        raise ValueError(f"Unrecognised identifier: {identifier}")
    scope, value = identifier.split(":", 1)
    return scope, value


def _duration_weight(task: ScheduleTask) -> float:
    delta = (task.end - task.start).days or 1
    return max(1.0, float(delta))


def _collect_contract_tasks(repo: ScheduleRepo, contract_id: str) -> List[ScheduleTask]:
    tasks = repo.fetch_contract_schedule(contract_id)
    if not tasks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract schedule not found")
    return tasks


def _build_process(task: ScheduleTask, sow_id: str) -> ProcessItem:
    meta = task.meta or {}
    return ProcessItem(
        id=task.id.split(":", 1)[1],
        sowId=sow_id,
        name=task.name,
        startPlanned=datetime.combine(task.start, time.min),
        endPlanned=datetime.combine(task.end, time.min),
        percentComplete=task.progress,
        spi=_safe_float(meta.get("spi")),
        cpi=_safe_float(meta.get("cpi")),
        milestones=[],
    )


def _safe_float(value) -> Optional[float]:
    try:
        if value is None:
            return None
        num = float(value)
        if num != num:  # NaN check
            return None
        return num
    except (TypeError, ValueError):
        return None


def _series_point_to_trend(point: SeriesPoint) -> TrendPoint:
    ts = point.ts_date
    try:
        snapshot = datetime.fromisoformat(ts)
    except ValueError:
        snapshot = datetime.combine(datetime.strptime(ts, "%Y-%m-%d").date(), time.min)
    return TrendPoint(date=snapshot, spi=_safe_float(point.actual))


def _resolve_cpi(metrics: Dict[str, float | None]) -> Optional[float]:
    cpi_value = _safe_float(metrics.get("cpi"))
    if cpi_value is not None:
        return cpi_value
    ev_value = _safe_float(metrics.get("ev"))
    ac_value = _safe_float(metrics.get("ac"))
    if ev_value is None or ac_value in (None, 0.0):
        return None
    return ev_value / ac_value


def _summarise_sow(sow_task: ScheduleTask, processes: List[ProcessItem], contract_id: str) -> SOWItem:
    if processes:
        start = min(proc.startPlanned for proc in processes)
        end = max(proc.endPlanned for proc in processes)
        totals = sum(_duration_from_process(proc) for proc in processes)
        progress = sum(proc.percentComplete * _duration_from_process(proc) for proc in processes) / totals if totals else sow_task.progress
        spi_vals = [proc.spi for proc in processes if proc.spi is not None]
    else:
        start = datetime.combine(sow_task.start, time.min)
        end = datetime.combine(sow_task.end, time.min)
        progress = sow_task.progress
        spi_vals = []

    meta = sow_task.meta or {}
    spi = _safe_float(meta.get("spi"))
    if spi is None and spi_vals:
        spi = sum(spi_vals) / len(spi_vals)

    return SOWItem(
        id=sow_task.id.split(":", 1)[1],
        contractId=contract_id,
        code=sow_task.name.split(" ", 1)[0] if sow_task.name else sow_task.id,
        name=sow_task.name,
        startPlanned=start,
        endPlanned=end,
        percentComplete=progress,
        spi=spi,
        cpi=_safe_float(meta.get("cpi")),
        processes=processes,
    )


def _duration_from_process(proc: ProcessItem) -> float:
    delta = (proc.endPlanned - proc.startPlanned).days or 1
    return float(max(1, delta))


@router.get("/contracts/{contract_id}/schedule", response_model=ContractSchedule)
def contract_schedule(contract_id: str, repo: ScheduleRepo = Depends(get_repo)) -> ContractSchedule:
    tasks = _collect_contract_tasks(repo, contract_id)

    contract_task = next((task for task in tasks if task.id.startswith("contract:")), None)
    if contract_task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract task missing")

    sow_tasks = [task for task in tasks if task.id.startswith("sow:")]
    process_tasks = [task for task in tasks if task.id.startswith("process:")]

    peer_contracts: List[PeerContract] = []
    project_id: Optional[str] = None
    if contract_task.parent:
        _, project_id = _parse_identifier(contract_task.parent)
    if project_id:
        project_tasks = repo.fetch_project_schedule(project_id)
        for task in project_tasks:
            if task.id.startswith("contract:"):
                _, peer_id = _parse_identifier(task.id)
                peer_contracts.append(
                    PeerContract(
                        id=peer_id,
                        code=task.name.split(" ", 1)[0] if task.name else peer_id,
                        name=task.name,
                    )
                )
        peer_contracts.sort(key=lambda item: item.name)

    processes_by_sow: Dict[str, List[ProcessItem]] = {}
    for proc_task in process_tasks:
        _, proc_id = _parse_identifier(proc_task.id)
        parent_id = proc_task.parent
        if not parent_id:
            continue
        _, sow_id = _parse_identifier(parent_id)
        processes_by_sow.setdefault(sow_id, [])
        processes_by_sow[sow_id].append(_build_process(proc_task, sow_id))

    sow_items = []
    for sow_task in sow_tasks:
        _, sow_id = _parse_identifier(sow_task.id)
        sow_items.append(_summarise_sow(sow_task, processes_by_sow.get(sow_id, []), contract_id))

    sow_items.sort(key=lambda item: item.startPlanned)

    return ContractSchedule(
        id=contract_id,
        code=contract_task.name.split(" ", 1)[0] if contract_task.name else contract_id,
        name=contract_task.name,
        updatedAt=datetime.utcnow(),
        baselineVersion=None,
        sows=sow_items,
        peerContracts=peer_contracts,
    )


@router.get("/sows/{sow_id}/schedule", response_model=SOWItem)
def sow_schedule(sow_id: str, repo: ScheduleRepo = Depends(get_repo)) -> SOWItem:
    # Need to infer parent contract via full fetch
    tasks = repo.fetch_contract_schedule(sow_id.split("-", 1)[0])  # fallback best-effort
    sow_task = next((task for task in tasks if task.id == f"sow:{sow_id}"), None)
    if sow_task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOW not found")
    parent_contract = sow_task.parent.split(":", 1)[1] if sow_task.parent else ""
    process_tasks = [task for task in tasks if task.parent == sow_task.id]
    processes = [_build_process(proc_task, sow_id) for proc_task in process_tasks]
    return _summarise_sow(sow_task, processes, parent_contract)


@router.get("/processes/{process_id}/schedule", response_model=ProcessItem)
def process_schedule(process_id: str, repo: ScheduleRepo = Depends(get_repo)) -> ProcessItem:
    tasks = repo.fetch_contract_schedule(process_id.split("-", 1)[0])
    proc_task = next((task for task in tasks if task.id == f"process:{process_id}"), None)
    if proc_task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
    sow_id = proc_task.parent.split(":", 1)[1] if proc_task.parent else ""
    return _build_process(proc_task, sow_id)


@router.get("/contracts/{contract_id}/kpis", response_model=KPIResponse)
def contract_kpis(
    contract_id: str,
    level: str = Query("contract", pattern="^(contract|sow|process)$"),
    id: Optional[str] = None,
    repo: ScheduleRepo = Depends(get_repo),
    kpi_repo: ContractKpiRepo = Depends(get_kpi_repo),
) -> KPIResponse:
    if level == "contract":
        metrics = kpi_repo.fetch_latest(
            contract_id,
            metrics=("spi", "cpi", "ev", "pv", "ac", "prod_actual_pct", "prod_planned_pct"),
        )
        series = kpi_repo.fetch_series(contract_id, "spi", 45)
        trend = [_series_point_to_trend(point) for point in series][-12:]
        spi = _safe_float(metrics.get("spi"))
        cpi = _resolve_cpi(metrics)
        ev = _safe_float(metrics.get("ev"))
        pv = _safe_float(metrics.get("pv"))
        ac = _safe_float(metrics.get("ac"))
        progress_actual = _safe_float(metrics.get("prod_actual_pct"))
        progress_planned = _safe_float(metrics.get("prod_planned_pct"))
        return KPIResponse(
            spi=spi,
            cpi=cpi,
            ev=ev,
            pv=pv,
            ac=ac,
            progressActual=progress_actual,
            progressPlanned=progress_planned,
            trend=trend,
        )

    tasks = _collect_contract_tasks(repo, contract_id)
    if level == "sow":
        if not id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id is required for sow level")
        relevant = [task for task in tasks if task.parent == f"sow:{id}"]
    else:
        if not id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id is required for process level")
        relevant = [task for task in tasks if task.id == f"process:{id}"]

    if not relevant:
        return KPIResponse()

    spi_values = [_safe_float(task.meta.get("spi")) for task in relevant if task.meta]
    spi_values = [value for value in spi_values if value is not None]
    cpi_values = [_safe_float(task.meta.get("cpi")) for task in relevant if task.meta]
    cpi_values = [value for value in cpi_values if value is not None]

    percent_values = [task.progress for task in relevant]
    weights = [_duration_weight(task) for task in relevant]
    total_weight = sum(weights)

    spi = sum(spi_values) / len(spi_values) if spi_values else None
    cpi = sum(cpi_values) / len(cpi_values) if cpi_values else None

    progress_actual = (
        round(sum(value * weight for value, weight in zip(percent_values, weights)) / total_weight * 100, 2)
        if total_weight
        else None
    )

    trend = [
        TrendPoint(date=task.end, spi=_safe_float(task.meta.get("spi")) if task.meta else None)
        for task in sorted(relevant, key=lambda t: t.end)
    ][:12]

    return KPIResponse(
        spi=spi,
        cpi=cpi,
        progressActual=progress_actual,
        trend=trend,
    )


class ResourceAdjustment(BaseModel):
    resource: str
    quantity: int


class WhatIfRequest(BaseModel):
    contractId: str
    daysOffset: int = Field(..., ge=-60, le=60)
    resources: List[ResourceAdjustment] = Field(default_factory=list)


class WhatIfResponse(BaseModel):
    projectedFinish: datetime
    deltaDays: int
    spiProjected: Optional[float] = None
    notes: List[str] = Field(default_factory=list)


@router.post("/schedule/whatif", response_model=WhatIfResponse)
def schedule_what_if(payload: WhatIfRequest, repo: ScheduleRepo = Depends(get_repo)) -> WhatIfResponse:
    tasks = _collect_contract_tasks(repo, payload.contractId)
    process_tasks = [task for task in tasks if task.id.startswith("process:")]
    if not process_tasks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No processes to simulate")

    latest_finish = max(task.end for task in process_tasks)
    resource_bonus = _resource_bonus_days(payload.resources)
    effective_offset = payload.daysOffset - resource_bonus
    projected_finish = latest_finish + timedelta(days=effective_offset)
    baseline_spi = sum((_safe_float(task.meta.get("spi")) or 1.0) for task in process_tasks) / len(process_tasks)
    spi_adjustment = effective_offset / 90  # heuristic
    spi_projected = max(0.6, min(1.4, baseline_spi - spi_adjustment))

    notes: List[str] = []
    if effective_offset < 0:
        notes.append("Acceleration scenario reduces schedule tail.")
    elif effective_offset > 0:
        notes.append("Extension scenario could trigger claims review.")
    if resource_bonus > 0:
        notes.append(f"Additional resources shaved {resource_bonus} days from projection.")

    return WhatIfResponse(
        projectedFinish=projected_finish,
        deltaDays=effective_offset,
        spiProjected=spi_projected,
        notes=notes,
    )


def _resource_bonus_days(resources: List[ResourceAdjustment]) -> int:
    bonus = 0
    for resource in resources:
        if resource.resource.lower() == "excavator":
            bonus += resource.quantity * 2
        elif resource.resource.lower() in {"formwork", "crew", "crews"}:
            bonus += resource.quantity
        elif resource.resource.lower() in {"qa", "inspector", "drones"}:
            bonus += int(resource.quantity * 0.5)
    return min(20, max(0, bonus))
