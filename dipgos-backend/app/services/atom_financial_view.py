from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from psycopg.errors import UndefinedTable
from psycopg.rows import dict_row

from ..config import settings
from ..db import pool
from ..models import (
    AtomFinancialAllocation,
    AtomFinancialAllocationsPayload,
    AtomFinancialAvailableFilters,
    AtomFinancialBasisBreakdown,
    AtomFinancialFilterOption,
    AtomFinancialFilters,
    AtomFinancialFlags,
    AtomFinancialGroupingRow,
    AtomFinancialKpis,
    AtomFinancialRange,
    AtomFinancialReconciliation,
    AtomFinancialScopeBlock,
    AtomFinancialScopeInfo,
    AtomFinancialTrend,
    AtomFinancialTrendPoint,
    AtomFinancialViewResponse,
)
from .progress_v2 import (
    _normalise_tenant as progress_normalise_tenant,
    _resolve_scope as progress_resolve_scope,
    _Scope as ProgressScope,
)


def _ensure_feature_enabled() -> None:
    if not settings.feature_atom_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Atom Manager financial API is disabled")


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid date value {value}") from exc


def _normalise_hours(minutes: float) -> float:
    return round(minutes / 60.0, 4)


def _safe_div(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _scope_info_from_entity(level: str, entity: Optional[dict]) -> AtomFinancialScopeInfo:
    if not entity:
        return AtomFinancialScopeInfo(level=level, id=None, code=None, name=None)
    return AtomFinancialScopeInfo(
        level=level,
        id=str(entity.get("entity_id")) if entity.get("entity_id") else None,
        code=entity.get("code"),
        name=entity.get("name"),
    )


def _scope_info_from_row(level: str, row_key: str, rows: Sequence[dict]) -> AtomFinancialScopeInfo:
    for item in rows:
        meta = item.get(row_key)
        if meta:
            return AtomFinancialScopeInfo(
                level=level,
                id=meta.get("id"),
                code=meta.get("code"),
                name=meta.get("name"),
            )
    return AtomFinancialScopeInfo(level=level, id=None, code=None, name=None)


def _as_float(value: Optional[object]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_schedule_window(
    schedule_date: date,
    payload: Optional[dict],
    busy_minutes: float,
    idle_minutes: float,
) -> Tuple[Optional[datetime], Optional[datetime], Optional[str], Optional[str]]:
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None
    location_label: Optional[str] = None
    shift_label: Optional[str] = None

    if payload:
        time_slots = payload.get("timeSlots") or []
        for slot in time_slots:
            start_raw = slot.get("start")
            end_raw = slot.get("end")
            slot_location = slot.get("location")
            slot_shift = slot.get("shift")
            try:
                if start_raw:
                    parsed_start = datetime.combine(
                        schedule_date,
                        datetime.strptime(start_raw, "%H:%M").time(),
                        tzinfo=timezone.utc,
                    )
                else:
                    parsed_start = None
                if end_raw:
                    parsed_end = datetime.combine(
                        schedule_date,
                        datetime.strptime(end_raw, "%H:%M").time(),
                        tzinfo=timezone.utc,
                    )
                else:
                    parsed_end = None
            except ValueError:
                parsed_start = None
                parsed_end = None

            if parsed_start and (start_dt is None or parsed_start < start_dt):
                start_dt = parsed_start
            if parsed_end and (end_dt is None or parsed_end > end_dt):
                end_dt = parsed_end

            if not location_label and slot_location:
                location_label = slot_location
            if not shift_label and slot_shift:
                shift_label = slot_shift

    if start_dt is None and busy_minutes > 0:
        start_dt = datetime.combine(schedule_date, time(8, 0), tzinfo=timezone.utc)
    if start_dt is not None and end_dt is None and busy_minutes > 0:
        end_dt = start_dt + timedelta(minutes=busy_minutes + idle_minutes)

    return start_dt, end_dt, location_label, shift_label


DEFAULT_RATE_CARDS: Dict[str, Dict[str, float]] = {
    "d0000000-0000-0000-0000-000000000007": {"time_rate": 120.0, "unit_rate": 38.0},
    "d0000000-0000-0000-0000-000000000010": {"time_rate": 165.0, "unit_rate": 3.25},
}


def _fetch_dynamic_financial_rows(
    scope: ProgressScope,
    start_date: date,
    end_date: date,
) -> List[dict]:
    tenant_uuid = scope.tenant_id or scope.project.get("tenant_id")
    if tenant_uuid is None:
        return []

    filters: List[str] = []
    params: List = [tenant_uuid, scope.project["entity_id"], start_date, end_date]

    if scope.contract:
        filters.append("se.contract_id = %s")
        params.append(scope.contract["entity_id"])
    if scope.sow:
        filters.append("se.sow_id = %s")
        params.append(scope.sow["entity_id"])
    if scope.process:
        filters.append("se.process_id = %s")
        params.append(scope.process["entity_id"])

    filter_sql = ""
    if filters:
        filter_sql = " AND " + " AND ".join(filters)

    query = f"""
        SELECT
            sd.id AS daily_id,
            sd.schedule_date,
            sd.total_busy_minutes,
            sd.total_idle_minutes,
            sd.total_allocations,
            sd.volume_committed,
            sd.volume_unit,
            sd.notes AS daily_notes,
            sd.payload,
            sd.created_at AS daily_created_at,
            sd.updated_at AS daily_updated_at,
            se.id AS schedule_entry_id,
            se.status AS schedule_status,
            se.notes AS schedule_notes,
            se.milestone,
            se.criticality,
            se.percent_complete,
            se.planned_start,
            se.planned_finish,
            se.actual_start,
            se.actual_finish,
            se.contract_id,
            se.sow_id,
            se.process_id,
            se.project_id,
            process.code AS process_code,
            process.name AS process_name,
            sow.code AS sow_code,
            sow.name AS sow_name,
            contract.code AS contract_code,
            contract.name AS contract_name,
            project.code AS project_code,
            project.name AS project_name,
            atom.id AS atom_id,
            atom.name AS atom_name,
            atom.unit AS atom_unit,
            atom_type.id AS atom_type_id,
            atom_type.name AS atom_type_name,
            atom_type.category AS atom_category,
            rate.basis AS rate_basis,
            rate.time_rate,
            rate.unit_rate,
            rate.standby_rate,
            rate.overtime_multiplier,
            rate.surcharge_multiplier,
            rate.location AS rate_location,
            rate.shift AS rate_shift
        FROM dipgos.atom_schedule_daily sd
        JOIN dipgos.atom_schedule_entries se
          ON se.tenant_id = sd.tenant_id
         AND se.atom_id = sd.atom_id
         AND sd.schedule_date BETWEEN COALESCE(se.actual_start, se.planned_start, sd.schedule_date)
                                 AND COALESCE(se.actual_finish, se.planned_finish, sd.schedule_date)
        JOIN dipgos.entities process ON process.entity_id = se.process_id
        LEFT JOIN dipgos.entities sow ON sow.entity_id = se.sow_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = se.contract_id
        LEFT JOIN dipgos.entities project ON project.entity_id = se.project_id
        JOIN dipgos.atoms atom ON atom.id = sd.atom_id
        JOIN dipgos.atom_types atom_type ON atom_type.id = atom.atom_type_id
        LEFT JOIN LATERAL (
            SELECT
                fa.basis,
                fa.time_rate,
                fa.unit_rate,
                fa.standby_rate,
                fa.overtime_multiplier,
                fa.surcharge_multiplier,
                fa.location,
                fa.shift
            FROM dipgos.atom_financial_allocations fa
            WHERE fa.atom_id = sd.atom_id
              AND fa.tenant_id = sd.tenant_id
              AND (fa.process_id IS NULL OR fa.process_id = se.process_id)
            ORDER BY fa.allocation_date DESC NULLS LAST, fa.updated_at DESC NULLS LAST, fa.created_at DESC NULLS LAST
            LIMIT 1
        ) rate ON TRUE
        WHERE sd.tenant_id = %s
          AND se.project_id = %s
          AND sd.schedule_date BETWEEN %s AND %s
          {filter_sql}
        ORDER BY sd.schedule_date ASC, atom.name ASC
    """

    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                raw_rows = cur.fetchall()
    except UndefinedTable:
        return []

    results: List[dict] = []
    for row in raw_rows:
        schedule_date: date = row["schedule_date"]
        busy_minutes = float(row["total_busy_minutes"] or 0)
        idle_minutes = float(row["total_idle_minutes"] or 0)

        schedule_status_raw = (row.get("schedule_status") or "billable").strip()
        schedule_status = schedule_status_raw.lower()
        billable_minutes = busy_minutes
        non_billable_minutes = 0.0
        if schedule_status in {"standby", "idle", "non_billable"}:
            non_billable_minutes = busy_minutes
            billable_minutes = 0.0

        start_dt, end_dt, location_label, shift_label = _extract_schedule_window(
            schedule_date,
            row.get("payload"),
            busy_minutes,
            idle_minutes,
        )

        basis = (row.get("rate_basis") or "time").lower()
        time_rate = _as_float(row.get("time_rate"))
        unit_rate = _as_float(row.get("unit_rate"))
        standby_rate = _as_float(row.get("standby_rate"))
        overtime_multiplier = _as_float(row.get("overtime_multiplier")) or 1.0
        surcharge_multiplier = _as_float(row.get("surcharge_multiplier")) or 1.0

        rate_card = DEFAULT_RATE_CARDS.get(str(row["atom_id"]))
        if rate_card:
            if time_rate is None and rate_card.get("time_rate") is not None:
                time_rate = rate_card["time_rate"]
            if unit_rate is None and rate_card.get("unit_rate") is not None:
                unit_rate = rate_card["unit_rate"]

        planned_minutes: Optional[float] = None
        planned_start: Optional[date] = row.get("planned_start")
        planned_finish: Optional[date] = row.get("planned_finish")
        if planned_start:
            finish_date = planned_finish or planned_start
            if finish_date < planned_start:
                finish_date = planned_start
            planned_days = (finish_date - planned_start).days + 1
            typical_minutes = busy_minutes + idle_minutes
            if typical_minutes <= 0:
                typical_minutes = 480.0
            planned_minutes = float(planned_days) * float(typical_minutes)

        if location_label is None:
            location_label = row.get("rate_location") or row.get("process_name")
        if shift_label is None:
            shift_label = row.get("rate_shift") or "Day"

        volume_committed = _as_float(row.get("volume_committed"))
        quantity_value = volume_committed if volume_committed and volume_committed > 0 else None
        quantity_unit = row.get("volume_unit") if quantity_value else None

        if quantity_value:
            hours_reference = billable_minutes or busy_minutes
            if unit_rate is None and time_rate and quantity_value > 0 and hours_reference:
                unit_rate = ((hours_reference / 60.0) * time_rate) / quantity_value
            basis = "volume"

        planned_earned: Optional[float] = None
        if basis == "volume" and quantity_value and unit_rate:
            planned_earned = quantity_value * unit_rate * overtime_multiplier * surcharge_multiplier
        elif planned_minutes and time_rate:
            planned_earned = (planned_minutes / 60.0) * time_rate * overtime_multiplier * surcharge_multiplier

        notes_parts = []
        if row.get("schedule_notes"):
            notes_parts.append(row["schedule_notes"])
        if row.get("daily_notes"):
            notes_parts.append(row["daily_notes"])
        notes = " ".join(notes_parts) if notes_parts else None

        results.append(
            {
                "id": row["daily_id"],
                "atom_id": row["atom_id"],
                "basis": basis,
                "allocation_date": schedule_date,
                "start_ts": start_dt,
                "end_ts": end_dt,
                "busy_minutes": busy_minutes,
                "idle_minutes": idle_minutes,
                "billable_minutes": billable_minutes,
                "non_billable_minutes": non_billable_minutes,
                "quantity": quantity_value,
                "unit": quantity_unit or row.get("atom_unit"),
                "time_rate": time_rate,
                "unit_rate": unit_rate,
                "standby_rate": standby_rate,
                "overtime_multiplier": overtime_multiplier,
                "surcharge_multiplier": surcharge_multiplier,
                "location": location_label,
                "shift": shift_label,
                "status": schedule_status_raw or "billable",
                "notes": notes,
                "non_billable_reason": None,
                "sensor_condition": None,
                "planned_billable_minutes": planned_minutes or 0.0,
                "planned_earned": planned_earned,
                "created_at": row.get("daily_created_at"),
                "updated_at": row.get("daily_updated_at"),
                "atom_name": row.get("atom_name"),
                "atom_type_name": row.get("atom_type_name"),
                "atom_type_id": row.get("atom_type_id"),
                "atom_category": row.get("atom_category"),
                "contract_entity_id": row.get("contract_id"),
                "contract_code": row.get("contract_code"),
                "contract_name": row.get("contract_name"),
                "sow_entity_id": row.get("sow_id"),
                "sow_code": row.get("sow_code"),
                "sow_name": row.get("sow_name"),
                "process_entity_id": row.get("process_id"),
                "process_code": row.get("process_code"),
                "process_name": row.get("process_name"),
            }
        )

    return results


def _fetch_legacy_financial_rows(
    scope: ProgressScope,
    start_date: date,
    end_date: date,
) -> List[dict]:
    tenant_uuid = scope.tenant_id or scope.project.get("tenant_id")
    if tenant_uuid is None:
        return []

    params: List = [
        tenant_uuid,
        scope.project["entity_id"],
        start_date,
        end_date,
    ]
    where_clauses = [
        "a.tenant_id = %s",
        "a.project_id = %s",
        "a.allocation_date BETWEEN %s AND %s",
    ]
    if scope.contract:
        where_clauses.append("a.contract_id = %s")
        params.append(scope.contract["entity_id"])
    if scope.sow:
        where_clauses.append("a.sow_id = %s")
        params.append(scope.sow["entity_id"])
    if scope.process:
        where_clauses.append("a.process_id = %s")
        params.append(scope.process["entity_id"])

    query = f"""
        SELECT
            a.id,
            a.atom_id,
            a.basis,
            a.allocation_date,
            a.start_ts,
            a.end_ts,
            a.busy_minutes,
            a.idle_minutes,
            a.billable_minutes,
            a.non_billable_minutes,
            a.quantity,
            a.unit,
            a.time_rate,
            a.unit_rate,
            a.standby_rate,
            a.overtime_multiplier,
            a.surcharge_multiplier,
            a.location,
            a.shift,
            a.status,
            a.notes,
            a.non_billable_reason,
            a.sensor_condition,
            a.planned_billable_minutes,
            a.planned_earned,
            a.created_at,
            a.updated_at,
            atom.name AS atom_name,
            atom_type.name AS atom_type_name,
            atom_type.id AS atom_type_id,
            atom_type.category AS atom_category,
            contract.entity_id AS contract_entity_id,
            contract.code AS contract_code,
            contract.name AS contract_name,
            sow.entity_id AS sow_entity_id,
            sow.code AS sow_code,
            sow.name AS sow_name,
            process.entity_id AS process_entity_id,
            process.code AS process_code,
            process.name AS process_name
        FROM dipgos.atom_financial_allocations a
        JOIN dipgos.atoms atom ON atom.id = a.atom_id
        JOIN dipgos.atom_types atom_type ON atom_type.id = atom.atom_type_id
        LEFT JOIN dipgos.entities contract ON contract.entity_id = a.contract_id
        LEFT JOIN dipgos.entities sow ON sow.entity_id = a.sow_id
        LEFT JOIN dipgos.entities process ON process.entity_id = a.process_id
        WHERE {" AND ".join(where_clauses)}
        ORDER BY a.allocation_date ASC, a.start_ts NULLS LAST, a.id
    """

    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params)
                return list(cur.fetchall())
    except UndefinedTable:
        return []


def get_atom_financial_view(
    tenant_id: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
    atom_id: Optional[str],
    start_date_str: Optional[str],
    end_date_str: Optional[str],
    basis_filter: Optional[List[str]],
    location_filter: Optional[str],
    atom_type_filter: Optional[str],
    shift_filter: Optional[str],
    billable_filter: Optional[str],
    group_by: Optional[str],
) -> AtomFinancialViewResponse:
    _ensure_feature_enabled()

    tenant_hint = progress_normalise_tenant(tenant_id or "default")

    scope: ProgressScope = _resolve_scope_with_fallback(
        tenant_hint=tenant_hint,
        project_code=project_code,
        contract_code=contract_code,
        sow_code=sow_code,
        process_code=process_code,
    )

    start_date = _parse_date(start_date_str)
    end_date = _parse_date(end_date_str)

    today = date.today()
    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = end_date - timedelta(days=6)

    if start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="startDate must be before endDate")

    applied_basis_filter = [value.lower() for value in (basis_filter or []) if value]
    applied_location_filter = location_filter.strip() if location_filter else None
    applied_atom_type_filter = atom_type_filter.strip() if atom_type_filter else None
    applied_shift_filter = shift_filter.strip() if shift_filter else None
    applied_billable_filter = billable_filter.lower().strip() if billable_filter else None
    applied_group_by = group_by.strip() if group_by else None

    rows = _fetch_dynamic_financial_rows(scope, start_date, end_date)
    if rows:
        legacy_rows = _fetch_legacy_financial_rows(scope, start_date, end_date)
        if legacy_rows:
            seen_ids = {str(row.get("id")) for row in rows if row.get("id")}
            for legacy in legacy_rows:
                basis = (legacy.get("basis") or "").lower()
                if basis not in {"volume", "sensor"}:
                    continue
                legacy_id = str(legacy.get("id"))
                if legacy_id in seen_ids:
                    continue
                rows.append(legacy)
                seen_ids.add(legacy_id)
    else:
        rows = _fetch_legacy_financial_rows(scope, start_date, end_date)

    if not rows:
        return AtomFinancialViewResponse(
            generatedAt=datetime.now(timezone.utc),
            range=AtomFinancialRange(start=start_date, end=end_date, preset=None),
            scopeOrder=["project"],
            selectedAtomId=atom_id,
            selectedAtomName=None,
            filters=AtomFinancialFilters(
                basis=applied_basis_filter,
                location=applied_location_filter,
                atomType=applied_atom_type_filter,
                shift=applied_shift_filter,
                billable=applied_billable_filter,
                groupBy=applied_group_by,
            ),
            availableFilters=AtomFinancialAvailableFilters(),
            scopes={
                "project": AtomFinancialScopeBlock(
                    scope=_scope_info_from_entity("project", scope.project),
                    kpis=AtomFinancialKpis(),
                )
            },
        )

    computed_rows: List[dict] = []
    selected_atom_name: Optional[str] = None

    for row in rows:
        computed = _build_allocation(row)
        if applied_basis_filter and computed["basis"] not in applied_basis_filter:
            continue
        if applied_location_filter and (
            computed["allocation"].location or ""
        ).strip().lower() != applied_location_filter.strip().lower():
            continue
        if applied_atom_type_filter and str(computed["atom_type_id"]) != applied_atom_type_filter:
            continue
        if applied_shift_filter and (computed["allocation"].shift or "").strip().lower() != applied_shift_filter.lower():
            continue
        if applied_billable_filter == "billable" and not computed["billable"]:
            continue
        if applied_billable_filter == "non_billable" and computed["billable"]:
            continue

        if atom_id and str(computed["allocation"].atomId) == str(atom_id):
            selected_atom_name = computed["allocation"].atomName

        computed_rows.append(computed)

    if atom_id and selected_atom_name is None:
        # Atom filter supplied but no matching allocations after filters
        selected_atom_name = next(
            (row["atom_name"] for row in rows if str(row["atom_id"]) == str(atom_id)),
            None,
        )

    if not computed_rows:
        return AtomFinancialViewResponse(
            generatedAt=datetime.now(timezone.utc),
            range=AtomFinancialRange(start=start_date, end=end_date, preset=None),
            scopeOrder=["project"],
            selectedAtomId=atom_id,
            selectedAtomName=selected_atom_name,
            filters=AtomFinancialFilters(
                basis=applied_basis_filter,
                location=applied_location_filter,
                atomType=applied_atom_type_filter,
                shift=applied_shift_filter,
                billable=applied_billable_filter,
                groupBy=applied_group_by,
            ),
            availableFilters=AtomFinancialAvailableFilters(),
            scopes={
                "project": AtomFinancialScopeBlock(
                    scope=_scope_info_from_entity("project", scope.project),
                    kpis=AtomFinancialKpis(),
                )
            },
        )

    _mark_overlaps(computed_rows)

    available_filters = _build_available_filters(computed_rows)

    scope_blocks: Dict[str, AtomFinancialScopeBlock] = {}

    atom_scope_rows = (
        [row for row in computed_rows if atom_id and str(row["allocation"].atomId) == str(atom_id)]
        if atom_id
        else []
    )
    if atom_scope_rows:
        scope_blocks["atom"] = _build_scope_block(
            atom_scope_rows,
            _scope_info_from_row("atom", "atom_meta", atom_scope_rows),
            applied_group_by,
        )

    process_scope_rows = _filter_by_entity(computed_rows, "process_id", scope.process["entity_id"] if scope.process else None)
    if process_scope_rows:
        process_info = _scope_info_from_entity("process", scope.process) if scope.process else _scope_info_from_row(
            "process", "process_meta", process_scope_rows
        )
        scope_blocks["process"] = _build_scope_block(process_scope_rows, process_info, applied_group_by)

    sow_scope_rows = _filter_by_entity(computed_rows, "sow_id", scope.sow["entity_id"] if scope.sow else None)
    if sow_scope_rows:
        sow_info = _scope_info_from_entity("sow", scope.sow) if scope.sow else _scope_info_from_row(
            "sow", "sow_meta", sow_scope_rows
        )
        scope_blocks["sow"] = _build_scope_block(sow_scope_rows, sow_info, applied_group_by)

    contract_scope_rows = _filter_by_entity(
        computed_rows,
        "contract_id",
        scope.contract["entity_id"] if scope.contract else None,
    )
    if contract_scope_rows:
        contract_info = (
            _scope_info_from_entity("contract", scope.contract)
            if scope.contract
            else _scope_info_from_row("contract", "contract_meta", contract_scope_rows)
        )
        scope_blocks["contract"] = _build_scope_block(contract_scope_rows, contract_info, applied_group_by)

    # Project scope always exists
    scope_blocks["project"] = _build_scope_block(
        computed_rows,
        _scope_info_from_entity("project", scope.project),
        applied_group_by,
    )

    scope_order = ["atom", "process", "sow", "contract", "project"]
    scope_order = [key for key in scope_order if key in scope_blocks]

    return AtomFinancialViewResponse(
        generatedAt=datetime.now(timezone.utc),
        range=AtomFinancialRange(start=start_date, end=end_date, preset=None),
        scopeOrder=scope_order,
        selectedAtomId=atom_id,
        selectedAtomName=selected_atom_name,
        filters=AtomFinancialFilters(
            basis=applied_basis_filter,
            location=applied_location_filter,
            atomType=applied_atom_type_filter,
            shift=applied_shift_filter,
            billable=applied_billable_filter,
            groupBy=applied_group_by,
        ),
        availableFilters=available_filters,
        scopes=scope_blocks,
    )


