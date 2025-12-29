from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from uuid import uuid4, uuid5, NAMESPACE_URL

import json

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..db import pool
from ..models.scm import (
    ScmCanvasCard,
    ScmCanvasLane,
    ScmDashboardKpi,
    ScmDashboardResponse,
    ScmInsight,
    ScmInsightAction,
    ScmInventoryCard,
    ScmProcessCanvasResponse,
    ScmProcessMetrics,
    ScmProcessStageResponse,
    ScmStageNode,
    ScmStageResource,
    ScmScopeInfo,
)
from .progress_v2 import (
    ProgressScope,
    progress_normalise_tenant,
    resolve_scope_with_fallback,
)

logger = logging.getLogger(__name__)


LANE_DEFINITIONS: Tuple[Tuple[str, str], ...] = (
    ("requisition", "Requisitions"),
    ("purchase_order", "Purchase Orders"),
    ("shipment", "Shipments"),
)

STAGE_PRECEDENCE = {
    "Design": 10,
    "Off-Site Works": 20,
    "Logistics": 30,
    "Site Works": 40,
    "Testing": 50,
    "Commissioning": 60,
    "Handover": 70,
}

STAGE_ORDER = ["design", "off_site", "logistics", "on_site"]

STAGE_LABELS = {
    "design": "Design",
    "off_site": "Off-Site Works",
    "logistics": "Logistics",
    "on_site": "Site Works",
}

STATUS_STAGE_MAP = {
    "planned": "design",
    "draft": "design",
    "requested": "design",
    "released": "design",
    "engineering": "design",
    "committed": "off_site",
    "approved": "off_site",
    "fabricating": "off_site",
    "procured": "off_site",
    "in_flight": "logistics",
    "in_transit": "logistics",
    "shipped": "logistics",
    "at_port": "logistics",
    "dispatched": "logistics",
    "delivered": "on_site",
    "received": "on_site",
    "staged": "on_site",
    "installed": "on_site",
}

STAGE_STATUS_UPDATE = {
    "design": "planned",
    "off_site": "committed",
    "logistics": "in_flight",
    "on_site": "delivered",
}

SCOPE_COLUMN = {
    "portfolio": "tenant_id",
    "project": "project_id",
    "contract": "contract_id",
    "sow": "sow_id",
    "process": "process_id",
}


def _stage_from_status(status: Optional[str]) -> str:
    if not status:
        return "design"
    return STATUS_STAGE_MAP.get(status.lower(), "design")


def _emit_alert(scope: ProgressScope, severity: str, title: str, summary: str, metadata: Dict[str, object]) -> Optional[str]:
    """
    Record an SCM event and raise a unified alert so Alarm Center can surface it.
    """
    if severity not in {"critical", "warning", "info"}:
        severity = "info"

    event_id = uuid4()
    occurred_at = datetime.now(timezone.utc)

    project_id = scope.project["entity_id"] if scope.project else None
    contract_id = scope.contract["entity_id"] if scope.contract else None
    sow_id = scope.sow["entity_id"] if scope.sow else None
    process_id = scope.process["entity_id"] if scope.process else None

    alert_metadata = {
        "summary": summary,
        "scope": {
            "project": scope.project.get("code") if scope.project else None,
            "contract": scope.contract.get("code") if scope.contract else None,
            "sow": scope.sow.get("code") if scope.sow else None,
            "process": scope.process.get("code") if scope.process else None,
        },
        "details": metadata,
    }

    alert_id: Optional[str] = None

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dipgos.scm_events (
                  id, tenant_id, project_id, contract_id, sow_id, process_id,
                  source, severity, event_type, message, occurred_at, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    event_id,
                    scope.tenant_id,
                    project_id,
                    contract_id,
                    sow_id,
                    process_id,
                    "scm:dashboard",
                    severity,
                    metadata.get("eventType", "scm.insight"),
                    title,
                    occurred_at,
                    json.dumps(alert_metadata),
                ),
            )

            if severity in {"critical", "warning"}:
                alert_id = str(uuid5(NAMESPACE_URL, f"scm:{title}:{project_id}:{contract_id}:{process_id}"))
                cur.execute(
                    """
                    INSERT INTO dipgos.alerts (id, project_id, title, severity, raised_at, category, status, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, 'open', %s)
                    ON CONFLICT (id) DO UPDATE
                      SET severity = EXCLUDED.severity,
                          metadata = EXCLUDED.metadata,
                          raised_at = EXCLUDED.raised_at,
                          status = 'open'
                    """,
                    (
                        alert_id,
                        scope.project.get("code") if scope.project else None,
                        title,
                        severity,
                        occurred_at,
                        "Supply Chain",
                        json.dumps(alert_metadata),
                    ),
                )

    return alert_id
                

