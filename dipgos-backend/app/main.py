from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from contextlib import asynccontextmanager

from .routers import projects, alerts, kpi, contract_kpi, schedule, contract_schedule, weather, ccc_v2, financial
from .db import open_pool, close_pool, pool, initialize_database

@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()       # open DB pool at startup
    initialize_database()
    yield
    close_pool()      # close pool at shutdown

app = FastAPI(
    title="DiPGOS Backend",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(CORSMiddleware, allow_origins=origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(alerts.router,   prefix="/api/alerts",   tags=["alerts"])
app.include_router(kpi.router,      prefix="/api/kpi",      tags=["kpi"])
app.include_router(contract_kpi.router)
app.include_router(schedule.router)
app.include_router(contract_schedule.router)
app.include_router(weather.router)
app.include_router(ccc_v2.router)
app.include_router(financial.router)

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
