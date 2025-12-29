from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.repos.contract_kpi_repo import ContractKpiRepo
from app.repos.schedule_repo import ScheduleRepo
from app.db import pool


client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_features():
    settings.feature_contract_right_panel_echarts = True
    settings.feature_schedule_ui = True


@pytest.fixture
def conn():
    with pool.connection() as connection:
        with connection.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
        try:
            yield connection
        finally:
            connection.rollback()


def _insert_kpi_data(conn, contract_id: str, sow_id: str, process_id: str, metric: str, value: float, ts: date):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT project_id FROM dipgos.contracts WHERE id = %s",
            (contract_id,),
        )
        row = cur.fetchone()
        project_id = row[0] if row else contract_id
        cur.execute(
            """
            INSERT INTO dipgos.kpi_fact (scope_level, project_id, contract_id, sow_id, process_id, metric_code, ts_date, actual_numeric)
            VALUES ('process', %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (process_id, metric_code, ts_date) DO UPDATE SET actual_numeric = EXCLUDED.actual_numeric
            """,
            (project_id, contract_id, sow_id, process_id, metric, ts, value),
        )
    conn.commit()


def _build_scope(conn):
    project_id = "contract-project"
    contract_id = "contract-test"
    sow_id = "contract-sow"
    process_id = "contract-process"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO dipgos.projects (id, name, lat, lng, status_pct, phase, alerts)
            VALUES (%s, %s, 0, 0, 0, 'Construction', 0)
            ON CONFLICT (id) DO NOTHING
            """,
            (project_id, project_id),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contracts (id, project_id, name, phase, discipline, lat, lng, status_pct, status_label, alerts)
            VALUES (%s, %s, %s, 'Construction', 'Civil', 0, 0, 0, NULL, 0)
            ON CONFLICT (id) DO NOTHING
            """,
            (contract_id, project_id, contract_id),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contract_sows (id, contract_id, title, status, progress, sequence)
            VALUES (%s, %s, %s, 'In Progress', 0, 0)
            ON CONFLICT (id) DO NOTHING
            """,
            (sow_id, contract_id, sow_id),
        )
        cur.execute(
            """
            INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
            VALUES (%s, %s, %s, 'In Progress', 'Lead', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '30 days', 0, 0)
            ON CONFLICT (id) DO UPDATE SET sow_id = EXCLUDED.sow_id
            """,
            (process_id, sow_id, process_id),
        )
    conn.commit()
    return project_id, contract_id, sow_id, process_id


def test_contract_kpi_repo_latest(conn):
    repo = ContractKpiRepo()
    _, contract_id, sow_id, process_id = _build_scope(conn)
    _insert_kpi_data(conn, contract_id, sow_id, process_id, 'prod_actual_pct', 45.0, date.today())
    result = repo.fetch_latest(contract_id)
    assert result['prod_actual_pct'] == 45.0


def test_contract_kpi_series_endpoint(conn):
    _, contract_id, sow_id, process_id = _build_scope(conn)
    _insert_kpi_data(conn, contract_id, sow_id, process_id, 'prod_actual_pct', 20.0, date.today())

    response = client.get(f"/api/contract/{contract_id}/right-panel/series", params={"metric": "prod_actual_pct", "days": 30})
    assert response.status_code == 200
    body = response.json()
    assert body['dates'], "expected series dates"
    assert body['actual'], "expected actual values"


def test_contract_schedule_endpoint(conn):
    schedule_repo = ScheduleRepo()
    _, contract_id, sow_id, process_id = _build_scope(conn)
    _insert_kpi_data(conn, contract_id, sow_id, process_id, 'schedule_progress_pct', 60.0, date.today())

    tasks = schedule_repo.fetch_contract_schedule(contract_id)
    assert tasks, "expected schedule tasks"

    response = client.get(f"/api/schedule/contract/{contract_id}")
    assert response.status_code == 200
    payload = response.json()['tasks']
    assert any(task['id'].startswith('project:') for task in payload)
