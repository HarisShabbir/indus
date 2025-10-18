from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field, ValidationError

from ..config import settings
from ..repos.schedule_repo import ScheduleRepo, ScheduleTask

logger = logging.getLogger(__name__)


def _ensure_feature_enabled() -> None:
    if not settings.feature_schedule_ui:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule feature disabled")


def get_repo() -> ScheduleRepo:
    return ScheduleRepo()


class GanttTaskModel(BaseModel):
    id: str
    name: str
    start: str
    end: str
    progress: float = Field(ge=0.0, le=1.0)
    parent: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class ScheduleResponse(BaseModel):
    tasks: List[GanttTaskModel]


router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _serialise_tasks(tasks: List[ScheduleTask]) -> List[GanttTaskModel]:
    serialised: List[GanttTaskModel] = []
    for task in tasks:
        try:
            serialised.append(
                GanttTaskModel(
                    id=task.id,
                    name=task.name,
                    start=task.start.isoformat(),
                    end=task.end.isoformat(),
                    progress=max(0.0, min(task.progress, 1.0)),
                    parent=task.parent,
                    meta=task.meta or {},
                )
            )
        except ValidationError as exc:  # pragma: no cover - defensive
            logger.warning("Dropping invalid schedule task id=%s errors=%s", task.id, exc.errors())
    return serialised


@router.get("/project/{project_id}", response_model=ScheduleResponse)
def project_schedule(
    project_id: str,
    response: Response,
    repo: ScheduleRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> ScheduleResponse:
    _ensure_feature_enabled()
    tasks = _serialise_tasks(repo.fetch_project_schedule(project_id))
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info("schedule_project project_id=%s tasks=%s request_id=%s", project_id, len(tasks), x_request_id)
    return ScheduleResponse(tasks=tasks)


@router.get("/contract/{contract_id}", response_model=ScheduleResponse)
def contract_schedule(
    contract_id: str,
    response: Response,
    repo: ScheduleRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> ScheduleResponse:
    _ensure_feature_enabled()
    tasks = _serialise_tasks(repo.fetch_contract_schedule(contract_id))
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info("schedule_contract contract_id=%s tasks=%s request_id=%s", contract_id, len(tasks), x_request_id)
    return ScheduleResponse(tasks=tasks)


@router.get("/sow/{sow_id}", response_model=ScheduleResponse)
def sow_schedule(
    sow_id: str,
    response: Response,
    repo: ScheduleRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> ScheduleResponse:
    _ensure_feature_enabled()
    tasks = _serialise_tasks(repo.fetch_sow_schedule(sow_id))
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info("schedule_sow sow_id=%s tasks=%s request_id=%s", sow_id, len(tasks), x_request_id)
    return ScheduleResponse(tasks=tasks)


@router.get("/process/{process_id}", response_model=ScheduleResponse)
def process_schedule(
    process_id: str,
    response: Response,
    repo: ScheduleRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> ScheduleResponse:
    _ensure_feature_enabled()
    tasks = _serialise_tasks(repo.fetch_process_schedule(process_id))
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info("schedule_process process_id=%s tasks=%s request_id=%s", process_id, len(tasks), x_request_id)
    return ScheduleResponse(tasks=tasks)
