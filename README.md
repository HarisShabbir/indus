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
