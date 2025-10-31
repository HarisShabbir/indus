from __future__ import annotations

from contextlib import contextmanager
from uuid import UUID

from fastapi.testclient import TestClient

from app.config import settings
from app.db import pool
from app.main import app


client = TestClient(app)


@contextmanager
def enable_atom_features():
    original_atom = settings.feature_atom_manager
    original_progress = settings.feature_progress_v2
    settings.feature_atom_manager = True
    settings.feature_progress_v2 = True
    try:
        yield
    finally:
        settings.feature_atom_manager = original_atom
        settings.feature_progress_v2 = original_progress


def test_deployment_report_returns_groups():
    with enable_atom_features():
        response = client.get(
            "/api/v2/atoms/deployments/report",
            params={
                "tenantId": "default",
                "projectId": "diamer-basha",
                "contractId": "mw-01-main-dam",
                "status": "active",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "active"
        assert "groups" in payload and isinstance(payload["groups"], list)
        assert "totals" in payload and "engaged" in payload["totals"]
        assert payload.get("pagination", {}).get("page") == 1


def test_change_request_creation_and_cleanup():
    with enable_atom_features():
        response = client.post(
            "/api/v2/change-requests",
            json={
                "tenantId": "default",
                "projectId": "diamer-basha",
                "contractId": "mw-01-main-dam",
                "atomType": "machinery",
                "model": "Excavator CAT 336",
                "requestedUnits": 2,
                "createdBy": "contractor",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["atom_type"] == "machinery"
        assert data["model"] == "Excavator CAT 336"
        cr_id = UUID(str(data["id"]))

        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM dipgos.change_requests WHERE id = %s", (cr_id,))
            conn.commit()
