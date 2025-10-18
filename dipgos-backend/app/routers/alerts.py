from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from ..db import pool

router = APIRouter()


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
    raised_at: str
    items: List[AlertItem]


@router.get("/", response_model=List[Alert])
def list_alerts(project_id: Optional[str] = Query(None, description="Filter alerts for a project")):
    sql = "SELECT id, project_id, title, location, activity, severity, raised_at FROM dipgos.alerts"
    params: List[object] = []
    if project_id:
        sql += " WHERE project_id = %s"
        params.append(project_id)
    sql += " ORDER BY raised_at DESC"

    alerts: List[Alert] = []
    alert_ids: List[str] = []
    item_rows = []
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        for row in cur.fetchall():
            alert_ids.append(row[0])
            alerts.append(
                Alert(
                    id=row[0],
                    project_id=row[1],
                    title=row[2],
                    location=row[3],
                    activity=row[4],
                    severity=row[5],
                    raised_at=row[6].isoformat(),
                    items=[],
                )
            )

        if alert_ids:
            cur.execute(
                """
                SELECT alert_id, item_type, label, detail
                FROM dipgos.alert_items
                WHERE alert_id = ANY(%s)
                ORDER BY id
                """,
                (alert_ids,),
            )
            item_rows = cur.fetchall()

    items_map = {alert.id: [] for alert in alerts}
    for alert_id, item_type, label, detail in item_rows:
        items_map[alert_id].append(AlertItem(type=item_type, label=label, detail=detail))

    for alert in alerts:
        alert.items = items_map.get(alert.id, [])

    return alerts


@router.get("/{alert_id}", response_model=Alert)
def get_alert(alert_id: str):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, project_id, title, location, activity, severity, raised_at
            FROM dipgos.alerts
            WHERE id = %s
            """,
            (alert_id,),
        )
        row = cur.fetchone()
        if not row:
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
        raised_at=row[6].isoformat(),
        items=[AlertItem(type=r[0], label=r[1], detail=r[2]) for r in items_rows],
    )


