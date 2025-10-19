# DiPGOS Frontend Starter (React + Vite + React-Leaflet)

A minimal dashboard UI that matches the portfolio map + project cards and a side alert panel.

## Setup

```bash
# Node 18+ recommended
npm install
# or: pnpm install / yarn
```

Create a `.env` file to point to your backend (defaults to 8000):
```
VITE_API_URL=http://localhost:8000
VITE_FEATURE_CCC_V2=true            # optional: enable the new CCC experience
VITE_FEATURE_SCHEDULE_UI=true        # optional: enable scheduling routes
VITE_FEATURE_FINANCIAL_VIEW=true     # optional: enable the Financial View pages
```

## Run
```bash
npm run dev
# http://localhost:5173
```

The app fetches:
- `GET /api/projects?phase=Construction`
- `GET /api/projects?phase=O&M`
- `GET /api/alerts?project_id=...`
# indus
