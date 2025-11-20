from __future__ import annotations

import ast
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from fastapi import WebSocket
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ..db import pool

logger = logging.getLogger(__name__)

EVALUATION_INTERVAL_SECONDS = 300


def _to_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalise_json(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray, memoryview)):
        raw = bytes(raw).decode("utf-8")
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            return {}
    return {}


class SafeExpressionEvaluator:
    """Evaluates basic arithmetic/boolean expressions without allowing arbitrary code."""

    def validate(self, expression: str) -> None:
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc:  # pragma: no cover - defensive guard
            raise ValueError(f"Invalid condition syntax: {exc}") from exc
        self._validate_node(tree.body)

    def evaluate(self, expression: str, context: Dict[str, Any]) -> bool:
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"Invalid condition syntax: {exc}") from exc
        result = self._eval_node(tree.body, context)
        return bool(result)

    def _validate_node(self, node: ast.AST) -> None:
        allowed_nodes = (
            ast.Expression,
            ast.BoolOp,
            ast.BinOp,
            ast.UnaryOp,
            ast.Compare,
            ast.Name,
            ast.Constant,
            ast.List,
            ast.Tuple,
            ast.Set,
        )
        if isinstance(node, ast.Expression):
            self._validate_node(node.body)
            return
        if not isinstance(node, allowed_nodes):
            raise ValueError(f"Unsupported expression element: {type(node).__name__}")
        if isinstance(node, ast.BoolOp):
            for value in node.values:
                self._validate_node(value)
        elif isinstance(node, ast.BinOp):
            self._validate_node(node.left)
            self._validate_node(node.right)
        elif isinstance(node, ast.UnaryOp):
            self._validate_node(node.operand)
        elif isinstance(node, ast.Compare):
            self._validate_node(node.left)
            for comparator in node.comparators:
                self._validate_node(comparator)
        elif isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            for elt in node.elts:
                self._validate_node(elt)

    def _eval_node(self, node: ast.AST, context: Dict[str, Any]) -> Any:
        if isinstance(node, ast.Expression):
            return self._eval_node(node.body, context)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return context.get(node.id)
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                for value in node.values:
                    if not self._truthy(self._eval_node(value, context)):
                        return False
                return True
            if isinstance(node.op, ast.Or):
                for value in node.values:
                    if self._truthy(self._eval_node(value, context)):
                        return True
                return False
        if isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand, context)
            if isinstance(node.op, ast.Not):
                return not self._truthy(operand)
            if isinstance(node.op, ast.USub):
                return -float(operand)
            if isinstance(node.op, ast.UAdd):
                return float(operand)
        if isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, context)
            right = self._eval_node(node.right, context)
            return self._apply_binop(node.op, left, right)
        if isinstance(node, ast.Compare):
            left = self._eval_node(node.left, context)
            for operator, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, context)
                if not self._apply_compare(operator, left, right):
                    return False
                left = right
            return True
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return [self._eval_node(elt, context) for elt in node.elts]
        raise ValueError(f"Unsupported expression element: {type(node).__name__}")

    def _apply_binop(self, operator: ast.AST, left: Any, right: Any) -> Any:
        if left is None or right is None:
            raise ValueError("Missing value for arithmetic comparison")
        left_num = float(left)
        right_num = float(right)
        if isinstance(operator, ast.Add):
            return left_num + right_num
        if isinstance(operator, ast.Sub):
            return left_num - right_num
        if isinstance(operator, ast.Mult):
            return left_num * right_num
        if isinstance(operator, ast.Div):
            if right_num == 0:
                raise ValueError("Division by zero in rule condition")
            return left_num / right_num
        if isinstance(operator, ast.Mod):
            return left_num % right_num
        raise ValueError(f"Operator {type(operator).__name__} is not supported")

    def _apply_compare(self, operator: ast.AST, left: Any, right: Any) -> bool:
        if isinstance(operator, (ast.Eq, ast.NotEq)):
            if isinstance(operator, ast.Eq):
                return left == right
            return left != right
        if left is None or right is None:
            raise ValueError("Missing value for comparison")
        if isinstance(operator, ast.Lt):
            return left < right
        if isinstance(operator, ast.LtE):
            return left <= right
        if isinstance(operator, ast.Gt):
            return left > right
        if isinstance(operator, ast.GtE):
            return left >= right
        if isinstance(operator, ast.In):
            return left in right
        if isinstance(operator, ast.NotIn):
            return left not in right
        raise ValueError(f"Comparator {type(operator).__name__} is not supported")

    def _truthy(self, value: Any) -> bool:
        return bool(value)


safe_evaluator = SafeExpressionEvaluator()


