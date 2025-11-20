import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from psycopg.errors import DatabaseError
from psycopg_pool import ConnectionPool
from psycopg.types.json import Json

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
    CREATE TABLE IF NOT EXISTS dipgos.contract_sow_markers (
        sow_id TEXT PRIMARY KEY REFERENCES dipgos.contract_sows(id) ON DELETE CASCADE,
        lat NUMERIC(9, 6) NOT NULL,
        lng NUMERIC(9, 6) NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.contract_sow_metrics (
        sow_id TEXT PRIMARY KEY REFERENCES dipgos.contract_sows(id) ON DELETE CASCADE,
        actual_progress NUMERIC(5, 2),
        planned_progress NUMERIC(5, 2),
        quality_score NUMERIC(5, 2),
        spi NUMERIC(5, 2),
        cpi NUMERIC(5, 2),
        ncr_open INTEGER DEFAULT 0,
        ncr_closed INTEGER DEFAULT 0,
        qaor_open INTEGER DEFAULT 0,
        qaor_closed INTEGER DEFAULT 0,
        design_actual NUMERIC(6, 2),
        design_planned NUMERIC(6, 2),
        preparatory_actual NUMERIC(6, 2),
        preparatory_planned NUMERIC(6, 2),
        construction_actual NUMERIC(6, 2),
        construction_planned NUMERIC(6, 2),
        scope_weight NUMERIC(6, 3) DEFAULT 1.0,
        ev_value NUMERIC(12, 2),
        pv_value NUMERIC(12, 2),
        ac_value NUMERIC(12, 2)
    )
    """,
    """
    ALTER TABLE dipgos.contract_sow_metrics
        ADD COLUMN IF NOT EXISTS design_actual NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS design_planned NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS preparatory_actual NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS preparatory_planned NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS construction_actual NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS construction_planned NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS scope_weight NUMERIC(6, 3) DEFAULT 1.0,
        ADD COLUMN IF NOT EXISTS ev_value NUMERIC(12, 2),
        ADD COLUMN IF NOT EXISTS pv_value NUMERIC(12, 2),
        ADD COLUMN IF NOT EXISTS ac_value NUMERIC(12, 2)
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
    """
    CREATE TABLE IF NOT EXISTS dipgos.process_historian (
        id BIGSERIAL PRIMARY KEY,
        record_id TEXT,
        alarm_id TEXT,
        record_type TEXT NOT NULL,
        action TEXT NOT NULL,
        project_id TEXT,
        project_name TEXT,
        contract_id TEXT,
        contract_name TEXT,
        sow_id TEXT,
        sow_name TEXT,
        process_id TEXT,
        process_name TEXT,
        title TEXT,
        severity TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        notes TEXT
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_process_historian_process_id ON dipgos.process_historian(process_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_process_historian_record_type ON dipgos.process_historian(record_type)
    """,
    """
    CREATE TABLE IF NOT EXISTS dipgos.rcc_block_metrics (
        id SERIAL PRIMARY KEY,
        dam_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        lift INTEGER NOT NULL,
        percent_complete NUMERIC(5, 2),
        actual_rate NUMERIC(8, 2),
        temperature NUMERIC(5, 2),
        lag_minutes NUMERIC(6, 2),
        status TEXT NOT NULL,
        rule_violated BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dam_id, block_id, lift)
    )
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


def _seed_rcc_process(conn, payload: dict) -> None:
    sow_id = payload.get("sow_id")
    stages = payload.get("stages") or []
    rules = payload.get("rules") or []
    created_by = payload.get("created_by")
    if not sow_id or not stages:
        return

    now = datetime.now(timezone.utc)
    operations: list[dict[str, Any]] = []
    inputs: list[dict[str, Any]] = []

    def _visit(stage_id: str, op_def: dict, parent_id: str | None = None) -> None:
        op_entry = {
            "id": op_def["id"],
            "stage_id": stage_id,
            "parent_id": parent_id,
            "name": op_def["name"],
            "type": op_def.get("type", "operation"),
            "metadata": op_def.get("metadata") or {},
            "rule_id": op_def.get("rule_id"),
            "sequence": op_def.get("sequence") or 0,
        }
        operations.append(op_entry)
        for input_def in op_def.get("inputs") or []:
            inputs.append(
                {
                    "id": input_def["id"],
                    "operation_id": op_entry["id"],
                    "label": input_def["label"],
                    "unit": input_def.get("unit"),
                    "source_type": input_def.get("source_type"),
                    "source_name": input_def.get("source_name"),
                    "thresholds": input_def.get("thresholds") or {},
                    "current_value": input_def.get("current_value"),
                    "metadata": input_def.get("metadata") or {},
                }
            )
        for child in op_def.get("children") or []:
            _visit(stage_id, child, op_entry["id"])

    with conn.cursor() as cur:
        for stage in stages:
            cur.execute(
                """
                INSERT INTO dipgos.process_stages (id, sow_id, name, description, sequence, created_by)
                VALUES (%(id)s, %(sow_id)s, %(name)s, %(description)s, %(sequence)s, %(created_by)s)
                ON CONFLICT (id) DO UPDATE SET
                    sow_id = EXCLUDED.sow_id,
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    sequence = EXCLUDED.sequence,
                    created_by = EXCLUDED.created_by,
                    updated_at = NOW()
                """,
                {
                    "id": stage["id"],
                    "sow_id": sow_id,
                    "name": stage["name"],
                    "description": stage.get("description"),
                    "sequence": stage.get("sequence") or 0,
                    "created_by": created_by,
                },
            )
            for op in stage.get("operations") or []:
                _visit(stage["id"], op)

        for rule in rules:
            cur.execute(
                """
                INSERT INTO dipgos.alarm_rules (
                    id, category, condition, severity, action, message,
                    enabled, created_by, metadata, updated_at
                )
                VALUES (
                    %(id)s, %(category)s, %(condition)s, %(severity)s, %(action)s, %(message)s,
                    %(enabled)s, %(created_by)s, %(metadata)s, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    category = EXCLUDED.category,
                    condition = EXCLUDED.condition,
                    severity = EXCLUDED.severity,
                    action = EXCLUDED.action,
                    message = EXCLUDED.message,
                    enabled = EXCLUDED.enabled,
                    created_by = COALESCE(EXCLUDED.created_by, dipgos.alarm_rules.created_by),
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
                """,
                {
                    "id": rule["id"],
                    "category": rule["category"],
                    "condition": rule["condition"],
                    "severity": rule["severity"],
                    "action": rule.get("action"),
                    "message": rule.get("message"),
                    "enabled": rule.get("enabled", True),
                    "created_by": rule.get("created_by") or created_by,
                    "metadata": Json(rule.get("metadata") or {}),
                },
            )

        for op in operations:
            cur.execute(
                """
                INSERT INTO dipgos.process_operations (
                    id, stage_id, parent_id, name, type, metadata, rule_id, sequence
                )
                VALUES (
                    %(id)s, %(stage_id)s, %(parent_id)s, %(name)s, %(type)s,
                    %(metadata)s, %(rule_id)s, %(sequence)s
                )
                ON CONFLICT (id) DO UPDATE SET
                    stage_id = EXCLUDED.stage_id,
                    parent_id = EXCLUDED.parent_id,
                    name = EXCLUDED.name,
                    type = EXCLUDED.type,
                    metadata = EXCLUDED.metadata,
                    rule_id = EXCLUDED.rule_id,
                    sequence = EXCLUDED.sequence
                """,
                {
                    "id": op["id"],
                    "stage_id": op["stage_id"],
                    "parent_id": op["parent_id"],
                    "name": op["name"],
                    "type": op["type"],
                    "metadata": Json(op["metadata"]),
                    "rule_id": op["rule_id"],
                    "sequence": op["sequence"],
                },
            )

        for input_meta in inputs:
            cur.execute(
                """
                INSERT INTO dipgos.process_inputs (
                    id, operation_id, label, unit, source_type, source_name,
                    thresholds, current_value, last_observed, metadata
                )
                VALUES (
                    %(id)s, %(operation_id)s, %(label)s, %(unit)s, %(source_type)s, %(source_name)s,
                    %(thresholds)s, %(current_value)s, %(last_observed)s, %(metadata)s
                )
                ON CONFLICT (id) DO UPDATE SET
                    operation_id = EXCLUDED.operation_id,
                    label = EXCLUDED.label,
                    unit = EXCLUDED.unit,
                    source_type = EXCLUDED.source_type,
                    source_name = EXCLUDED.source_name,
                    thresholds = EXCLUDED.thresholds,
                    current_value = EXCLUDED.current_value,
                    last_observed = EXCLUDED.last_observed,
                    metadata = EXCLUDED.metadata
                """,
                {
                    "id": input_meta["id"],
                    "operation_id": input_meta["operation_id"],
                    "label": input_meta["label"],
                    "unit": input_meta["unit"],
                    "source_type": input_meta["source_type"],
                    "source_name": input_meta["source_name"],
                    "thresholds": Json(input_meta["thresholds"]),
                    "current_value": input_meta["current_value"],
                    "last_observed": now,
                    "metadata": Json(input_meta["metadata"]),
                },
            )


def _seed_rcc_block_progress(conn) -> None:
    progress_path = FIXTURE_DIR / "rcc_block_progress.json"
    if not progress_path.exists():
        return
    rows = json.loads(progress_path.read_text())
    if not isinstance(rows, list):
        return
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO dipgos.rcc_block_progress (
                    id,
                    sow_id,
                    block_no,
                    lift_no,
                    status,
                    percent_complete,
                    temperature,
                    density,
                    batch_id,
                    vendor,
                    ipc_value,
                    metadata,
                    observed_at,
                    updated_at
                )
                VALUES (
                    %(id)s,
                    %(sow_id)s,
                    %(block_no)s,
                    %(lift_no)s,
                    %(status)s,
                    %(percent_complete)s,
                    %(temperature)s,
                    %(density)s,
                    %(batch_id)s,
                    %(vendor)s,
                    %(ipc_value)s,
                    %(metadata)s,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    sow_id = EXCLUDED.sow_id,
                    block_no = EXCLUDED.block_no,
                    lift_no = EXCLUDED.lift_no,
                    status = EXCLUDED.status,
                    percent_complete = EXCLUDED.percent_complete,
                    temperature = EXCLUDED.temperature,
                    density = EXCLUDED.density,
                    batch_id = EXCLUDED.batch_id,
                    vendor = EXCLUDED.vendor,
                    ipc_value = EXCLUDED.ipc_value,
                    metadata = EXCLUDED.metadata,
                    observed_at = NOW(),
                    updated_at = NOW()
                """,
                {
                    "id": row["id"],
                    "sow_id": row["sow_id"],
                    "block_no": row["block_no"],
                    "lift_no": row["lift_no"],
                    "status": row.get("status", "planned"),
                    "percent_complete": row.get("percent_complete", 0),
                    "temperature": row.get("temperature"),
                    "density": row.get("density"),
                    "batch_id": row.get("batch_id"),
                    "vendor": row.get("vendor"),
                    "ipc_value": row.get("ipc_value"),
                    "metadata": Json(row.get("metadata") or {}),
                },
            )
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

        rcc_process_path = FIXTURE_DIR / "rcc_process.json"
        if rcc_process_path.exists():
            logger.info("Syncing RCC process definitions from %s", rcc_process_path)
            payload = json.loads(rcc_process_path.read_text())
            _seed_rcc_process(conn, payload)
            conn.commit()
        _seed_rcc_block_progress(conn)


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

        sow_markers_path = FIXTURE_DIR / "contract_sow_markers.json"
        if sow_markers_path.exists():
            logger.info("Syncing dipgos.contract_sow_markers from %s", sow_markers_path)
            markers = json.loads(sow_markers_path.read_text())
            with conn.cursor() as cur:
                for marker in markers:
                    cur.execute(
                        """
                        INSERT INTO dipgos.contract_sow_markers (sow_id, lat, lng)
                        VALUES (%(sow_id)s, %(lat)s, %(lng)s)
                        ON CONFLICT (sow_id) DO UPDATE SET
                            lat = EXCLUDED.lat,
                            lng = EXCLUDED.lng
                        """,
                        marker,
                    )
            conn.commit()

        sow_metrics_path = FIXTURE_DIR / "contract_sow_metrics.json"
        if sow_metrics_path.exists():
            logger.info("Syncing dipgos.contract_sow_metrics from %s", sow_metrics_path)
            metrics = json.loads(sow_metrics_path.read_text())
            with conn.cursor() as cur:
                for row in metrics:
                    cur.execute(
                        """
                        INSERT INTO dipgos.contract_sow_metrics (
                            sow_id,
                            actual_progress,
                            planned_progress,
                            quality_score,
                            spi,
                            cpi,
                            ncr_open,
                            ncr_closed,
                            qaor_open,
                            qaor_closed,
                            design_actual,
                            design_planned,
                            preparatory_actual,
                            preparatory_planned,
                            construction_actual,
                            construction_planned,
                            scope_weight,
                            ev_value,
                            pv_value,
                            ac_value
                        )
                        VALUES (
                            %(sow_id)s,
                            %(actual_progress)s,
                            %(planned_progress)s,
                            %(quality_score)s,
                            %(spi)s,
                            %(cpi)s,
                            %(ncr_open)s,
                            %(ncr_closed)s,
                            %(qaor_open)s,
                            %(qaor_closed)s,
                            %(design_actual)s,
                            %(design_planned)s,
                            %(preparatory_actual)s,
                            %(preparatory_planned)s,
                            %(construction_actual)s,
                            %(construction_planned)s,
                            %(scope_weight)s,
                            %(ev_value)s,
                            %(pv_value)s,
                            %(ac_value)s
                        )
                        ON CONFLICT (sow_id) DO UPDATE SET
                            actual_progress = EXCLUDED.actual_progress,
                            planned_progress = EXCLUDED.planned_progress,
                            quality_score = EXCLUDED.quality_score,
                            spi = EXCLUDED.spi,
                            cpi = EXCLUDED.cpi,
                            ncr_open = EXCLUDED.ncr_open,
                            ncr_closed = EXCLUDED.ncr_closed,
                            qaor_open = EXCLUDED.qaor_open,
                            qaor_closed = EXCLUDED.qaor_closed,
                            design_actual = EXCLUDED.design_actual,
                            design_planned = EXCLUDED.design_planned,
                            preparatory_actual = EXCLUDED.preparatory_actual,
                            preparatory_planned = EXCLUDED.preparatory_planned,
                            construction_actual = EXCLUDED.construction_actual,
                            construction_planned = EXCLUDED.construction_planned,
                            scope_weight = EXCLUDED.scope_weight,
                            ev_value = EXCLUDED.ev_value,
                            pv_value = EXCLUDED.pv_value,
                            ac_value = EXCLUDED.ac_value
                        """,
                        row,
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
