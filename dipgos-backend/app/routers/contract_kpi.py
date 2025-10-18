from __future__ import annotations

import logging
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, ValidationError, field_validator

from ..config import settings
from ..repos.contract_kpi_repo import ContractKpiRepo

logger = logging.getLogger(__name__)

METRIC_CODES: tuple[str, ...] = (
    "prod_actual_pct",
    "prod_planned_pct",
    "design_output",
    "prep_output",
    "const_output",
    "ncr_open",
    "ncr_closed",
    "qaor_open",
    "qaor_closed",
    "quality_conf",
    "spi",
)


def _ensure_feature_enabled() -> None:
    if not settings.feature_contract_right_panel_echarts:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract KPI right panel is disabled")


def _as_float(value: Optional[Decimal | float | int]) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def get_repo() -> ContractKpiRepo:
    return ContractKpiRepo()


class LatestQuery(BaseModel):
    contract_id: str = Field(..., alias="contractId", description="Contract identifier")

    @field_validator("contract_id")
    @classmethod
    def _validate_contract_id(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("contractId is required")
        return value.strip()


class LatestPayload(BaseModel):
    latest: Dict[str, Optional[float]]


class SeriesQuery(BaseModel):
    contract_id: str = Field(..., alias="contractId", description="Contract identifier")
    metric: str = Field(..., description="Metric code")
    days: int = Field(90, ge=7, le=365)

    @field_validator("contract_id")
    @classmethod
    def _validate_contract_id(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("contractId is required")
        return value.strip()

    @field_validator("metric")
    @classmethod
    def _validate_metric(cls, value: str) -> str:
        metric = value.strip()
        if metric not in METRIC_CODES:
            allowed = ", ".join(METRIC_CODES)
            raise ValueError(f"metric must be one of {allowed}")
        return metric


class SeriesPayload(BaseModel):
    dates: List[str]
    actual: List[Optional[float]]
    planned: List[Optional[float]]


router = APIRouter(prefix="/api/contract", tags=["contract-kpi"])


@router.get("/{contract_id}/right-panel/latest", response_model=LatestPayload)
def contract_latest(
    contract_id: str,
    response: Response,
    repo: ContractKpiRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> LatestPayload:
    _ensure_feature_enabled()
    try:
        query = LatestQuery(contractId=contract_id)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.errors()) from exc
    latest = repo.fetch_latest(query.contract_id, metrics=METRIC_CODES)
    payload: Dict[str, Optional[float]] = {metric: _as_float(latest.get(metric)) for metric in METRIC_CODES}
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info(
        "contract_latest contract_id=%s metrics=%s request_id=%s",
        query.contract_id,
        len(payload),
        x_request_id,
    )
    return LatestPayload(latest=payload)


@router.get("/{contract_id}/right-panel/series", response_model=SeriesPayload)
def contract_series(
    contract_id: str,
    response: Response,
    metric: str = Query(..., description="Metric code"),
    days: int = Query(90, ge=7, le=365),
    repo: ContractKpiRepo = Depends(get_repo),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
) -> SeriesPayload:
    _ensure_feature_enabled()
    try:
        query = SeriesQuery(contractId=contract_id, metric=metric, days=days)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.errors()) from exc
    points = repo.fetch_series(query.contract_id, query.metric, query.days)
    payload = SeriesPayload(
        dates=[point.ts_date for point in points],
        actual=[_as_float(point.actual) for point in points],
        planned=[_as_float(point.planned) for point in points],
    )
    response.headers["Cache-Control"] = "public, max-age=60"
    logger.info(
        "contract_series contract_id=%s metric=%s days=%s rows=%s request_id=%s",
        query.contract_id,
        query.metric,
        query.days,
        len(points),
        x_request_id,
    )
    return payload