def get_latest_telemetry_map() -> Dict[str, Optional[float]]:
    telemetry: Dict[str, Optional[float]] = {}
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT source_name, current_value
            FROM dipgos.process_inputs
            WHERE source_name IS NOT NULL
            """
        )
        for row in cur.fetchall():
            telemetry[row["source_name"]] = _to_number(row["current_value"])
    return telemetry


def _build_context(metadata: Dict[str, Any], telemetry: Dict[str, Optional[float]]) -> Dict[str, Any]:
    context = dict(telemetry)
    month_key = datetime.now(timezone.utc).strftime("%b").lower()
    context["current_month"] = month_key
    context.update(metadata.get("context") or {})

    if "max_by_month" in metadata:
        month_limits = metadata["max_by_month"]
        default_max = metadata.get("default_max") or context.get("max_pour_temp")
        context["max_pour_temp"] = month_limits.get(month_key, default_max)

    if "seasonal_durations" in metadata:
        durations = metadata["seasonal_durations"]
        warm_months = set(metadata.get("warm_months") or [])
        season = "warm" if month_key in warm_months else "cold"
        context["required_curing_days"] = (
            durations.get(season)
            or durations.get("default")
            or durations.get("cold")
            or durations.get("warm")
        )

    return context


def compute_rule_state(rule_row: Dict[str, Any], telemetry: Dict[str, Optional[float]]) -> tuple[str, Optional[str], Dict[str, Any]]:
    metadata = _normalise_json(rule_row.get("metadata"))
    context = _build_context(metadata, telemetry)
    detail: Optional[str] = None
    try:
        result = safe_evaluator.evaluate(rule_row["condition"], context)
    except ValueError as exc:
        result = False
        detail = str(exc)
        logger.warning("Rule %s evaluation error: %s", rule_row.get("id"), exc)
    status = "ok" if result else ("error" if detail else "alarm")
    snapshot_keys = metadata.get("required_inputs") or []
    snapshot = {
        "context": {key: context.get(key) for key in snapshot_keys},
        "evaluated": rule_row["condition"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
    }
    if detail:
        snapshot["detail"] = detail
    return status, detail, snapshot


def _fetch_rule_rows(cur) -> List[Dict[str, Any]]:
    cur.execute(
        """
        SELECT
            ar.*,
            po.id AS operation_id,
            po.name AS operation_name,
            po.stage_id,
            ps.name AS stage_name,
            ps.sow_id,
            cs.title AS sow_name,
            cs.contract_id,
            c.name AS contract_name,
            c.project_id
        FROM dipgos.alarm_rules ar
        LEFT JOIN dipgos.process_operations po ON po.rule_id = ar.id
        LEFT JOIN dipgos.process_stages ps ON po.stage_id = ps.id
        LEFT JOIN dipgos.contract_sows cs ON ps.sow_id = cs.id
        LEFT JOIN dipgos.contracts c ON cs.contract_id = c.id
        WHERE ar.enabled = TRUE
        """
    )
    return cur.fetchall()


def evaluate_alarm_rules() -> List[Dict[str, Any]]:
    triggered: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT source_name, current_value
                FROM dipgos.process_inputs
                WHERE source_name IS NOT NULL
                """
            )
            telemetry = {row["source_name"]: _to_number(row["current_value"]) for row in cur.fetchall() if row.get("source_name")}
            rule_rows = _fetch_rule_rows(cur)

        with conn.cursor() as cur:
            for row in rule_rows:
                metadata = _normalise_json(row.get("metadata"))
                last_payload = _normalise_json(row.get("last_payload"))
                previous_status = row.get("last_status")
                status, detail, snapshot = compute_rule_state(row, telemetry)
                payload = {**snapshot, "required": metadata.get("required_inputs")}
                cur.execute(
                    """
                    UPDATE dipgos.alarm_rules
                    SET last_evaluated_at = %s,
                        last_status = %s,
                        last_payload = %s,
                        last_fired_at = CASE WHEN %s THEN %s ELSE last_fired_at END
                    WHERE id = %s
                    """,
                    (
                        now,
                        status,
                        Json(payload),
                        status == "alarm",
                        now,
                        row["id"],
                    ),
                )

                if status == "alarm" and previous_status != "alarm":
                    event_payload = {
                        "ruleId": row["id"],
                        "severity": row["severity"],
                        "message": row.get("message"),
                        "category": row.get("category"),
                        "sowId": row.get("sow_id"),
                        "stageId": row.get("stage_id"),
                        "stageName": row.get("stage_name"),
                        "operationId": row.get("operation_id"),
                        "operationName": row.get("operation_name"),
                        "contractId": row.get("contract_id"),
                        "contractName": row.get("contract_name"),
                        "projectId": row.get("project_id"),
                        "payload": payload,
                        "timestamp": now.isoformat(),
                    }
                    triggered.append(event_payload)
                    cur.execute(
                        """
                        INSERT INTO dipgos.process_historian (
                            record_type,
                            action,
                            sow_id,
                            sow_name,
                            process_id,
                            process_name,
                            contract_id,
                            contract_name,
                            project_id,
                            title,
                            severity,
                            payload,
                            created_at
                        )
                        VALUES (
                            'alarm',
                            'triggered',
                            %(sow_id)s,
                            %(sow_name)s,
                            %(process_id)s,
                            %(process_name)s,
                            %(contract_id)s,
                            %(contract_name)s,
                            %(project_id)s,
                            %(title)s,
                            %(severity)s,
                            %(payload)s,
                            %(created_at)s
                        )
                        """,
                        {
                            "sow_id": row.get("sow_id"),
                            "sow_name": row.get("sow_name"),
                            "process_id": row.get("operation_id"),
                            "process_name": row.get("operation_name"),
                            "contract_id": row.get("contract_id"),
                            "contract_name": row.get("contract_name"),
                            "project_id": row.get("project_id"),
                            "title": row.get("message") or row.get("category"),
                            "severity": row.get("severity"),
                            "payload": Json(event_payload),
                            "created_at": now,
                        },
                    )
        conn.commit()
    return triggered


class AlarmWebSocketManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, payload: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections)
        stale: List[WebSocket] = []
        for conn in targets:
            try:
                await conn.send_json(payload)
            except Exception:
                stale.append(conn)
        if stale:
            async with self._lock:
                for conn in stale:
                    self._connections.discard(conn)


alarm_ws_manager = AlarmWebSocketManager()


async def alarm_rule_monitor() -> None:
    while True:
        try:
            triggered = await asyncio.to_thread(evaluate_alarm_rules)
            for event in triggered:
                await alarm_ws_manager.broadcast({"event": "alarm_triggered", **event})
        except asyncio.CancelledError:  # pragma: no cover - shutdown path
            break
        except Exception:
            logger.exception("Error while evaluating RCC alarm rules")
        await asyncio.sleep(EVALUATION_INTERVAL_SECONDS)
