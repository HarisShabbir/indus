from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from hashlib import sha1
from time import perf_counter
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from psycopg.rows import dict_row

from ..db import pool

logger = logging.getLogger(__name__)

ScopeLiteral = Literal["project", "contract", "sow", "process"]


def _to_float(value: Optional[Decimal | float | int]) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _mean(values: Iterable[float]) -> Optional[float]:
    sequence = list(v for v in values if v is not None)
    if not sequence:
        return None
    return sum(sequence) / len(sequence)


def _status_from_progress(progress: float) -> str:
    pct = progress * 100
    if pct >= 90:
        return "On Track"
    if pct >= 70:
        return "Monitoring"
    return "At Risk"


@dataclass
class ScheduleTask:
    id: str
    name: str
    start: date
    end: date
    progress: float
    parent: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)


class ScheduleRepo:
    """Build hierarchical schedule data for projects/contracts/SOWs/processes."""

    def fetch_project_schedule(self, project_id: str) -> List[ScheduleTask]:
        return self._fetch_schedule("project", project_id)

    def fetch_contract_schedule(self, contract_id: str) -> List[ScheduleTask]:
        return self._fetch_schedule("contract", contract_id)

    def fetch_sow_schedule(self, sow_id: str) -> List[ScheduleTask]:
        return self._fetch_schedule("sow", sow_id)

    def fetch_process_schedule(self, process_id: str) -> List[ScheduleTask]:
        return self._fetch_schedule("process", process_id)

    # --------------------------------------------------------------------- #
    # Internal helpers
    # --------------------------------------------------------------------- #

    def _fetch_schedule(self, scope: ScopeLiteral, identifier: str) -> List[ScheduleTask]:
        start = perf_counter()
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                rows = self._load_rows(cur, scope, identifier)
                if not rows:
                    tasks = self._build_fallback(cur, scope, identifier)
                    elapsed = (perf_counter() - start) * 1000
                    logger.debug(
                        "fetch_schedule scope=%s id=%s rows=%s elapsed_ms=%.2f (fallback)",
                        scope,
                        identifier,
                        len(tasks),
                        elapsed,
                    )
                    return tasks
                tasks = self._rows_to_tasks(rows, scope)
        elapsed = (perf_counter() - start) * 1000
        logger.debug(
            "fetch_schedule scope=%s id=%s rows=%s tasks=%s elapsed_ms=%.2f",
            scope,
            identifier,
            len(rows),
            len(tasks),
            elapsed,
        )
        return tasks

    def _load_rows(self, cur, scope: ScopeLiteral, identifier: str) -> List[Dict[str, Any]]:
        filters = {
            "project": "p.id = %s",
            "contract": "c.id = %s",
            "sow": "sc.id = %s",
            "process": "scc.id = %s",
        }
        where_clause = filters.get(scope)
        if where_clause is None:
            raise ValueError(f"Unsupported scope: {scope}")

        cur.execute(
            f"""
            SELECT
              p.id   AS project_id,
              p.name AS project_name,
              p.status_label AS project_status_label,
              c.id   AS contract_id,
              c.name AS contract_name,
              c.status_label AS contract_status_label,
              sc.id  AS sow_id,
              sc.title AS sow_title,
              sc.sequence AS sow_sequence,
              scc.id AS process_id,
              scc.title AS process_title,
              scc.sequence AS process_sequence,
              scc.start_date,
              scc.due_date,
              sched.actual_numeric   AS schedule_progress_pct,
              prod.actual_numeric    AS prod_actual_pct,
              spi.actual_numeric     AS spi_value,
              qc.actual_numeric      AS quality_conf,
              cpi.actual_numeric     AS cpi_value
            FROM dipgos.projects p
            JOIN dipgos.contracts c ON c.project_id = p.id
            JOIN dipgos.contract_sows sc ON sc.contract_id = c.id
            JOIN dipgos.contract_sow_clauses scc ON scc.sow_id = sc.id
            LEFT JOIN dipgos.v_kpi_latest_process sched
                   ON sched.process_id = scc.id
                  AND sched.metric_code = 'schedule_progress_pct'
            LEFT JOIN dipgos.v_kpi_latest_process prod
                   ON prod.process_id = scc.id
                  AND prod.metric_code = 'prod_actual_pct'
            LEFT JOIN dipgos.v_kpi_latest_process spi
                   ON spi.process_id = scc.id
                  AND spi.metric_code = 'spi'
            LEFT JOIN dipgos.v_kpi_latest_process qc
                   ON qc.process_id = scc.id
                  AND qc.metric_code = 'quality_conf'
            LEFT JOIN dipgos.v_kpi_latest_process cpi
                   ON cpi.process_id = scc.id
                  AND cpi.metric_code = 'cpi'
            WHERE {where_clause}
            ORDER BY sc.sequence NULLS LAST, scc.sequence NULLS LAST
            """,
            (identifier,),
        )
        rows = cur.fetchall()
        return rows

    def _rows_to_tasks(self, rows: List[Dict[str, Any]], scope: ScopeLiteral) -> List[ScheduleTask]:
        projects: Dict[str, Dict[str, Any]] = {}

        for row in rows:
            project_id = row["project_id"]
            project = projects.setdefault(
                project_id,
                {
                    "id": project_id,
                    "name": row.get("project_name") or project_id,
                    "status_label": row.get("project_status_label"),
                    "contracts": {},
                },
            )

            contract_id = row["contract_id"]
            contracts = project["contracts"]
            contract = contracts.setdefault(
                contract_id,
                {
                    "id": contract_id,
                    "name": row.get("contract_name") or contract_id,
                    "status_label": row.get("contract_status_label"),
                    "sows": {},
                },
            )

            sow_id = row["sow_id"]
            sows = contract["sows"]
            sow = sows.setdefault(
                sow_id,
                {
                    "id": sow_id,
                    "name": row.get("sow_title") or sow_id,
                    "sequence": row.get("sow_sequence") or 0,
                    "processes": [],
                },
            )

            process_progress_raw = _to_float(row.get("schedule_progress_pct"))
            if process_progress_raw is None:
                process_progress_raw = _to_float(row.get("prod_actual_pct"))
            process_progress = _clamp((process_progress_raw or 0.0) / 100.0)

            process = {
                "id": row["process_id"],
                "name": row.get("process_title") or row["process_id"],
                "sequence": row.get("process_sequence") or 0,
                "start": row.get("start_date"),
                "end": row.get("due_date"),
                "progress": process_progress,
                "spi": _to_float(row.get("spi_value")),
                "cpi": _to_float(row.get("cpi_value")),
                "quality_conf": _to_float(row.get("quality_conf")),
            }
            sow["processes"].append(process)

        project_tasks: List[ScheduleTask] = []
        contract_tasks: List[ScheduleTask] = []
        sow_tasks: List[ScheduleTask] = []
        process_tasks: List[ScheduleTask] = []

        for project_id in sorted(projects.keys()):
            project_data = projects[project_id]
            contract_children: List[ScheduleTask] = []

            for contract_id in sorted(project_data["contracts"].keys()):
                contract_data = project_data["contracts"][contract_id]
                contract_fallback = self._synth_contract_window(contract_id)
                sow_children: List[ScheduleTask] = []
                sow_count = max(len(contract_data["sows"]), 1)

                for sow_id in sorted(contract_data["sows"].keys(), key=lambda sid: contract_data["sows"][sid]["sequence"]):
                    sow_data = contract_data["sows"][sow_id]
                    sow_fallback = self._synth_sow_window(contract_fallback, sow_id, sow_data["sequence"], sow_count)
                    process_children: List[ScheduleTask] = []

                    for process_data in sorted(sow_data["processes"], key=lambda item: item["sequence"]):
                        start, end = self._resolve_process_dates(
                            process_data["start"],
                            process_data["end"],
                            sow_fallback,
                            contract_fallback,
                            process_data["id"],
                            process_data["sequence"],
                        )
                        process_task = ScheduleTask(
                            id=f"process:{process_data['id']}",
                            name=process_data["name"],
                            start=start,
                            end=end,
                            progress=process_data["progress"],
                            parent=f"sow:{sow_id}",
                            meta=self._build_process_meta(
                                process_data["progress"],
                                process_data["spi"],
                                process_data["cpi"],
                                process_data["quality_conf"],
                            ),
                        )
                        process_children.append(process_task)

                    if not process_children:
                        # In case the scope filters out processes (should be rare), synthesise one placeholder.
                        start, end = self._synth_process_window(sow_fallback, f"{sow_id}:fallback", 0)
                        process_children.append(
                            ScheduleTask(
                                id=f"process:{sow_id}:synthetic",
                                name=f"{sow_data['name']} Activity",
                                start=start,
                                end=end,
                                progress=0.0,
                                parent=f"sow:{sow_id}",
                                meta=self._build_process_meta(0.0, None, None, None),
                            )
                        )

                    process_tasks.extend(process_children)

                    sow_start = min(task.start for task in process_children)
                    sow_end = max(task.end for task in process_children)
                    sow_progress = _mean([task.progress for task in process_children]) or 0.0
                    sow_spi = _mean(
                        [
                            task.meta.get("spi")
                            for task in process_children
                            if isinstance(task.meta.get("spi"), (float, int))
                        ]
                    )
                    sow_quality = _mean(
                        [
                            task.meta.get("quality_conf")
                            for task in process_children
                            if isinstance(task.meta.get("quality_conf"), (float, int))
                        ]
                    )

                    sow_task = ScheduleTask(
                        id=f"sow:{sow_id}",
                        name=sow_data["name"],
                        start=sow_start,
                        end=sow_end,
                        progress=_clamp(sow_progress),
                        parent=f"contract:{contract_id}",
                        meta=self._build_sow_meta(
                            sow_progress,
                            sow_spi,
                            sow_quality,
                            len(process_children),
                        ),
                    )
                    sow_children.append(sow_task)
                    sow_tasks.append(sow_task)

                if sow_children:
                    contract_start = min(task.start for task in sow_children)
                    contract_end = max(task.end for task in sow_children)
                    contract_progress = _mean([task.progress for task in sow_children]) or 0.0
                    contract_spi = _mean(
                        [
                            task.meta.get("spi")
                            for task in sow_children
                            if isinstance(task.meta.get("spi"), (float, int))
                        ]
                    )
                    contract_quality = _mean(
                        [
                            task.meta.get("quality_conf")
                            for task in sow_children
                            if isinstance(task.meta.get("quality_conf"), (float, int))
                        ]
                    )
                else:
                    contract_start, contract_end = contract_fallback
                    contract_progress = 0.0
                    contract_spi = None
                    contract_quality = None

                contract_task = ScheduleTask(
                    id=f"contract:{contract_id}",
                    name=contract_data["name"],
                    start=contract_start,
                    end=contract_end,
                    progress=_clamp(contract_progress),
                    parent=f"project:{project_id}",
                    meta=self._build_contract_meta(
                        contract_progress,
                        contract_spi,
                        contract_quality,
                        len(sow_children),
                        contract_data.get("status_label"),
                    ),
                )
                contract_children.append(contract_task)
                contract_tasks.append(contract_task)

            if contract_children:
                project_start = min(task.start for task in contract_children)
                project_end = max(task.end for task in contract_children)
                project_progress = _mean([task.progress for task in contract_children]) or 0.0
                project_spi = _mean(
                    [
                        task.meta.get("spi")
                        for task in contract_children
                        if isinstance(task.meta.get("spi"), (float, int))
                    ]
                )
            else:
                project_start, project_end = self._synth_contract_window(project_id)
                project_progress = 0.0
                project_spi = None

            project_task = ScheduleTask(
                id=f"project:{project_id}",
                name=project_data["name"],
                start=project_start,
                end=project_end,
                progress=_clamp(project_progress),
                parent=None,
                meta=self._build_project_meta(
                    project_progress,
                    project_spi,
                    len(project_data["contracts"]),
                    project_data.get("status_label"),
                ),
            )
            project_tasks.append(project_task)

        # Assemble list ensuring parents precede children.
        tasks: List[ScheduleTask] = []
        tasks.extend(project_tasks)
        tasks.extend(contract_tasks)
        tasks.extend(sow_tasks)
        tasks.extend(process_tasks)

        if scope != "project":
            project_id = rows[0]["project_id"]
            contract_id = rows[0]["contract_id"]
            seed_ids: set[str]
            if scope == "contract":
                seed_ids = {f"project:{project_id}", f"contract:{contract_id}"}
            elif scope == "sow":
                sow_id = rows[0]["sow_id"]
                seed_ids = {f"project:{project_id}", f"contract:{contract_id}", f"sow:{sow_id}"}
            else:  # process
                sow_id = rows[0]["sow_id"]
                process_id = rows[0]["process_id"]
                seed_ids = {
                    f"project:{project_id}",
                    f"contract:{contract_id}",
                    f"sow:{sow_id}",
                    f"process:{process_id}",
                }

            kept = set(seed_ids)
            changed = True
            while changed:
                changed = False
                for task in tasks:
                    if task.id in kept:
                        continue
                    if task.parent and task.parent in kept:
                        kept.add(task.id)
                        changed = True
            tasks = [task for task in tasks if task.id in kept]

        return tasks

    def _resolve_process_dates(
        self,
        start: Optional[date],
        end: Optional[date],
        sow_window: Tuple[date, date],
        contract_window: Tuple[date, date],
        process_id: str,
        sequence: int,
    ) -> Tuple[date, date]:
        if start and end and end > start:
            return start, end
        base_window = sow_window or contract_window
        return self._synth_process_window(base_window, process_id, sequence)

    def _build_process_meta(
        self,
        progress: float,
        spi: Optional[float],
        cpi: Optional[float],
        quality_conf: Optional[float],
    ) -> Dict[str, Any]:
        meta = {
            "progress_pct": round(progress * 100, 2),
            "status": _status_from_progress(progress),
        }
        if spi is not None:
            meta["spi"] = spi
        if cpi is not None:
            meta["cpi"] = cpi
        if quality_conf is not None:
            meta["quality_conf"] = quality_conf
        return meta

    def _build_sow_meta(
        self,
        progress: float,
        spi: Optional[float],
        quality_conf: Optional[float],
        child_count: int,
    ) -> Dict[str, Any]:
        meta = {
            "progress_pct": round(progress * 100, 2),
            "status": _status_from_progress(progress),
            "child_count": child_count,
        }
        if spi is not None:
            meta["spi"] = spi
        if quality_conf is not None:
            meta["quality_conf"] = quality_conf
        return meta

    def _build_contract_meta(
        self,
        progress: float,
        spi: Optional[float],
        quality_conf: Optional[float],
        child_count: int,
        status_label: Optional[str],
    ) -> Dict[str, Any]:
        meta = {
            "progress_pct": round(progress * 100, 2),
            "status": _status_from_progress(progress),
            "child_count": child_count,
        }
        if spi is not None:
            meta["spi"] = spi
        if quality_conf is not None:
            meta["quality_conf"] = quality_conf
        if status_label:
            meta["status_label"] = status_label
        return meta

    def _build_project_meta(
        self,
        progress: float,
        spi: Optional[float],
        child_count: int,
        status_label: Optional[str],
    ) -> Dict[str, Any]:
        meta = {
            "progress_pct": round(progress * 100, 2),
            "status": _status_from_progress(progress),
            "child_count": child_count,
        }
        if spi is not None:
            meta["spi"] = spi
        if status_label:
            meta["status_label"] = status_label
        return meta

    def _synth_contract_window(self, contract_id: str) -> Tuple[date, date]:
        today = date.today()
        start = today - timedelta(days=90)
        end = today + timedelta(days=180)
        return start, end

    def _synth_sow_window(
        self,
        contract_window: Tuple[date, date],
        sow_id: str,
        sequence: int,
        sow_count: int,
    ) -> Tuple[date, date]:
        contract_start, contract_end = contract_window
        total_days = max((contract_end - contract_start).days, 30)
        span = max(total_days // max(sow_count, 1), 30)
        seed = int(sha1(f"{sow_id}:{sequence}".encode("utf-8")).hexdigest()[:6], 16)
        max_offset = max(total_days - span, 1)
        offset = seed % max_offset
        start = contract_start + timedelta(days=offset)
        end = start + timedelta(days=span)
        if end > contract_end:
            end = contract_end
        if end <= start:
            end = start + timedelta(days=span)
        return start, end

    def _synth_process_window(
        self,
        sow_window: Tuple[date, date],
        process_id: str,
        sequence: int,
    ) -> Tuple[date, date]:
        sow_start, sow_end = sow_window
        total_days = max((sow_end - sow_start).days, 21)
        span = max(total_days // 3, 14)
        seed = int(sha1(f"{process_id}:{sequence}".encode("utf-8")).hexdigest()[:6], 16)
        max_offset = max(total_days - span, 1)
        offset = seed % max_offset
        start = sow_start + timedelta(days=offset)
        end = start + timedelta(days=span)
        if end > sow_end:
            end = sow_end
        if end <= start:
            end = start + timedelta(days=14)
        return start, end

    def _build_fallback(self, cur, scope: ScopeLiteral, identifier: str) -> List[ScheduleTask]:
        metadata = self._fetch_scope_metadata(cur, scope, identifier)
        if not metadata:
            return []

        tasks: List[ScheduleTask] = []
        project_id = metadata.get("project_id")
        contract_id = metadata.get("contract_id")
        sow_id = metadata.get("sow_id")
        process_id = metadata.get("process_id")

        contract_window = self._synth_contract_window(contract_id or identifier)
        sow_window: Optional[Tuple[date, date]] = None

        if project_id:
            project_task = ScheduleTask(
                id=f"project:{project_id}",
                name=metadata.get("project_name") or project_id,
                start=contract_window[0],
                end=contract_window[1],
                progress=0.0,
                parent=None,
                meta={"progress_pct": 0.0, "status": "No Data"},
            )
            tasks.append(project_task)

        if contract_id:
            contract_task = ScheduleTask(
                id=f"contract:{contract_id}",
                name=metadata.get("contract_name") or contract_id,
                start=contract_window[0],
                end=contract_window[1],
                progress=0.0,
                parent=f"project:{project_id}" if project_id else None,
                meta={
                    "progress_pct": 0.0,
                    "status": "No Data",
                    "status_label": metadata.get("contract_status_label"),
                },
            )
            tasks.append(contract_task)

        if sow_id:
            sow_window = self._synth_sow_window(contract_window, sow_id, metadata.get("sow_sequence") or 0, 1)
            sow_task = ScheduleTask(
                id=f"sow:{sow_id}",
                name=metadata.get("sow_title") or sow_id,
                start=sow_window[0],
                end=sow_window[1],
                progress=0.0,
                parent=f"contract:{contract_id}" if contract_id else None,
                meta={"progress_pct": 0.0, "status": "No Data", "child_count": 0},
            )
            tasks.append(sow_task)

        if process_id:
            sow_window = sow_window or self._synth_sow_window(contract_window, sow_id or process_id, 0, 1)
            process_start, process_end = self._synth_process_window(sow_window, process_id, metadata.get("process_sequence") or 0)
            process_task = ScheduleTask(
                id=f"process:{process_id}",
                name=metadata.get("process_title") or process_id,
                start=process_start,
                end=process_end,
                progress=0.0,
                parent=f"sow:{sow_id}" if sow_id else (f"contract:{contract_id}" if contract_id else None),
                meta={"progress_pct": 0.0, "status": "No Data"},
            )
            tasks.append(process_task)

        if scope == "project" and not tasks:
            project_task = ScheduleTask(
                id=f"project:{identifier}",
                name=metadata.get("project_name") or identifier,
                start=contract_window[0],
                end=contract_window[1],
                progress=0.0,
                parent=None,
                meta={"progress_pct": 0.0, "status": "No Data"},
            )
            tasks.append(project_task)

        return tasks

    def _fetch_scope_metadata(self, cur, scope: ScopeLiteral, identifier: str) -> Optional[Dict[str, Any]]:
        if scope == "project":
            cur.execute(
                "SELECT id AS project_id, name AS project_name, status_label AS project_status_label FROM dipgos.projects WHERE id = %s",
                (identifier,),
            )
        elif scope == "contract":
            cur.execute(
                """
                SELECT
                  p.id AS project_id,
                  p.name AS project_name,
                  c.id AS contract_id,
                  c.name AS contract_name,
                  c.status_label AS contract_status_label
                FROM dipgos.contracts c
                JOIN dipgos.projects p ON p.id = c.project_id
                WHERE c.id = %s
                """,
                (identifier,),
            )
        elif scope == "sow":
            cur.execute(
                """
                SELECT
                  p.id AS project_id,
                  p.name AS project_name,
                  c.id AS contract_id,
                  c.name AS contract_name,
                  c.status_label AS contract_status_label,
                  sc.id AS sow_id,
                  sc.title AS sow_title,
                  sc.sequence AS sow_sequence
                FROM dipgos.contract_sows sc
                JOIN dipgos.contracts c ON c.id = sc.contract_id
                JOIN dipgos.projects p ON p.id = c.project_id
                WHERE sc.id = %s
                """,
                (identifier,),
            )
        else:  # process
            cur.execute(
                """
                SELECT
                  p.id AS project_id,
                  p.name AS project_name,
                  c.id AS contract_id,
                  c.name AS contract_name,
                  c.status_label AS contract_status_label,
                  sc.id AS sow_id,
                  sc.title AS sow_title,
                  sc.sequence AS sow_sequence,
                  scc.id AS process_id,
                  scc.title AS process_title,
                  scc.sequence AS process_sequence
                FROM dipgos.contract_sow_clauses scc
                JOIN dipgos.contract_sows sc ON sc.id = scc.sow_id
                JOIN dipgos.contracts c ON c.id = sc.contract_id
                JOIN dipgos.projects p ON p.id = c.project_id
                WHERE scc.id = %s
                """,
                (identifier,),
            )
        row = cur.fetchone()
        return dict(row) if row else None
