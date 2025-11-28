import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from contextlib import asynccontextmanager, suppress

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
    rcc,
    rcc_dam,
    rcc_schedule,
)
from .db import open_pool, close_pool, pool, initialize_database
from .services.rcc_rules import alarm_rule_monitor, evaluate_alarm_rules


logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()  # open DB pool at startup
    database_available = True
    alarm_task = None
    try:
        initialize_database()
        await asyncio.to_thread(evaluate_alarm_rules)
        alarm_task = asyncio.create_task(alarm_rule_monitor())
    except Exception as exc:  # pragma: no cover - defensive fallback for local dev
        database_available = False
        logger.warning("Database initialization failed; continuing with fixture data: %s", exc)
    app.state.database_available = database_available
    try:
        yield
    finally:
        if alarm_task:
            alarm_task.cancel()
            with suppress(asyncio.CancelledError):
                await alarm_task
        close_pool()  # close pool at shutdown

app = FastAPI(
    title="DiPGOS Backend",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# Allow any localhost/127.* origin for dev tools (Vite/Next/Storybook, etc.)
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fallback header injector to guarantee CORS for local dev (covers any response path)
@app.middleware("http")
async def add_cors_headers(request, call_next):
    if request.method == "OPTIONS":
        from fastapi import Response

        resp = Response(status_code=200)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp
    response = await call_next(request)
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
    return response

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
app.include_router(rcc.router)
app.include_router(rcc_dam.router)
app.include_router(rcc_schedule.router)

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
