from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    CCCSelection,
    CccSummary,
    MapMarker,
    WipDial,
    RightPanelKpiPayload,
    PhysicalWorksCard,
    WorkInProgressCard,
    WorkInProgressCategory,
    WorkOutputCard,
    WorkOutputItem,
    PerformanceSnapshotCard,
    QualitySummaryCard,
)

CACHE_TTL_SECONDS = 60.0
_SUMMARY_CACHE: Dict[Tuple, Tuple[float, CccSummary]] = {}
_KPIS_CACHE: Dict[Tuple, Tuple[float, RightPanelKpiPayload]] = {}

RATIO_METRICS = {
    "prod_actual_pct",
    "prod_planned_pct",
    "design_output",
    "prep_output",
    "const_output",
    "quality_conf",
    "schedule_progress_pct",
    "spi",
    "cpi",
}

ADDITIVE_METRICS = {
    "ev",
    "pv",
    "ac",
    "ncr_open",
    "ncr_closed",
    "qaor_open",
    "qaor_closed",
}


def _cache_get(cache: Dict[Tuple, Tuple[float, object]], key: Tuple) -> Optional[object]:
    entry = cache.get(key)
    if not entry:
        return None
    ts, payload = entry
    if time.time() - ts > CACHE_TTL_SECONDS:
        cache.pop(key, None)
        return None
    return payload


def _cache_set(cache: Dict[Tuple, Tuple[float, object]], key: Tuple, payload: object) -> None:
    cache[key] = (time.time(), payload)


def _ensure_feature_enabled() -> None:
    if not settings.feature_ccc_v2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CCC v2 API is disabled")


def _to_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_contract_code(name: str) -> Optional[str]:
    if not name:
        return None
    prefix = ""
    for char in name:
        if char.isalnum() or char in "-_":
            prefix += char
        else:
            break
    return prefix or None


def _normalise_tenant(raw: Optional[str]) -> str:
    return (raw or "default").strip().lower() or "default"


def _compute_status(actual: Optional[float], planned: Optional[float]) -> str:
    if actual is None or planned is None:
        return "monitoring"
    delta = actual - planned
    if delta >= -2:
        return "on-track"
    if delta >= -8:
        return "monitoring"
    return "risk"


