-- 003_ccc_views.sql
-- CCC v2 rollup helpers (materialized view + indexes)
SET search_path TO dipgos, public;

DROP MATERIALIZED VIEW IF EXISTS dipgos.mv_ccc_latest_metric;

CREATE MATERIALIZED VIEW dipgos.mv_ccc_latest_metric AS
WITH latest_process AS (
  SELECT
    project_id,
    contract_id,
    sow_id,
    process_id,
    metric_code,
    actual_numeric,
    planned_numeric,
    ts_date,
    ROW_NUMBER() OVER (PARTITION BY process_id, metric_code ORDER BY ts_date DESC) AS rn
  FROM dipgos.kpi_fact
  WHERE scope_level = 'process'
),
process_metrics AS (
  SELECT
    project_id,
    contract_id,
    sow_id,
    process_id,
    metric_code,
    actual_numeric,
    planned_numeric,
    ts_date
  FROM latest_process
  WHERE rn = 1
),
sow_metrics AS (
  SELECT
    project_id,
    contract_id,
    sow_id,
    metric_code,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(actual_numeric)
      ELSE AVG(actual_numeric)
    END AS actual_numeric,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(planned_numeric)
      ELSE AVG(planned_numeric)
    END AS planned_numeric,
    MAX(ts_date) AS ts_date
  FROM process_metrics
  GROUP BY project_id, contract_id, sow_id, metric_code
),
contract_metrics AS (
  SELECT
    project_id,
    contract_id,
    metric_code,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(actual_numeric)
      ELSE AVG(actual_numeric)
    END AS actual_numeric,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(planned_numeric)
      ELSE AVG(planned_numeric)
    END AS planned_numeric,
    MAX(ts_date) AS ts_date
  FROM sow_metrics
  GROUP BY project_id, contract_id, metric_code
),
project_metrics AS (
  SELECT
    project_id,
    metric_code,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(actual_numeric)
      ELSE AVG(actual_numeric)
    END AS actual_numeric,
    CASE
      WHEN metric_code IN ('ev','pv','ac','ncr_open','ncr_closed','qaor_open','qaor_closed')
        THEN SUM(planned_numeric)
      ELSE AVG(planned_numeric)
    END AS planned_numeric,
    MAX(ts_date) AS ts_date
  FROM contract_metrics
  GROUP BY project_id, metric_code
)
SELECT
  'process'::text AS level,
  project_id,
  contract_id,
  sow_id,
  process_id,
  metric_code,
  actual_numeric,
  planned_numeric,
  ts_date
FROM process_metrics
UNION ALL
SELECT
  'sow'::text AS level,
  project_id,
  contract_id,
  sow_id,
  NULL AS process_id,
  metric_code,
  actual_numeric,
  planned_numeric,
  ts_date
FROM sow_metrics
UNION ALL
SELECT
  'contract'::text AS level,
  project_id,
  contract_id,
  NULL AS sow_id,
  NULL AS process_id,
  metric_code,
  actual_numeric,
  planned_numeric,
  ts_date
FROM contract_metrics
UNION ALL
SELECT
  'project'::text AS level,
  project_id,
  NULL AS contract_id,
  NULL AS sow_id,
  NULL AS process_id,
  metric_code,
  actual_numeric,
  planned_numeric,
  ts_date
FROM project_metrics;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ccc_latest_metric_uq
  ON dipgos.mv_ccc_latest_metric(level, project_id, COALESCE(contract_id, ''), COALESCE(sow_id, ''), COALESCE(process_id, ''), metric_code);

CREATE INDEX IF NOT EXISTS mv_ccc_latest_metric_project
  ON dipgos.mv_ccc_latest_metric(project_id, level, contract_id, sow_id, process_id, metric_code);

REFRESH MATERIALIZED VIEW dipgos.mv_ccc_latest_metric;