def _filter_by_entity(rows: Sequence[dict], key: str, target_id: Optional[object]) -> List[dict]:
    if target_id:
        return [row for row in rows if row.get(key) == target_id]
    return list(rows)


def _build_available_filters(rows: Sequence[dict]) -> AtomFinancialAvailableFilters:
    basis_counter: Dict[str, int] = defaultdict(int)
    location_counter: Dict[str, int] = defaultdict(int)
    atom_type_counter: Dict[str, Dict[str, object]] = {}
    shift_counter: Dict[str, int] = defaultdict(int)
    status_counter: Dict[str, int] = defaultdict(int)

    for item in rows:
        allocation: AtomFinancialAllocation = item["allocation"]
        basis_counter[item["basis"]] += 1
        if allocation.location:
            location_counter[allocation.location] += 1
        atom_type_counter.setdefault(
            allocation.atomType,
            {"count": 0, "id": str(item["atom_type_id"]), "label": allocation.atomType},
        )["count"] += 1
        if allocation.shift:
            shift_counter[allocation.shift] += 1
        if allocation.status:
            status_counter[allocation.status] += 1

    def _format_options(counter: Dict[str, int]) -> List[AtomFinancialFilterOption]:
        return [
            AtomFinancialFilterOption(id=label, label=label, count=count)
            for label, count in sorted(counter.items(), key=lambda item: item[0])
        ]

    atom_type_options = [
        AtomFinancialFilterOption(id=str(meta["id"]), label=str(meta["label"]), count=int(meta["count"]))
        for meta in atom_type_counter.values()
    ]
    atom_type_options.sort(key=lambda option: option.label)

    return AtomFinancialAvailableFilters(
        basis=[
            AtomFinancialFilterOption(id=label, label=label.title(), count=count)
            for label, count in sorted(basis_counter.items(), key=lambda item: item[0])
        ],
        locations=_format_options(location_counter),
        atomTypes=atom_type_options,
        shifts=_format_options(shift_counter),
        statuses=_format_options(status_counter),
    )


