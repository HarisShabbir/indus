from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import pool

router = APIRouter()


def _set_search_path(cur) -> None:
    cur.execute("SET search_path TO dipgos, public")


def _decimal_or_none(value):
    if value is None:
        return None
    return float(value)


class KpiPoint(BaseModel):
    ts_date: date = Field(..., alias="date")
    actual: Optional[float] = None
    planned: Optional[float] = None


class KpiLatestResponse(BaseModel):
    metrics: Dict[str, KpiPoint]


class KpiSeriesResponse(BaseModel):
    metric_code: str
    dates: List[date]
    actual: List[Optional[float]]
    planned: List[Optional[float]]


@dataclass
class _SeriesRow:
    ts_date: date
    actual: Optional[float]
    planned: Optional[float]


def _fetch_latest(query: str, identifier: str) -> Dict[str, KpiPoint]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _set_search_path(cur)
            cur.execute(query, (identifier,))
            rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No KPI data found")
    latest: Dict[str, KpiPoint] = {}
    for metric_code, ts_date, actual, planned in rows:
        latest[metric_code] = KpiPoint(
            date=ts_date,
            actual=_decimal_or_none(actual),
            planned=_decimal_or_none(planned),
        )
    return latest


def _fetch_series(query: str, params: tuple) -> List[_SeriesRow]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _set_search_path(cur)
            cur.execute(query, params)
            rows = cur.fetchall()
    return [_SeriesRow(ts_date=row[0], actual=_decimal_or_none(row[1]), planned=_decimal_or_none(row[2])) for row in rows]


@router.get("/contract/{contract_id}/latest", response_model=KpiLatestResponse)
def contract_latest(contract_id: str) -> KpiLatestResponse:
    latest = _fetch_latest(
        """
        SELECT metric_code, ts_date, actual_numeric, planned_numeric
        FROM dipgos.v_kpi_latest_contract
        WHERE contract_id = %s
        ORDER BY metric_code
        """,
        contract_id,
    )
    return KpiLatestResponse(metrics=latest)


@router.get("/contract/{contract_id}/series", response_model=KpiSeriesResponse)
def contract_series(
    contract_id: str,
    metric: str = Query(..., min_length=1),
    days: int = Query(60, ge=1, le=365),
) -> KpiSeriesResponse:
    metric_code = metric
    if metric_code.lower() == "cpi":
        rows = _fetch_series(
            """
            SELECT ts_date,
                   CASE WHEN ac_value = 0 THEN NULL ELSE ev_value / ac_value END AS actual_numeric,
                   NULL::double precision AS planned_numeric
            FROM (
              SELECT ts_date,
                     SUM(CASE WHEN metric_code = 'ev' THEN actual_numeric ELSE 0 END) AS ev_value,
                     SUM(CASE WHEN metric_code = 'ac' THEN actual_numeric ELSE 0 END) AS ac_value
              FROM dipgos.v_kpi_series_contract
              WHERE contract_id = %s
                AND metric_code IN ('ev','ac')
                AND ts_date >= CURRENT_DATE - %s
              GROUP BY ts_date
            ) AS s
            ORDER BY ts_date
            """,
            (contract_id, days),
        )
    else:
        rows = _fetch_series(
            """
            SELECT ts_date, actual_numeric, planned_numeric
            FROM dipgos.v_kpi_series_contract
            WHERE contract_id = %s
              AND metric_code = %s
              AND ts_date >= CURRENT_DATE - %s
            ORDER BY ts_date
            """,
            (contract_id, metric_code, days),
        )

    if not rows:
        raise HTTPException(status_code=404, detail="No KPI data found for requested series")

    dates = [row.ts_date for row in rows]
    actual = [row.actual for row in rows]
    planned = [row.planned for row in rows]

    return KpiSeriesResponse(metric_code=metric_code, dates=dates, actual=actual, planned=planned)


@router.get("/sow/{sow_id}/latest", response_model=KpiLatestResponse)
def sow_latest(sow_id: str) -> KpiLatestResponse:
    latest = _fetch_latest(
        """
        SELECT metric_code, ts_date, actual_numeric, planned_numeric
        FROM dipgos.v_kpi_latest_sow
        WHERE sow_id = %s
        ORDER BY metric_code
        """,
        sow_id,
    )
    return KpiLatestResponse(metrics=latest)


@router.get("/process/{process_id}/series", response_model=KpiSeriesResponse)
def process_series(
    process_id: str,
    metric: str = Query(..., min_length=1),
    days: int = Query(60, ge=1, le=365),
) -> KpiSeriesResponse:
    metric_code = metric
    rows = _fetch_series(
        """
        SELECT ts_date, actual_numeric, planned_numeric
        FROM dipgos.v_kpi_series_process
        WHERE process_id = %s
          AND metric_code = %s
          AND ts_date >= CURRENT_DATE - %s
        ORDER BY ts_date
        """,
        (process_id, metric_code, days),
    )

    if not rows:
        raise HTTPException(status_code=404, detail="No KPI data found for requested series")

    dates = [row.ts_date for row in rows]
    actual = [row.actual for row in rows]
    planned = [row.planned for row in rows]

    return KpiSeriesResponse(metric_code=metric_code, dates=dates, actual=actual, planned=planned)