def _build_scope_info(level: str, scope: ProgressScope) -> ScmScopeInfo:
    mapping = {
        "process": scope.process,
        "sow": scope.sow,
        "contract": scope.contract,
        "project": scope.project,
    }
    entity = mapping.get(level) if level != "portfolio" else None
    return ScmScopeInfo(
        level=level,
        id=str(entity["entity_id"]) if entity else None,
        code=entity.get("code") if entity else None,
        name=entity.get("name") if entity else None,
    )


def _fetch_rows(query: str, params: Tuple) -> List[Dict]:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            return cur.fetchall()


def _fetch_process_lookup(process_ids: List) -> Dict[str, Dict[str, str]]:
    if not process_ids:
        return {}
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT entity_id, code, name
                FROM dipgos.entities
                WHERE level = 'process' AND entity_id = ANY(%s)
                """,
                (process_ids,),
            )
            return {str(row["entity_id"]): {"code": row["code"], "name": row["name"]} for row in cur.fetchall()}


def _persist_insights(scope_level: str, scope: ProgressScope, insights: List[ScmInsight]) -> None:
    """
    Store generated insights so downstream analytics and audit trails can learn from decisions.
    Avoid duplicating identical insights emitted in the last 12 hours for the same scope.
    """
    if not insights:
        return

    tenant_id = scope.tenant_id
    project_id = scope.project["entity_id"] if scope.project else None
    contract_id = scope.contract["entity_id"] if scope.contract else None
    sow_id = scope.sow["entity_id"] if scope.sow else None
    process_id = scope.process["entity_id"] if scope.process else None

    with pool.connection() as conn:
        with conn.cursor() as cur:
            for insight in insights:
                cur.execute(
                    """
                    SELECT 1
                    FROM dipgos.scm_insights
                    WHERE scope_level = %s
                      AND COALESCE(project_id::text, '') = COALESCE(%s::text, '')
                      AND COALESCE(contract_id::text, '') = COALESCE(%s::text, '')
                      AND COALESCE(sow_id::text, '') = COALESCE(%s::text, '')
                      AND COALESCE(process_id::text, '') = COALESCE(%s::text, '')
                      AND metric = %s
                      AND headline = %s
                      AND summary = %s
                      AND created_at > NOW() - INTERVAL '12 hours'
                    """,
                    (
                        scope_level,
                        project_id,
                        contract_id,
                        sow_id,
                        process_id,
                        insight.metric,
                        insight.headline,
                        insight.summary,
                    ),
                )
                if cur.fetchone():
                    continue

                cur.execute(
                    """
                    INSERT INTO dipgos.scm_insights (
                      id,
                      tenant_id,
                      project_id,
                      contract_id,
                      sow_id,
                      process_id,
                      scope_level,
                      metric,
                      headline,
                      summary,
                      details,
                      actions,
                      severity
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uuid4(),
                        tenant_id,
                        project_id,
                        contract_id,
                        sow_id,
                        process_id,
                        scope_level,
                        insight.metric,
                        insight.headline,
                        insight.summary,
                        json.dumps(insight.details or []),
                        json.dumps([action.model_dump() for action in insight.actions] if insight.actions else []),
                        insight.severity,
                    ),
                )


