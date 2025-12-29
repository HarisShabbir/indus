# DiPGOS Frontend Starter (React + Vite + React-Leaflet)

A minimal dashboard UI that matches the portfolio map + project cards and a side alert panel.

## Setup

```bash
# Node 18+ recommended
npm install
# or: pnpm install / yarn
```

Create a `.env` file to point to your backend (defaults to port 8000):

```env
VITE_API_URL=http://localhost:8000
VITE_FEATURE_CCC_V2=true            # optional: enable the new CCC experience
VITE_FEATURE_SCHEDULE_UI=true        # optional: enable scheduling routes
VITE_FEATURE_FINANCIAL_VIEW=true     # optional: enable the Financial View pages
VITE_FEATURE_ATOM_MANAGER=true       # optional: enable the Atom Manager workspace
VITE_FEATURE_PROGRESS_V2=true        # optional: enable DPPR-backed progress endpoints
```

### Seed daily progress data

Once the backend is running, jump into `dipgos-backend/` and seed six months of DPPR history directly from the sample Diamer Basha daily progress report. The schedule, financial, and Atom Manager views will automatically refresh on the next poll.

```bash
cd dipgos-backend
python -m scripts.seed_dppr_from_report \
  --report scripts/reports/sample_dam_pit_report.txt \
  --entity mw-01-dam-pit \
  --months 6 \
  --as-of 2025-08-10
```

Provide your own OCR’d report with `--report` to regenerate DPPR rows.

## Run
```bash
npm run dev
# http://localhost:5173
```

## Atom Manager v2 highlights

- Hierarchical left rail mirrors the Actors → Workforce and Materials → Machinery taxonomies, including collapsible subgroups and live category totals.
- Summary cards now surface engaged/idle/available breakdowns, utilisation, and deployed vs total replacement value (per category) directly from `/api/v2/atoms/summary`.
- Deployment panel consumes `/api/v2/atoms/deployments/report`, surfacing grouped counts, utilisation hours, work-complete metrics, and context links back to the process/SOW/contract while keeping the Active tab aligned with the engaged totals.
- Contractors gain a “Propose capacity increase” modal wired to `/api/v2/change-requests`; submissions show inline success messaging.
- Journey badges expand to show the warehouse → in-transit → on-site → engaged timeline for each atom, and idle/completed units remain in sync with the summary cards.
- Financial tab aggregates EV/PV/AC alongside portfolio value, cost share, and average engaged unit value for each category, with responsive overflow handling.
- Global theme toggles default to dark mode but propagate across breadcrumbs, filters, tabs, and panels when switching to light.

### Seed 1k+ atom instances with deployment journeys

Run the enrichment script after migrations to ensure the Atom Manager has deep, construction-flavoured data (atoms, deployments, journeys, cost metadata):

```bash
cd dipgos-backend
python -m scripts.enrich_atom_dataset --atoms 1000 --active-ratio 0.8
python -m scripts.load_atom_manifestation
```

Supply `--seed` for repeatable output or `--database-url` to point at a non-default Postgres instance. The script upserts atom groups/types, inserts 1 000 atoms with vendor/spec/cost attributes, assigns deployments (with journey timelines), and prints a summary of how many records were written.

`scripts.load_atom_manifestation` seeds the Manifestation Layer attributes (vendor/machine/model properties) that drive the new tab for CAT/Volvo excavators. Re-run it whenever the CSV is updated.

The app fetches:
- `GET /api/projects?phase=Construction`
- `GET /api/projects?phase=O&M`
- `GET /api/alerts?project_id=...`

## RCC Dam process + rule engine

The RCC scope now renders live workflow data sourced from PostgreSQL (`process_stages`, `process_operations`, `process_inputs`, and `alarm_rules`). A FastAPI background task evaluates all enabled rules every five minutes, writes new events to `process_historian`, and emits an `alarm_triggered` WebSocket event on `/api/rcc/ws/alarms`.

### Editing the workflow

1. Seed data for stages, operations, inputs, and rules lives in `dipgos-backend/app/fixtures/rcc_process.json`. Update it to reflect new spreadsheet rows (IDs remain stable) and restart the backend to upsert changes, or craft a dedicated SQL migration if you need complete control.
2. Each `process_inputs` entry should define a unique `source_name`, thresholds (`min`, `max`, and optional `warn_*` values), plus the current telemetry value. The rule engine exposes every `source_name` as a variable inside `alarm_rules.condition`.
3. For derived logic (monthly limits, seasonal durations, etc.) supply extra numbers under `alarm_rules.metadata.context`. Those keys are also injected into the expression namespace.

### Managing rules

- In the UI, switch to the RCC Dam scope, open the **Process** tab, and click **Manage rules**. The modal lets you toggle `enabled`, edit category/condition/severity/message/action, and save directly to `/api/rcc/rules`.
- Rules can also be scripted through the API:

```bash
curl -X POST http://localhost:8000/api/rcc/rules \
  -H 'Content-Type: application/json' \
  -d '{
        "id": "rcc-rule-temp-control",
        "category": "Temperature",
        "condition": "pour_temperature >= min_pour_temp and pour_temperature <= max_pour_temp",
        "severity": "high",
        "message": "Pour temperature must follow seasonal limits.",
        "enabled": true,
        "metadata": {
          "context": { "min_pour_temp": 4 },
          "max_by_month": { "may": 19, "jun": 16 }
        }
      }'
```

Saving a rule triggers an immediate evaluation pass, so the Process view reflects the new logic without waiting for the 5‑minute poller.

### Telemetry feeds

- `process_inputs.current_value` + `last_observed` store the latest sensor reading. Update them via your ingestion pipeline and the rule engine will pick up the changes on the next evaluation.
- Alarms are written to `process_historian` with payloads that include the evaluated context so downstream dashboards can replay the exact values that caused a trigger.
- Subscribe to `/api/rcc/ws/alarms` if you need near-real-time notifications when a rule transitions into the `alarm` state.
# indus
