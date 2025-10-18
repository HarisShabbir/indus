from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.db import open_pool, initialize_database, pool
from app.repos.contract_kpi_repo import ContractKpiRepo
from app.repos.weather_repo import WeatherLocation
from app.routers import weather as weather_router


@pytest.fixture(scope="module", autouse=True)
def _setup_env(monkeypatch):
    monkeypatch.setenv("FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS", "true")
    monkeypatch.setenv("FEATURE_SCHEDULE_UI", "true")
    settings.feature_contract_right_panel_echarts = True
    settings.feature_schedule_ui = True
    open_pool()
    initialize_database()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _ensure_sample_contract() -> str:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET search_path TO dipgos, public")
            cur.execute("SELECT id FROM dipgos.contracts LIMIT 1")
            row = cur.fetchone()
            if row:
                return row[0]
            raise RuntimeError("No contracts available in seed data")


def test_latest_endpoint(client: TestClient):
    contract_id = _ensure_sample_contract()
    response = client.get(f"/api/contract/{contract_id}/right-panel/latest")
    assert response.status_code == 200
    payload = response.json()
    assert "latest" in payload
    assert isinstance(payload["latest"], dict)


def test_series_validation(client: TestClient):
    contract_id = _ensure_sample_contract()
    bad = client.get(f"/api/contract/{contract_id}/right-panel/series?metric=unknown")
    assert bad.status_code == 422 or bad.status_code == 400

    ok = client.get(f"/api/contract/{contract_id}/right-panel/series?metric=prod_actual_pct&days=30")
    assert ok.status_code == 200
    payload = ok.json()
    assert "dates" in payload and "actual" in payload
    assert len(payload["dates"]) == len(payload["actual"])


def test_schedule_endpoint(client: TestClient):
    contract_id = _ensure_sample_contract()
    response = client.get(f"/api/schedule/contract/{contract_id}")
    assert response.status_code == 200
    payload = response.json()
    tasks = payload["tasks"]
    assert tasks
    for task in tasks:
        assert "id" in task and "name" in task
        # ISO date format check
        date.fromisoformat(task["start"])
        date.fromisoformat(task["end"])


def test_weather_endpoint(client: TestClient, monkeypatch):
    def fake_fetch_all(self):
        return [
            WeatherLocation(id='proj-demo', name='Demo Project', lat=35.0, lng=74.0, entity_type='project'),
            WeatherLocation(id='ctr-demo', name='Demo Contract', lat=34.5, lng=73.8, entity_type='contract'),
        ]

    def fake_summary(locations):
        generated = datetime.now(timezone.utc)
        base_entry = {
            'temperature_c': 24.0,
            'wind_speed_kph': 10.0,
            'weather_code': 1,
            'weather_description': 'Mainly clear',
            'icon': 'sunny-interval',
            'observed_at': generated,
            'source': 'open-meteo',
        }
        projects = []
        contracts = []
        for loc in locations:
            entry = {
                'id': loc.id,
                'name': loc.name,
                'lat': loc.lat,
                'lng': loc.lng,
                'entity_type': loc.entity_type,
            }
            entry.update(base_entry)
            if loc.entity_type == 'project':
                projects.append(entry)
            else:
                contracts.append(entry)
        return {'generated_at': generated, 'projects': projects, 'contracts': contracts}

    monkeypatch.setattr(weather_router.WeatherRepo, 'fetch_all', fake_fetch_all, raising=False)
    monkeypatch.setattr(weather_router, 'build_weather_summary', fake_summary)

    response = client.get('/api/weather')
    assert response.status_code == 200
    payload = response.json()
    assert payload['projects'][0]['id'] == 'proj-demo'
    assert payload['contracts'][0]['id'] == 'ctr-demo'


def test_contract_level_kpis(client: TestClient):
    contract_id = _ensure_sample_contract()
    response = client.get(f"/api/contracts/{contract_id}/kpis")
    assert response.status_code == 200
    payload = response.json()

    repo = ContractKpiRepo()
    latest = repo.fetch_latest(
        contract_id,
        metrics=("spi", "cpi", "ev", "pv", "ac", "prod_actual_pct", "prod_planned_pct"),
    )

    def _to_float(value):
        return float(value) if value is not None else None

    def _approx_equal(lhs, rhs):
        lhs_val = _to_float(lhs)
        rhs_val = _to_float(rhs)
        if lhs_val is None or rhs_val is None:
            return lhs_val is rhs_val
        return abs(lhs_val - rhs_val) < 1e-6

    assert _approx_equal(payload.get("spi"), latest.get("spi"))
    expected_cpi = _to_float(latest.get("cpi"))
    ev_val = _to_float(latest.get("ev"))
    ac_val = _to_float(latest.get("ac"))
    if expected_cpi is None and ev_val is not None and ac_val not in (None, 0.0):
        expected_cpi = ev_val / ac_val if ac_val else None
    assert _approx_equal(payload.get("cpi"), expected_cpi)
    field_map = {
        "ev": "ev",
        "pv": "pv",
        "ac": "ac",
        "progressActual": "prod_actual_pct",
        "progressPlanned": "prod_planned_pct",
    }
    for response_field, metric_name in field_map.items():
        expected = latest.get(metric_name)
        if expected is None:
            assert payload.get(response_field) is None
        else:
            assert _approx_equal(payload.get(response_field), expected)

    trend = payload.get("trend", [])
    assert isinstance(trend, list)
    if trend:
        assert "date" in trend[0] and "spi" in trend[0]