def _build_scope_block(
    rows: Sequence[dict],
    scope_info: AtomFinancialScopeInfo,
    group_by: Optional[str],
) -> AtomFinancialScopeBlock:
    total_busy_minutes = sum(item["busy_minutes"] for item in rows)
    total_idle_minutes = sum(item["idle_minutes"] for item in rows)
    total_billable_minutes = sum(item["billable_minutes"] for item in rows)
    total_non_billable_minutes = sum(item["non_billable_minutes"] for item in rows)

    total_time_earned = sum(item["earned_time"] for item in rows)
    total_volume_earned = sum(item["earned_volume"] for item in rows if item["basis"] == "volume")
    total_sensor_earned = sum(item["earned_time"] for item in rows if item["basis"] == "sensor")
    total_earned = sum(item["earned_total"] for item in rows)
    total_volume_billed = sum(item["volume_billed"] for item in rows)

    utilization_pct = (
        _safe_div(total_busy_minutes, total_busy_minutes + total_idle_minutes) * 100.0
        if (total_busy_minutes + total_idle_minutes) > 0
        else 0.0
    )
    average_rate = None
    if total_billable_minutes > 0:
        average_rate = total_time_earned / (total_billable_minutes / 60.0)

    basis_breakdown = _compute_basis_breakdown(rows)
    groupings = _compute_groupings(rows, group_by)
    trend = _compute_trend(rows)
    reconciliation = _compute_reconciliation(rows, total_earned, total_billable_minutes)
    flags = _compute_flags(rows)

    allocations_payload = AtomFinancialAllocationsPayload(
        items=[item["allocation"] for item in rows],
        total=len(rows),
    )

    kpis = AtomFinancialKpis(
        busyHours=_normalise_hours(total_busy_minutes),
        idleHours=_normalise_hours(total_idle_minutes),
        billableHours=_normalise_hours(total_billable_minutes),
        nonBillableHours=_normalise_hours(total_non_billable_minutes),
        utilizationPct=round(utilization_pct, 2),
        earned=round(total_earned, 2),
        timeEarned=round(total_time_earned, 2),
        volumeEarned=round(total_volume_earned, 2),
        sensorEarned=round(total_sensor_earned, 2),
        averageRate=round(average_rate, 2) if average_rate is not None else None,
        volumeBilled=round(total_volume_billed, 3),
    )

    return AtomFinancialScopeBlock(
        scope=scope_info,
        kpis=kpis,
        basisBreakdown=basis_breakdown,
        groupings=groupings,
        trend=trend,
        reconciliation=reconciliation,
        allocations=allocations_payload,
        flags=flags,
    )