def get_process_canvas(
    tenant_id: Optional[str],
    project_code: Optional[str],
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ScmProcessCanvasResponse:
    if not process_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="processId is required")

    tenant_hint = progress_normalise_tenant(tenant_id or "default")
    scope = resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )
    if scope.process is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")

    process_id = scope.process["entity_id"]
    params = (process_id,)

    demand_rows = _fetch_rows(
        """
        SELECT
          d.id,
          d.status,
          d.priority,
          d.quantity_required,
          d.quantity_committed,
          d.needed_date,
          i.code AS item_code,
          COALESCE(i.description, i.code) AS item_name,
          i.unit,
          d.metadata
        FROM dipgos.scm_demand_items d
        JOIN dipgos.scm_items i ON i.id = d.item_id
        WHERE d.process_id = %s
        ORDER BY COALESCE(d.needed_date, CURRENT_DATE), d.priority NULLS LAST, i.code
        """,
        params,
    )

    requisition_rows = _fetch_rows(
        """
        SELECT
          r.id,
          r.requisition_code,
          r.status,
          r.requested_qty,
          r.approved_qty,
          r.needed_date,
          r.requester,
          r.approver,
          r.justification
        FROM dipgos.scm_requisitions r
        WHERE r.process_id = %s
        ORDER BY r.created_at DESC
        """,
        params,
    )

    purchase_rows = _fetch_rows(
        """
        SELECT
          p.id,
          p.po_number,
          p.supplier,
          p.status,
          p.ordered_qty,
          p.committed_value,
          p.currency,
          p.expected_date,
          p.actual_date
        FROM dipgos.scm_purchase_orders p
        WHERE p.process_id = %s
        ORDER BY p.created_at DESC
        """,
        params,
    )

    shipment_rows = _fetch_rows(
        """
        SELECT
          s.id,
          s.tracking_code,
          s.status,
          s.origin,
          s.destination,
          s.etd,
          s.eta,
          s.actual_arrival,
          s.carrier
        FROM dipgos.scm_shipments s
        WHERE s.process_id = %s
        ORDER BY COALESCE(s.eta, s.created_at) ASC
        """,
        params,
    )

    inventory_rows = _fetch_rows(
        """
        SELECT
          inv.id,
          inv.item_id,
          inv.location_label,
          inv.snapshot_date,
          inv.quantity_on_hand,
          inv.quantity_reserved,
          inv.quantity_available,
          inv.unit_cost,
          items.code AS item_code,
          COALESCE(items.description, items.code) AS item_name,
          items.unit
        FROM dipgos.scm_inventory_snapshots inv
        JOIN dipgos.scm_items items ON items.id = inv.item_id
        WHERE inv.process_id = %s OR (inv.process_id IS NULL AND inv.contract_id = %s)
        ORDER BY inv.snapshot_date DESC, items.code
        LIMIT 200
        """,
        (process_id, scope.contract["entity_id"] if scope.contract else None),
    )

    # Build requirement/input/output groupings and procurement lanes
    requirements: List[ScmCanvasCard] = []
    inputs: List[ScmCanvasCard] = []
    outputs: List[ScmCanvasCard] = []
    procurement_lanes: Dict[str, ScmCanvasLane] = {lane: ScmCanvasLane(title=label) for lane, label in LANE_DEFINITIONS}
    total_required = 0.0
    total_committed = 0.0
    inventory_value = 0.0
    risk_reasons: List[str] = []
    stage_map: Dict[str, List[ScmCanvasCard]] = defaultdict(list)
    stage_order: Dict[str, int] = {}
    today = date.today()

    def normalise_metadata(payload) -> Dict[str, object]:
        if isinstance(payload, dict):
            return payload
        return {}

    def register_stage(card: ScmCanvasCard):
        metadata = card.metadata or {}
        stage = metadata.get("stage")
        if not stage:
            return
        stage_map[stage].append(card)
        order_hint = metadata.get("stageOrder")
        if isinstance(order_hint, (int, float)):
            stage_order.setdefault(stage, int(order_hint))

    for row in demand_rows:
        total_required += float(row["quantity_required"] or 0)
        total_committed += float(row["quantity_committed"] or 0)
        needed = row["needed_date"]
        status_text = (row["status"] or "planned").lower()
        quantity_required = float(row["quantity_required"] or 0)
        quantity_committed = float(row["quantity_committed"] or 0)
        lag_days = (needed - today).days if needed else None
        risk_level = None
        if quantity_required > 0 and quantity_committed < quantity_required:
            if needed and lag_days is not None and lag_days <= 7:
                risk_level = "critical"
                risk_reasons.append(f"{row['item_code']} lacks commitment for need date {needed.isoformat()}")
            elif needed and lag_days is not None and lag_days <= 14:
                risk_level = "warning"
        metadata = normalise_metadata(row.get("metadata"))
        tags = metadata.get("tags", [])
        if not isinstance(tags, list):
            tags = []
        card = ScmCanvasCard(
            id=str(row["id"]),
            title=row["item_name"],
            subtitle=row["item_code"],
            status=status_text,
            quantity=quantity_required,
            unit=row["unit"],
            neededDate=needed,
            progress=(quantity_committed / quantity_required * 100) if quantity_required else None,
            risk=risk_level,
            tags=[tag for tag in tags if isinstance(tag, str)],
            metadata=metadata,
        )
        if status_text in {"planned", "requested", "draft"}:
            requirements.append(card)
        elif status_text in {"committed", "in_flight", "expediting"}:
            inputs.append(card)
        else:
            outputs.append(card)
        register_stage(card)

    for row in requisition_rows:
        metadata = normalise_metadata(row.get("metadata"))
        card = ScmCanvasCard(
            id=str(row["id"]),
            title=row["requisition_code"] or f"Requisition {row['id']}",
            subtitle=row.get("justification"),
            status=(row["status"] or "draft").lower(),
            quantity=float(row["requested_qty"] or 0),
            neededDate=row.get("needed_date"),
            tags=[value for value in [row.get("requester"), row.get("approver")] if value],
            metadata=metadata,
        )
        procurement_lanes["requisition"].cards.append(card)

    for row in purchase_rows:
        metadata = normalise_metadata(row.get("metadata"))
        quantity = float(row["ordered_qty"] or 0)
        value = float(row["committed_value"] or 0)
        eta = row.get("expected_date")
        risk_level = None
        if eta and eta < today and not row.get("actual_date"):
            risk_level = "warning"
        card = ScmCanvasCard(
            id=str(row["id"]),
            title=row["po_number"] or f"PO {row['id']}",
            subtitle=row.get("supplier"),
            status=(row["status"] or "draft").lower(),
            quantity=quantity,
            unit=row.get("currency"),
            neededDate=eta,
            risk=risk_level,
            tags=[f"${value:,.0f}"],
            metadata=metadata,
        )
        procurement_lanes["purchase_order"].cards.append(card)

    for row in shipment_rows:
        metadata = normalise_metadata(row.get("metadata"))
        eta = row.get("eta")
        risk_level = None
        if eta and eta < today and not row.get("actual_arrival"):
            risk_level = "critical"
            risk_reasons.append(f"Shipment {row['tracking_code']} overdue since {eta.isoformat()}")
        card = ScmCanvasCard(
            id=str(row["id"]),
            title=row["tracking_code"] or f"Shipment {row['id']}",
            subtitle=f"{row.get('origin') or 'Unknown'} → {row.get('destination') or 'Unknown'}",
            status=(row["status"] or "planned").lower(),
            eta=eta,
            tags=[value for value in [row.get("carrier")] if value],
            risk=risk_level,
            metadata=metadata,
        )
        procurement_lanes["shipment"].cards.append(card)
        register_stage(card)

    inventory_cards: List[ScmInventoryCard] = []
    for row in inventory_rows:
        unit_cost = float(row["unit_cost"] or 0)
        available = float(row["quantity_available"] or 0)
        inventory_value += unit_cost * available
        inventory_cards.append(
            ScmInventoryCard(
                id=str(row["id"]),
                itemCode=row["item_code"],
                itemName=row["item_name"],
                location=row.get("location_label"),
                onHand=float(row["quantity_on_hand"] or 0),
                reserved=float(row["quantity_reserved"] or 0),
                available=available,
                unitCost=unit_cost or None,
                snapshotDate=row["snapshot_date"],
            )
        )

    timeline_lanes: List[ScmCanvasLane] = []
    if stage_map:
        def lane_sort_key(stage: str) -> Tuple[int, str]:
            precedence = stage_order.get(stage, STAGE_PRECEDENCE.get(stage, 999))
            return precedence, stage

        for stage in sorted(stage_map.keys(), key=lane_sort_key):
            cards = stage_map[stage]
            cards_sorted = sorted(
                cards,
                key=lambda c: (
                    str(c.metadata.get("timeBucket")) if isinstance(c.metadata, dict) else "",
                    c.neededDate or date.max,
                    c.title,
                ),
            )
            timeline_lanes.append(ScmCanvasLane(title=stage, cards=cards_sorted))

    coverage_pct = (total_committed / total_required * 100) if total_required else 0.0
    risk_level = "normal"
    if risk_reasons:
        risk_level = "critical"
    elif coverage_pct < 90:
        risk_level = "warning"

    metrics = ScmProcessMetrics(
        coveragePct=round(coverage_pct, 2),
        requiredQty=round(total_required, 2),
        committedQty=round(total_committed, 2),
        openRequisitions=len([card for card in procurement_lanes["requisition"].cards if card.status not in {"approved", "closed"}]),
        openPurchaseOrders=len([card for card in procurement_lanes["purchase_order"].cards if card.status not in {"closed", "received"}]),
        openShipments=len([card for card in procurement_lanes["shipment"].cards if card.status not in {"delivered", "received"}]),
        inventoryValue=round(inventory_value, 2),
        riskLevel=risk_level,
        riskReasons=risk_reasons,
    )

    return ScmProcessCanvasResponse(
        generatedAt=datetime.now(timezone.utc),
        scope=ScmScopeInfo(
            level="process",
            id=str(scope.process["entity_id"]),
            code=scope.process["code"],
            name=scope.process["name"],
        ),
        requirements=requirements,
        inputs=inputs,
        outputs=outputs,
        timeline=timeline_lanes,
        procurement=[lane for lane in procurement_lanes.values()],
        logistics=procurement_lanes["shipment"].cards,
        inventory=inventory_cards,
        metrics=metrics,
    )


