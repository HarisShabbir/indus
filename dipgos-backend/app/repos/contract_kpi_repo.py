from __future__ import annotations

import logging
from dataclasses import dataclass
from time import perf_counter
from typing import Dict, Iterable, List, Sequence

from psycopg.rows import dict_row

from ..db import pool

logger = logging.getLogger(__name__)


ALLOWED_METRICS: Sequence[str] = (
    'prod_actual_pct',
    'prod_planned_pct',
    'design_output',
    'prep_output',
    'const_output',
    'ncr_open',
    'ncr_closed',
    'qaor_open',
    'qaor_closed',
    'quality_conf',
    'spi',
    'ev',
    'pv',
    'ac',
    'cpi',
    'schedule_progress_pct',
)


DEFAULT_LATEST_METRICS: Sequence[str] = (
    'prod_actual_pct',
    'prod_planned_pct',
    'design_output',
    'prep_output',
    'const_output',
    'ncr_open',
    'ncr_closed',
    'qaor_open',
    'qaor_closed',
    'quality_conf',
    'spi',
)


@dataclass
class SeriesPoint:
    ts_date: str
    actual: float
    planned: float


class ContractKpiRepo:
    """Read-only access to contract KPI data."""

    def fetch_latest(self, contract_id: str, metrics: Iterable[str] | None = None) -> Dict[str, float | None]:
        metric_list = tuple(metrics or DEFAULT_LATEST_METRICS)
        start = perf_counter()
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                cur.execute(
                    """
                    SELECT metric_code, actual_numeric
                    FROM dipgos.v_kpi_latest_contract
                    WHERE contract_id = %s
                      AND metric_code = ANY(%s)
                    """,
                    (contract_id, list(metric_list)),
                )
                rows = cur.fetchall()
        elapsed = (perf_counter() - start) * 1000
        logger.debug("fetch_latest contract_id=%s metrics=%s rows=%s elapsed_ms=%.2f", contract_id, metric_list, len(rows), elapsed)
        latest: Dict[str, float | None] = {metric: None for metric in metric_list}
        for row in rows:
            latest[row['metric_code']] = row['actual_numeric']
        return latest

    def fetch_series(self, contract_id: str, metric_code: str, days: int) -> List[SeriesPoint]:
        if metric_code == 'cpi':
            return self._fetch_cpi_series(contract_id, days)

        start = perf_counter()
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                cur.execute(
                    """
                    SELECT ts_date, COALESCE(actual_numeric,0) AS actual, COALESCE(planned_numeric,0) AS planned
                    FROM dipgos.v_kpi_series_contract
                    WHERE contract_id = %s AND metric_code = %s
                      AND ts_date >= CURRENT_DATE - (%s::int - 1)
                    ORDER BY ts_date
                    """,
                    (contract_id, metric_code, days),
                )
                rows = cur.fetchall()
        elapsed = (perf_counter() - start) * 1000
        logger.debug("fetch_series contract_id=%s metric=%s days=%s rows=%s elapsed_ms=%.2f", contract_id, metric_code, days, len(rows), elapsed)
        return [SeriesPoint(ts_date=str(row['ts_date']), actual=row['actual'], planned=row['planned']) for row in rows]

    def _fetch_cpi_series(self, contract_id: str, days: int) -> List[SeriesPoint]:
        start = perf_counter()
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                cur.execute(
                    """
                    SELECT ts_date,
                           CASE WHEN SUM(ac_actual) = 0 THEN NULL
                                ELSE SUM(ev_actual) / NULLIF(SUM(ac_actual),0)
                           END AS cpi_value
                    FROM (
                      SELECT ts_date,
                             CASE WHEN metric_code = 'ev' THEN COALESCE(actual_numeric,0) ELSE 0 END AS ev_actual,
                             CASE WHEN metric_code = 'ac' THEN COALESCE(actual_numeric,0) ELSE 0 END AS ac_actual
                      FROM dipgos.v_kpi_series_contract
                      WHERE contract_id = %s
                        AND metric_code IN ('ev','ac')
                        AND ts_date >= CURRENT_DATE - (%s::int - 1)
                    ) AS src
                    GROUP BY ts_date
                    ORDER BY ts_date
                    """,
                    (contract_id, days),
                )
                rows = cur.fetchall()
        elapsed = (perf_counter() - start) * 1000
        logger.debug("fetch_cpi_series contract_id=%s days=%s rows=%s elapsed_ms=%.2f", contract_id, days, len(rows), elapsed)
        series: List[SeriesPoint] = []
        for row in rows:
            val = row['cpi_value']
            series.append(SeriesPoint(ts_date=str(row['ts_date']), actual=val if val is not None else 0.0, planned=0.0))
        return series