def _compute_ratio(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator in (None, 0):
        return None
    if denominator == 0:
        return None
    return numerator / denominator


def _max_ts(dates: Iterable[datetime]) -> Optional[datetime]:
    filtered = [d for d in dates if d is not None]
    if not filtered:
        return None
    return max(filtered)


def _average_positive_delta(series: List[Tuple[datetime, Optional[float], Optional[float]]]) -> Optional[float]:
    values = [v for (_, v, _) in series if v is not None]
    if len(values) < 2:
        return None
    deltas = []
    for previous, current in zip(values, values[1:]):
        delta = current - previous
        if delta > 0:
            deltas.append(delta)
    if not deltas:
        return None
    return sum(deltas) / len(deltas)


class _MetricsEntry:
    __slots__ = ("metrics", "timestamp")

    def __init__(self):
        self.metrics: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
        self.timestamp: Optional[datetime] = None

    def add(self, metric_code: str, actual, planned, ts_date) -> None:
        self.metrics[metric_code] = (_to_float(actual), _to_float(planned))
        if ts_date:
            ts_dt = (
                ts_date
                if isinstance(ts_date, datetime)
                else datetime.combine(ts_date, datetime.min.time(), tzinfo=timezone.utc)
            )
            if not self.timestamp or ts_dt > self.timestamp:
                self.timestamp = ts_dt

    def value(self, metric_code: str, kind: str = "actual") -> Optional[float]:
        data = self.metrics.get(metric_code)
        if not data:
            return None
        actual, planned = data
        return actual if kind == "actual" else planned


def _fetch_project_payload(selection: CCCSelection):
    project_row = None
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, name, lat, lng, status_pct, metadata
                FROM dipgos.projects
                WHERE id = %s
                """,
                (selection.project_id,),
            )
            project_row = cur.fetchone()

    if not project_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    tenant_in_db = _normalise_tenant((project_row.get("metadata") or {}).get("tenant_id"))
    if tenant_in_db != _normalise_tenant(selection.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")

    return project_row


def _gather_entities(project_id: str):
    """Return contracts, sows, processes and supporting dictionaries keyed by id."""
    contracts: Dict[str, dict] = {}
    sows: Dict[str, dict] = {}
    processes: Dict[str, dict] = {}
    sow_markers: Dict[str, Tuple[float, float]] = {}
    sow_metrics: Dict[str, dict] = {}

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, project_id, name, phase, discipline, lat, lng, status_pct, status_label, alerts
                FROM dipgos.contracts
                WHERE project_id = %s
                ORDER BY name
                """,
                (project_id,),
            )
            for row in cur.fetchall():
                contracts[row["id"]] = row

            if contracts:
                cur.execute(
                    """
                    SELECT id, contract_id, title, status, progress, sequence
                    FROM dipgos.contract_sows
                    WHERE contract_id = ANY(%s)
                    ORDER BY sequence, title
                    """,
                    (list(contracts.keys()),),
                )
                for row in cur.fetchall():
                    sows[row["id"]] = row

            if sows:
                cur.execute(
                    """
                    SELECT id, sow_id, title, status, lead, progress, sequence
                    FROM dipgos.contract_sow_clauses
                    WHERE sow_id = ANY(%s)
                    ORDER BY sequence, title
                    """,
                    (list(sows.keys()),),
                )
                for row in cur.fetchall():
                    processes[row["id"]] = row

            if sows:
                cur.execute(
                    """
                    SELECT sow_id, lat, lng
                    FROM dipgos.contract_sow_markers
                    WHERE sow_id = ANY(%s)
                    """,
                    (list(sows.keys()),),
                )
                for row in cur.fetchall():
                    sow_markers[row["sow_id"]] = (float(row["lat"]), float(row["lng"]))

                cur.execute(
                    """
                    SELECT sow_id,
                           actual_progress,
                           planned_progress,
                           quality_score,
                           spi,
                           cpi,
                           ncr_open,
                           ncr_closed,
                           qaor_open,
                           qaor_closed,
                           design_actual,
                           design_planned,
                           preparatory_actual,
                           preparatory_planned,
                           construction_actual,
                           construction_planned,
                           scope_weight,
                           ev_value,
                           pv_value,
                           ac_value
                    FROM dipgos.contract_sow_metrics
                    WHERE sow_id = ANY(%s)
                    """,
                    (list(sows.keys()),),
                )
                for row in cur.fetchall():
                    sow_metrics[row["sow_id"]] = row

    return contracts, sows, processes, sow_markers, sow_metrics


