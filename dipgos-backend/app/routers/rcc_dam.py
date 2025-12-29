from __future__ import annotations

import random
from collections import Counter
from typing import Dict, List, Tuple, Any, Optional
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, HTTPException, status
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ..db import pool

router = APIRouter(prefix="/api/rcc-dam", tags=["rcc dam"])

STATUS_KEYS = ("complete", "in-progress", "at-risk", "not-started", "rule-violated")
ENVIRONMENT_METRIC_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "daily_pour_volume": {"kind": "range", "min": 1.6, "max": 4.5, "precision": 1},
    "cumulative_volume": {"kind": "drift", "min": 14500, "max": 17000, "precision": 0, "variance": 220},
    "core_temperature": {"kind": "range", "min": 18.0, "max": 37.5, "precision": 1},
    "air_temperature": {"kind": "range", "min": 10.0, "max": 42.5, "precision": 1},
    "moisture": {"kind": "range", "min": 2.4, "max": 6.8, "precision": 1},
    "humidity": {"kind": "range", "min": 32.0, "max": 84.0, "precision": 0},
    "ph_value": {"kind": "range", "min": 6.2, "max": 8.4, "precision": 1},
    "turbidity": {"kind": "range", "min": 1.0, "max": 6.0, "precision": 1},
    "cement_inventory": {"kind": "range", "min": 360, "max": 640, "precision": 0},
    "cost_variance": {"kind": "range", "min": 5.0, "max": 18.0, "precision": 1},
    "block_pour_rate": {"kind": "int", "min": 2, "max": 9},
    "cement_supplier": {
        "kind": "choice",
        "choices": [
            {"text": "PakCem JV", "status": "ok"},
            {"text": "Lucky – Frontier JV", "status": "ok"},
            {"text": "NBP On-site plant", "status": "ok"},
        ],
    },
    "delivery_schedule": {
        "kind": "choice",
        "choices": [
            {"text": "Convoy rolling · ETA 17:40", "status": "ok"},
            {"text": "Batch queued · ETA 18:55", "status": "warning"},
            {"text": "Pour delayed · ETA 20:10", "status": "alarm"},
        ],
    },
    "lab_reports": {
        "kind": "choice",
        "choices": [
            {"text": "Compression tests cleared", "status": "ok"},
            {"text": "Waiting on QA stamp", "status": "warning"},
        ],
    },
    "technical_specs": {
        "kind": "choice",
        "choices": [
            {"text": "Mix design M80 validated", "status": "ok"},
            {"text": "Thermal model tweak in review", "status": "warning"},
        ],
    },
}


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _metric_status_from_thresholds(value: Optional[float], thresholds: Optional[Dict[str, Any]]) -> str:
    if value is None:
        return "ok"
    thresholds = thresholds or {}
    min_val = _to_float(thresholds.get("min"))
    max_val = _to_float(thresholds.get("max"))
    warn_min = _to_float(thresholds.get("warn_min"))
    warn_max = _to_float(thresholds.get("warn_max"))
    if min_val is not None and value < min_val:
        return "alarm"
    if max_val is not None and value > max_val:
        return "alarm"
    if warn_min is not None and value < warn_min:
        return "warning"
    if warn_max is not None and value > warn_max:
        return "warning"
    return "ok"


