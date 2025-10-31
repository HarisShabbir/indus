import json
import logging
from pathlib import Path
from typing import Any, Iterable

from psycopg.errors import DatabaseError
from psycopg_pool import ConnectionPool

from .config import settings

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
FIXTURE_DIR = BASE_DIR / "fixtures"
MIGRATIONS_DIR = BASE_DIR.parent / "migrations"

# start closed, we'll open in app lifespan
pool = ConnectionPool(conninfo=settings.database_url, max_size=10, open=False)


SCHEMA_STATEMENTS: Iterable[str] = (
    """
    CREATE TABLE IF NOT EXISTS dipgos.projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat NUMERIC(9, 6) NOT NULL,
        lng NUMERIC(9, 6) NOT NULL,
        status_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
        phase TEXT NOT NULL,
        status_label TEXT,
        alerts INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        address TEXT,
        geofence_radius_m NUMERIC(10, 2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.alerts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES dipgos.projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        location TEXT,
        activity TEXT,
        severity TEXT,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        owner TEXT,
        root_cause TEXT,
        recommendation TEXT,
        acknowledged_at TIMESTAMPTZ,
        due_at TIMESTAMPTZ,
        cleared_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS category TEXT
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS owner TEXT
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS root_cause TEXT
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS recommendation TEXT
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.alert_items (
        id BIGSERIAL PRIMARY KEY,
        alert_id TEXT NOT NULL REFERENCES dipgos.alerts(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON dipgos.alerts(project_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_alert_items_alert_id ON dipgos.alert_items(alert_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.contracts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES dipgos.projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phase TEXT NOT NULL,
        discipline TEXT,
        lat NUMERIC(9, 6) NOT NULL,
        lng NUMERIC(9, 6) NOT NULL,
        status_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
        status_label TEXT,
        alerts INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        metadata JSONB DEFAULT '{}'::jsonb
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON dipgos.contracts(project_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.contract_sows (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES dipgos.contracts(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT,
        progress NUMERIC(5, 2) DEFAULT 0,
        sequence INTEGER DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.contract_sow_clauses (
        id TEXT PRIMARY KEY,
        sow_id TEXT NOT NULL REFERENCES dipgos.contract_sows(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT,
        lead TEXT,
        start_date DATE,
        due_date DATE,
        progress NUMERIC(5, 2) DEFAULT 0,
        sequence INTEGER DEFAULT 0
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_contract_sows_contract_id ON dipgos.contract_sows(contract_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_sow_clauses_sow_id ON dipgos.contract_sow_clauses(sow_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.project_insights (
        project_id TEXT PRIMARY KEY REFERENCES dipgos.projects(id) ON DELETE CASCADE,
        payload JSONB NOT NULL
    )
    """,
    """
    ALTER TABLE dipgos.projects
        ADD COLUMN IF NOT EXISTS address TEXT
    """,
    """
    ALTER TABLE dipgos.projects
        ADD COLUMN IF NOT EXISTS geofence_radius_m NUMERIC(10, 2)
    """,
    """
    ALTER TABLE dipgos.projects
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
    """,
    """
    ALTER TABLE dipgos.projects
        ALTER COLUMN updated_at SET DEFAULT NOW()
    """,
)


def open_pool() -> None:
    if pool.closed:
        pool.open()


def close_pool() -> None:
    if not pool.closed:
        pool.close()


def initialize_database() -> None:
    try:
        ensure_schema()
        apply_migrations()
        seed_database()
    except Exception:  # pragma: no cover - defensive guard
        logger.exception("Database initialization failed")
        raise


def ensure_schema() -> None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE SCHEMA IF NOT EXISTS dipgos")
            cur.execute("SET search_path TO dipgos, public")
            for statement in SCHEMA_STATEMENTS:
                cur.execute(statement)
        conn.commit()


def apply_migrations() -> None:
    """Execute idempotent SQL migrations stored in dipgos-backend/migrations."""
    if not MIGRATIONS_DIR.exists():
        return

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        return

    with pool.connection() as conn:
        for path in migration_files:
            sql = path.read_text()
            if not sql.strip():
                continue
            logger.info("Applying migration %s", path.name)
            with conn.cursor() as cur:
                cur.execute(sql)
        conn.commit()


