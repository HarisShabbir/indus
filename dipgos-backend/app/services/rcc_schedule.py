from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4
import logging

from fastapi import HTTPException, status
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg import errors as pg_errors

from ..db import pool
from ..models.rcc_schedule import (
    AlarmClearResponse,
    AlarmCreateRequest,
    ClearBlockAlarmsRequest,
    RccActivity,
    RccAlarmEvent,
    RccBlockSummary,
    RccProgressLog,
    ScheduleActivityDetail,
    ScheduleFilter,
)

logger = logging.getLogger(__name__)


def _status_from_percent(percent: float, has_alarm: bool) -> str:
    if percent >= 100:
        return "complete"
    if has_alarm:
        return "delayed"
    if percent > 0:
        return "in_progress"
    return "not_started"


def list_block_summaries(block_group_code: Optional[str] = None) -> List[RccBlockSummary]:
    params: List[Any] = []
    where = ""
    if block_group_code:
        where = "WHERE l.block_group_code = %s"
        params.append(block_group_code)
    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                WITH layer_totals AS (
                    SELECT block_number, block_group_code,
                           SUM(COALESCE(volume_m3, 0)) AS total_volume,
                           MIN(elevation_m) AS min_elev,
                           MAX(elevation_m) AS max_elev
                    FROM dipgos.rcc_block_layers
                    GROUP BY block_number, block_group_code
                ),
                activity_totals AS (
                    SELECT block_number, block_group_code,
                           SUM(COALESCE(actual_volume_m3, 0)) AS actual_volume,
                           MAX(COALESCE(percent_complete, 0)) AS activity_pct
                    FROM dipgos.rcc_schedule_activities
                    WHERE block_number IS NOT NULL
                    GROUP BY block_number, block_group_code
                ),
                alarm_totals AS (
                    SELECT block_number, block_group_code, COUNT(*) FILTER (WHERE status = 'open') AS open_alarms
                    FROM dipgos.rcc_alarm_events
                    GROUP BY block_number, block_group_code
                )
                SELECT
                    l.block_number,
                    l.block_group_code,
                    l.total_volume,
                    COALESCE(a.actual_volume, 0) AS actual_volume,
                    COALESCE(a.activity_pct, 0) AS activity_pct,
                    COALESCE(al.open_alarms, 0) AS open_alarms,
                    l.min_elev,
                    l.max_elev
                FROM layer_totals l
                LEFT JOIN activity_totals a
                    ON a.block_number = l.block_number AND a.block_group_code = l.block_group_code
                LEFT JOIN alarm_totals al
                    ON al.block_number = l.block_number AND al.block_group_code = l.block_group_code
                {where}
                ORDER BY l.block_number
                """,
                params,
            )
            rows = cur.fetchall()
    except pg_errors.UndefinedTable:
        return []
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("rcc_schedule.list_block_summaries failed")
        return []
    if not rows:
        return _fallback_block_summaries()
    summaries: List[RccBlockSummary] = []
    for row in rows:
        total_volume = float(row["total_volume"] or 0)
        actual_volume = float(row["actual_volume"] or 0)
        percent_vol = (actual_volume / total_volume * 100) if total_volume > 0 else 0
        percent = max(percent_vol, float(row["activity_pct"] or 0))
        status_val = _status_from_percent(percent, row.get("open_alarms", 0) > 0)
        summaries.append(
            RccBlockSummary(
                block_number=row["block_number"],
                block_group_code=row["block_group_code"],
                total_volume_m3=total_volume,
                planned_volume_m3=total_volume,
                actual_volume_m3=actual_volume,
                percent_complete=round(percent, 2),
                status=status_val,
                open_alarms=row.get("open_alarms", 0),
                min_elevation_m=row.get("min_elev"),
                max_elevation_m=row.get("max_elev"),
            )
        )
    return summaries


def _row_to_activity(row: Dict[str, Any]) -> RccActivity:
    return RccActivity(
        id=str(row["id"]),
        activity_code=row["activity_code"],
        activity_name=row["activity_name"],
        block_group_code=row["block_group_code"],
        block_number=row.get("block_number"),
        original_duration_days=row["original_duration_days"],
        baseline_start=row["baseline_start"],
        baseline_finish=row["baseline_finish"],
        total_float_days=row["total_float_days"],
        status=row["status"],
        planned_volume_m3=row.get("planned_volume_m3"),
        actual_volume_m3=row.get("actual_volume_m3"),
        percent_complete=float(row.get("percent_complete") or 0),
        variance_days=row.get("variance_days", 0) or 0,
        planned_start=row.get("planned_start"),
        planned_finish=row.get("planned_finish"),
        actual_start=row.get("actual_start"),
        actual_finish=row.get("actual_finish"),
        metadata=row.get("metadata") or {},
    )


def list_schedule(filter: ScheduleFilter) -> List[RccActivity]:
    clauses: List[str] = []
    params: List[Any] = []
    if filter.block_group_code:
        clauses.append("block_group_code = %s")
        params.append(filter.block_group_code)
    if filter.block_number is not None:
        clauses.append("block_number = %s")
        params.append(filter.block_number)
    if filter.status:
        clauses.append("status = %s")
        params.append(filter.status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                SELECT *
                FROM dipgos.rcc_schedule_activities
                {where}
                ORDER BY block_group_code, COALESCE(block_number, 0), baseline_start
                """,
                params,
            )
            rows = cur.fetchall()
    except pg_errors.UndefinedTable:
        return _fallback_activities()
    except Exception:  # pragma: no cover - defensive
        logger.exception("rcc_schedule.list_schedule failed")
        return _fallback_activities()
    if not rows:
        return _fallback_activities()
    return [_row_to_activity(row) for row in rows]


