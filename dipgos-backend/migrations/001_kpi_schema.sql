-- 001_kpi_schema.sql
-- KPI persistence and rollup objects
SET search_path TO dipgos, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scope_level') THEN
    CREATE TYPE dipgos.scope_level AS ENUM ('process','sow','contract','project');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit') THEN
    CREATE TYPE dipgos.unit AS ENUM ('%','#','m','m2','m3','hrs','km','t','pcs','currency','NA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity') THEN
    CREATE TYPE dipgos.activity AS ENUM ('excavation','tunneling','concrete','structure','quality','schedule','finance','other');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS dipgos.metric_def (
  metric_code TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  unit TEXT DEFAULT NULL,
  kind TEXT DEFAULT 'kpi'
);

INSERT INTO dipgos.metric_def (metric_code, metric_name, unit, kind) VALUES
  ('prod_actual_pct','Physical Works Completed - Actual %','%','ratio'),
  ('prod_planned_pct','Physical Works Completed - Planned %','%','ratio'),
  ('design_output','Design Work Output %','%','ratio'),
  ('prep_output','Preparatory Work Output %','%','ratio'),
  ('const_output','Construction Work Output %','%','ratio'),
  ('ncr_open','NCR Open','#','count'),
  ('ncr_closed','NCR Closed','#','count'),
  ('qaor_open','QAOR Open','#','count'),
  ('qaor_closed','QAOR Closed','#','count'),
  ('quality_conf','Quality Conformance %','%','ratio'),
  ('spi','Schedule Performance Index',NULL,'ratio'),
  ('ev','Earned Value','currency','currency'),
  ('pv','Planned Value','currency','currency'),
  ('ac','Actual Cost','currency','currency'),
  ('cpi','Cost Performance Index',NULL,'ratio'),
  ('schedule_progress_pct','Schedule Progress %','%','ratio')