def seed_database() -> None:
    """Idempotent bootstrap of MVP fixture data.

    In production this can be replaced by proper ETL/ingest. The seeding logic
    only runs when tables are empty to avoid stomping on live data.
    """
    projects_path = FIXTURE_DIR / "projects.json"
    alerts_path = FIXTURE_DIR / "alerts.json"

    if not projects_path.exists():
        return

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM dipgos.projects")
            (project_count,) = cur.fetchone()

        if project_count == 0:
            logger.info("Seeding dipgos.projects from %s", projects_path)
            projects = json.loads(projects_path.read_text())
            with conn.cursor() as cur:
                for project in projects:
                    cur.execute(
                        """
                        INSERT INTO dipgos.projects (
                            id, name, lat, lng, status_pct, phase, status_label,
                            alerts, image, address, geofence_radius_m, metadata
                        )
                        VALUES (
                            %(id)s, %(name)s, %(lat)s, %(lng)s, %(status_pct)s,
                            %(phase)s, %(status_label)s, %(alerts)s, %(image)s,
                            %(address)s, %(geofence_radius_m)s, '{}'::jsonb
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            lat = EXCLUDED.lat,
                            lng = EXCLUDED.lng,
                            status_pct = EXCLUDED.status_pct,
                            phase = EXCLUDED.phase,
                            status_label = EXCLUDED.status_label,
                            alerts = EXCLUDED.alerts,
                            image = EXCLUDED.image,
                            address = EXCLUDED.address,
                            geofence_radius_m = EXCLUDED.geofence_radius_m,
                            updated_at = NOW()
                        """,
                        project,
                    )
            conn.commit()

        if alerts_path.exists():
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM dipgos.alerts")
                (alert_count,) = cur.fetchone()
            if alert_count == 0:
                logger.info("Seeding dipgos.alerts from %s", alerts_path)
                alerts = json.loads(alerts_path.read_text())
                with conn.cursor() as cur:
                    for raw_alert in alerts:
                        alert = raw_alert.copy()
                        items = alert.pop("items", [])
                        metadata = alert.pop("metadata", {})
                        payload = {
                            "id": alert.get("id"),
                            "project_id": alert.get("project_id"),
                            "title": alert.get("title"),
                            "location": alert.get("location"),
                            "activity": alert.get("activity"),
                            "severity": alert.get("severity"),
                            "category": alert.get("category"),
                            "status": alert.get("status", "open"),
                            "owner": alert.get("owner"),
                            "root_cause": alert.get("root_cause"),
                            "recommendation": alert.get("recommendation"),
                            "acknowledged_at": alert.get("acknowledged_at"),
                            "due_at": alert.get("due_at"),
                            "cleared_at": alert.get("cleared_at"),
                            "raised_at": alert.get("raised_at"),
                            "metadata": json.dumps(metadata or {}),
                        }
                        cur.execute(
                            """
                            INSERT INTO dipgos.alerts (
                                id, project_id, title, location, activity, severity,
                                category, status, owner, root_cause, recommendation,
                                acknowledged_at, due_at, cleared_at, raised_at, metadata
                            )
                            VALUES (
                                %(id)s, %(project_id)s, %(title)s, %(location)s, %(activity)s, %(severity)s,
                                %(category)s, %(status)s, %(owner)s, %(root_cause)s, %(recommendation)s,
                                %(acknowledged_at)s, %(due_at)s, %(cleared_at)s, %(raised_at)s, %(metadata)s::jsonb
                            )
                            ON CONFLICT (id) DO UPDATE SET
                                title = EXCLUDED.title,
                                location = EXCLUDED.location,
                                activity = EXCLUDED.activity,
                                severity = EXCLUDED.severity,
                                category = EXCLUDED.category,
                                status = EXCLUDED.status,
                                owner = EXCLUDED.owner,
                                root_cause = EXCLUDED.root_cause,
                                recommendation = EXCLUDED.recommendation,
                                acknowledged_at = EXCLUDED.acknowledged_at,
                                due_at = EXCLUDED.due_at,
                                cleared_at = EXCLUDED.cleared_at,
                                raised_at = EXCLUDED.raised_at,
                                metadata = EXCLUDED.metadata
                            """,
                            payload,
                        )
                        cur.execute("DELETE FROM dipgos.alert_items WHERE alert_id = %s", (payload["id"],))
                        for item in items:
                            cur.execute(
                                """
                                INSERT INTO dipgos.alert_items (alert_id, item_type, label, detail)
                                VALUES (%s, %s, %s, %s)
                                ON CONFLICT DO NOTHING
                                """,
                                (
                                    payload["id"],
                                    item.get("item_type") or item.get("type"),
                                    item.get("label"),
                                    item.get("detail"),
                                ),
                            )
                conn.commit()


        contracts_path = FIXTURE_DIR / "contracts.json"
        insights_path = FIXTURE_DIR / "project_insights.json"

        if contracts_path.exists():
            logger.info("Syncing dipgos.contracts from %s", contracts_path)
            contracts = json.loads(contracts_path.read_text())
            with conn.cursor() as cur:
                for contract in contracts:
                    cur.execute(
                        """
                        INSERT INTO dipgos.contracts (
                            id, project_id, name, phase, discipline,
                            lat, lng, status_pct, status_label, alerts, image, metadata
                        )
                        VALUES (
                            %(id)s, %(project_id)s, %(name)s, %(phase)s, %(discipline)s,
                            %(lat)s, %(lng)s, %(status_pct)s, %(status_label)s, %(alerts)s, %(image)s, '{}'::jsonb
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            phase = EXCLUDED.phase,
                            discipline = EXCLUDED.discipline,
                            lat = EXCLUDED.lat,
                            lng = EXCLUDED.lng,
                            status_pct = EXCLUDED.status_pct,
                            status_label = EXCLUDED.status_label,
                            alerts = EXCLUDED.alerts,
                            image = EXCLUDED.image,
                            metadata = EXCLUDED.metadata
                        """,
                        contract,
                    )
            conn.commit()

        contract_sows_path = FIXTURE_DIR / "contract_sows.json"
        sow_clauses_path = FIXTURE_DIR / "contract_sow_clauses.json"

        if contract_sows_path.exists():
            logger.info("Syncing dipgos.contract_sows from %s", contract_sows_path)
            sows = json.loads(contract_sows_path.read_text())
            with conn.cursor() as cur:
                for sow in sows:
                    cur.execute(
                        """
                        INSERT INTO dipgos.contract_sows (id, contract_id, title, status, progress, sequence)
                        VALUES (%(id)s, %(contract_id)s, %(title)s, %(status)s, %(progress)s, %(sequence)s)
                        ON CONFLICT (id) DO UPDATE SET
                            title = EXCLUDED.title,
                            status = EXCLUDED.status,
                            progress = EXCLUDED.progress,
                            sequence = EXCLUDED.sequence
                        """,
                        sow,
                    )
            conn.commit()

        if sow_clauses_path.exists():
            logger.info("Syncing dipgos.contract_sow_clauses from %s", sow_clauses_path)
            clauses = json.loads(sow_clauses_path.read_text())
            with conn.cursor() as cur:
                for clause in clauses:
                    cur.execute(
                        """
                        INSERT INTO dipgos.contract_sow_clauses (
                            id, sow_id, title, status, lead, start_date, due_date, progress, sequence
                        )
                        VALUES (
                            %(id)s, %(sow_id)s, %(title)s, %(status)s, %(lead)s,
                            %(start_date)s, %(due_date)s, %(progress)s, %(sequence)s
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            title = EXCLUDED.title,
                            status = EXCLUDED.status,
                            lead = EXCLUDED.lead,
                            start_date = EXCLUDED.start_date,
                            due_date = EXCLUDED.due_date,
                            progress = EXCLUDED.progress,
                            sequence = EXCLUDED.sequence
                        """,
                        clause,
                    )
            conn.commit()

        if insights_path.exists():
            logger.info("Syncing dipgos.project_insights from %s", insights_path)
            insights = json.loads(insights_path.read_text())
            with conn.cursor() as cur:
                for insight in insights:
                    cur.execute(
                        """
                        INSERT INTO dipgos.project_insights (project_id, payload)
                        VALUES (%(project_id)s, %(payload)s::jsonb)
                        ON CONFLICT (project_id) DO UPDATE SET payload = EXCLUDED.payload
                        """,
                        {
                            "project_id": insight["project_id"],
                            "payload": json.dumps(insight["payload"]),
                        },
                    )
            conn.commit()
