from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ..db import pool

router = APIRouter()

logger = logging.getLogger(__name__)


def _normalise_payload(raw: Any) -> Dict[str, Any]:
  if raw is None:
    return {}
  if isinstance(raw, dict):
    return raw
  if isinstance(raw, (bytes, bytearray, memoryview)):
    raw = bytes(raw).decode("utf-8")
  if isinstance(raw, str):
    try:
      parsed = json.loads(raw)
      if isinstance(parsed, dict):
        return parsed
    except json.JSONDecodeError:
      logger.warning("Unable to parse process historian payload JSON", exc_info=True)
  return {}


class ProcessHistorianRecord(BaseModel):
  id: int
  record_id: Optional[str] = None
  alarm_id: Optional[str] = None
  record_type: str
  action: str
  project_id: Optional[str] = None
  project_name: Optional[str] = None
  contract_id: Optional[str] = None
  contract_name: Optional[str] = None
  sow_id: Optional[str] = None
  sow_name: Optional[str] = None
  process_id: Optional[str] = None
  process_name: Optional[str] = None
  title: Optional[str] = None
  severity: Optional[str] = None
  payload: Dict[str, Any] = Field(default_factory=dict)
  created_by: Optional[str] = None
  created_at: str
  closed_at: Optional[str] = None
  notes: Optional[str] = None


class ProcessHistorianPayload(BaseModel):
  record_id: Optional[str] = None
  alarm_id: Optional[str] = None
  record_type: str
  action: str
  project_id: Optional[str] = None
  project_name: Optional[str] = None
  contract_id: Optional[str] = None
  contract_name: Optional[str] = None
  sow_id: Optional[str] = None
  sow_name: Optional[str] = None
  process_id: Optional[str] = None
  process_name: Optional[str] = None
  title: Optional[str] = None
  severity: Optional[str] = None
  payload: Dict[str, Any] = Field(default_factory=dict)
  created_by: Optional[str] = None
  closed_at: Optional[str] = None
  notes: Optional[str] = None


def _row_to_record(row: Dict[str, Any]) -> ProcessHistorianRecord:
  return ProcessHistorianRecord(
    id=row["id"],
    record_id=row.get("record_id"),
    alarm_id=row.get("alarm_id"),
    record_type=row["record_type"],
    action=row["action"],
    project_id=row.get("project_id"),
    project_name=row.get("project_name"),
    contract_id=row.get("contract_id"),
    contract_name=row.get("contract_name"),
    sow_id=row.get("sow_id"),
    sow_name=row.get("sow_name"),
    process_id=row.get("process_id"),
    process_name=row.get("process_name"),
    title=row.get("title"),
    severity=row.get("severity"),
    payload=_normalise_payload(row.get("payload")),
    created_by=row.get("created_by"),
    created_at=row["created_at"].isoformat() if row.get("created_at") else "",
    closed_at=row["closed_at"].isoformat() if row.get("closed_at") else None,
    notes=row.get("notes"),
  )


@router.get("/", response_model=List[ProcessHistorianRecord])
def list_process_history(
  process_id: Optional[str] = Query(None, description="Filter by process id"),
  record_type: Optional[str] = Query(None, description="Filter by record type"),
  limit: int = Query(50, ge=1, le=200, description="Maximum records to return"),
):
  sql = """
      SELECT
          id,
          record_id,
          alarm_id,
          record_type,
          action,
          project_id,
          project_name,
          contract_id,
          contract_name,
          sow_id,
          sow_name,
          process_id,
          process_name,
          title,
          severity,
          payload,
          created_by,
          created_at,
          closed_at,
          notes
      FROM dipgos.process_historian
  """
  clauses: List[str] = []
  params: List[Any] = []
  if process_id:
    clauses.append("process_id = %s")
    params.append(process_id)
  if record_type:
    clauses.append("record_type = %s")
    params.append(record_type)
  if clauses:
    sql += " WHERE " + " AND ".join(clauses)
  sql += " ORDER BY created_at DESC LIMIT %s"
  params.append(limit)

  with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute(sql, params)
    rows = cur.fetchall()
    return [_row_to_record(row) for row in rows]


@router.post("/", response_model=ProcessHistorianRecord, status_code=status.HTTP_201_CREATED)
def create_process_history(entry: ProcessHistorianPayload):
  with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute(
      """
      INSERT INTO dipgos.process_historian (
          record_id,
          alarm_id,
          record_type,
          action,
          project_id,
          project_name,
          contract_id,
          contract_name,
          sow_id,
          sow_name,
          process_id,
          process_name,
          title,
          severity,
          payload,
          created_by,
          closed_at,
          notes
      )
      VALUES (
          %(record_id)s,
          %(alarm_id)s,
          %(record_type)s,
          %(action)s,
          %(project_id)s,
          %(project_name)s,
          %(contract_id)s,
          %(contract_name)s,
          %(sow_id)s,
          %(sow_name)s,
          %(process_id)s,
          %(process_name)s,
          %(title)s,
          %(severity)s,
          %(payload)s,
          %(created_by)s,
          %(closed_at)s,
          %(notes)s
      )
      RETURNING
          id,
          record_id,
          alarm_id,
          record_type,
          action,
          project_id,
          project_name,
          contract_id,
          contract_name,
          sow_id,
          sow_name,
          process_id,
          process_name,
          title,
          severity,
          payload,
          created_by,
          created_at,
          closed_at,
          notes
      """,
      {
        "record_id": entry.record_id,
        "alarm_id": entry.alarm_id,
        "record_type": entry.record_type,
        "action": entry.action,
        "project_id": entry.project_id,
        "project_name": entry.project_name,
        "contract_id": entry.contract_id,
        "contract_name": entry.contract_name,
        "sow_id": entry.sow_id,
        "sow_name": entry.sow_name,
        "process_id": entry.process_id,
        "process_name": entry.process_name,
        "title": entry.title,
        "severity": entry.severity,
        "payload": Json(entry.payload or {}),
        "created_by": entry.created_by or "alarm-center",
        "closed_at": entry.closed_at,
        "notes": entry.notes,
      },
    )
    row = cur.fetchone()
    if not row:
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create historian record")
    return _row_to_record(row)
