from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import pool
from app.main import app

client = TestClient(app)


@contextmanager
def enable_progress_flag():
    original = settings.feature_progress_v2
    settings.feature_progress_v2 = True
    try:
        yield
    finally:
        settings.feature_progress_v2 = original


@contextmanager
def temporary_process_entity():
    entity_id = uuid4()
    code = f"test-proc-{entity_id.hex[:8]}"
    tenant_id = "00000000-0000-0000-0000-000000000001"
    parent_sow = "33333333-3333-3333-3333-333333333333"
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
                VALUES (%s, 'process', %s, %s, %s, %s)
                """,
                (entity_id, code, f"Test Process {entity_id.hex[:4]}", parent_sow, tenant_id),
            )
        conn.commit()
    try:
        yield code
    finally:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM dipgos.entities WHERE entity_id = %s", (entity_id,))
            conn.commit()


def _ingest_dppr(process_code: str, *, ev: float, pv: float, ac: float, report_date: date | None = None) -> None:
    payload = {
        "tenantId": "default",
        "rows": [
            {
                "entityId": process_code,
                "reportDate": (report_date or date.today()).isoformat(),
                "qtyDone": ev,
                "qtyPlanned": pv,
                "ev": ev,
                "pv": pv,
                "ac": ac,
            }
        ],
    }
    response = client.post("/api/v2/progress/bulk", json=payload)
    assert response.status_code == 202


def test_progress_summary_handles_zero_divisors():
    with enable_progress_flag(), temporary_process_entity() as process_code:
        _ingest_dppr(process_code, ev=0, pv=0, ac=0)

        response = client.get(
            "/api/v2/progress/summary",
            params={"tenantId": "default", "projectId": "diamer-basha", "processId": process_code},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["spi"] is None
        assert payload["cpi"] is None
        assert payload["percentComplete"] is None


def test_progress_summary_refreshes_after_upsert():
    with enable_progress_flag(), temporary_process_entity() as process_code:
        today = date.today()
        _ingest_dppr(process_code, ev=10, pv=12, ac=8, report_date=today)

        first = client.get(
            "/api/v2/progress/summary",
            params={"tenantId": "default", "projectId": "diamer-basha", "processId": process_code},
        )
        assert first.status_code == 200
        initial = first.json()
        assert initial["ev"] == pytest.approx(10, rel=1e-3)

        _ingest_dppr(process_code, ev=25, pv=25, ac=20, report_date=today)
        second = client.get(
            "/api/v2/progress/summary",
            params={"tenantId": "default", "projectId": "diamer-basha", "processId": process_code},
        )
        assert second.status_code == 200
        updated = second.json()
        assert updated["ev"] == pytest.approx(25, rel=1e-3)
        assert updated["ev"] != initial["ev"], "Expected cache to clear after upsert"