def _compute_basis_breakdown(rows: Sequence[dict]) -> List[AtomFinancialBasisBreakdown]:
    by_basis: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    counts: Dict[str, int] = defaultdict(int)
    for item in rows:
        basis = item["basis"]
        counts[basis] += 1
        by_basis[basis]["earned"] += item["earned_total"]
        by_basis[basis]["busy_minutes"] += item["busy_minutes"]
        by_basis[basis]["idle_minutes"] += item["idle_minutes"]
        by_basis[basis]["billable_minutes"] += item["billable_minutes"]
        if basis == "volume" and item["billable"]:
            by_basis[basis]["volume"] += item.get("quantity") or 0.0

    breakdown: List[AtomFinancialBasisBreakdown] = []
    for basis, metrics in by_basis.items():
        busy = metrics["busy_minutes"]
        idle = metrics["idle_minutes"]
        utilization = _safe_div(busy, busy + idle) * 100.0 if (busy + idle) else 0.0
        breakdown.append(
            AtomFinancialBasisBreakdown(
                basis=basis,
                earned=round(metrics["earned"], 2),
                billableHours=_normalise_hours(metrics["billable_minutes"]),
                busyHours=_normalise_hours(busy),
                idleHours=_normalise_hours(idle),
                utilizationPct=round(utilization, 2),
                volume=round(metrics.get("volume", 0.0), 3) if basis == "volume" else None,
                allocationCount=counts[basis],
            )
        )
    breakdown.sort(key=lambda item: item.basis)
    return breakdown


