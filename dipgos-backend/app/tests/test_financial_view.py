from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.db import pool
from app.services.financial import clear_financial_cache

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_flag():
    original = settings.feature_financial_view
    settings.feature_financial_view = True
    try:
        yield
    finally:
        settings.feature_financial_view = original
        clear_financial_cache()


@pytest.fixture
def conn():
    with pool.connection() as connection:
        with connection.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
        try:
            yield connection
        finally:
            connection.rollback()


def _seed_financial_scope(conn):
    tenant_uuid = uuid.uuid4()
    project_code = "finance-project"
    contract_code = "finance-contract"
    sow_code = "finance-sow"

    project_entity = uuid.uuid4()
    contract_entity = uuid.uuid4()
    sow_entity = uuid.uuid4()

    today = date.today()

    with conn.cursor() as cur:
        cur.execute("DELETE FROM dipgos.expense_expected WHERE project_id = %s", (project_entity,))
        cur.execute("DELETE FROM dipgos.fund_outflows WHERE project_id = %s", (project_entity,))
        cur.execute("DELETE FROM dipgos.fund_expected WHERE project_id = %s", (project_entity,))
        cur.execute("DELETE FROM dipgos.fund_inflows WHERE project_id = %s", (project_entity,))
        cur.execute("DELETE FROM dipgos.allocations WHERE entity_id IN (%s, %s)", (project_entity, contract_entity))
        cur.execute("DELETE FROM dipgos.evm_metrics WHERE entity_id IN (%s, %s, %s)", (project_entity, contract_entity, sow_entity))
        cur.execute("DELETE FROM dipgos.entities WHERE entity_id IN (%s, %s, %s)", (sow_entity, contract_entity, project_entity))

        cur.execute(
            """
            INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
            VALUES (%s, 'project', %s, %s, NULL, %s)
            """,
            (project_entity, project_code, "Financial Project", tenant_uuid),
        )
        cur.execute(
            """
            INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
            VALUES (%s, 'contract', %s, %s, %s, %s)
            """,
            (contract_entity, contract_code, "MW-01 Main Dam", project_entity, tenant_uuid),
        )
        cur.execute(
            """
            INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
            VALUES (%s, 'sow', %s, %s, %s, %s)
            """,
            (sow_entity, sow_code, "RCC Package", contract_entity, tenant_uuid),
        )

        cur.execute(
            """
            INSERT INTO dipgos.evm_metrics (entity_id, period_date, ev, pv, ac, percent_complete)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (contract_entity, today, 1_200_000, 1_100_000, 1_050_000, 0.55),
        )
        cur.execute(
            """
            INSERT INTO dipgos.evm_metrics (entity_id, period_date, ev, pv, ac, percent_complete)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (project_entity, today, 2_400_000, 2_100_000, 2_050_000, 0.58),
        )

        cur.execute(
            """
            INSERT INTO dipgos.allocations (id, entity_id, amount, status, created_at, tenant_id)
            VALUES (%s, %s, %s, %s, NOW(), %s)
            """,
            (uuid.uuid4(), project_entity, 5_000_000, "Approved", tenant_uuid),
        )
        cur.execute(
            """
            INSERT INTO dipgos.allocations (id, entity_id, amount, status, created_at, tenant_id)
            VALUES (%s, %s, %s, %s, NOW(), %s)
            """,
            (uuid.uuid4(), contract_entity, 2_500_000, "Under Approval", tenant_uuid),
        )

        cur.execute(
            """
            INSERT INTO dipgos.fund_inflows (id, project_id, account, amount, txn_date, source, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (uuid.uuid4(), project_entity, "Development Fund", 1_200_000, today - timedelta(days=10), "Govt", tenant_uuid),
        )
        cur.execute(
            """
            INSERT INTO dipgos.fund_expected (id, project_id, account, amount, expected_date, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (uuid.uuid4(), project_entity, "Next Installment", 800_000, today + timedelta(days=20), tenant_uuid),
        )

        cur.execute(
            """
            INSERT INTO dipgos.fund_outflows (id, project_id, contract_id, sow_id, process_id, category, amount, txn_date, tenant_id)
            VALUES (%s, %s, %s, %s, NULL, %s, %s, %s, %s)
            """,
            (uuid.uuid4(), project_entity, contract_entity, sow_entity, "Batching Plant", 450_000, today - timedelta(days=5), tenant_uuid),
        )
        cur.execute(
            """
            INSERT INTO dipgos.expense_expected (id, project_id, contract_id, sow_id, process_id, category, amount, expected_date, tenant_id)
            VALUES (%s, %s, %s, %s, NULL, %s, %s, %s, %s)
            """,
            (uuid.uuid4(), project_entity, contract_entity, sow_entity, "Formwork", 300_000, today + timedelta(days=15), tenant_uuid),
        )

    conn.commit()
    return {
        "project_code": project_code,
        "contract_code": contract_code,
        "tenant_uuid": tenant_uuid,
    }


def test_financial_summary_returns_metrics(conn):
    scope = _seed_financial_scope(conn)

    response = client.get(
        "/api/v2/financial/summary",
        params={
            "tenantId": str(scope["tenant_uuid"]),
            "projectId": scope["project_code"],
            "contractId": scope["contract_code"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ev"] is not None
    assert payload["pv"] is not None
    assert payload["ac"] is not None
    assert payload["variance_abs"] is not None
    assert payload["as_of"] is not None


def test_financial_allocation_and_expenses(conn):
    scope = _seed_financial_scope(conn)

    alloc = client.get(
        "/api/v2/financial/fund-allocation",
        params={"tenantId": str(scope["tenant_uuid"]), "projectId": scope["project_code"],},
    )
    assert alloc.status_code == 200
    payload = alloc.json()
    assert payload["project"]["amount"] is not None
    assert payload["contracts"]

    expenses = client.get(
        "/api/v2/financial/expenses",
        params={
            "tenantId": str(scope["tenant_uuid"]),
            "projectId": scope["project_code"],
        },
    )
    assert expenses.status_code == 200
    exp_rows = expenses.json()
    assert exp_rows and exp_rows[0]["children"], "expected contract expenses with children"


def test_financial_flow_and_cash_tables(conn):
    scope = _seed_financial_scope(conn)
    flow = client.get(
        "/api/v2/financial/fund-flow",
        params={"tenantId": str(scope["tenant_uuid"]), "projectId": scope["project_code"]},
    )
    assert flow.status_code == 200
    flow_payload = flow.json()
    assert flow_payload["nodes"], "expected sankey nodes"
    assert flow_payload["links"], "expected sankey links"

    incoming = client.get(
        "/api/v2/financial/incoming",
        params={"tenantId": str(scope["tenant_uuid"]), "projectId": scope["project_code"]},
    )
    assert incoming.status_code == 200
    incoming_payload = incoming.json()
    assert incoming_payload["available"], "expected available funds"
    assert incoming_payload["expected"], "expected expected funds"

    outgoing = client.get(
        "/api/v2/financial/outgoing",
        params={"tenantId": str(scope["tenant_uuid"]), "projectId": scope["project_code"]},
    )
    assert outgoing.status_code == 200
    outgoing_payload = outgoing.json()
    assert outgoing_payload["actual"], "expected actual expenses"
    assert outgoing_payload["expected"], "expected future expenses"