def _resolve_sow_context(dam_id: str) -> Tuple[str, str, str]:
    """Return (sow_id, contract_id, project_id) for the provided dam identifier."""
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT cs.id AS sow_id, cs.contract_id, c.project_id
            FROM dipgos.contract_sows cs
            JOIN dipgos.contracts c ON c.id = cs.contract_id
            WHERE cs.id = %s
            """,
            (dam_id,),
        )
        row = cur.fetchone()
        if row:
            return row["sow_id"], row["contract_id"], row["project_id"]
        cur.execute(
            """
            SELECT cs.id AS sow_id, cs.contract_id, c.project_id
            FROM dipgos.contract_sows cs
            JOIN dipgos.contracts c ON c.id = cs.contract_id
            WHERE cs.contract_id = %s
            ORDER BY
                CASE
                    WHEN LOWER(cs.title) LIKE 'rcc%%' THEN 0
                    WHEN LOWER(cs.title) LIKE '%%dam%%' THEN 1
                    ELSE 2
                END,
                cs.sequence,
                cs.id
            LIMIT 1
            """,
            (dam_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dam not found")
    return row["sow_id"], row["contract_id"], row["project_id"]


def _derive_status(percent_complete: float, temperature: float, lag_minutes: float) -> Tuple[str, bool, Optional[str]]:
    """Simple demo rules for turning metrics into block status."""
    status_val = "not-started"
    reason = None
    if percent_complete >= 100:
        status_val = "complete"
    elif percent_complete >= 60 and temperature <= 25 and lag_minutes <= 30:
        status_val = "in-progress"
    elif percent_complete > 0 and (temperature > 25 or lag_minutes > 30):
        status_val = "at-risk"
    elif percent_complete > 0:
        status_val = "in-progress"

    rule_violated = temperature > 35 or lag_minutes > 90
    if rule_violated:
        status_val = "rule-violated"
        triggers: List[str] = []
        if temperature > 35:
            triggers.append(f"Core temp {temperature:.1f}°C > 35° limit")
        if lag_minutes > 90:
            triggers.append(f"Placement lag {lag_minutes:.0f} min > 90 min threshold")
        reason = " & ".join(triggers) if triggers else "Rule violation detected"
    elif status_val == "at-risk":
        triggers = []
        if temperature > 25:
            triggers.append(f"Core temp trending high ({temperature:.1f}°C)")
        if lag_minutes > 30:
            triggers.append(f"Placement lag {lag_minutes:.0f} min")
        if percent_complete < 20:
            triggers.append("Slow progress on lift")
        reason = " & ".join(triggers) if triggers else "Monitoring anomaly"
    elif status_val == "in-progress" and percent_complete < 15:
        reason = "Lift just underway – monitoring telemetry"
    return status_val, rule_violated, reason


def _generate_metrics(block_no: int, lift_no: int) -> Dict[str, float]:
    """Generate synthetic telemetry that roughly tracks with lift depth."""
    progress_bias = (lift_no * 0.07) + random.uniform(-0.2, 0.4)
    base = max(0.0, min(1.0, random.random() * 0.9 + progress_bias))
    percent_complete = round(min(100.0, base * 105 + random.uniform(-15, 8)), 1)
    if random.random() < 0.18:
        percent_complete = 0.0
    actual_rate = round(random.uniform(90, 240), 1)
    temperature = round(random.uniform(18, 44), 1)
    lag_minutes = round(max(0.0, random.gauss(30, 25)), 1)
    if random.random() < 0.15:
        temperature = round(random.uniform(36, 44), 1)
    if random.random() < 0.15:
        lag_minutes = round(random.uniform(60, 150), 1)
    status_val, rule_violated, reason = _derive_status(percent_complete, temperature, lag_minutes)
    return {
        "percent_complete": percent_complete,
        "actual_rate": actual_rate,
        "temperature": temperature,
        "lag_minutes": lag_minutes,
        "status": status_val,
        "rule_violated": rule_violated,
        "risk_reason": reason,
    }


def _simulate_environment_metrics(cur, sow_id: str) -> Dict[str, Dict[str, Any]]:
    """Randomise RCC environment metrics so the card deck moves with each sync."""
    cur.execute(
        """
        SELECT id, metric, label, unit, value_numeric, value_text, thresholds
        FROM dipgos.rcc_environment_metrics
        WHERE sow_id = %s
        """,
        (sow_id,),
    )
    rows = cur.fetchall()
    updates: List[Dict[str, Any]] = []
    summary: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        metric_id = row["metric"]
        schema = ENVIRONMENT_METRIC_SCHEMAS.get(metric_id)
        if not schema:
            continue
        value_numeric: Optional[float] = None
        value_text: Optional[str] = None
        forced_status: Optional[str] = None
        kind = schema.get("kind", "range")
        if kind == "range":
            precision = schema.get("precision", 1)
            value_numeric = round(random.uniform(schema["min"], schema["max"]), precision)
        elif kind == "drift":
            precision = schema.get("precision", 1)
            anchor = row.get("value_numeric") or schema.get("start") or schema["min"]
            variance = schema.get("variance", 120)
            value_numeric = max(
                schema["min"],
                min(schema["max"], float(anchor) + random.uniform(-variance, variance)),
            )
            value_numeric = round(value_numeric, precision)
        elif kind == "int":
            value_numeric = float(random.randint(schema["min"], schema["max"]))
        elif kind == "choice":
            choice = random.choice(schema["choices"])
            value_text = choice["text"]
            forced_status = choice.get("status")
        else:
            continue

        status = forced_status
        if status is None:
            status = _metric_status_from_thresholds(value_numeric, row.get("thresholds"))
        updates.append(
            {
                "id": row["id"],
                "value_numeric": value_numeric,
                "value_text": value_text,
                "status": status,
            }
        )
        summary[metric_id] = {
            "label": row["label"],
            "unit": row.get("unit"),
            "valueNumeric": value_numeric,
            "valueText": value_text,
            "status": status,
        }
    if updates:
        cur.executemany(
            """
            UPDATE dipgos.rcc_environment_metrics
            SET value_numeric = %(value_numeric)s,
                value_text = %(value_text)s,
                status = %(status)s,
                updated_at = NOW()
            WHERE id = %(id)s
            """,
            updates,
        )
    return summary


def _create_alarm(cur, project_id: str, dam_id: str, sow_id: str, block_id: str, lift_no: int, metrics: Dict[str, float]) -> None:
    """Upsert a high severity alert so it shows up in the Alarm Center."""
    alert_id = str(uuid5(NAMESPACE_URL, f"rcc-demo:{dam_id}:{block_id}:{lift_no}"))
    metadata = {
        "dam_id": dam_id,
        "sow_id": sow_id,
        "block_id": block_id,
        "lift": lift_no,
        "code": "RCC_RULE_VIOLATION",
        "status": metrics["status"],
        "percent_complete": metrics["percent_complete"],
        "temperature": metrics["temperature"],
        "lag_minutes": metrics["lag_minutes"],
        "source": "RCC 3D Sync Metrics Demo",
    }
    message = f"Rule violation in Block {block_id}, Lift {lift_no}: high temperature / lag"
    cur.execute(
        """
        INSERT INTO dipgos.alerts (
            id,
            project_id,
            title,
            location,
            activity,
            severity,
            category,
            status,
            metadata,
            raised_at
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, 'open', %s, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            severity = EXCLUDED.severity,
            status = 'open',
            raised_at = NOW(),
            metadata = EXCLUDED.metadata
        """,
        (
            alert_id,
            project_id,
            message,
            f"Block {block_id}",
            "RCC 3D Sync Metrics Demo",
            "high",
            "RCC",
            Json(metadata),
        ),
    )


@router.post("/{dam_id}/sync-metrics-demo")
def sync_metrics_demo(dam_id: str):
    """
    Demo simulator: generates synthetic process metrics for this dam,
    updates block/lift statuses, and raises alarms when rules are violated.
    Used only to demonstrate end-to-end real-time behavior in the UI.
    """

    sow_id, contract_id, project_id = _resolve_sow_context(dam_id)
    environment_summary: Dict[str, Dict[str, Any]] = {}
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, block_no, lift_no
            FROM dipgos.rcc_block_progress
            WHERE sow_id = %s
            ORDER BY block_no, lift_no
            """,
            (sow_id,),
        )
        progress_rows = cur.fetchall()
        if not progress_rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No RCC blocks configured for this dam")

        metrics_payload: List[Dict[str, object]] = []
        progress_updates: List[Dict[str, object]] = []
        status_counts: Counter[str] = Counter()
        response_updates: List[Dict[str, object]] = []

        for row in progress_rows:
            block_no = row["block_no"]
            lift_no = row["lift_no"]
            block_id = f"{int(block_no):02d}"
            metrics = _generate_metrics(block_no, lift_no)
            metadata = {
                "risk_reason": metrics.get("risk_reason"),
                "temperature": metrics["temperature"],
                "lag_minutes": metrics["lag_minutes"],
                "actual_rate": metrics["actual_rate"],
                "rule_violated": metrics["rule_violated"],
            }
            metrics_payload.append(
                {
                    "dam_id": dam_id,
                    "block_id": block_id,
                    "lift": lift_no,
                    **metrics,
                }
            )
            progress_updates.append(
                {
                    "id": row["id"],
                    "status": metrics["status"],
                    "percent_complete": metrics["percent_complete"],
                    "temperature": metrics["temperature"],
                    "metadata": Json(metadata),
                }
            )
            status_counts[metrics["status"]] += 1
            response_updates.append(
                {
                    "blockId": block_id,
                    "blockNo": block_no,
                    "lift": lift_no,
                    "status": metrics["status"],
                    "percentComplete": metrics["percent_complete"],
                    "temperature": metrics["temperature"],
                    "riskReason": metrics.get("risk_reason"),
                    "lagMinutes": metrics["lag_minutes"],
                    "actualRate": metrics["actual_rate"],
                    "ruleViolated": metrics["rule_violated"],
                }
            )

        cur.executemany(
            """
            INSERT INTO dipgos.rcc_block_metrics (
                dam_id,
                block_id,
                lift,
                percent_complete,
                actual_rate,
                temperature,
                lag_minutes,
                status,
                rule_violated,
                updated_at
            )
            VALUES (
                %(dam_id)s,
                %(block_id)s,
                %(lift)s,
                %(percent_complete)s,
                %(actual_rate)s,
                %(temperature)s,
                %(lag_minutes)s,
                %(status)s,
                %(rule_violated)s,
                NOW()
            )
            ON CONFLICT (dam_id, block_id, lift) DO UPDATE SET
                percent_complete = EXCLUDED.percent_complete,
                actual_rate = EXCLUDED.actual_rate,
                temperature = EXCLUDED.temperature,
                lag_minutes = EXCLUDED.lag_minutes,
                status = EXCLUDED.status,
                rule_violated = EXCLUDED.rule_violated,
                updated_at = NOW()
            """,
            metrics_payload,
        )

        cur.executemany(
            """
            UPDATE dipgos.rcc_block_progress
            SET status = %(status)s,
                percent_complete = %(percent_complete)s,
                temperature = %(temperature)s,
                metadata = %(metadata)s,
                observed_at = NOW(),
                updated_at = NOW()
            WHERE id = %(id)s
            """,
            progress_updates,
        )

        for payload in metrics_payload:
            if payload["rule_violated"]:
                _create_alarm(cur, project_id, dam_id, sow_id, payload["block_id"], payload["lift"], payload)

        environment_summary = _simulate_environment_metrics(cur, sow_id)
        conn.commit()

    block_count = {entry["block_id"] for entry in metrics_payload}
    return {
        "damId": dam_id,
        "sowId": sow_id,
        "contractId": contract_id,
        "simulated": True,
        "blocksUpdated": len(block_count),
        "liftsUpdated": len(metrics_payload),
        "statusCounts": {key: status_counts.get(key, 0) for key in STATUS_KEYS},
        "updates": response_updates,
        "environmentMetricsUpdated": len(environment_summary),
        "environmentMetricStatus": environment_summary,
    }