def _fetch_activity(cur, activity_id: str) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT *
        FROM dipgos.rcc_schedule_activities
        WHERE id = %s
        """,
        (activity_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return row


def get_activity_detail(activity_id: str) -> ScheduleActivityDetail:
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        activity_row = _fetch_activity(cur, activity_id)
        cur.execute(
            """
            SELECT id, reported_at, reported_by, volume_placed_m3, percent_complete, note
            FROM dipgos.rcc_activity_progress
            WHERE activity_id = %s
            ORDER BY reported_at DESC
            """,
            (activity_id,),
        )
        progress_rows = cur.fetchall()
        cur.execute(
            """
            SELECT id, block_number, block_group_code, activity_id, alarm_code, severity, status, raised_at, cleared_at, message, metadata
            FROM dipgos.rcc_alarm_events
            WHERE activity_id = %s
            ORDER BY raised_at DESC
            """,
            (activity_id,),
        )
        alarm_rows = cur.fetchall()
        # Fallback: if no alarms linked directly, surface open alarms for the same block/group even if activity_id is null
        if not alarm_rows and activity_row.get("block_number"):
            cur.execute(
                """
                SELECT id, block_number, block_group_code, activity_id, alarm_code, severity, status, raised_at, cleared_at, message, metadata
                FROM dipgos.rcc_alarm_events
                WHERE block_number = %s AND block_group_code = %s AND status = 'open'
                ORDER BY raised_at DESC
                """,
                (activity_row["block_number"], activity_row["block_group_code"]),
            )
            alarm_rows = cur.fetchall()
    progress_logs = [
        RccProgressLog(
            id=row["id"],
            reported_at=row["reported_at"],
            reported_by=row.get("reported_by"),
            volume_placed_m3=row.get("volume_placed_m3"),
            percent_complete=row.get("percent_complete"),
            note=row.get("note"),
        )
        for row in progress_rows
    ]
    alarms = [
        RccAlarmEvent(
            id=str(row["id"]),
            block_number=row["block_number"],
            block_group_code=row["block_group_code"],
            activity_id=str(row["activity_id"]) if row.get("activity_id") else None,
            alarm_code=row.get("alarm_code"),
            severity=row.get("severity"),
            status=row["status"],
            raised_at=row["raised_at"],
            cleared_at=row.get("cleared_at"),
            message=row.get("message"),
            metadata=row.get("metadata") or {},
        )
        for row in alarm_rows
    ]
    return ScheduleActivityDetail(activity=_row_to_activity(activity_row), progress=progress_logs, alarms=alarms)


def _recalculate_variance(actual_start: Optional[date], actual_finish: Optional[date], baseline_start: date, baseline_finish: date) -> int:
    if actual_finish:
        return (actual_finish - baseline_finish).days
    if actual_start and actual_start > baseline_start:
        return (actual_start - baseline_start).days
    return 0


def record_progress(payload) -> ScheduleActivityDetail:
    reported_at = payload.reported_at or datetime.utcnow()
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        activity_row = _fetch_activity(cur, payload.activity_id)
        cur.execute(
            """
            INSERT INTO dipgos.rcc_activity_progress (activity_id, reported_at, reported_by, volume_placed_m3, percent_complete, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                payload.activity_id,
                reported_at,
                payload.reported_by,
                payload.volume_placed_m3,
                payload.percent_complete,
                payload.note,
            ),
        )
        progress_id = cur.fetchone()["id"]

        planned_volume = float(activity_row.get("planned_volume_m3") or 0)
        current_actual_volume = float(activity_row.get("actual_volume_m3") or 0)
        new_actual_volume = current_actual_volume + float(payload.volume_placed_m3 or 0)
        percent_from_volume = (new_actual_volume / planned_volume * 100) if planned_volume > 0 else 0
        provided_percent = float(payload.percent_complete or 0)
        percent_complete = max(percent_from_volume, provided_percent, float(activity_row.get("percent_complete") or 0))

        actual_start = activity_row.get("actual_start") or (reported_at.date() if percent_complete > 0 else None)
        actual_finish = activity_row.get("actual_finish")
        status_val = activity_row["status"]
        if percent_complete >= 100:
            status_val = "complete"
            actual_finish = actual_finish or reported_at.date()
        elif percent_complete > 0 and status_val == "not_started":
            status_val = "in_progress"

        variance_days = _recalculate_variance(actual_start, actual_finish, activity_row["baseline_start"], activity_row["baseline_finish"])

        cur.execute(
            """
            UPDATE dipgos.rcc_schedule_activities
            SET actual_volume_m3 = %s,
                percent_complete = %s,
                actual_start = COALESCE(actual_start, %s),
                actual_finish = %s,
                status = %s,
                variance_days = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                new_actual_volume,
                percent_complete,
                actual_start,
                actual_finish,
                status_val,
                variance_days,
                payload.activity_id,
            ),
        )
        conn.commit()
    return get_activity_detail(payload.activity_id)


def _resolve_activity_for_alarm(cur, block_number: int, block_group_code: str, activity_code: Optional[str]) -> Optional[str]:
    if activity_code:
        cur.execute(
            """
            SELECT id FROM dipgos.rcc_schedule_activities
            WHERE activity_code = %s
            """,
            (activity_code,),
        )
        row = cur.fetchone()
        return row["id"] if row else None
    # First try exact block match
    cur.execute(
        """
        SELECT id
        FROM dipgos.rcc_schedule_activities
        WHERE block_number = %s AND block_group_code = %s
          AND status NOT IN ('complete','canceled')
        ORDER BY baseline_start
        LIMIT 1
        """,
        (block_number, block_group_code),
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    # Fallback to any activity in the group (e.g., summary rows with NULL block_number)
    cur.execute(
        """
        SELECT id
        FROM dipgos.rcc_schedule_activities
        WHERE block_group_code = %s
          AND status NOT IN ('complete','canceled')
        ORDER BY baseline_start
        LIMIT 1
        """,
        (block_group_code,),
    )
    row = cur.fetchone()
    return row["id"] if row else None


def create_alarm(payload: AlarmCreateRequest) -> RccAlarmEvent:
    now = datetime.utcnow()
    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            activity_id = _resolve_activity_for_alarm(cur, payload.block_number, payload.block_group_code, payload.activity_code)
            cur.execute(
                """
                INSERT INTO dipgos.rcc_alarm_events (block_number, block_group_code, activity_id, alarm_code, severity, status, raised_at, message, metadata)
                VALUES (%s, %s, %s, %s, %s, 'open', %s, %s, %s)
                RETURNING *
                """,
                (
                    payload.block_number,
                    payload.block_group_code,
                    activity_id,
                    payload.alarm_code,
                    payload.severity,
                    now,
                    payload.message,
                    Json(payload.metadata or {}),
                ),
            )
            alarm_row = cur.fetchone()
            if activity_id:
                cur.execute(
                """
                UPDATE dipgos.rcc_schedule_activities
                SET status = 'delayed',
                    variance_days = GREATEST(variance_days, 2),
                    metadata = metadata || jsonb_build_object('alarm_active', true, 'last_alarm_id', %s),
                    updated_at = NOW()
                WHERE id = %s
                """,
                (alarm_row["id"], activity_id),
            )
            else:
                # Backfill a linked activity if missing (use group fallback)
                resolved = _resolve_activity_for_alarm(cur, payload.block_number, payload.block_group_code, None)
                if resolved:
                    cur.execute(
                        """
                        UPDATE dipgos.rcc_alarm_events
                        SET activity_id = %s
                        WHERE id = %s
                        """,
                        (resolved, alarm_row["id"]),
                    )
                    activity_id = resolved
            conn.commit()
    except pg_errors.UndefinedTable:
        alarm_row = {
            "id": str(uuid4()),
            "block_number": payload.block_number,
            "block_group_code": payload.block_group_code,
            "activity_id": None,
            "alarm_code": payload.alarm_code,
            "severity": payload.severity,
            "status": "open",
            "raised_at": now,
            "cleared_at": None,
            "message": payload.message,
            "metadata": payload.metadata or {},
        }
    except Exception as exc:  # pragma: no cover
        logger.exception("create_alarm failed")
        alarm_row = {
            "id": str(uuid4()),
            "block_number": payload.block_number,
            "block_group_code": payload.block_group_code,
            "activity_id": None,
            "alarm_code": payload.alarm_code,
            "severity": payload.severity,
            "status": "open",
            "raised_at": now,
            "cleared_at": None,
            "message": payload.message,
            "metadata": payload.metadata or {},
        }
    return RccAlarmEvent(
        id=alarm_row["id"],
        block_number=alarm_row["block_number"],
        block_group_code=alarm_row["block_group_code"],
        activity_id=alarm_row.get("activity_id"),
        alarm_code=alarm_row.get("alarm_code"),
        severity=alarm_row.get("severity"),
        status=alarm_row["status"],
        raised_at=alarm_row["raised_at"],
        cleared_at=alarm_row.get("cleared_at"),
        message=alarm_row.get("message"),
        metadata=alarm_row.get("metadata") or {},
    )


def clear_alarm(alarm_id: str) -> AlarmClearResponse:
    now = datetime.utcnow()
    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                UPDATE dipgos.rcc_alarm_events
                SET status = 'cleared', cleared_at = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (now, alarm_id),
            )
            alarm_row = cur.fetchone()
            if not alarm_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alarm not found")
            activity_id = alarm_row.get("activity_id")
            if activity_id:
                cur.execute(
                    """
                    UPDATE dipgos.rcc_schedule_activities
                    SET status = CASE WHEN percent_complete >= 100 THEN 'complete' ELSE 'in_progress' END,
                        metadata = metadata - 'alarm_active',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (activity_id,),
                )
            conn.commit()
    except pg_errors.UndefinedTable:
        alarm_row = {"id": alarm_id, "cleared_at": now}
    except Exception as exc:  # pragma: no cover
        logger.exception("clear_alarm failed")
        alarm_row = {"id": alarm_id, "cleared_at": now}
    return AlarmClearResponse(id=alarm_row["id"], status="cleared", cleared_at=alarm_row["cleared_at"])


