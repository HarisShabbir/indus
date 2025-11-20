from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status, WebSocket
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ..db import pool
from ..models.rcc import (
    AlarmRuleList,
    AlarmRuleModel,
    ProcessInputModel,
    ProcessOperationModel,
    ProcessStageModel,
    RccProcessTree,
    RccBlockProgress,
    RccEnvironmentMetric,
)
from .rcc_rules import _normalise_json, compute_rule_state, evaluate_alarm_rules, safe_evaluator


def _to_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _input_status(value: Optional[float], thresholds: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    if value is None:
        return "unknown", "Awaiting telemetry"
    min_val = _to_number(thresholds.get("min"))
    max_val = _to_number(thresholds.get("max"))
    warn_min = _to_number(thresholds.get("warn_min") or thresholds.get("warning_min"))
    warn_max = _to_number(thresholds.get("warn_max") or thresholds.get("warning_max"))

    if min_val is not None and value < min_val:
        return "alarm", f"Below minimum ({value} < {min_val})"
    if max_val is not None and value > max_val:
        return "alarm", f"Above maximum ({value} > {max_val})"
    if warn_min is not None and value < warn_min:
        return "warning", f"Approaching minimum ({value})"
    if warn_max is not None and value > warn_max:
        return "warning", f"Approaching maximum ({value})"
    return "ok", None


def _row_to_rule_model(row: Dict[str, Any]) -> AlarmRuleModel:
    metadata = _normalise_json(row.get("metadata"))
    last_payload = _normalise_json(row.get("last_payload"))
    return AlarmRuleModel(
        id=row["id"],
        category=row["category"],
        condition=row["condition"],
        severity=row["severity"],
        action=row.get("action"),
        message=row.get("message"),
        enabled=row.get("enabled", True),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        created_by=row.get("created_by"),
        metadata=metadata,
        last_evaluated_at=row.get("last_evaluated_at"),
        last_status=row.get("last_status"),
        last_payload=last_payload,
        last_fired_at=row.get("last_fired_at"),
        operation_id=row.get("operation_id"),
        stage_id=row.get("stage_id"),
        operation_name=row.get("operation_name"),
        stage_name=row.get("stage_name"),
    )


def _fetch_rules(rule_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not rule_ids:
        return {}
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                ar.*,
                po.id AS operation_id,
                po.name AS operation_name,
                ps.id AS stage_id,
                ps.name AS stage_name
            FROM dipgos.alarm_rules ar
            LEFT JOIN dipgos.process_operations po ON po.rule_id = ar.id
            LEFT JOIN dipgos.process_stages ps ON po.stage_id = ps.id
            WHERE ar.id = ANY(%s)
            """,
            (rule_ids,),
        )
        rows = cur.fetchall()
    return {row["id"]: row for row in rows}


def get_process_tree(sow_id: str) -> RccProcessTree:
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, title
            FROM dipgos.contract_sows
            WHERE id = %s
            """,
            (sow_id,),
        )
        sow_row = cur.fetchone()
        if not sow_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOW not found")

        cur.execute(
            """
            SELECT id, name, description, sequence
            FROM dipgos.process_stages
            WHERE sow_id = %s
            ORDER BY sequence, name
            """,
            (sow_id,),
        )
        stages = cur.fetchall()
        if not stages:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No RCC process configured for this SOW")

        stage_ids = [stage["id"] for stage in stages]
        cur.execute(
            """
            SELECT id, stage_id, parent_id, name, type, metadata, rule_id, sequence
            FROM dipgos.process_operations
            WHERE stage_id = ANY(%s)
            ORDER BY stage_id, sequence
            """,
            (stage_ids,),
        )
        operations = cur.fetchall()
        operation_ids = [row["id"] for row in operations]

        input_rows: List[dict] = []
        telemetry_map: Dict[str, Optional[float]] = {}
        as_of: Optional[datetime] = None

        if operation_ids:
            cur.execute(
                """
                SELECT id, operation_id, label, unit, source_type, source_name,
                       thresholds, current_value, last_observed, metadata
                FROM dipgos.process_inputs
                WHERE operation_id = ANY(%s)
                """,
                (operation_ids,),
            )
            input_rows = cur.fetchall()
            for row in input_rows:
                if row.get("last_observed"):
                    obs = row["last_observed"]
                    if not as_of or obs > as_of:
                        as_of = obs
                source_name = row.get("source_name")
                if source_name:
                    telemetry_map[source_name] = _to_number(row.get("current_value"))

    rule_ids = [row["rule_id"] for row in operations if row.get("rule_id")]
    rule_lookup = _fetch_rules(rule_ids)

    inputs_by_operation: Dict[str, List[ProcessInputModel]] = {}
    for input_row in input_rows:
        thresholds = _normalise_json(input_row.get("thresholds"))
        value = _to_number(input_row.get("current_value"))
        status_value, status_message = _input_status(value, thresholds)
        model = ProcessInputModel(
            id=input_row["id"],
            label=input_row["label"],
            unit=input_row.get("unit"),
            source_type=input_row.get("source_type"),
            source_name=input_row.get("source_name"),
            thresholds=thresholds,
            current_value=value,
            last_observed=input_row.get("last_observed"),
            metadata=_normalise_json(input_row.get("metadata")),
            status=status_value,
            status_message=status_message,
        )
        inputs_by_operation.setdefault(input_row["operation_id"], []).append(model)

    stage_children: Dict[str, List[Dict[str, Any]]] = {stage["id"]: [] for stage in stages}
    op_nodes: Dict[str, Dict[str, Any]] = {}
    for row in operations:
        node = {
            "id": row["id"],
            "stage_id": row["stage_id"],
            "parent_id": row.get("parent_id"),
            "name": row["name"],
            "type": row["type"],
            "metadata": _normalise_json(row.get("metadata")),
            "rule_id": row.get("rule_id"),
            "sequence": row.get("sequence") or 0,
            "children": [],
        }
        op_nodes[row["id"]] = node

    for node in op_nodes.values():
        parent_id = node["parent_id"]
        if parent_id and parent_id in op_nodes:
            op_nodes[parent_id]["children"].append(node)
        else:
            stage_children[node["stage_id"]].append(node)

    def build_operation(node: Dict[str, Any]) -> Tuple[ProcessOperationModel, int]:
        child_models: List[ProcessOperationModel] = []
        child_alarm_total = 0
        for child in sorted(node["children"], key=lambda item: item["sequence"]):
            child_model, child_alarm_count = build_operation(child)
            child_models.append(child_model)
            child_alarm_total += child_alarm_count

        inputs = inputs_by_operation.get(node["id"], [])
        input_alarm_msgs = [inp.status_message for inp in inputs if inp.status == "alarm" and inp.status_message]
        input_warning_msgs = [inp.status_message for inp in inputs if inp.status == "warning" and inp.status_message]

        status = "ok"
        status_message: Optional[str] = None
        if input_alarm_msgs:
            status = "alarm"
            status_message = input_alarm_msgs[0]
        elif input_warning_msgs:
            status = "warning"
            status_message = input_warning_msgs[0]

        rule_model: Optional[AlarmRuleModel] = None
        if node.get("rule_id"):
            rule_row = rule_lookup.get(node["rule_id"])
            if rule_row:
                rule_status = rule_row.get("last_status")
                rule_payload = _normalise_json(rule_row.get("last_payload"))
                rule_detail = rule_payload.get("detail")
                if not rule_row.get("last_evaluated_at"):
                    rule_status, rule_detail, rule_payload = compute_rule_state(rule_row, telemetry_map)
                rule_model = AlarmRuleModel(
                    id=rule_row["id"],
                    category=rule_row["category"],
                    condition=rule_row["condition"],
                    severity=rule_row["severity"],
                    action=rule_row.get("action"),
                    message=rule_row.get("message"),
                    enabled=rule_row.get("enabled", True),
                    created_at=rule_row.get("created_at"),
                    updated_at=rule_row.get("updated_at"),
                    created_by=rule_row.get("created_by"),
                    metadata=_normalise_json(rule_row.get("metadata")),
                    last_evaluated_at=rule_row.get("last_evaluated_at"),
                    last_status=rule_status or "unknown",
                    last_payload=rule_payload,
                    last_fired_at=rule_row.get("last_fired_at"),
                    operation_id=rule_row.get("operation_id"),
                    stage_id=rule_row.get("stage_id"),
                    operation_name=node["name"],
                    stage_name=rule_row.get("stage_name"),
                )
                if rule_status in ("alarm", "error"):
                    status = "alarm" if rule_status == "alarm" else "error"
                    status_message = rule_detail or rule_row.get("message")

        if child_models:
            if any(child.status == "alarm" for child in child_models):
                status = "alarm"
                status_message = status_message or "Child operation alarm"
            elif status != "alarm" and any(child.status == "warning" for child in child_models):
                status = "warning"
                status_message = status_message or "Child operation warning"

        operation_model = ProcessOperationModel(
            id=node["id"],
            name=node["name"],
            type=node["type"],
            sequence=node["sequence"],
            metadata=node["metadata"],
            status=status,
            status_message=status_message,
            rule=rule_model,
            inputs=inputs,
            children=child_models,
        )

        alarm_total = child_alarm_total + (1 if status in ("alarm", "error") else 0)
        return operation_model, alarm_total

    stage_models: List[ProcessStageModel] = []
    for stage in stages:
        operations_nodes = stage_children.get(stage["id"], [])
        operation_models: List[ProcessOperationModel] = []
        alarm_count = 0
        for op_node in sorted(operations_nodes, key=lambda item: item["sequence"]):
            op_model, op_alarm_count = build_operation(op_node)
            operation_models.append(op_model)
            alarm_count += op_alarm_count
        stage_models.append(
            ProcessStageModel(
                id=stage["id"],
                name=stage["name"],
                description=stage.get("description"),
                sequence=stage.get("sequence") or 0,
                operations=operation_models,
                alarm_count=alarm_count,
            )
        )

    return RccProcessTree(
        sow_id=sow_row["id"],
        sow_name=sow_row["title"],
        as_of=as_of or datetime.now(timezone.utc),
        stages=stage_models,
    )


def list_block_progress(sow_id: str) -> List[RccBlockProgress]:
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                id,
                sow_id,
                block_no,
                lift_no,
                status,
                percent_complete,
                temperature,
                density,
                batch_id,
                vendor,
                ipc_value,
                metadata,
                observed_at
            FROM dipgos.rcc_block_progress
            WHERE sow_id = %s
            ORDER BY block_no, lift_no
            """,
            (sow_id,),
        )
        rows = cur.fetchall()
    return [
        RccBlockProgress(
            id=row["id"],
            sow_id=row["sow_id"],
            block_no=row["block_no"],
            lift_no=row["lift_no"],
            status=row["status"],
            percent_complete=float(row["percent_complete"]),
            temperature=row.get("temperature"),
            density=row.get("density"),
            batch_id=row.get("batch_id"),
            vendor=row.get("vendor"),
            ipc_value=row.get("ipc_value"),
            metadata=_normalise_json(row.get("metadata")),
            observed_at=row.get("observed_at"),
        )
        for row in rows
    ]


def list_environment_metrics(sow_id: str) -> List[RccEnvironmentMetric]:
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, sow_id, metric, label, unit, value_numeric, value_text, status, thresholds, metadata, updated_at
            FROM dipgos.rcc_environment_metrics
            WHERE sow_id = %s
            ORDER BY label
            """,
            (sow_id,),
        )
        rows = cur.fetchall()
    metrics: List[RccEnvironmentMetric] = []
    for row in rows:
        value_numeric = row.get("value_numeric")
        metrics.append(
            RccEnvironmentMetric(
                id=row["id"],
                sow_id=row["sow_id"],
                metric=row["metric"],
                label=row["label"],
                unit=row.get("unit"),
                value_numeric=float(value_numeric) if value_numeric is not None else None,
                value_text=row.get("value_text"),
                status=row.get("status") or "unknown",
                thresholds=_normalise_json(row.get("thresholds")),
                metadata=_normalise_json(row.get("metadata")),
                updated_at=row.get("updated_at"),
            )
        )
    return metrics