def _compute_groupings(rows: Sequence[dict], group_by: Optional[str]) -> Dict[str, List[AtomFinancialGroupingRow]]:
    grouping_definitions = {
        "process": ("process_meta", "process_id", "process_code", "process_name"),
        "atomType": ("atom_type_meta", "atom_type_id", None, "atom_type_name"),
        "location": ("location_meta", "location_key", None, "location_label"),
        "shift": ("shift_meta", "shift_key", None, "shift_label"),
    }

    results: Dict[str, List[AtomFinancialGroupingRow]] = {}
    for key, meta in grouping_definitions.items():
        entries = _aggregate_group(rows, key, meta)
        if entries:
            results[key] = entries

    if group_by and group_by not in results:
        # Provide bucket even if empty so UI can maintain selection
        results[group_by] = []

    return results


def _aggregate_group(
    rows: Sequence[dict],
    grouping_key: str,
    meta: tuple,
) -> List[AtomFinancialGroupingRow]:
    meta_field, id_key, code_key, label_key = meta
    aggregates: Dict[str, Dict[str, object]] = {}

    for item in rows:
        meta_info = item.get(meta_field)
        if meta_field == "location_meta":
            label = item["allocation"].location
            if not label:
                continue
            group_id = label
            code = label
            name = label
        elif meta_field == "shift_meta":
            label = item["allocation"].shift
            if not label:
                continue
            group_id = label
            code = label
            name = label
        elif meta_field == "atom_type_meta":
            group_id = str(item["atom_type_id"])
            name = item["allocation"].atomType
            code = item["allocation"].atomType
            if not group_id:
                continue
        else:  # process meta
            if not meta_info:
                continue
            group_id = str(meta_info.get("id"))
            code = meta_info.get("code") or group_id
            name = meta_info.get("name") or code

        bucket = aggregates.setdefault(
            group_id,
            {
                "code": code,
                "name": name,
                "earned": 0.0,
                "billable_minutes": 0.0,
                "busy_minutes": 0.0,
                "idle_minutes": 0.0,
                "volume": 0.0,
                "atoms": set(),
                "count": 0,
            },
        )
        bucket["earned"] += item["earned_total"]
        bucket["billable_minutes"] += item["billable_minutes"]
        bucket["busy_minutes"] += item["busy_minutes"]
        bucket["idle_minutes"] += item["idle_minutes"]
        if item["basis"] == "volume" and item["billable"]:
            bucket["volume"] += item.get("quantity") or 0.0
        bucket["atoms"].add(item["allocation"].atomId)
        bucket["count"] += 1

    result: List[AtomFinancialGroupingRow] = []
    for group_id, data in aggregates.items():
        busy = float(data["busy_minutes"])
        idle = float(data["idle_minutes"])
        utilization = _safe_div(busy, busy + idle) * 100.0 if (busy + idle) else 0.0
        result.append(
            AtomFinancialGroupingRow(
                key=group_id,
                code=data["code"],
                name=data["name"],
                earned=round(float(data["earned"]), 2),
                billableHours=_normalise_hours(float(data["billable_minutes"])),
                busyHours=_normalise_hours(busy),
                idleHours=_normalise_hours(idle),
                utilizationPct=round(utilization, 2),
                volume=round(float(data["volume"]), 3) if float(data["volume"]) else None,
                atomCount=len(data["atoms"]),
                allocationCount=data["count"],
            )
        )

    result.sort(key=lambda entry: entry.earned, reverse=True)
    return result