def _load_latest_metrics(project_id: str) -> Tuple[Dict[Tuple[str, str], _MetricsEntry], Optional[datetime]]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY dipgos.mv_ccc_latest_metric")
            except Exception:
                conn.rollback()
                with conn.cursor() as fallback_cur:
                    fallback_cur.execute("REFRESH MATERIALIZED VIEW dipgos.mv_ccc_latest_metric")
                conn.commit()
            else:
                conn.commit()

    metrics: Dict[Tuple[str, str], _MetricsEntry] = {}
    timestamps: List[datetime] = []

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT level,
                       project_id,
                       contract_id,
                       sow_id,
                       process_id,
                       metric_code,
                       actual_numeric,
                       planned_numeric,
                       ts_date
                FROM dipgos.mv_ccc_latest_metric
                WHERE project_id = %s
                """,
                (project_id,),
            )
            for row in cur.fetchall():
                level = row["level"]
                if level == "project":
                    entity_id = row["project_id"]
                elif level == "contract":
                    entity_id = row["contract_id"]
                elif level == "sow":
                    entity_id = row["sow_id"]
                else:
                    entity_id = row["process_id"]
                if not entity_id:
                    continue
                key = (level, entity_id)
                entry = metrics.setdefault(key, _MetricsEntry())
                entry.add(row["metric_code"], row["actual_numeric"], row["planned_numeric"], row["ts_date"])
                if entry.timestamp:
                    timestamps.append(entry.timestamp)

    return metrics, _max_ts(timestamps)


def _metric_percent(entry: Optional[_MetricsEntry], fallback: Optional[float] = None) -> float:
    if entry:
        val = entry.value("prod_actual_pct")
        if val is not None:
            return float(max(0.0, min(100.0, val)))
    return float(max(0.0, min(100.0, fallback or 0.0)))


def _extract_project_dial(project_row, metrics_lookup) -> WipDial:
    project_id = project_row["id"]
    entry = metrics_lookup.get(("project", project_id))
    percent = _metric_percent(entry, _to_float(project_row.get("status_pct")))
    ev = entry.value("ev") if entry else None
    pv = entry.value("pv") if entry else None
    ac = entry.value("ac") if entry else None
    spi_metric = entry.value("spi") if entry else None
    cpi_metric = entry.value("cpi") if entry else None
    spi = spi_metric if spi_metric is not None else _compute_ratio(ev, pv)
    cpi = cpi_metric if cpi_metric is not None else _compute_ratio(ev, ac)
    return WipDial(
        id=project_id,
        level="project",
        code=None,
        name=project_row["name"],
        percent_complete=percent,
        ev=ev,
        pv=pv,
        ac=ac,
        spi=spi,
        cpi=cpi,
    )


def _build_contract_dials(contracts, metrics_lookup, focused_contract_id: Optional[str]) -> List[WipDial]:
    dials: List[WipDial] = []
    for contract_id, row in contracts.items():
        entry = metrics_lookup.get(("contract", contract_id))
        percent = _metric_percent(entry, _to_float(row.get("status_pct")))
        ev = entry.value("ev") if entry else None
        pv = entry.value("pv") if entry else None
        ac = entry.value("ac") if entry else None
        spi_metric = entry.value("spi") if entry else None
        cpi_metric = entry.value("cpi") if entry else None
        spi = spi_metric if spi_metric is not None else _compute_ratio(ev, pv)
        cpi = cpi_metric if cpi_metric is not None else _compute_ratio(ev, ac)
        dials.append(
            WipDial(
                id=contract_id,
                level="contract",
                code=_extract_contract_code(row["name"]),
                name=row["name"],
                percent_complete=percent,
                ev=ev,
                pv=pv,
                ac=ac,
                spi=spi,
                cpi=cpi,
            )
        )
    if focused_contract_id:
        dials.sort(key=lambda dial: (dial.id != focused_contract_id, dial.name.lower()))
    else:
        dials.sort(key=lambda dial: dial.name.lower())
    return dials


def _build_sow_dials(contract_id: Optional[str], sows: Dict[str, dict], metrics_lookup, sow_metrics) -> List[WipDial]:
    if not contract_id:
        return []
    dials: List[WipDial] = []
    for sow_id, row in sows.items():
        if row["contract_id"] != contract_id:
            continue
        entry = metrics_lookup.get(("sow", sow_id))
        static = sow_metrics.get(sow_id, {})
        percent = _metric_percent(entry, _to_float(row.get("progress")) if entry else _to_float(static.get("actual_progress")))
        ev = entry.value("ev") if entry else None
        pv = entry.value("pv") if entry else None
        ac = entry.value("ac") if entry else None
        spi_metric = entry.value("spi") if entry else _to_float(static.get("spi"))
        cpi_metric = entry.value("cpi") if entry else _to_float(static.get("cpi"))
        dials.append(
            WipDial(
                id=sow_id,
                level="sow",
                code=None,
                name=row["title"],
                percent_complete=percent,
                ev=ev,
                pv=pv,
                ac=ac,
                spi=spi_metric if spi_metric is not None else _compute_ratio(ev, pv),
                cpi=cpi_metric if cpi_metric is not None else _compute_ratio(ev, ac),
            )
        )
    dials.sort(key=lambda dial: dial.name.lower())
    return dials


def _build_process_dials(sow_id: Optional[str], processes: Dict[str, dict], metrics_lookup) -> List[WipDial]:
    if not sow_id:
        return []
    dials: List[WipDial] = []
    for process_id, row in processes.items():
        if row["sow_id"] != sow_id:
            continue
        entry = metrics_lookup.get(("process", process_id))
        percent = _metric_percent(entry, _to_float(row.get("progress")))
        ev = entry.value("ev") if entry else None
        pv = entry.value("pv") if entry else None
        ac = entry.value("ac") if entry else None
        spi_metric = entry.value("spi") if entry else None
        cpi_metric = entry.value("cpi") if entry else None
        dials.append(
            WipDial(
                id=process_id,
                level="process",
                code=None,
                name=row["title"],
                percent_complete=percent,
                ev=ev,
                pv=pv,
                ac=ac,
                spi=spi_metric if spi_metric is not None else _compute_ratio(ev, pv),
                cpi=cpi_metric if cpi_metric is not None else _compute_ratio(ev, ac),
            )
        )
    dials.sort(key=lambda dial: dial.name.lower())
    return dials


def _build_markers(selection: CCCSelection, project_row, contracts, sows, processes, metrics_lookup, sow_markers) -> List[MapMarker]:
    items: List[MapMarker] = []

    if selection.process_id:
        parent_sow = processes.get(selection.process_id, {}).get("sow_id")
        items.extend(_markers_for_processes([selection.process_id], contracts, sows, processes, metrics_lookup))
        if parent_sow:
            items.extend(_markers_for_sows([parent_sow], contracts, sows, metrics_lookup, sow_markers))
    elif selection.sow_id:
        process_ids = [pid for pid, proc in processes.items() if proc["sow_id"] == selection.sow_id]
        if process_ids:
            items.extend(_markers_for_processes(process_ids, contracts, sows, processes, metrics_lookup))
        items.extend(_markers_for_sows([selection.sow_id], contracts, sows, metrics_lookup, sow_markers))
    elif selection.contract_id:
        sow_ids = [sid for sid, sow in sows.items() if sow["contract_id"] == selection.contract_id]
        if sow_ids:
            items.extend(_markers_for_sows(sow_ids, contracts, sows, metrics_lookup, sow_markers))
        items.extend(_markers_for_contracts([selection.contract_id], contracts, metrics_lookup))
    else:
        items.extend(_markers_for_contracts(list(contracts.keys()), contracts, metrics_lookup))

    if not items:
        # ensure we at least return the project marker at the map center
        percent = _metric_percent(metrics_lookup.get(("project", project_row["id"])), _to_float(project_row.get("status_pct")))
        items.append(
            MapMarker(
                id=project_row["id"],
                type="contract",
                name=project_row["name"],
                lat=float(project_row["lat"]),
                lon=float(project_row["lng"]),
                status="monitoring",
                percent_complete=percent,
                spi=None,
                cpi=None,
            )
        )

    return items


def _markers_for_contracts(contract_ids: List[str], contracts, metrics_lookup) -> List[MapMarker]:
    markers: List[MapMarker] = []
    for contract_id in contract_ids:
        row = contracts.get(contract_id)
        if not row:
            continue
        entry = metrics_lookup.get(("contract", contract_id))
        percent = _metric_percent(entry, _to_float(row.get("status_pct")))
        planned = entry.value("prod_planned_pct") if entry else None
        spi = entry.value("spi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("pv") if entry else None)
        cpi = entry.value("cpi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("ac") if entry else None)
        markers.append(
            MapMarker(
                id=contract_id,
                type="contract",
                name=row["name"],
                lat=float(row["lat"]),
                lon=float(row["lng"]),
                status=_compute_status(percent, planned),
                percent_complete=percent,
                spi=spi,
                cpi=cpi,
            )
        )
    return markers


def _markers_for_sows(sow_ids: List[str], contracts, sows, metrics_lookup, sow_markers) -> List[MapMarker]:
    markers: List[MapMarker] = []
    for sow_id in sow_ids:
        sow = sows.get(sow_id)
        if not sow:
            continue
        contract = contracts.get(sow["contract_id"])
        if not contract:
            continue
        entry = metrics_lookup.get(("sow", sow_id))
        percent = _metric_percent(entry, _to_float(sow.get("progress")))
        planned = entry.value("prod_planned_pct") if entry else None
        lat, lon = sow_markers.get(sow_id, (float(contract["lat"]), float(contract["lng"])))
        markers.append(
            MapMarker(
                id=sow_id,
                type="sow",
                name=sow["title"],
                lat=lat,
                lon=lon,
                status=_compute_status(percent, planned),
                percent_complete=percent,
                spi=entry.value("spi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("pv") if entry else None),
                cpi=entry.value("cpi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("ac") if entry else None),
            )
        )
    return markers


def _markers_for_processes(process_ids: List[str], contracts, sows, processes, metrics_lookup) -> List[MapMarker]:
    markers: List[MapMarker] = []
    for process_id in process_ids:
        process = processes.get(process_id)
        if not process:
            continue
        sow = sows.get(process["sow_id"])
        if not sow:
            continue
        contract = contracts.get(sow["contract_id"])
        if not contract:
            continue
        entry = metrics_lookup.get(("process", process_id))
        percent = _metric_percent(entry, _to_float(process.get("progress")))
        planned = entry.value("prod_planned_pct") if entry else None
        markers.append(
            MapMarker(
                id=process_id,
                type="process",
                name=process["title"],
                lat=float(contract["lat"]),
                lon=float(contract["lng"]),
                status=_compute_status(percent, planned),
                percent_complete=percent,
                spi=entry.value("spi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("pv") if entry else None),
                cpi=entry.value("cpi") if entry else _compute_ratio(entry.value("ev") if entry else None, entry.value("ac") if entry else None),
            )
        )
    return markers


def get_ccc_summary(selection: CCCSelection) -> CccSummary:
    _ensure_feature_enabled()

    cache_key = (
        _normalise_tenant(selection.tenant_id),
        selection.project_id,
        selection.contract_id,
        selection.sow_id,
        selection.process_id,
    )
    cached = _cache_get(_SUMMARY_CACHE, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    project_row = _fetch_project_payload(selection)
    contracts, sows, processes, sow_markers, sow_metrics = _gather_entities(selection.project_id)
    metrics_lookup, metrics_as_of = _load_latest_metrics(selection.project_id)

    wip_dials: List[WipDial] = []
    wip_dials.append(_extract_project_dial(project_row, metrics_lookup))
    wip_dials.extend(_build_contract_dials(contracts, metrics_lookup, selection.contract_id))
    wip_dials.extend(_build_sow_dials(selection.contract_id, sows, metrics_lookup, sow_metrics))
    wip_dials.extend(_build_process_dials(selection.sow_id, processes, metrics_lookup))

    markers = _build_markers(selection, project_row, contracts, sows, processes, metrics_lookup, sow_markers)

    as_of = metrics_as_of or datetime.now(timezone.utc)

    summary = CccSummary(
        selection=selection,
        map=markers,
        wip=wip_dials,
        as_of=as_of,
    )

    _cache_set(_SUMMARY_CACHE, cache_key, summary)
    return summary


def _fetch_series(
    level: str,
    project_id: str,
    contract_id: Optional[str],
    sow_id: Optional[str],
    metric: str,
    limit: int = 30,
) -> List[Tuple[datetime, Optional[float], Optional[float]]]:
    aggregate_fn = "SUM" if metric in ADDITIVE_METRICS else "AVG"
    clauses = ["project_id = %s", "metric_code = %s"]
    params: List = [project_id, metric]
    if level == "contract" and contract_id:
        clauses.append("scope_level = 'process'")
        clauses.append("contract_id = %s")
        params.append(contract_id)
    elif level == "sow" and sow_id:
        clauses.append("scope_level = 'process'")
        clauses.append("sow_id = %s")
        params.append(sow_id)
    else:
        clauses.append("scope_level = 'process'")

    where_sql = " AND ".join(clauses)
    query = f"""
        SELECT ts_date,
               {aggregate_fn}(actual_numeric) AS actual_value,
               {aggregate_fn}(planned_numeric) AS planned_value
        FROM dipgos.kpi_fact
        WHERE {where_sql}
        GROUP BY ts_date
        ORDER BY ts_date DESC
        LIMIT %s
    """
    params.append(limit)

    rows: List[Tuple[datetime, Optional[float], Optional[float]]] = []
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            for row in cur.fetchall():
                ts = row["ts_date"]
                ts_dt = (
                    ts if isinstance(ts, datetime) else datetime.combine(ts, datetime.min.time(), tzinfo=timezone.utc)
                )
                rows.append((ts_dt, _to_float(row["actual_value"]), _to_float(row["planned_value"])))
    rows.sort(key=lambda item: item[0])
    return rows


def _series_values(series: List[Tuple[datetime, Optional[float], Optional[float]]]) -> Tuple[List[float], List[float]]:
    actual = [actual_value for (_, actual_value, _) in series if actual_value is not None]
    planned = [planned_value for (_, _, planned_value) in series if planned_value is not None]
    return actual, planned


def _weighted_average(rows: List[dict], key: str) -> Optional[float]:
    total = 0.0
    weight_sum = 0.0
    for row in rows:
        value = _to_float(row.get(key))
        if value is None:
            continue
        weight = _to_float(row.get("scope_weight")) or 1.0
        total += value * weight
        weight_sum += weight
    if not weight_sum:
        return None
    return total / weight_sum


def _combine_static_metrics(rows: List[dict]) -> Optional[dict]:
    if not rows:
        return None
    combined: dict = {}
    combined["scope_weight"] = sum(_to_float(row.get("scope_weight")) or 1.0 for row in rows)
    for key in (
        "actual_progress",
        "planned_progress",
        "quality_score",
        "design_actual",
        "design_planned",
        "preparatory_actual",
        "preparatory_planned",
        "construction_actual",
        "construction_planned",
        "spi",
        "cpi",
    ):
        avg = _weighted_average(rows, key)
        if avg is not None:
            combined[key] = avg

    for key in ("ncr_open", "ncr_closed", "qaor_open", "qaor_closed"):
        combined[key] = sum(int(row.get(key) or 0) for row in rows)

    for key in ("ev_value", "pv_value", "ac_value"):
        combined[key] = sum(_to_float(row.get(key)) or 0.0 for row in rows)

    return combined


def _resolve_static_metrics(contract_id, sow_id, sows, sow_metrics) -> Optional[dict]:
    if sow_id:
        metrics = sow_metrics.get(sow_id)
        return dict(metrics) if metrics else None
    if contract_id:
        rows = [
            sow_metrics[sow_id]
            for sow_id, sow in sows.items()
            if sow["contract_id"] == contract_id and sow_id in sow_metrics
        ]
        combined = _combine_static_metrics(rows)
        return combined
    return None


def _quality_summary_from_static(static_metrics: Optional[dict]) -> Optional[QualitySummaryCard]:
    if not static_metrics:
        return None
    return QualitySummaryCard(
        ncr_open=int(static_metrics.get("ncr_open") or 0),
        ncr_closed=int(static_metrics.get("ncr_closed") or 0),
        qaor_open=int(static_metrics.get("qaor_open") or 0),
        qaor_closed=int(static_metrics.get("qaor_closed") or 0),
        quality_conformance=_to_float(static_metrics.get("quality_score")),
    )


def _group_contract_categories(contracts, metrics_lookup) -> WorkInProgressCard:
    categories: Dict[str, List[Tuple[Optional[float], Optional[float]]]] = defaultdict(list)
    for contract_id, row in contracts.items():
        entry = metrics_lookup.get(("contract", contract_id))
        actual = entry.value("prod_actual_pct") if entry else _to_float(row.get("status_pct"))
        planned = entry.value("prod_planned_pct") if entry else None
        stage = (row.get("status_label") or row.get("phase") or "Unknown").title()
        categories[stage].append((actual, planned))

    items: List[WorkInProgressCategory] = []
    for stage, values in categories.items():
        actual_vals = [v for v, _ in values if v is not None]
        planned_vals = [v for _, v in values if v is not None]
        actual_avg = sum(actual_vals) / len(actual_vals) if actual_vals else None
        planned_avg = sum(planned_vals) / len(planned_vals) if planned_vals else None
        variance = None
        if actual_avg is not None and planned_avg is not None:
            variance = actual_avg - planned_avg
        items.append(
            WorkInProgressCategory(
                name=stage,
                count=len(values),
                planned_percent=planned_avg,
                actual_percent=actual_avg,
                variance_percent=variance,
            )
        )
    items.sort(key=lambda item: item.name.lower())

    return WorkInProgressCard(categories=items)


def _work_output_items(metrics_entry: Optional[_MetricsEntry], static_metrics: Optional[dict] = None) -> List[WorkOutputItem]:
    output_metrics = [
        ("Design", "design_output"),
        ("Preparatory", "prep_output"),
        ("Construction", "const_output"),
    ]
    static_lookup = {
        "design_output": ("design_actual", "design_planned"),
        "prep_output": ("preparatory_actual", "preparatory_planned"),
        "const_output": ("construction_actual", "construction_planned"),
    }
    items: List[WorkOutputItem] = []
    for label, metric_code in output_metrics:
        actual = metrics_entry.value(metric_code) if metrics_entry else None
        planned = metrics_entry.value(metric_code, kind="planned") if metrics_entry else None
        if actual is None and static_metrics:
            source_key = static_lookup[metric_code][0]
            actual = _to_float(static_metrics.get(source_key))
        if planned is None and static_metrics:
            planned_key = static_lookup[metric_code][1]
            planned = _to_float(static_metrics.get(planned_key))
        variance = None
        if actual is not None and planned is not None:
            variance = actual - planned
        items.append(
            WorkOutputItem(
                name=label,
                planned_percent=planned,
                actual_percent=actual,
                variance_percent=variance,
            )
        )
    return items


def _performance_snapshot(
    metrics_entry: Optional[_MetricsEntry],
    spi_series: List[float],
    cpi_series: List[float],
    ac_series: List[Tuple[datetime, Optional[float], Optional[float]]],
) -> PerformanceSnapshotCard:
    ev = metrics_entry.value("ev") if metrics_entry else None
    pv = metrics_entry.value("pv") if metrics_entry else None
    ac = metrics_entry.value("ac") if metrics_entry else None
    spi_metric = metrics_entry.value("spi") if metrics_entry else None
    cpi_metric = metrics_entry.value("cpi") if metrics_entry else None
    spi = spi_metric if spi_metric is not None else _compute_ratio(ev, pv)
    cpi = cpi_metric if cpi_metric is not None else _compute_ratio(ev, ac)

    notes: List[str] = []
    if pv in (None, 0):
        notes.append("PV is zero; SPI not computed")
    if ac in (None, 0):
        notes.append("AC is zero; CPI not computed")

    burn_rate_days = None
    runway_days = None
    cash_flow = None

    if ac is not None and ev is not None:
        cash_flow = ev - ac

    avg_daily_ac = _average_positive_delta(ac_series)
    if avg_daily_ac:
        if ac is not None and avg_daily_ac > 0:
            burn_rate_days = ac / avg_daily_ac if avg_daily_ac else None
        if pv is not None and ac is not None:
            remaining = pv - ac
            if remaining > 0:
                runway_days = remaining / avg_daily_ac
    else:
        if ac is not None and ac > 0:
            notes.append("Insufficient AC history to compute burn rate")

    if spi_series:
        spi_series = [val for val in spi_series if val is not None]
    if cpi_series:
        cpi_series = [val for val in cpi_series if val is not None]

    return PerformanceSnapshotCard(
        spi=spi,
        cpi=cpi,
        ev=ev,
        pv=pv,
        ac=ac,
        burn_rate_days=burn_rate_days,
        runway_days=runway_days,
        cash_flow=cash_flow,
        trend_spi=spi_series,
        trend_cpi=cpi_series,
        notes=notes,
    )


def get_right_panel_kpis(project_id: str, contract_id: Optional[str], sow_id: Optional[str], tenant_id: str) -> RightPanelKpiPayload:
    _ensure_feature_enabled()

    selection = CCCSelection(tenant_id=tenant_id, project_id=project_id, contract_id=contract_id, sow_id=sow_id)
    cache_key = (_normalise_tenant(tenant_id), project_id, contract_id, sow_id)
    cached = _cache_get(_KPIS_CACHE, cache_key)
    if cached:
        return cached  # type: ignore[return-value]

    project_row = _fetch_project_payload(selection)
    contracts, sows, processes, sow_markers, sow_metrics = _gather_entities(project_id)
    metrics_lookup, metrics_as_of = _load_latest_metrics(project_id)

    if sow_id:
        level = "sow"
        target_key = sow_id
    elif contract_id:
        level = "contract"
        target_key = contract_id
    else:
        level = "project"
        target_key = project_id

    target_entry = metrics_lookup.get((level, target_key))
    project_entry = metrics_lookup.get(("project", project_id))

    physical_series = _fetch_series(level, project_id, contract_id, sow_id, "prod_actual_pct")
    planned_series = _fetch_series(level, project_id, contract_id, sow_id, "prod_planned_pct")
    actual_trend, _ = _series_values(physical_series)
    planned_trend, _ = _series_values(planned_series)

    static_metrics = _resolve_static_metrics(contract_id, sow_id, sows, sow_metrics)
    actual_percent = (
        target_entry.value("prod_actual_pct")
        if target_entry
        else _to_float(static_metrics.get("actual_progress"))
        if static_metrics
        else None
    )
    planned_percent = (
        target_entry.value("prod_planned_pct", kind="planned")
        if target_entry
        else _to_float(static_metrics.get("planned_progress"))
        if static_metrics
        else None
    )
    variance = None
    if actual_percent is not None and planned_percent is not None:
        variance = actual_percent - planned_percent
    physical_card = PhysicalWorksCard(
        actual_percent=actual_percent,
        planned_percent=planned_percent,
        variance_percent=variance,
        trend_actual=actual_trend,
        trend_planned=planned_trend,
    )

    work_in_progress = _group_contract_categories(contracts, metrics_lookup)

    work_output_items = _work_output_items(target_entry or project_entry, static_metrics)
    work_output_card = WorkOutputCard(items=work_output_items)

    spi_series_data = _fetch_series(level, project_id, contract_id, sow_id, "spi", limit=20)
    cpi_series_data = _fetch_series(level, project_id, contract_id, sow_id, "cpi", limit=20)
    ac_series = _fetch_series(level, project_id, contract_id, sow_id, "ac", limit=20)
    spi_trend = [val for _, val, _ in spi_series_data if val is not None]
    cpi_trend = [val for _, val, _ in cpi_series_data if val is not None]

    fallback_entry = target_entry
    if not fallback_entry and static_metrics:
        fallback_entry = _MetricsEntry()
        fallback_entry.metrics["prod_actual_pct"] = (_to_float(static_metrics.get("actual_progress")), None)
        fallback_entry.metrics["prod_planned_pct"] = (_to_float(static_metrics.get("planned_progress")), None)
        fallback_entry.metrics["spi"] = (_to_float(static_metrics.get("spi")), None)
        fallback_entry.metrics["cpi"] = (_to_float(static_metrics.get("cpi")), None)
        fallback_entry.metrics["quality_conf"] = (_to_float(static_metrics.get("quality_score")), None)
        fallback_entry.metrics["design_output"] = (
            _to_float(static_metrics.get("design_actual")),
            _to_float(static_metrics.get("design_planned")),
        )
        fallback_entry.metrics["prep_output"] = (
            _to_float(static_metrics.get("preparatory_actual")),
            _to_float(static_metrics.get("preparatory_planned")),
        )
        fallback_entry.metrics["const_output"] = (
            _to_float(static_metrics.get("construction_actual")),
            _to_float(static_metrics.get("construction_planned")),
        )
        fallback_entry.metrics["ev"] = (_to_float(static_metrics.get("ev_value")), None)
        fallback_entry.metrics["pv"] = (_to_float(static_metrics.get("pv_value")), None)
        fallback_entry.metrics["ac"] = (_to_float(static_metrics.get("ac_value")), None)
    performance_card = _performance_snapshot(fallback_entry or project_entry, spi_trend, cpi_trend, ac_series)

    preparatory_card = WorkOutputCard(items=_work_output_items(target_entry or project_entry, static_metrics))

    quality_summary = _quality_summary_from_static(static_metrics)

    payload = RightPanelKpiPayload(
        selection=selection,
        as_of=metrics_as_of or datetime.now(timezone.utc),
        physical=physical_card,
        work_in_progress=work_in_progress,
        work_output=work_output_card,
        performance=performance_card,
        preparatory=preparatory_card,
        quality_summary=quality_summary,
    )

    _cache_set(_KPIS_CACHE, cache_key, payload)
    return payload


def clear_ccc_cache() -> None:
    _SUMMARY_CACHE.clear()
    _KPIS_CACHE.clear()