ON CONFLICT (metric_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS dipgos.process_daily_report (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  project_id TEXT NOT NULL REFERENCES dipgos.projects(id),
  contract_id TEXT NOT NULL REFERENCES dipgos.contracts(id),
  sow_id TEXT NOT NULL REFERENCES dipgos.contract_sows(id),
  process_id TEXT NOT NULL REFERENCES dipgos.contract_sow_clauses(id),
  weather TEXT NULL,
  temp_max_c NUMERIC(5,2) NULL,
  temp_min_c NUMERIC(5,2) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (process_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_process_daily_report_date
  ON dipgos.process_daily_report(report_date, project_id);

CREATE TABLE IF NOT EXISTS dipgos.process_daily_item (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES dipgos.process_daily_report(id) ON DELETE CASCADE,
  activity dipgos.activity NOT NULL,
  location_label TEXT NULL,
  metric_label TEXT NOT NULL,
  unit dipgos.unit NOT NULL DEFAULT 'NA',
  designed_total NUMERIC(18,4) NULL,
  produced_day NUMERIC(18,4) NULL,
  produced_night NUMERIC(18,4) NULL,
  produced_total NUMERIC(18,4) NULL,
  cumulative_actual NUMERIC(18,4) NULL,
  cumulative_planned NUMERIC(18,4) NULL,
  remaining NUMERIC(18,4) NULL,
  completion_pct NUMERIC(6,2) NULL,
  cost_actual NUMERIC(18,2) NULL,
  cost_planned NUMERIC(18,2) NULL,
  extra JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_process_daily_item_report_id
  ON dipgos.process_daily_item(report_id);

CREATE TABLE IF NOT EXISTS dipgos.kpi_fact (
  id BIGSERIAL PRIMARY KEY,
  scope_level dipgos.scope_level NOT NULL,
  project_id TEXT NOT NULL REFERENCES dipgos.projects(id),
  contract_id TEXT NOT NULL REFERENCES dipgos.contracts(id),
  sow_id TEXT NOT NULL REFERENCES dipgos.contract_sows(id),
  process_id TEXT NOT NULL REFERENCES dipgos.contract_sow_clauses(id),
  metric_code TEXT NOT NULL REFERENCES dipgos.metric_def(metric_code),
  ts_date DATE NOT NULL,
  actual_numeric DOUBLE PRECISION NULL,
  planned_numeric DOUBLE PRECISION NULL,
  currency_code CHAR(3) DEFAULT 'USD',
  extra JSONB DEFAULT '{}'::jsonb,
  UNIQUE (process_id, metric_code, ts_date)
);

CREATE INDEX IF NOT EXISTS kpi_fact_idx
  ON dipgos.kpi_fact(scope_level, project_id, contract_id, sow_id, process_id, metric_code, ts_date);

CREATE MATERIALIZED VIEW IF NOT EXISTS dipgos.mv_kpi_sow AS
SELECT 'sow'::dipgos.scope_level AS scope_level,
       project_id,
       contract_id,
       sow_id,
       metric_code,
       ts_date,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(actual_numeric) ELSE AVG(actual_numeric) END AS actual_numeric,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(planned_numeric) ELSE AVG(planned_numeric) END AS planned_numeric
FROM dipgos.kpi_fact
WHERE scope_level = 'process'
GROUP BY project_id, contract_id, sow_id, metric_code, ts_date;

CREATE UNIQUE INDEX IF NOT EXISTS mv_kpi_sow_uq
  ON dipgos.mv_kpi_sow(project_id, contract_id, sow_id, metric_code, ts_date);

CREATE MATERIALIZED VIEW IF NOT EXISTS dipgos.mv_kpi_contract AS
SELECT 'contract'::dipgos.scope_level AS scope_level,
       project_id,
       contract_id,
       metric_code,
       ts_date,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(actual_numeric) ELSE AVG(actual_numeric) END AS actual_numeric,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(planned_numeric) ELSE AVG(planned_numeric) END AS planned_numeric
FROM dipgos.mv_kpi_sow
GROUP BY project_id, contract_id, metric_code, ts_date;

CREATE UNIQUE INDEX IF NOT EXISTS mv_kpi_contract_uq
  ON dipgos.mv_kpi_contract(project_id, contract_id, metric_code, ts_date);

CREATE MATERIALIZED VIEW IF NOT EXISTS dipgos.mv_kpi_project AS
SELECT 'project'::dipgos.scope_level AS scope_level,
       project_id,
       metric_code,
       ts_date,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(actual_numeric) ELSE AVG(actual_numeric) END AS actual_numeric,
       CASE WHEN metric_code IN ('ncr_open','ncr_closed','qaor_open','qaor_closed','ev','pv','ac')
            THEN SUM(planned_numeric) ELSE AVG(planned_numeric) END AS planned_numeric
FROM dipgos.mv_kpi_contract
GROUP BY project_id, metric_code, ts_date;

CREATE UNIQUE INDEX IF NOT EXISTS mv_kpi_project_uq
  ON dipgos.mv_kpi_project(project_id, metric_code, ts_date);

CREATE OR REPLACE VIEW dipgos.v_kpi_latest_process AS
SELECT DISTINCT ON (process_id, metric_code)
  process_id,
  metric_code,
  ts_date,
  actual_numeric,
  planned_numeric,
  contract_id,
  sow_id,
  project_id
FROM dipgos.kpi_fact
WHERE scope_level = 'process'
ORDER BY process_id, metric_code, ts_date DESC;

CREATE OR REPLACE VIEW dipgos.v_kpi_series_process AS
SELECT process_id,
       project_id,
       contract_id,
       sow_id,
       metric_code,
       ts_date,
       actual_numeric,
       planned_numeric
FROM dipgos.kpi_fact
WHERE scope_level = 'process';

CREATE OR REPLACE VIEW dipgos.v_kpi_latest_sow AS
SELECT DISTINCT ON (sow_id, metric_code)
  sow_id,
  contract_id,
  project_id,
  metric_code,
  ts_date,
  actual_numeric,
  planned_numeric
FROM dipgos.mv_kpi_sow
ORDER BY sow_id, metric_code, ts_date DESC;

CREATE OR REPLACE VIEW dipgos.v_kpi_series_sow AS
SELECT sow_id,
       contract_id,
       project_id,
       metric_code,
       ts_date,
       actual_numeric,
       planned_numeric
FROM dipgos.mv_kpi_sow;

CREATE OR REPLACE VIEW dipgos.v_kpi_latest_contract AS
SELECT DISTINCT ON (contract_id, metric_code)
  contract_id,
  project_id,
  metric_code,
  ts_date,
  actual_numeric,
  planned_numeric
FROM dipgos.mv_kpi_contract
ORDER BY contract_id, metric_code, ts_date DESC;

CREATE OR REPLACE VIEW dipgos.v_kpi_latest_project AS
SELECT DISTINCT ON (project_id, metric_code)
  project_id,
  metric_code,
  ts_date,
  actual_numeric,
  planned_numeric
FROM dipgos.mv_kpi_project
ORDER BY project_id, metric_code, ts_date DESC;

CREATE OR REPLACE VIEW dipgos.v_kpi_series_project AS
SELECT project_id,
       metric_code,
       ts_date,
       actual_numeric,
       planned_numeric
FROM dipgos.mv_kpi_project;

CREATE OR REPLACE VIEW dipgos.v_scope_tree AS
SELECT p.id AS project_id,
       c.id AS contract_id,
       cs.id AS sow_id,
       csc.id AS process_id
FROM dipgos.projects p
JOIN dipgos.contracts c ON c.project_id = p.id
JOIN dipgos.contract_sows cs ON cs.contract_id = c.id
JOIN dipgos.contract_sow_clauses csc ON csc.sow_id = cs.id;

CREATE OR REPLACE FUNCTION dipgos.refresh_kpi_rollups() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW dipgos.mv_kpi_sow;
  REFRESH MATERIALIZED VIEW dipgos.mv_kpi_contract;
  REFRESH MATERIALIZED VIEW dipgos.mv_kpi_project;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dipgos.ingest_daily_kpis(p_from DATE, p_to DATE)
RETURNS void AS $$
BEGIN
  WITH base AS (
    SELECT r.project_id,
           r.contract_id,
           r.sow_id,
           r.process_id,
           r.report_date,
           i.id AS item_id,
           i.activity,
           i.metric_label,
           i.designed_total,
           COALESCE(i.produced_total, COALESCE(i.produced_day,0) + COALESCE(i.produced_night,0)) AS produced_total,
           COALESCE(i.cumulative_actual, 0) AS cumulative_actual,
           COALESCE(i.cumulative_planned, 0) AS cumulative_planned,
           i.remaining,
           i.completion_pct,
           i.cost_actual,
           i.cost_planned,
           i.extra
    FROM dipgos.process_daily_report r
    JOIN dipgos.process_daily_item i ON i.report_id = r.id
    WHERE r.report_date BETWEEN p_from AND p_to
  ),
  prepared AS (
    SELECT b.*,
           CASE
             WHEN b.designed_total IS NULL OR b.designed_total = 0 THEN NULL
             ELSE LEAST(100.0, GREATEST(0.0, (b.cumulative_actual / b.designed_total) * 100.0))
           END AS pct_actual,
           CASE
             WHEN b.designed_total IS NULL OR b.designed_total = 0 THEN NULL
             ELSE LEAST(100.0, GREATEST(0.0, (b.cumulative_planned / NULLIF(b.designed_total,0)) * 100.0))
           END AS pct_planned,
           COALESCE((b.extra ->> 'ncr_open')::numeric, 0) AS ncr_open_val,
           COALESCE((b.extra ->> 'ncr_closed')::numeric, 0) AS ncr_closed_val,
           COALESCE((b.extra ->> 'qaor_open')::numeric, 0) AS qaor_open_val,
           COALESCE((b.extra ->> 'qaor_closed')::numeric, 0) AS qaor_closed_val,
           COALESCE((b.extra ->> 'quality_conf')::numeric, b.completion_pct) AS quality_conf_val,
           COALESCE((b.extra ->> 'schedule_progress_pct')::numeric, b.completion_pct) AS schedule_progress_val,
           COALESCE((b.extra ->> 'spi')::numeric, NULL) AS spi_val,
           COALESCE((b.extra ->> 'ev')::numeric, NULL) AS ev_val,
           COALESCE((b.extra ->> 'pv')::numeric, NULL) AS pv_val
    FROM base b
  ),
  metrics AS (
    SELECT project_id,
           contract_id,
           sow_id,
           process_id,
           report_date AS ts_date,
           'prod_actual_pct'::text AS metric_code,
           pct_actual AS actual_value,
           pct_planned AS planned_value,
           jsonb_build_object('source','process_daily_item','item_id', item_id) AS extra
    FROM prepared
    WHERE pct_actual IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, ts_date,
           'prod_planned_pct', planned_value, planned_value,
           jsonb_build_object('source','process_daily_item','item_id', item_id)
    FROM (
      SELECT project_id, contract_id, sow_id, process_id, report_date AS ts_date,
             pct_planned AS planned_value, item_id
      FROM prepared
    ) q
    WHERE planned_value IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'const_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity, 'item_id', item_id)
    FROM prepared
    WHERE activity IN ('excavation','tunneling','concrete','structure')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'design_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity, 'item_id', item_id)
    FROM prepared
    WHERE activity IN ('structure','other')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'prep_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity, 'item_id', item_id)
    FROM prepared
    WHERE activity IN ('tunneling','other')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ncr_open',
           ncr_open_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ncr_open_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ncr_closed',
           ncr_closed_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ncr_closed_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'qaor_open',
           qaor_open_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE qaor_open_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'qaor_closed',
           qaor_closed_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE qaor_closed_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'quality_conf',
           quality_conf_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE quality_conf_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'schedule_progress_pct',
           schedule_progress_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE schedule_progress_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'spi',
           spi_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE spi_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ev',
           ev_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ev_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'pv',
           pv_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE pv_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ac',
           cost_actual::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE cost_actual IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'cpi',
           CASE
             WHEN cost_actual IS NULL OR cost_actual = 0 THEN NULL
             ELSE COALESCE(ev_val,0)::double precision / NULLIF(cost_actual::double precision, 0)
           END,
           NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE cost_actual IS NOT NULL AND cost_actual <> 0 AND ev_val IS NOT NULL
  )
  INSERT INTO dipgos.kpi_fact (
    scope_level,
    project_id,
    contract_id,
    sow_id,
    process_id,
    metric_code,
    ts_date,
    actual_numeric,
    planned_numeric,
    extra
  )
  SELECT 'process'::dipgos.scope_level,
         project_id,
         contract_id,
         sow_id,
         process_id,
         metric_code,
         ts_date,
         actual_value,
         planned_value,
         extra
  FROM metrics
  ON CONFLICT (process_id, metric_code, ts_date) DO UPDATE
  SET actual_numeric = EXCLUDED.actual_numeric,
      planned_numeric = EXCLUDED.planned_numeric,
      extra = EXCLUDED.extra;

  PERFORM dipgos.refresh_kpi_rollups();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW dipgos.v_kpi_series_contract AS
SELECT contract_id,
       project_id,
       metric_code,
       ts_date,
       actual_numeric,
       planned_numeric
FROM dipgos.mv_kpi_contract;
