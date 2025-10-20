from __future__ import annotations

from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


@contextmanager
def enable_flag():
    original = settings.feature_atom_manager
    settings.feature_atom_manager = True
    try:
        yield
    finally:
        settings.feature_atom_manager = original


def test_repository_tree_available(monkeypatch):
    with enable_flag():
        response = client.get(
            "/api/v2/atoms/repository",
            params={"tenantId": "default", "projectId": "diamer-basha"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["nodes"], "expected repository nodes"
        categories = {node["level"] for node in payload["nodes"]}
        assert "category" in categories


def test_summary_cards(monkeypatch):
    with enable_flag():
        response = client.get(
            "/api/v2/atoms/summary",
            params={"tenantId": "default", "projectId": "diamer-basha", "contractId": "mw-01-main-dam"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["cards"], "expected summary cards"
        first = payload["cards"][0]
        assert {"category", "total", "engaged", "idle"}.issubset(first.keys())


def test_deployments(monkeypatch):
    with enable_flag():
        response = client.get(
            "/api/v2/atoms/deployments",
            params={
                "tenantId": "default",
                "projectId": "diamer-basha",
                "contractId": "mw-01-main-dam",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert isinstance(payload["deployments"], list)


def test_deployment_requires_contractor(monkeypatch):
    with enable_flag():
        response = client.post(
            "/api/v2/atoms/deployments",
            params={
                "tenantId": "default",
                "projectId": "diamer-basha",
                "contractId": "mw-01-main-dam",
            },
            json={
                "atomId": "d0000000-0000-0000-0000-000000000002",
                "processId": "44444444-4444-4444-4444-444444444444",
                "action": "assign",
            },
        )
        assert response.status_code == 403
