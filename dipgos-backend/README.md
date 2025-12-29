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

## Progress v2 API (feature flagged)

Set `FEATURE_PROGRESS_V2=true` to expose the `/api/v2/progress/*` endpoints backed by the daily project progress report (DPPR) tables.

### Bulk ingest

````
POST /api/v2/progress/bulk
````

Accepts `{ tenantId, rows[] }` payloads and upserts DPPR entries idempotently for process or SOW entities. SPI, CPI, and percent complete are recalculated per report date, and caches are invalidated immediately so downstream summaries refresh on the next poll.

### Summary

````
GET /api/v2/progress/summary?tenantId=default&projectId=<code>&contractId=<optional>&sowId=<optional>&processId=<optional>
````

Returns `{ ev, pv, ac, spi, cpi, percentComplete, slips, nextActivities[], as_of }` scoped to any hierarchy level. Slips are expressed in days (positive = behind plan). Responses are cached for ~45s per tenant/scope tuple unless new DPPR records arrive.

### Seed DPPR data from a daily report

The helper script in `scripts/seed_dppr_from_report.py` parses an OCR/plain-text export of the Diamer Basha daily progress report and synthesises six months of DPPR history for the Dam Pit excavation process. This drives the schedule, financial, CCC, and Atom Manager UIs from a single source of truth.

````bash
cd dipgos-backend
# optional: convert PDF → text first, for example with `pdftotext report.pdf report.txt`
python -m scripts.seed_dppr_from_report \
    --report scripts/reports/sample_dam_pit_report.txt \
    --entity mw-01-dam-pit \
    --months 6 \
    --as-of 2025-08-10
````

Custom reports can be supplied via the `--report` flag; the script smooths daily increments to match the cumulative excavated quantity in the snapshot, upserts `dipgos.dppr`, and keeps `dipgos.evm_metrics` in sync so `/api/v2/progress/summary` immediately reflects the new data.

## Tests

```bash
python -m pytest dipgos-backend/app/tests
```

> Pytest is not bundled with the base environment; install it via `pip install pytest` if you plan to run the suite locally.

## Atom Manager API (feature flagged)

Set `FEATURE_ATOM_MANAGER=true` to expose the `/api/v2/atoms/*` endpoints. Migration `005_atom_manager.sql` provisions the schema (`atom_groups`, `atom_types`, `atoms`, `atom_deployments`) plus demo records for the Diamer Basha hierarchy.

### Repository Tree
````
GET /api/v2/atoms/repository?tenantId=default&projectId=diamer-basha&contractId=mw-01-main-dam
````
Returns hierarchical nodes `{ id, parentId, level, category, total, engaged, idle }[]` so the UI can rebuild the collapsible repository.

### Summary Cards
````
GET /api/v2/atoms/summary?tenantId=default&projectId=diamer-basha&contractId=mw-01-main-dam
````
Produces nine category cards with totals/engaged/idle and a lightweight ratio trend. Supports contract, SOW, and process scopes.

### Deployments
````
GET /api/v2/atoms/deployments?tenantId=default&projectId=diamer-basha&contractId=mw-01-main-dam
POST /api/v2/atoms/deployments  (use `X-User-Role: contractor` for mutations)
````
Reads return active and historical deployments. Contractors can `assign` or `unassign` atoms via the POST body `{ "atomId": "…", "processId": "…", "action": "assign" | "unassign" }`; clients remain read-only.

### Deployment report (grouped)
```http
GET /api/v2/atoms/deployments/report?tenantId=default&projectId=diamer-basha&contractId=mw-01-main-dam&status=active|idle
```
Returns a reporting-grade payload used by the new Atom Manager right panel:

```json
{
  "scope": {"level": "contract", "entityId": "…", "projectId": "diamer-basha", "contractId": "mw-01-main-dam"},
  "status": "active",
  "groups": [{
    "atomType": "machinery",
    "model": "Excavator CAT 336",
    "vendor": "Caterpillar Inc.",
    "capacity": {"bucket_m3": 1.2},
    "count": 4,
    "hoursCompleted": 128.5,
    "workCompleted": {"qtyDone": 5200, "percentComplete": 0.37},
    "journeyStatus": "engaged",
    "processName": "Dam Pit excavation",
    "items": [{
      "atomId": "…",
      "serial": "CAT-EX-021-009",
      "deploymentStart": "2025-10-06T07:00:00Z",
      "hoursCompleted": 31.5,
      "journey": [{"status": "warehouse", "ts": "2025-10-01T10:00:00Z"}, …]
    }]
  }],
  "totals": {"engaged": 10, "idle": 3, "completed": 1},
  "pagination": {"page": 1, "size": 50, "totalGroups": 6},
  "as_of": "2025-10-22T19:00:00Z"
}
```

Active and idle tabs are cached for ~45 s per tenant/scope. Idle responses include both idle and completed resources so the UI can split the tab client-side.

### Change requests (contractor stub)
```http
POST /api/v2/change-requests
GET  /api/v2/change-requests?tenantId=default&projectId=diamer-basha&contractId=mw-01-main-dam
```
`POST` validates the hierarchy (project/contract/SOW/process codes) before inserting a pending capacity increase record. The response echoes the stored row. `GET` lists the most recent 200 requests for the supplied scope.

### Atom journey events
```http
POST /api/v2/atoms/journey
```
Record a status transition for an atom instance `{ atomId, status: 'warehouse'|'in_transit'|'on_site'|'engaged', ts? }`. The deployment report surfaces the latest state and the full timeline for each atom in the right-panel drawer.

### Atom dataset enrichment (dev utility)

Generate a large synthetic dataset for the Atom Manager (atoms, deployments, journey history):

```bash
cd dipgos-backend
.venv/bin/python -m scripts.enrich_atom_dataset --atoms 1000 --active-ratio 0.8
.venv/bin/python -m scripts.load_atom_manifestation
```

Arguments:

- `--atoms` (default `1000`): number of atom records to ensure.
- `--active-ratio` (default `0.75`): fraction of atoms to seed with deployments.
- `--seed` (default `42`): RNG seed to keep the output deterministic.
- `--database-url`: optional explicit Postgres URL (falls back to `app.config.Settings.database_url`).

`scripts.load_atom_manifestation` hydrates the `atom_manifestation` table with vendor/model attribute rows that power the Manifestation Layer tab (e.g., Caterpillar CAT 395, Volvo EC750E). Re-run it whenever the CSV in `scripts/data/atom_manifestation.csv` changes.

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