def get_process_stage_summary(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: str,
) -> ScmProcessStageResponse:
    tenant_hint = progress_normalise_tenant(tenant_id or "default")
    scope = resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )

    if scope.process is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")

    process_id = scope.process["entity_id"]

    demand_rows = _fetch_rows(
        """
        SELECT
          d.id,
          d.status,
          d.quantity_required,
          d.quantity_committed,
          d.needed_date,
          d.metadata,
          i.code AS item_code,
          COALESCE(i.description, i.code) AS item_name,
          i.unit,
          i.category
        FROM dipgos.scm_demand_items d
        JOIN dipgos.scm_items i ON i.id = d.item_id
        WHERE d.process_id = %s
        ORDER BY i.code
        """,
        (process_id,),
    )

    shipment_rows = _fetch_rows(
        """
        SELECT id, tracking_code, status, origin, destination, eta, metadata
        FROM dipgos.scm_shipments
        WHERE process_id = %s
        ORDER BY COALESCE(eta, CURRENT_DATE + INTERVAL '365 days') ASC
        """,
        (process_id,),
    )

    inventory_rows = _fetch_rows(
        """
        SELECT inv.id, inv.item_id, inv.location_label, inv.snapshot_date,
               inv.quantity_on_hand, inv.quantity_reserved, inv.quantity_available,
               inv.unit_cost,
               items.code AS item_code,
               COALESCE(items.description, items.code) AS item_name,
               items.unit
        FROM dipgos.scm_inventory_snapshots inv
        JOIN dipgos.scm_items items ON items.id = inv.item_id
        WHERE inv.process_id = %s
        ORDER BY inv.snapshot_date DESC
        LIMIT 40
        """,
        (process_id,),
    )

    stage_index = {stage: idx for idx, stage in enumerate(STAGE_ORDER)}

    aggregated: Dict[str, Dict[str, object]] = {}
    for stage in STAGE_ORDER:
        aggregated[stage] = {
            "node": ScmStageNode(
                id=stage,
                title=STAGE_LABELS.get(stage, stage.title()),
                status="ok",
            ),
            "risk": False,
        }

    def register_resource(stage: str, resource: ScmStageResource, risk: bool = False) -> None:
        entry = aggregated[stage]
        node: ScmStageNode = entry["node"]
        node.resources.append(resource)
        node.requiredTotal += resource.required
        node.committedTotal += resource.committed
        node.inTransitTotal += resource.inTransit
        node.availableTotal += resource.available
        if risk:
            entry["risk"] = True

    for row in demand_rows:
        stage = _stage_from_status(row.get("status"))
        metadata = row.get("metadata") or {}
        resource = ScmStageResource(
            id=str(row["id"]),
            resourceId=str(row["id"]),
            kind="demand",
            name=row.get("item_name") or "Demand item",
            code=row.get("item_code"),
            unit=row.get("unit"),
            stage=stage,
            status=row.get("status") or "planned",
            required=float(row.get("quantity_required") or 0),
            committed=float(row.get("quantity_committed") or 0),
            metadata=metadata if isinstance(metadata, dict) else {},
        )
        register_resource(stage, resource, risk=resource.committed < resource.required)

    for row in shipment_rows:
        status = (row.get("status") or "").lower()
        is_delayed = False
        eta = row.get("eta")
        if eta is not None:
            if isinstance(eta, datetime):
                eta_date = eta.date()
            else:
                eta_date = eta
            if eta_date < datetime.now(timezone.utc).date() and status not in {"delivered", "received"}:
                is_delayed = True
        metadata = row.get("metadata") or {}
        resource = ScmStageResource(
            id=str(row["id"]),
            resourceId=str(row["id"]),
            kind="shipment",
            name=row.get("tracking_code") or "Shipment",
            code=row.get("tracking_code"),
            stage="logistics",
            status=status or "in_transit",
            inTransit=1.0 if status not in {"delivered", "received"} else 0.0,
            metadata=metadata if isinstance(metadata, dict) else {},
            eta=eta,
        )
        register_resource("logistics", resource, risk=is_delayed)

    for row in inventory_rows:
        available = float(row.get("quantity_available") or 0)
        on_hand = float(row.get("quantity_on_hand") or 0)
        resource = ScmStageResource(
            id=str(row["id"]),
            resourceId=str(row["id"]),
            kind="inventory",
            name=row.get("item_name") or "Inventory",
            code=row.get("item_code"),
            unit=row.get("unit"),
            stage="on_site",
            status="available" if available > 0 else "reserved",
            required=0.0,
            committed=on_hand,
            available=available,
            metadata={"location": row.get("location_label")},
        )
        register_resource("on_site", resource)

    stages: List[ScmStageNode] = []
    for stage in STAGE_ORDER:
        entry = aggregated[stage]
        node: ScmStageNode = entry["node"]
        risk = entry["risk"]
        if risk:
            node.status = "warning"
        elif node.id == "logistics" and node.inTransitTotal > 0:
            node.status = "progress"
        elif node.resources:
            node.status = "ok"
        else:
            node.status = "idle"
        node.requiredTotal = round(node.requiredTotal, 2)
        node.committedTotal = round(node.committedTotal, 2)
        node.inTransitTotal = round(node.inTransitTotal, 2)
        node.availableTotal = round(node.availableTotal, 2)
        node.resources.sort(key=lambda res: (stage_index.get(res.stage, 0), res.name))
        stages.append(node)

    return ScmProcessStageResponse(
        generatedAt=datetime.now(timezone.utc),
        scope=ScmScopeInfo(
            level="process",
            id=str(scope.process["entity_id"]),
            code=scope.process["code"],
            name=scope.process["name"],
        ),
        stages=stages,
    )


