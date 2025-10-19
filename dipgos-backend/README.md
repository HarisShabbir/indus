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

## CCC v2 API (feature flagged)

Set `FEATURE_CCC_V2=true` in your environment to enable the new Construction Control Center middle-section endpoints.

### Summary Endpoint

```
GET /api/v2/ccc/summary?tenantId=default&projectId=...&contractId=...&sowId=...&processId=...
```

Returns `selection`, `map` markers, `wip` dials, and an `as_of` timestamp. The WIP dials follow the hierarchy: project → contract → SOW → process. Map markers align with the current selection depth.

### Right Panel KPIs

```
GET /api/v2/ccc/kpis/right-panel?tenantId=default&projectId=...&contractId=...
```

Delivers the data for the right-hand KPI cards:

- `physical`: Actual vs planned physical works (with sparkline trends).
- `work_in_progress`: Stage-based stacked bars per discipline/status.
- `work_output`: Planned vs actual for design, preparatory, and construction outputs.
- `performance`: SPI, CPI, EV/PV/AC, cash flow notes, and trending arrays.
- `preparatory`: Same schema as `work_output` for drill-down sections.

The response schema keeps keys stable and uses `null` for missing values; arrays are always present to simplify frontend binding. Split ratios for the CCC map/WIP pane persist in `localStorage['ccc.mapWip.split']` when the feature flag is enabled.


## Financial View API (feature flagged)

Set `FEATURE_FINANCIAL_VIEW=true` to expose the read-only `/api/v2/financial/*` endpoints. These APIs roll up data from the new financial tables (`entities`, `evm_metrics`, `allocations`, `fund_inflows`, `fund_expected`, `fund_outflows`, `expense_expected`) and helper views (`vw_evm_rollup`, `vw_financial_allocation`, `vw_expenses_rollup`, `vw_fund_flow`).

### Summary
````
GET /api/v2/financial/summary?tenantId=default&projectId=<code>&contractId=<optional>
````
Returns EV, PV, AC, SPI, CPI, burn rate, and schedule variance with an ISO8601 `as_of` timestamp. Passing `contractId` scopes the rollup to that contract; omitting it returns project totals.

### Fund Allocation
````
GET /api/v2/financial/fund-allocation?tenantId=default&projectId=<code>
````
Delivers the project allocation row plus one row per contract: `{ description, amount, status, contractId }`.

### Expenses
````
GET /api/v2/financial/expenses?tenantId=default&projectId=<code>&contractId=<optional>
````
Returns contract-level rows with nested SOW children. Each row includes `{ description, contractCode, actual, paid, balance, status, children[] }`.

### Fund Flow
````
GET /api/v2/financial/fund-flow?tenantId=default&projectId=<code>&contractId=<optional>
````
Sankey-ready payload `{ nodes: [{id,label,type}], links: [{source,target,value}] }` describing project inflows and outflows.

### Incoming / Outgoing tables
````
GET /api/v2/financial/incoming?tenantId=default&projectId=<code>
GET /api/v2/financial/outgoing?tenantId=default&projectId=<code>&contractId=<optional>
````
Incoming responses return `available` (deposited) and `expected` sections. Outgoing responses return `actual` and optional `expected` expense tables. All numeric fields are numeric (never omitted) and timestamps are UTC ISO strings.

Responses are cached for 45s per tenant/project/contract tuple.

## Tests

```bash
python -m pytest dipgos-backend/app/tests
```

> Pytest is not bundled with the base environment; install it via `pip install pytest` if you plan to run the suite locally.

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
