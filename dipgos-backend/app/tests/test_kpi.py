from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from psycopg.errors import UniqueViolation

from app.config import settings
from app.db import initialize_database, open_pool, pool


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    open_pool()
    initialize_database()
    settings.feature_contract_right_panel_echarts = True
    settings.feature_schedule_ui = True
    yield


@pytest.fixture
def conn():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
        try:
            yield conn
        finally:
            conn.rollback()


def _build_scope(cur):
    project_id = f"test-project-{uuid4().hex}"
    contract_id = f"test-contract-{uuid4().hex}"
    sow_id = f"test-sow-{uuid4().hex}"
    clause_id = f"test-clause-{uuid4().hex}"

    cur.execute(
        """
        INSERT INTO dipgos.projects (id, name, lat, lng, status_pct, phase, alerts)
        VALUES (%s, %s, 0, 0, 0, 'Construction', 0)
        """,
        (project_id, project_id),
    )
    cur.execute(
        """
        INSERT INTO dipgos.contracts (id, project_id, name, phase, discipline, lat, lng, status_pct, status_label, alerts)
        VALUES (%s, %s, %s, 'Construction', 'Civil', 0, 0, 0, NULL, 0)
        """,
        (contract_id, project_id, contract_id),
    )
    cur.execute(
        """
        INSERT INTO dipgos.contract_sows (id, contract_id, title, status, progress, sequence)
        VALUES (%s, %s, %s, 'In Progress', 0, 0)
        """,
        (sow_id, contract_id, sow_id),
    )
    cur.execute(
        """
        INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
        VALUES (%s, %s, %s, 'In Progress', 'Lead', CURRENT_DATE, CURRENT_DATE, 0, 0)
        """,
        (clause_id, sow_id, clause_id),
    )
    return project_id, contract_id, sow_id, clause_id


def test_kpi_fact_unique_constraint(conn):
    with conn.cursor() as cur:
        project_id, contract_id, sow_id, process_id = _build_scope(cur)
        cur.execute(
            """
            INSERT INTO dipgos.kpi_fact (
                scope_level, project_id, contract_id, sow_id, process_id, metric_code,
                ts_date, actual_numeric, planned_numeric
            )
            VALUES ('process', %s, %s, %s, %s, 'prod_actual_pct', %s, 10, NULL)
            """,
            (project_id, contract_id, sow_id, process_id, date.today()),
        )
        with pytest.raises(UniqueViolation):
            cur.execute(
                """
                INSERT INTO dipgos.kpi_fact (
                    scope_level, project_id, contract_id, sow_id, process_id, metric_code,
                    ts_date, actual_numeric, planned_numeric
                )
                VALUES ('process', %s, %s, %s, %s, 'prod_actual_pct', %s, 12, NULL)
                """,
                (project_id, contract_id, sow_id, process_id, date.today()),
            )


def test_kpi_rollup_sum_and_average(conn):
    with conn.cursor() as cur:
        project_id, contract_id, sow_id, process_one = _build_scope(cur)
        process_two = f"{process_one}-b"
        cur.execute(
            """
            INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
            VALUES (%s, %s, %s, 'In Progress', 'Lead', CURRENT_DATE, CURRENT_DATE, 0, 0)
            """,
            (process_two, sow_id, process_two),
        )
        today = date.today()
        cur.execute(
            """
            INSERT INTO dipgos.kpi_fact (scope_level, project_id, contract_id, sow_id, process_id, metric_code, ts_date, actual_numeric)
            VALUES
            ('process', %s, %s, %s, %s, 'ncr_open', %s, 10),
            ('process', %s, %s, %s, %s, 'ncr_open', %s, 20),
            ('process', %s, %s, %s, %s, 'prod_actual_pct', %s, 30),
            ('process', %s, %s, %s, %s, 'prod_actual_pct', %s, 60)
            """,
            (
                project_id,
                contract_id,
                sow_id,
                process_one,
                today,
                project_id,
                contract_id,
                sow_id,
                process_two,
                today,
                project_id,
                contract_id,
                sow_id,
                process_one,
                today,
                project_id,
                contract_id,
                sow_id,
                process_two,
                today,
            ),
        )
        cur.execute("SELECT dipgos.refresh_kpi_rollups()")
        cur.execute(
            """
            SELECT actual_numeric
            FROM dipgos.mv_kpi_sow
            WHERE sow_id = %s AND metric_code = 'ncr_open'
            """,
            (sow_id,),
        )
        (sum_value,) = cur.fetchone()
        cur.execute(
            """
            SELECT actual_numeric
            FROM dipgos.mv_kpi_sow
            WHERE sow_id = %s AND metric_code = 'prod_actual_pct'
            """,
            (sow_id,),
        )
        (avg_value,) = cur.fetchone()

    assert sum_value == pytest.approx(30.0)
    assert avg_value == pytest.approx(45.0)


def test_ingest_daily_kpis_idempotent(conn):
    with conn.cursor() as cur:
        project_id, contract_id, sow_id, process_id = _build_scope(cur)
        report_date = date.today()
        cur.execute(
            """
            INSERT INTO dipgos.process_daily_report (report_date, project_id, contract_id, sow_id, process_id, notes)
            VALUES (%s, %s, %s, %s, %s, 'test') RETURNING id
            """,
            (report_date, project_id, contract_id, sow_id, process_id),
        )
        (report_id,) = cur.fetchone()
        cur.execute(
            """
            INSERT INTO dipgos.process_daily_item (
                report_id, activity, metric_label, unit, designed_total, produced_day,
                produced_night, cumulative_actual, cumulative_planned, completion_pct,
                cost_actual, cost_planned, extra
            )
            VALUES (
                %s, 'excavation', 'Excavation', 'm3', 10000, 120, 80,
                2000, 2500, 25, 5000, 5200,
                jsonb_build_object('quality_conf', 95, 'schedule_progress_pct', 60)
            )
            """,
            (report_id,),
        )
        cur.execute("SELECT dipgos.ingest_daily_kpis(%s, %s)", (report_date, report_date))
        cur.execute(
            """
            SELECT COUNT(*) FROM dipgos.kpi_fact
            WHERE process_id = %s AND metric_code = 'prod_actual_pct' AND ts_date = %s
            """,
            (process_id, report_date),
        )
        (first_count,) = cur.fetchone()
        cur.execute("SELECT dipgos.ingest_daily_kpis(%s, %s)", (report_date, report_date))
        cur.execute(
            """
            SELECT COUNT(*) FROM dipgos.kpi_fact
            WHERE process_id = %s AND metric_code = 'prod_actual_pct' AND ts_date = %s
            """,
            (process_id, report_date),
        )
        (second_count,) = cur.fetchone()

    assert first_count == 1
    assert second_count == 1