def clear_block_alarms(payload: ClearBlockAlarmsRequest) -> Dict[str, Any]:
    now = datetime.utcnow()
    params: List[Any] = [payload.block_number, payload.block_group_code]
    alarm_code_clause = ""
    if payload.alarm_code:
        alarm_code_clause = "AND alarm_code = %s"
        params.append(payload.alarm_code)
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            UPDATE dipgos.rcc_alarm_events
            SET status = 'cleared', cleared_at = %s, updated_at = NOW()
            WHERE block_number = %s AND block_group_code = %s
              AND status = 'open'
              {alarm_code_clause}
            RETURNING id, activity_id
            """,
            [now, *params],
        )
        rows = cur.fetchall()
        for row in rows:
            if row.get("activity_id"):
                cur.execute(
                    """
                    UPDATE dipgos.rcc_schedule_activities
                    SET status = CASE WHEN percent_complete >= 100 THEN 'complete' ELSE 'in_progress' END,
                        metadata = metadata - 'alarm_active',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (row["activity_id"],),
                )
        conn.commit()
    return {"cleared": len(rows)}


def clear_all_alarms() -> Dict[str, Any]:
    now = datetime.utcnow()
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE dipgos.rcc_alarm_events
            SET status = 'cleared', cleared_at = %s, updated_at = NOW()
            WHERE status = 'open'
            RETURNING id, activity_id
            """,
            (now,),
        )
        rows = cur.fetchall()
        for row in rows:
            if row.get("activity_id"):
                cur.execute(
                    """
                    UPDATE dipgos.rcc_schedule_activities
                    SET status = CASE WHEN percent_complete >= 100 THEN 'complete' ELSE 'in_progress' END,
                        metadata = metadata - 'alarm_active',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (row["activity_id"],),
                )
        conn.commit()
    return {"cleared": len(rows)}


