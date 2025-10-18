# DiPGOS Backend Starter (FastAPI)

Quick-start API that serves map markers (projects) and an example alert used by the dashboard.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate

# zsh users: quote extras
pip install -r requirements.txt
```

> If your shell expands brackets, install uvicorn like:  
> `pip install "uvicorn[standard]"`

## Run

```bash
./run.sh
# API: http://localhost:8000/api
```

## Seed demo KPI data

```bash
npm run seed:kpis
```

This will generate ~1,000 synthetic process reports and roll them up into the
new KPI fact tables.

## Tests

```bash
pytest dipgos-backend/app/tests
```

## Feature flags & API

Set the following environment variables to enable the new contract dashboards:

```
FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS=true
FEATURE_SCHEDULE_UI=true
```

Key endpoints:

- `GET /api/contract/{contractId}/right-panel/latest`
- `GET /api/contract/{contractId}/right-panel/series?metric=prod_actual_pct&days=90`
- `GET /api/schedule/project/{projectId}`
- `GET /api/schedule/contract/{contractId}`
- `GET /api/schedule/sow/{sowId}`
- `GET /api/schedule/process/{processId}`

All responses are additive and read-only; see `app/routers/contract_kpi.py` for
details.

Endpoints:
- `GET /api/projects` (optional `?phase=Construction` or `?phase=O&M`)
- `GET /api/projects/{id}`
- `GET /api/alerts` (optional `?project_id=...`)
- `GET /api/alerts/{id}`
- `GET /api/health`

CORS is enabled for `http://localhost:5173` (Vite) and `http://localhost:3000` (Next.js).
