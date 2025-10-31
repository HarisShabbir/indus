from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from psycopg.rows import dict_row

from ..data import fallback_alert_by_id, fallback_alerts
from ..db import pool

router = APIRouter()

logger = logging.getLogger(__name__)


class AlertItem(BaseModel):
    type: str
    label: str
    detail: str


class Alert(BaseModel):
    id: str
    project_id: str
    title: str
    location: Optional[str] = None
    activity: Optional[str] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None
    root_cause: Optional[str] = None
    recommendation: Optional[str] = None
    acknowledged_at: Optional[str] = None
    due_at: Optional[str] = None
    cleared_at: Optional[str] = None
    raised_at: str
    metadata: Optional[Dict[str, Any]] = None
    items: List[AlertItem]


def _normalise_metadata(raw) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray, memoryview)):
        raw = bytes(raw).decode("utf-8")
    if isinstance(raw, str):
        try:
            value = json.loads(raw)
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            logger.warning("Unable to decode alert metadata JSON", exc_info=True)
    return {}


@router.get("/", response_model=List[Alert])
def list_alerts(project_id: Optional[str] = Query(None, description="Filter alerts for a project")):
    sql = """
        SELECT
            id,
            project_id,
            title,
            location,
            activity,
            severity,
            category,
            status,
            owner,
            root_cause,
            recommendation,
            acknowledged_at,
            due_at,
            cleared_at,
            raised_at,
            metadata
        FROM dipgos.alerts
    """
    params: List[object] = []
    if project_id:
        sql += " WHERE project_id = %s"
        params.append(project_id)
    sql += " ORDER BY raised_at DESC"

    alerts: List[Alert] = []
    alert_ids: List[str] = []
    item_rows = []
    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            for row in cur.fetchall():
                alert_ids.append(row["id"])
                alerts.append(
                    Alert(
                        id=row["id"],
                        project_id=row["project_id"],
                        title=row["title"],
                        location=row["location"],
                        activity=row["activity"],
                        severity=row["severity"],
                        category=row.get("category"),
                        status=row.get("status"),
                        owner=row.get("owner"),
                        root_cause=row.get("root_cause"),
                        recommendation=row.get("recommendation"),
                        acknowledged_at=row["acknowledged_at"].isoformat() if row.get("acknowledged_at") else None,
                        due_at=row["due_at"].isoformat() if row.get("due_at") else None,
                        cleared_at=row["cleared_at"].isoformat() if row.get("cleared_at") else None,
                        raised_at=row["raised_at"].isoformat() if row.get("raised_at") else "",
                        metadata=_normalise_metadata(row.get("metadata")),
                        items=[],
                    )
                )

            if alert_ids:
                with conn.cursor() as cur_items:
                    cur_items.execute(
                        """
                        SELECT alert_id, item_type, label, detail
                        FROM dipgos.alert_items
                        WHERE alert_id = ANY(%s)
                        ORDER BY id
                        """,
                        (alert_ids,),
                    )
                    item_rows = cur_items.fetchall()
    except Exception as exc:  # pragma: no cover - fallback path
        logger.warning("Falling back to fixture alerts: %s", exc)
        return [Alert(**record) for record in fallback_alerts(project_id)]

    items_map = {alert.id: [] for alert in alerts}
    for alert_id, item_type, label, detail in item_rows:
        items_map[alert_id].append(AlertItem(type=item_type, label=label, detail=detail))

    for alert in alerts:
        alert.items = items_map.get(alert.id, [])

    return alerts


@router.get("/{alert_id}", response_model=Alert)
def get_alert(alert_id: str):
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    project_id,
                    title,
                    location,
                    activity,
                    severity,
                    category,
                    status,
                    owner,
                    root_cause,
                    recommendation,
                    acknowledged_at,
                    due_at,
                    cleared_at,
                    raised_at,
                    metadata
                FROM dipgos.alerts
                WHERE id = %s
                """,
                (alert_id,),
            )
            row = cur.fetchone()
            if not row:
                fallback = fallback_alert_by_id(alert_id)
                if fallback:
                    return Alert(**fallback)
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

            cur.execute(
                """
                SELECT item_type, label, detail
                FROM dipgos.alert_items
                WHERE alert_id = %s
                ORDER BY id
                """,
                (alert_id,),
            )
            items_rows = cur.fetchall()

        return Alert(
            id=row[0],
            project_id=row[1],
            title=row[2],
            location=row[3],
            activity=row[4],
            severity=row[5],
            category=row[6],
            status=row[7],
            owner=row[8],
            root_cause=row[9],
            recommendation=row[10],
            acknowledged_at=row[11].isoformat() if row[11] else None,
            due_at=row[12].isoformat() if row[12] else None,
            cleared_at=row[13].isoformat() if row[13] else None,
            raised_at=row[14].isoformat() if row[14] else "",
            metadata=_normalise_metadata(row[15]),
            items=[AlertItem(type=r[0], label=r[1], detail=r[2]) for r in items_rows],
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - fallback path
        logger.warning("Falling back to fixture alert %s: %s", alert_id, exc)
        fallback = fallback_alert_by_id(alert_id)
        if fallback:
            return Alert(**fallback)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