def list_alarms(status: Optional[str] = None, block_group_code: Optional[str] = None, block_number: Optional[int] = None) -> List[RccAlarmEvent]:
    clauses: List[str] = []
    params: List[Any] = []
    if status:
        clauses.append("status = %s")
        params.append(status)
    if block_group_code:
        clauses.append("block_group_code = %s")
        params.append(block_group_code)
    if block_number is not None:
        clauses.append("block_number = %s")
        params.append(block_number)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT id, block_number, block_group_code, activity_id, alarm_code, severity, status, raised_at, cleared_at, message, metadata
            FROM dipgos.rcc_alarm_events
            {where}
            ORDER BY raised_at DESC
            """,
            params,
        )
        rows = cur.fetchall()
    alarms: List[RccAlarmEvent] = []
    for row in rows:
        alarms.append(
            RccAlarmEvent(
                id=str(row["id"]),
                block_number=row["block_number"],
                block_group_code=row["block_group_code"],
                activity_id=str(row["activity_id"]) if row.get("activity_id") else None,
                alarm_code=row.get("alarm_code"),
                severity=row.get("severity"),
                status=row["status"],
                raised_at=row["raised_at"],
                cleared_at=row.get("cleared_at"),
                message=row.get("message"),
                metadata=row.get("metadata") or {},
            )
        )
    return alarms


def grouped_schedule() -> Dict[str, List[RccActivity]]:
    try:
        activities = list_schedule(ScheduleFilter())
    except Exception:  # pragma: no cover - defensive
        logger.exception("rcc_schedule.grouped_schedule failed during list")
        activities = _fallback_activities()
    if not activities:
        activities = _fallback_activities()
    groups: Dict[str, List[RccActivity]] = {}
    for act in activities:
        groups.setdefault(act.block_group_code, []).append(act)
    # if something still went wrong, return at least empty buckets
    if not groups:
        groups = {g: _fallback_activities() for g in ("B12-15", "B16-18", "B19-21", "B22-24", "B25-27", "B28-29")}
    return groups


def _fallback_activities() -> List[RccActivity]:
    """Provide deterministic fallback rows so the UI isn't empty during dev if seed isn't loaded."""
    seed_rows = [
        ("DC12~15#10", "Block #15 EL.898~901m", "B12-15", 15, 5, "2026-04-10", "2026-04-15", 0),
        ("DC12~15#15", "Block #14~15 up to EL.928m", "B12-15", 15, 120, "2026-04-15", "2026-08-13", 0),
        ("DC16~18#15", "Block #16~18 EL.907~928m", "B16-18", 16, 100, "2026-05-01", "2026-08-09", 19),
        ("DC19~21#20", "Block #19~21 EL.931~952m", "B19-21", 20, 100, "2026-07-13", "2026-10-21", 26),
        ("DC22~24#50", "Block #22~24 EL.965~990m", "B22-24", 22, 120, "2026-10-26", "2027-02-23", 66),
        ("DC25~27#20", "Block #25~27 EL.953~959m", "B25-27", 25, 20, "2027-03-28", "2027-04-16", 0),
        ("DC28~29#20", "Block #28~29 EL.953~962m", "B28-29", 28, 25, "2027-03-13", "2027-04-06", 0),
    ]
    fallback: List[RccActivity] = []
    for code, name, group, block_no, duration, start, finish, float_days in seed_rows:
        fallback.append(
          RccActivity(
              id=str(uuid4()),
              activity_code=code,
              activity_name=name,
              block_group_code=group,
              block_number=block_no,
              original_duration_days=duration,
              baseline_start=date.fromisoformat(start),
              baseline_finish=date.fromisoformat(finish),
              total_float_days=float_days,
              status="in_progress",
              planned_volume_m3=150000.0,
              actual_volume_m3=75000.0,
              percent_complete=15.0,
              variance_days=-5,
              planned_start=date.fromisoformat(start),
              planned_finish=date.fromisoformat(finish),
              actual_start=date.fromisoformat(start),
              actual_finish=None,
              metadata={},
          )
        )
    return fallback


def _fallback_block_summaries() -> List[RccBlockSummary]:
    """Fallback summary rows used when DB is empty."""
    groups = [
        ("B12-15", 12),
        ("B16-18", 16),
        ("B19-21", 19),
        ("B22-24", 22),
        ("B25-27", 25),
        ("B28-29", 28),
    ]
    summaries: List[RccBlockSummary] = []
    for group, block in groups:
        summaries.append(
            RccBlockSummary(
                block_number=block,
                block_group_code=group,
                total_volume_m3=536592.0,
                planned_volume_m3=536592.0,
                actual_volume_m3=80250.0,
                percent_complete=15.0,
                status="in_progress",
            )
        )
    return summaries