class _ProgressWebSocketManager:
    def __init__(self) -> None:
        self._connections: set[Tuple[WebSocket, Optional[str]]] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, sow_id: Optional[str]) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add((websocket, sow_id))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections = {(ws, sid) for ws, sid in self._connections if ws is not websocket}

    async def broadcast(self, payload: Dict[str, Any], sow_id: Optional[str] = None) -> None:
        async with self._lock:
            targets = list(self._connections)
        stale: List[Tuple[WebSocket, Optional[str]]] = []
        for websocket, target_sow in targets:
            if sow_id and target_sow and target_sow != sow_id:
                continue
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append((websocket, target_sow))
        if stale:
            async with self._lock:
                self._connections = {(ws, sid) for ws, sid in self._connections if (ws, sid) not in stale}


progress_ws_manager = _ProgressWebSocketManager()


def upsert_block_progress(sow_id: str, payload: Dict[str, Any]) -> RccBlockProgress:
    block_no = payload.get("block_no")
    lift_no = payload.get("lift_no")
    if block_no is None or lift_no is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="block_no and lift_no are required")
    record_id = payload.get("id") or f"{sow_id}-b{int(block_no):02d}-l{int(lift_no):02d}"
    metadata = payload.get("metadata") or {}
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO dipgos.rcc_block_progress (
                id,
                sow_id,
                block_no,
                lift_no,
                status,
                percent_complete,
                temperature,
                density,
                batch_id,
                vendor,
                ipc_value,
                metadata,
                observed_at,
                updated_at
            )
            VALUES (
                %(id)s,
                %(sow_id)s,
                %(block_no)s,
                %(lift_no)s,
                %(status)s,
                %(percent_complete)s,
                %(temperature)s,
                %(density)s,
                %(batch_id)s,
                %(vendor)s,
                %(ipc_value)s,
                %(metadata)s,
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                percent_complete = EXCLUDED.percent_complete,
                temperature = EXCLUDED.temperature,
                density = EXCLUDED.density,
                batch_id = EXCLUDED.batch_id,
                vendor = EXCLUDED.vendor,
                ipc_value = EXCLUDED.ipc_value,
                metadata = EXCLUDED.metadata,
                observed_at = NOW(),
                updated_at = NOW()
            RETURNING *
            """,
            {
                "id": record_id,
                "sow_id": sow_id,
                "block_no": block_no,
                "lift_no": lift_no,
                "status": payload.get("status", "planned"),
                "percent_complete": payload.get("percent_complete", 0),
                "temperature": payload.get("temperature"),
                "density": payload.get("density"),
                "batch_id": payload.get("batch_id"),
                "vendor": payload.get("vendor"),
                "ipc_value": payload.get("ipc_value"),
                "metadata": Json(metadata),
            },
        )
        row = cur.fetchone()
    result = RccBlockProgress(
        id=row["id"],
        sow_id=row["sow_id"],
        block_no=row["block_no"],
        lift_no=row["lift_no"],
        status=row["status"],
        percent_complete=float(row["percent_complete"]),
        temperature=row.get("temperature"),
        density=row.get("density"),
        batch_id=row.get("batch_id"),
        vendor=row.get("vendor"),
        ipc_value=row.get("ipc_value"),
        metadata=_normalise_json(row.get("metadata")),
        observed_at=row.get("observed_at"),
    )
    asyncio.create_task(
        progress_ws_manager.broadcast(
            {
                "event": "progress_update",
                "sowId": sow_id,
                "payload": result.model_dump(),
            },
            sow_id=sow_id,
        )
    )
    return result


def list_alarm_rules(sow_id: Optional[str] = None) -> AlarmRuleList:
    clauses: List[str] = []
    params: List[Any] = []
    if sow_id:
        clauses.append("ps.sow_id = %s")
        params.append(sow_id)

    sql = """
        SELECT
            ar.*,
            po.id AS operation_id,
            po.name AS operation_name,
            ps.id AS stage_id,
            ps.name AS stage_name
        FROM dipgos.alarm_rules ar
        LEFT JOIN dipgos.process_operations po ON po.rule_id = ar.id
        LEFT JOIN dipgos.process_stages ps ON po.stage_id = ps.id
    """
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY ar.category, ar.id"

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return AlarmRuleList(rules=[_row_to_rule_model(row) for row in rows])


def upsert_alarm_rule(rule_data: Dict[str, Any]) -> AlarmRuleModel:
    rule_id = rule_data.get("id") or str(uuid.uuid4())
    safe_evaluator.validate(rule_data["condition"])
    metadata = rule_data.get("metadata") or {}
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO dipgos.alarm_rules (
                    id, category, condition, severity, action, message,
                    enabled, created_by, metadata, updated_at
                )
                VALUES (
                    %(id)s, %(category)s, %(condition)s, %(severity)s, %(action)s, %(message)s,
                    %(enabled)s, %(created_by)s, %(metadata)s, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    category = EXCLUDED.category,
                    condition = EXCLUDED.condition,
                    severity = EXCLUDED.severity,
                    action = EXCLUDED.action,
                    message = EXCLUDED.message,
                    enabled = EXCLUDED.enabled,
                    created_by = COALESCE(EXCLUDED.created_by, dipgos.alarm_rules.created_by),
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
                RETURNING *
                """,
                {
                    "id": rule_id,
                    "category": rule_data["category"],
                    "condition": rule_data["condition"],
                    "severity": rule_data["severity"],
                    "action": rule_data.get("action"),
                    "message": rule_data.get("message"),
                    "enabled": rule_data.get("enabled", True),
                    "created_by": rule_data.get("created_by"),
                    "metadata": Json(metadata),
                },
            )
            row = cur.fetchone()
            operation_id = rule_data.get("operation_id")
            if operation_id:
                cur.execute(
                    """
                    UPDATE dipgos.process_operations
                    SET rule_id = %s
                    WHERE id = %s
                    """,
                    (rule_id, operation_id),
                )
        conn.commit()

    evaluate_alarm_rules()
    fetched = _fetch_rules([rule_id]).get(rule_id) or row
    return _row_to_rule_model(fetched)
