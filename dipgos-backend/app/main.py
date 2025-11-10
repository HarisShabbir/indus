import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from contextlib import asynccontextmanager

from .routers import (
    projects,
    alerts,
    kpi,
    contract_kpi,
    schedule,
    contract_schedule,
    weather,
    ccc_v2,
    financial,
    atom_financial_view,
    atom_manifestation_v2,
    atoms_v2,
    atoms_reports_v2,
    atom_journey_v2,
    atom_experience_v1,
    change_requests_v2,
    progress_v2,
    schedule_v2,
    financial_v2,
    scm,
    process_historian,
    collaboration,
)
from .db import open_pool, close_pool, pool, initialize_database


logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()  # open DB pool at startup
    database_available = True
    try:
        initialize_database()
    except Exception as exc:  # pragma: no cover - defensive fallback for local dev
        database_available = False
        logger.warning("Database initialization failed; continuing with fixture data: %s", exc)
    app.state.database_available = database_available
    try:
        yield
    finally:
        close_pool()  # close pool at shutdown

app = FastAPI(
    title="DiPGOS Backend",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

origins = [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(alerts.router,   prefix="/api/alerts",   tags=["alerts"])
app.include_router(kpi.router,      prefix="/api/kpi",      tags=["kpi"])
app.include_router(contract_kpi.router)
app.include_router(schedule.router)
app.include_router(contract_schedule.router)
app.include_router(weather.router)
app.include_router(ccc_v2.router)
app.include_router(financial.router)
app.include_router(atom_financial_view.router)
app.include_router(atom_manifestation_v2.router)
app.include_router(atoms_v2.router)
app.include_router(atoms_reports_v2.router)
app.include_router(atom_journey_v2.router)
app.include_router(atom_experience_v1.router)
app.include_router(change_requests_v2.router)
app.include_router(progress_v2.router)
app.include_router(schedule_v2.router)
app.include_router(financial_v2.router)
app.include_router(scm.router)
app.include_router(process_historian.router, prefix="/api/process-historian", tags=["process historian"])
app.include_router(collaboration.router, prefix="/api/collaboration", tags=["collaboration"])

@app.get("/api/health")
def health():
    return {"ok": True}

# DB connectivity quick-check
@app.get("/api/db/ping")
def db_ping():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("select 'ok'::text")
            (status,) = cur.fetchone()
            return {"db": status}
