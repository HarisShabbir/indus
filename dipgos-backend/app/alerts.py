from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ..db import pool

router = APIRouter()


class AlertItem(BaseModel):
    type: str = Field(..., alias="item_type")
    label: str
    detail: str


class AlertMetadata(BaseModel):
    __root__: dict = Field(default_factory=dict)

    def dict(self, *args, **kwargs):  # pragma: no cover - pydantic compat
        return dict(self.__root__)


class AlertResponse(BaseModel):
    id: str
    project_id: str
    title: str
    location: Optional[str] = None
    activity: Optional[str] = None
    severity: str
    category: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None
    root_cause: Optional[str] = None
    recommendation: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    cleared_at: Optional[datetime] = None
    raised_at: datetime
    metadata: Optional[dict] = None
    items: List[AlertItem]


class AlertCreatePayload(BaseModel):
    id: Optional[str] = None
    project_id: str
    title: str
    severity: str
    location: Optional[str] = None
    activity: Optional[str] = None
    category: Optional[str] = "SCM"
    status: Optional[str] = "open"
    owner: Optional[str] = None
    root_cause: Optional[str] = None
    recommendation: Optional[str] = None
    due_at: Optional[datetime] = None
    raised_at: Optional[datetime] = None
    metadata: Optional[dict] = Field(default_factory=dict)
    items: List[AlertItem] = Field(default_factory=list)


def _fetch_alerts(project_id: Optional[str] = None, limit: int = 500) -> List[dict]:
    query = """
        SELECT *
        FROM dipgos.alerts
        {where_clause}
        ORDER BY raised_at DESC
        LIMIT %s
    """
    where_clause = ""
    params: list = []
    if project_id:
        where_clause = "WHERE project_id = %s"
        params.append(project_id)
    params.append(limit)

    with pool.connection() as conn:
        conn.execute("SET search_path TO dipgos, public")
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query.format(where_clause=where_clause), params)
            alerts = cur.fetchall()
        if not alerts:
            return []
        alert_ids = [row["id"] for row in alerts]
        items_map = {alert_id: [] for alert_id in alert_ids}
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT alert_id, item_type, label, detail
                FROM dipgos.alert_items
                WHERE alert_id = ANY(%s)
                """,
                (alert_ids,),
            )
            for record in cur.fetchall():
                items_map.setdefault(record["alert_id"], []).append(
                    {"item_type": record["item_type"], "label": record["label"], "detail": record["detail"]}
                )
    for row in alerts:
        row["items"] = items_map.get(row["id"], [])
    return alerts


def _serialize_alert(row: dict) -> AlertResponse:
    metadata = row.get("metadata") or {}
    return AlertResponse(
        id=row["id"],
        project_id=row["project_id"],
        title=row["title"],
        location=row.get("location"),
        activity=row.get("activity"),
        severity=row["severity"],
        category=row.get("category"),
        status=row.get("status"),
        owner=row.get("owner"),
        root_cause=row.get("root_cause"),
        recommendation=row.get("recommendation"),
        acknowledged_at=row.get("acknowledged_at"),
        due_at=row.get("due_at"),
        cleared_at=row.get("cleared_at"),
        raised_at=row["raised_at"],
        metadata=metadata,
        items=[AlertItem(**item) for item in row.get("items", [])],
    )


@router.get("/", response_model=List[AlertResponse])
def list_alerts(project_id: Optional[str] = Query(None)):
    records = _fetch_alerts(project_id)
    return [_serialize_alert(record) for record in records]


@router.post("/", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(payload: AlertCreatePayload):
    alert_id = payload.id or str(uuid4())
    raised_at = payload.raised_at or datetime.utcnow()
    with pool.connection() as conn:
        conn.execute("SET search_path TO dipgos, public")
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO dipgos.alerts (
                    id, project_id, title, location, activity, severity,
                    category, status, owner, root_cause, recommendation,
                    due_at, metadata, raised_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    severity = EXCLUDED.severity,
                    category = EXCLUDED.category,
                    status = EXCLUDED.status,
                    metadata = EXCLUDED.metadata,
                    raised_at = EXCLUDED.raised_at
                RETURNING *
                """,
                (
                    alert_id,
                    payload.project_id,
                    payload.title,
                    payload.location,
                    payload.activity,
                    payload.severity,
                    payload.category,
                    payload.status,
                    payload.owner,
                    payload.root_cause,
                    payload.recommendation,
                    payload.due_at,
                    Json(payload.metadata or {}),
                    raised_at,
                ),
            )
            record = cur.fetchone()
            if record is None:
                raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create alarm")
            if payload.items:
                cur.executemany(
                    """
                    INSERT INTO dipgos.alert_items (alert_id, item_type, label, detail)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [(alert_id, item.type, item.label, item.detail) for item in payload.items],
                )
    record["items"] = [item.dict() for item in payload.items]
    return _serialize_alert(record)


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: str):
    with pool.connection() as conn:
        conn.execute("SET search_path TO dipgos, public")
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                UPDATE dipgos.alerts
                SET status = 'acknowledged',
                    acknowledged_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (alert_id,),
            )
            record = cur.fetchone()
            if not record:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Alert not found")
            cur.execute(
                "SELECT item_type, label, detail FROM dipgos.alert_items WHERE alert_id = %s",
                (alert_id,),
            )
            record["items"] = cur.fetchall()
    return _serialize_alert(record)
