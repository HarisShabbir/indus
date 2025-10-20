from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.db import pool
from app.services.ccc import clear_ccc_cache

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_flag():
    original = settings.feature_ccc_v2
    settings.feature_ccc_v2 = True
    yield
    settings.feature_ccc_v2 = original
    clear_ccc_cache()


@pytest.fixture
def conn():
    with pool.connection() as connection:
        with connection.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
        try:
            yield connection
        finally:
            connection.rollback()


def _ensure_scope(conn):
    project_id = "ccc-project"
    contract_id = "ccc-contract"
    sow_id = "ccc-sow"
    process_id = "ccc-process"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO dipgos.projects (id, name, lat, lng, status_pct, phase, alerts, metadata)
            VALUES (%s, %s, 35.0, 74.0, 50.0, 'Construction', 2, '{"tenant_id":"default"}')
            ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata
            """,
            (project_id, "CCC Project"),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contracts (id, project_id, name, phase, discipline, lat, lng, status_pct, status_label, alerts)
            VALUES (%s, %s, %s, 'Construction', 'Civil', 35.1, 74.1, 55.0, 'Construction', 1)
            ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id
            """,
            (contract_id, project_id, "MW-01 Main Dam"),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contract_sows (id, contract_id, title, status, progress, sequence)
            VALUES (%s, %s, %s, 'In Progress', 45.0, 1)
            ON CONFLICT (id) DO UPDATE SET contract_id = EXCLUDED.contract_id
            """,
            (sow_id, contract_id, "RCC Facilities"),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
            VALUES (%s, %s, %s, 'In Progress', 'Team', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '45 days', 40.0, 1)
            ON CONFLICT (id) DO UPDATE SET sow_id = EXCLUDED.sow_id
            """,
            (process_id, sow_id, "Batching Plant"),
        )
    conn.commit()
    return project_id, contract_id, sow_id, process_id


def _insert_metric(
    conn,
    project_id: str,
    contract_id: str,
    sow_id: str,
    process_id: str,
    metric: str,
    actual: float,
    planned: float | None,
    day_offset: int = 0,
):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO dipgos.kpi_fact (
                scope_level,
                project_id,
                contract_id,
                sow_id,
                process_id,
                metric_code,
                ts_date,
                actual_numeric,
                planned_numeric
            )
            VALUES ('process', %s, %s, %s, %s, %s, CURRENT_DATE - %s * INTERVAL '1 day', %s, %s)
            ON CONFLICT (process_id, metric_code, ts_date) DO UPDATE
                SET actual_numeric = EXCLUDED.actual_numeric,
                    planned_numeric = COALESCE(EXCLUDED.planned_numeric, dipgos.kpi_fact.planned_numeric)
            """,
            (
                project_id,
                contract_id,
                sow_id,
                process_id,
                metric,
                day_offset,
                actual,
                planned,
            ),
        )
    conn.commit()


def _seed_metrics(conn, project_id: str, contract_id: str, sow_id: str, process_id: str) -> None:
    for offset, actual, planned in [
        (2, 40.0, 42.0),
        (1, 48.0, 50.0),
        (0, 55.0, 53.0),
    ]:
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "prod_actual_pct", actual, planned, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "prod_planned_pct", planned or actual, planned, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "design_output", actual, planned, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "prep_output", actual - 5, planned - 5, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "const_output", actual - 7, planned - 6, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "ev", 1_000_000 + offset * 10_000, None, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "pv", 950_000 + offset * 8_000, None, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "ac", 900_000 + offset * 9_500, None, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "spi", 0.95 + offset * 0.01, None, offset)
        _insert_metric(conn, project_id, contract_id, sow_id, process_id, "cpi", 1.05 - offset * 0.01, None, offset)


def test_summary_endpoint_returns_wip_and_map(conn):
    project_id, contract_id, sow_id, process_id = _ensure_scope(conn)
    _seed_metrics(conn, project_id, contract_id, sow_id, process_id)

    response = client.get(
        "/api/v2/ccc/summary",
        params={"tenantId": "default", "projectId": project_id, "contractId": contract_id, "sowId": sow_id},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["selection"]["project_id"] == project_id
    assert payload["map"], "expected map markers"
    assert payload["wip"], "expected wip dials"
    assert any(dial["level"] == "contract" for dial in payload["wip"])
    assert any(marker["type"] in {"contract", "sow"} for marker in payload["map"])


def test_right_panel_endpoint_returns_cards(conn):
    project_id, contract_id, sow_id, process_id = _ensure_scope(conn)
    _seed_metrics(conn, project_id, contract_id, sow_id, process_id)

    response = client.get(
        "/api/v2/ccc/kpis/right-panel",
        params={"tenantId": "default", "projectId": project_id, "contractId": contract_id},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["selection"]["contract_id"] == contract_id
    assert payload["physical"]["trend_actual"], "expected physical sparkline"
    assert payload["work_output"]["items"], "expected work output items"
    assert payload["work_in_progress"]["categories"], "expected categories"
    assert "count" in payload["work_in_progress"]["categories"][0]
    assert "spi" in payload["performance"]


def test_flag_disabled_returns_403(conn):
    settings.feature_ccc_v2 = False
    response = client.get("/api/v2/ccc/summary", params={"tenantId": "default", "projectId": "ccc-project"})
    assert response.status_code == 403


def test_unknown_project_returns_404():
    response = client.get("/api/v2/ccc/summary", params={"tenantId": "default", "projectId": "missing"})
    assert response.status_code == 404