def _compute_trend(rows: Sequence[dict]) -> AtomFinancialTrend:
    day_buckets: Dict[date, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for item in rows:
        allocation_date: date = item["allocation"].allocationDate
        bucket = day_buckets[allocation_date]
        bucket["earned"] += item["earned_total"]
        bucket["billable_minutes"] += item["billable_minutes"]
        bucket["busy_minutes"] += item["busy_minutes"]
        bucket["idle_minutes"] += item["idle_minutes"]

    earned_points: List[AtomFinancialTrendPoint] = []
    utilization_points: List[AtomFinancialTrendPoint] = []

    for day in sorted(day_buckets.keys()):
        metrics = day_buckets[day]
        busy = metrics["busy_minutes"]
        idle = metrics["idle_minutes"]
        util_pct = _safe_div(busy, busy + idle) * 100.0 if (busy + idle) else 0.0
        point = AtomFinancialTrendPoint(
            date=day,
            earned=round(metrics["earned"], 2),
            billableHours=_normalise_hours(metrics["billable_minutes"]),
            busyHours=_normalise_hours(busy),
            idleHours=_normalise_hours(idle),
            utilizationPct=round(util_pct, 2),
        )
        earned_points.append(point)
        utilization_points.append(point)

    return AtomFinancialTrend(
        earnedVsBillable=earned_points,
        utilization=utilization_points,
    )


def _compute_reconciliation(
    rows: Sequence[dict],
    actual_earned: float,
    total_billable_minutes: float,
) -> AtomFinancialReconciliation:
    planned_earned = sum((row.get("planned_earned") or 0.0) for row in rows)
    planned_minutes = sum((row.get("planned_billable_minutes") or 0.0) for row in rows)
    variance = actual_earned - planned_earned
    variance_pct = None
    if planned_earned:
        variance_pct = (actual_earned / planned_earned) - 1.0
    messages: List[str] = []
    if not planned_earned:
        messages.append("No planned earned value provided for this scope.")
    return AtomFinancialReconciliation(
        plannedEarned=round(planned_earned, 2),
        actualEarned=round(actual_earned, 2),
        variance=round(variance, 2),
        variancePct=round(variance_pct, 4) if variance_pct is not None else None,
        plannedHours=_normalise_hours(planned_minutes) if planned_minutes else None,
        actualHours=_normalise_hours(total_billable_minutes) if total_billable_minutes else None,
        messages=messages,
    )


def _compute_flags(rows: Sequence[dict]) -> AtomFinancialFlags:
    missing_rates: List[str] = []
    zero_duration: List[str] = []
    overlaps: List[str] = []
    highlights: List[str] = []

    for item in rows:
        allocation: AtomFinancialAllocation = item["allocation"]
        if item.get("missing_rate"):
            missing_rates.append(allocation.allocationId)
        if item.get("zero_duration"):
            zero_duration.append(allocation.allocationId)
        if allocation.overlap:
            overlaps.append(allocation.allocationId)
        if allocation.nonBillableReason:
            highlights.append(f"{allocation.atomName}: {allocation.nonBillableReason}")

    return AtomFinancialFlags(
        missingRates=missing_rates,
        zeroDuration=zero_duration,
        overlaps=overlaps,
        highlights=highlights,
    )


def _mark_overlaps(rows: List[dict]) -> None:
    per_atom: Dict[str, List[dict]] = defaultdict(list)
    for item in rows:
        allocation: AtomFinancialAllocation = item["allocation"]
        if allocation.start and allocation.end:
            per_atom[str(allocation.atomId)].append(item)

    for atom_rows in per_atom.values():
        atom_rows.sort(key=lambda entry: entry["allocation"].start)
        last_end: Optional[datetime] = None
        last_item: Optional[dict] = None
        for entry in atom_rows:
            start = entry["allocation"].start
            end = entry["allocation"].end
            if start is None or end is None:
                continue
            if last_end and start < last_end:
                entry["allocation"].overlap = True
                entry["overlap"] = True
                if last_item:
                    last_item["allocation"].overlap = True
                    last_item["overlap"] = True
            if end and (last_end is None or end > last_end):
                last_end = end
                last_item = entry


def _build_allocation(row: dict) -> dict:
    busy_minutes = int(row.get("busy_minutes") or 0)
    idle_minutes = int(row.get("idle_minutes") or 0)
    billable_minutes = int(row.get("billable_minutes") or 0)
    non_billable_minutes = int(row.get("non_billable_minutes") or 0)
    quantity = row.get("quantity")
    quantity_value = float(quantity) if quantity is not None else None

    time_rate = row.get("time_rate")
    time_rate_value = float(time_rate) if time_rate is not None else None
    unit_rate = row.get("unit_rate")
    unit_rate_value = float(unit_rate) if unit_rate is not None else None
    standby_rate = row.get("standby_rate")
    standby_rate_value = float(standby_rate) if standby_rate is not None else None

    overtime_multiplier = float(row.get("overtime_multiplier") or 1.0)
    surcharge_multiplier = float(row.get("surcharge_multiplier") or 1.0)
    multiplier = overtime_multiplier * surcharge_multiplier

    status_raw = row.get("status") or ""
    status_key = status_raw.strip().lower()

    basis = (row.get("basis") or "time").lower()

    rate_to_use = time_rate_value
    if status_key == "standby" and standby_rate_value:
        rate_to_use = standby_rate_value

    billable = False
    earned_time = 0.0
    earned_volume = 0.0

    if basis in {"time", "sensor"}:
        if billable_minutes > 0 and rate_to_use:
            billable = True
            earned_time = (billable_minutes / 60.0) * rate_to_use * multiplier
    elif basis == "volume":
        if quantity_value and unit_rate_value:
            billable = True
            earned_volume = quantity_value * unit_rate_value * multiplier

    if status_key in {"non_billable", "idle"} or non_billable_minutes > 0:
        billable = False
        earned_time = 0.0
        earned_volume = 0.0

    earned_total = earned_time + earned_volume

    rate_unit = None
    effective_rate = None
    if basis in {"time", "sensor"}:
        rate_unit = "hour"
        if billable_minutes > 0:
            effective_rate = (earned_time / (billable_minutes / 60.0)) if billable_minutes else rate_to_use
        else:
            effective_rate = rate_to_use
    elif basis == "volume":
        rate_unit = row.get("unit") or "unit"
        effective_rate = unit_rate_value

    if not billable:
        effective_rate = None

    formula_parts: List[str] = []
    if basis in {"time", "sensor"} and billable_minutes > 0 and rate_to_use:
        formula_parts.append(f"{billable_minutes / 60.0:.2f}h × ${rate_to_use:.2f}/h")
        if not math.isclose(multiplier, 1.0):
            formula_parts.append(f"× {multiplier:.2f}")
        formula_parts.append(f"= ${earned_time:.2f}")
    elif basis == "volume" and quantity_value and unit_rate_value:
        unit_label = rate_unit or "unit"
        formula_parts.append(f"{quantity_value:.2f} {unit_label} × ${unit_rate_value:.2f}/{unit_label}")
        if not math.isclose(multiplier, 1.0):
            formula_parts.append(f"× {multiplier:.2f}")
        formula_parts.append(f"= ${earned_volume:.2f}")
    formula = " ".join(formula_parts) if formula_parts else None

    allocation = AtomFinancialAllocation(
        id=str(row["id"]),
        allocationDate=row["allocation_date"],
        atomId=str(row["atom_id"]),
        atomName=row.get("atom_name"),
        atomType=row.get("atom_type_name"),
        atomCategory=row.get("atom_category"),
        contractCode=row.get("contract_code"),
        sowCode=row.get("sow_code"),
        processCode=row.get("process_code"),
        processName=row.get("process_name"),
        basis=basis,
        start=row.get("start_ts"),
        end=row.get("end_ts"),
        busyHours=_normalise_hours(busy_minutes),
        idleHours=_normalise_hours(idle_minutes),
        billableHours=_normalise_hours(billable_minutes),
        nonBillableHours=_normalise_hours(non_billable_minutes),
        quantity=quantity_value,
        quantityUnit=row.get("unit"),
        rate=round(effective_rate, 2) if effective_rate is not None else None,
        rateUnit=rate_unit,
        standbyRate=round(standby_rate_value, 2) if standby_rate_value else None,
        overtimeMultiplier=overtime_multiplier if not math.isclose(overtime_multiplier, 1.0) else None,
        surchargeMultiplier=surcharge_multiplier if not math.isclose(surcharge_multiplier, 1.0) else None,
        earned=round(earned_total, 2),
        plannedEarned=float(row.get("planned_earned") or 0.0) if row.get("planned_earned") is not None else None,
        utilizationPct=round(
            _safe_div(busy_minutes, busy_minutes + idle_minutes) * 100.0,
            2,
        )
        if (busy_minutes + idle_minutes)
        else None,
        location=row.get("location"),
        shift=row.get("shift"),
        status=status_raw or None,
        notes=row.get("notes"),
        nonBillableReason=row.get("non_billable_reason"),
        sensorCondition=row.get("sensor_condition"),
        billable=billable,
        overlap=False,
        formula=formula,
        tags=_build_tags(basis, status_key, billable, multiplier),
    )

    computed = {
        "allocation": allocation,
        "basis": basis,
        "busy_minutes": float(busy_minutes),
        "idle_minutes": float(idle_minutes),
        "billable_minutes": float(billable_minutes),
        "non_billable_minutes": float(non_billable_minutes),
        "quantity": quantity_value or 0.0,
        "earned_time": float(earned_time),
        "earned_volume": float(earned_volume),
        "earned_total": float(earned_total),
        "billable": billable,
        "volume_billed": float(quantity_value or 0.0) if basis == "volume" and billable else 0.0,
        "planned_earned": float(row.get("planned_earned") or 0.0),
        "planned_billable_minutes": float(row.get("planned_billable_minutes") or 0.0),
        "multiplier": multiplier,
        "atom_type_id": row.get("atom_type_id"),
        "process_id": row.get("process_entity_id"),
        "sow_id": row.get("sow_entity_id"),
        "contract_id": row.get("contract_entity_id"),
        "atom_meta": {
            "id": str(row.get("atom_id")),
            "code": str(row.get("atom_name")),
            "name": row.get("atom_name"),
        },
        "process_meta": {
            "id": str(row.get("process_entity_id")) if row.get("process_entity_id") else None,
            "code": row.get("process_code"),
            "name": row.get("process_name"),
        }
        if row.get("process_entity_id")
        else None,
        "sow_meta": {
            "id": str(row.get("sow_entity_id")) if row.get("sow_entity_id") else None,
            "code": row.get("sow_code"),
            "name": row.get("sow_name"),
        }
        if row.get("sow_entity_id")
        else None,
        "contract_meta": {
            "id": str(row.get("contract_entity_id")) if row.get("contract_entity_id") else None,
            "code": row.get("contract_code"),
            "name": row.get("contract_name"),
        }
        if row.get("contract_entity_id")
        else None,
        "location_meta": {"id": allocation.location, "label": allocation.location} if allocation.location else None,
        "shift_meta": {"id": allocation.shift, "label": allocation.shift} if allocation.shift else None,
        "atom_type_meta": {
            "id": str(row.get("atom_type_id")),
            "name": allocation.atomType,
        },
        "missing_rate": bool(billable and basis in {"time", "sensor"} and not rate_to_use)
        or bool(basis == "volume" and billable and not unit_rate_value),
        "zero_duration": bool((busy_minutes + idle_minutes) == 0),
        "overlap": False,
    }
    return computed


def _build_tags(basis: str, status_key: str, billable: bool, multiplier: float) -> List[str]:
    tags: List[str] = []
    if basis == "sensor":
        tags.append("Sensor billed")
    if status_key == "standby":
        tags.append("Standby")
    if not billable:
        tags.append("Non-billable")
    if multiplier and not math.isclose(multiplier, 1.0):
        tags.append(f"Multiplier ×{multiplier:.2f}")
    return tags


def _resolve_scope_with_fallback(
    tenant_hint: Optional[str],
    project_code: str,
    contract_code: Optional[str],
    sow_code: Optional[str],
    process_code: Optional[str],
) -> ProgressScope:
    """Resolve scope but degrade gracefully when granular identifiers are missing."""

    current_contract = contract_code
    current_sow = sow_code
    current_process = process_code

    while True:
        try:
            return progress_resolve_scope(
                tenant_hint,
                project_code,
                current_contract,
                current_sow,
                current_process,
            )
        except HTTPException as exc:  # pragma: no cover - network path
            detail = str(exc.detail or "").lower()
            if exc.status_code != status.HTTP_404_NOT_FOUND:
                raise

            if current_process and "process not found" in detail:
                current_process = None
                continue

            if current_sow and "sow not found" in detail:
                current_sow = None
                current_process = None
                continue

            if current_contract and "contract not found" in detail:
                current_contract = None
                current_sow = None
                current_process = None
                continue

            # If project scope itself is missing just bubble the error.
            raise