def update_stage_transition(
    tenant_id: Optional[str],
    project_code: Optional[str],
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
    resource_id: str,
    stage: str,
) -> Dict[str, str]:
    stage_key = stage.lower()
    if stage_key not in STAGE_STATUS_UPDATE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported stage")

    tenant_hint = progress_normalise_tenant(tenant_id or "default")
    scope = resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, status, item_id, process_id, project_id, contract_id, sow_id
                FROM dipgos.scm_demand_items
                WHERE id = %s
                """,
                (resource_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

            desired_status = STAGE_STATUS_UPDATE[stage_key]
            current_status = (row["status"] or "").lower()
            if current_status == desired_status:
                return {"status": "ok", "message": "Stage unchanged"}

            cur.execute(
                """
                UPDATE dipgos.scm_demand_items
                   SET status = %s,
                       updated_at = NOW()
                 WHERE id = %s
                """,
                (desired_status, resource_id),
            )

            cur.execute(
                "SELECT code, description FROM dipgos.scm_items WHERE id = %s",
                (row["item_id"],),
            )
            item_info = cur.fetchone() or {}

    metadata = {
        "eventType": "scm.stage_transition",
        "resourceId": resource_id,
        "stage": stage_key,
        "previousStatus": current_status,
        "nextStatus": desired_status,
    }
    title = f"{item_info.get('description') or item_info.get('code') or 'Resource'} moved to {STAGE_LABELS.get(stage_key, stage_key.title())}"
    summary = (
        f"Stage changed from {current_status or 'unknown'} to {stage_key} for resource {item_info.get('code') or resource_id}."
    )
    _emit_alert(scope, "info", title, summary, metadata)

    return {"status": "ok", "message": "Stage updated"}


def get_scm_dashboard(
    scope_level: str,
    tenant_id: Optional[str],
    project_code: Optional[str],
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ScmDashboardResponse:
    scope_level = scope_level.lower()
    if scope_level not in SCOPE_COLUMN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scope level")

    tenant_hint = progress_normalise_tenant(tenant_id or "default")
    scope = resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )

    column = SCOPE_COLUMN[scope_level]
    if scope_level == "portfolio":
        target_value = scope.tenant_id or tenant_hint
        if target_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tenantId required for portfolio view")
    else:
        mapping = {
            "project": scope.project,
            "contract": scope.contract,
            "sow": scope.sow,
            "process": scope.process,
        }
        entity = mapping.get(scope_level)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{scope_level.title()} not found")
        target_value = entity["entity_id"]

    metrics = defaultdict(float)
    params = (target_value,)

    demand_totals = _fetch_rows(
        f"""
        SELECT
          COALESCE(SUM(quantity_required), 0) AS required_qty,
          COALESCE(SUM(quantity_committed), 0) AS committed_qty
        FROM dipgos.scm_demand_items
        WHERE {column} = %s
        """,
        params,
    )[0]

    financial_totals = _fetch_rows(
        f"""
        SELECT
          COALESCE(SUM(committed_value), 0) AS committed_value,
          COUNT(*) FILTER (WHERE status NOT IN ('closed','received')) AS open_po
        FROM dipgos.scm_purchase_orders
        WHERE {column} = %s
        """,
        params,
    )[0]

    shipment_totals = _fetch_rows(
        f"""
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('delivered','received')) AS open_shipments,
          COUNT(*) FILTER (WHERE eta < CURRENT_DATE AND status NOT IN ('delivered','received')) AS overdue_shipments
        FROM dipgos.scm_shipments
        WHERE {column} = %s
        """,
        params,
    )[0]

    inventory_totals = _fetch_rows(
        f"""
        SELECT
          COALESCE(SUM(quantity_available * COALESCE(unit_cost, 0)), 0) AS inventory_value
        FROM dipgos.scm_inventory_snapshots
        WHERE {column} = %s
        """,
        params,
    )[0]

    required_qty = float(demand_totals["required_qty"] or 0)
    committed_qty = float(demand_totals["committed_qty"] or 0)
    coverage_pct = (committed_qty / required_qty * 100) if required_qty else 0.0
    committed_value = float(financial_totals["committed_value"] or 0)
    open_po = int(financial_totals["open_po"] or 0)
    open_shipments = int(shipment_totals["open_shipments"] or 0)
    overdue_shipments = int(shipment_totals["overdue_shipments"] or 0)
    inventory_value = float(inventory_totals["inventory_value"] or 0)

    kpis = [
        ScmDashboardKpi(title="Demand coverage", value=round(coverage_pct, 2), unit="%", status="warning" if coverage_pct < 90 else "ok"),
        ScmDashboardKpi(title="Committed value", value=round(committed_value, 2), unit="USD"),
        ScmDashboardKpi(title="Open POs", value=float(open_po)),
        ScmDashboardKpi(title="Open shipments", value=float(open_shipments)),
        ScmDashboardKpi(title="Overdue shipments", value=float(overdue_shipments), status="critical" if overdue_shipments else "ok"),
        ScmDashboardKpi(title="Inventory value", value=round(inventory_value, 2), unit="USD"),
    ]

    demand_detail_rows = _fetch_rows(
        f"""
        SELECT d.id, d.status, d.quantity_required, d.quantity_committed, d.needed_date, d.process_id,
               i.code AS item_code, COALESCE(i.description, i.code) AS item_name, i.unit
        FROM dipgos.scm_demand_items d
        JOIN dipgos.scm_items i ON i.id = d.item_id
        WHERE {column} = %s
        ORDER BY COALESCE(d.needed_date, CURRENT_DATE) ASC
        LIMIT 24
        """,
        params,
    )

    po_detail_rows = _fetch_rows(
        f"""
        SELECT p.id, p.po_number, p.status, p.supplier, p.ordered_qty, p.committed_value, p.expected_date, p.process_id
        FROM dipgos.scm_purchase_orders p
        WHERE {column} = %s
        ORDER BY COALESCE(p.expected_date, CURRENT_DATE + INTERVAL '365 days') ASC
        LIMIT 24
        """,
        params,
    )

    shipment_detail_rows = _fetch_rows(
        f"""
        SELECT s.id, s.tracking_code, s.status, s.origin, s.destination, s.eta, s.actual_arrival, s.carrier, s.process_id,
               (CASE WHEN s.eta IS NOT NULL AND s.eta < CURRENT_DATE AND s.status NOT IN ('delivered','received') THEN TRUE ELSE FALSE END) AS overdue
        FROM dipgos.scm_shipments s
        WHERE {column} = %s
        ORDER BY COALESCE(s.eta, CURRENT_DATE + INTERVAL '365 days') ASC
        LIMIT 24
        """,
        params,
    )

    inventory_detail_rows = _fetch_rows(
        f"""
        SELECT id, item_id, location_label, snapshot_date, quantity_on_hand, quantity_reserved, quantity_available, unit_cost
        FROM dipgos.scm_inventory_snapshots
        WHERE {column} = %s
        ORDER BY snapshot_date DESC
        LIMIT 20
        """,
        params,
    )

    process_ids: List[str] = []
    for row in demand_detail_rows + po_detail_rows + shipment_detail_rows:
        if row.get("process_id"):
            process_ids.append(str(row["process_id"]))
    process_lookup = _fetch_process_lookup(process_ids)

    def process_label(row: Dict[str, object]) -> str:
        pid = row.get("process_id")
        if not pid:
            return ""
        info = process_lookup.get(str(pid))
        if not info:
            return ""
        return info.get("name") or info.get("code") or ""

    insights: List[ScmInsight] = []

    material_shortfalls = [
        row
        for row in demand_detail_rows
        if float(row["quantity_required"] or 0) > float(row["quantity_committed"] or 0)
    ]
    if material_shortfalls:
        severity = "critical" if coverage_pct < 60 else "warning"
        detail_messages = []
        for row in material_shortfalls[:6]:
            gap = float(row["quantity_required"] or 0) - float(row["quantity_committed"] or 0)
            detail_messages.append(
                f"{row['item_name']} · {process_label(row)} · short {gap:,.0f} {row['unit'] or ''} · need {row['needed_date'] or 'TBD'}"
            )
        summary = f"{len(material_shortfalls)} material lines are under-committed ({coverage_pct:.1f}% coverage)."
        insights.append(
            ScmInsight(
                metric="Demand coverage",
                headline="Material readiness at risk",
                summary=summary,
                severity=severity,
                details=detail_messages,
                actions=[
                    ScmInsightAction(label="Review procurement board", href="/atoms/scm"),
                    ScmInsightAction(label="Open Alarm Center", href="/alarms", description="Escalate to procurement lead"),
                ],
            )
        )
        _emit_alert(
            scope,
            severity,
            "Material readiness risk",
            summary,
            {
                "eventType": "scm.material_gap",
                "items": detail_messages,
                "coveragePct": coverage_pct,
            },
        )

    open_po_rows = [row for row in po_detail_rows if str(row.get("status", "")).lower() not in {"received", "closed"}]
    if open_po_rows:
        detail_messages = []
        for row in open_po_rows[:6]:
            detail_messages.append(
                f"{row['po_number']} · {process_label(row)} · {row['status']} · ${float(row['committed_value'] or 0):,.0f} · ETA {row['expected_date'] or 'TBD'}"
            )
        summary = f"{len(open_po_rows)} purchase orders are still open."
        insights.append(
            ScmInsight(
                metric="Open POs",
                headline="Open purchase orders",
                summary=summary,
                severity="warning" if open_po > 0 else "info",
                details=detail_messages,
                actions=[
                    ScmInsightAction(
                        label="Engage procurement team",
                        description="Confirm supplier commitments and delivery dates",
                        intent="engageProcurement",
                    ),
                ],
            )
        )
        if open_po > 0:
            _emit_alert(
                scope,
                "warning",
                "Open purchase orders",
                summary,
                {
                    "eventType": "scm.open_po",
                    "count": open_po,
                    "items": detail_messages,
                },
            )

    overdue_rows = [row for row in shipment_detail_rows if row.get("overdue")]
    if overdue_rows:
        detail_messages = []
        for row in overdue_rows[:6]:
            detail_messages.append(
                f"{row['tracking_code']} · {process_label(row)} · {row['origin']} → {row['destination']} · ETA {row['eta'] or 'TBD'}"
            )
        summary = f"{len(overdue_rows)} shipments have missed their promised ETA."
        insights.append(
            ScmInsight(
                metric="Overdue shipments",
                headline="Shipments overdue",
                summary=summary,
                severity="critical",
                details=detail_messages,
                actions=[
                    ScmInsightAction(label="Coordinate recovery plan", description="Engage logistics partner to expedite"),
                    ScmInsightAction(label="Open Alarm Center", href="/alarms"),
                ],
            )
        )
        _emit_alert(
            scope,
            "critical",
            "Logistics delay",
            summary,
            {
                "eventType": "scm.shipment_overdue",
                "count": len(overdue_rows),
                "shipments": detail_messages,
            },
        )

    if inventory_value > 0 and not inventory_detail_rows:
        inventory_messages = [
            "Inventory snapshots missing – update warehouse counts to maintain accuracy."
        ]
        insights.append(
            ScmInsight(
                metric="Inventory value",
                headline="Inventory data stale",
                summary="No recent inventory snapshots were found.",
                severity="warning",
                details=inventory_messages,
                actions=[
                    ScmInsightAction(label="Trigger inventory snapshot", description="Request updated counts from site warehouse"),
                ],
            )
        )

    try:
        _persist_insights(scope_level, scope, insights)
    except Exception:
        # Dashboard response should not fail because persistence failed – log and continue.
        logger.exception("Failed to persist SCM insights for scope %s", scope_level)

    return ScmDashboardResponse(
        generatedAt=datetime.now(timezone.utc),
        scope=_build_scope_info(scope_level, scope),
        kpis=kpis,
        totals={
            "requiredQty": round(required_qty, 2),
            "committedQty": round(committed_qty, 2),
            "committedValue": round(committed_value, 2),
            "inventoryValue": round(inventory_value, 2),
        },
        insights=insights,
    )


def engage_procurement_action(
    tenant_id: Optional[str],
    project_code: Optional[str],
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
    purchase_orders: List[Dict[str, object]],
    note: Optional[str] = None,
) -> Dict[str, object]:
    tenant_hint = progress_normalise_tenant(tenant_id or "default")
    scope = resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )
    if scope.contract is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="contractId is required for this action")

    po_summaries = []
    for entry in purchase_orders:
        number = str(entry.get("number") or entry.get("id") or entry.get("title") or "")
        status = str(entry.get("status") or "")
        eta = entry.get("eta") or entry.get("expectedDate")
        supplier = entry.get("supplier") or entry.get("vendor")
        value = entry.get("value") or entry.get("committedValue")
        po_summaries.append(
            {
                "number": number,
                "status": status,
                "eta": eta,
                "supplier": supplier,
                "value": value,
            }
        )

    if not po_summaries:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="purchaseOrders cannot be empty")

    headline = "Procurement follow-up required"
    contract_name = scope.contract.get("name") if scope.contract else ""
    summary = (
        f"Engage procurement on {len(po_summaries)} purchase order(s) for {contract_name or 'contract'} "
        f"to confirm supplier commitments and delivery."
    )

    metadata: Dict[str, object] = {
        "eventType": "scm.action.engage_procurement",
        "purchaseOrders": po_summaries,
    }
    if note:
        metadata["note"] = note

    alert_id = _emit_alert(
        scope,
        "warning",
        headline,
        summary,
        metadata,
    )

    return {
        "status": "ok",
        "alertId": alert_id,
        "message": "Procurement team engaged and alarm raised." if alert_id else "Procurement team engaged.",
    }
