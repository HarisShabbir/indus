-- 020_schedule_alignment.sql
-- Align process schedule metadata with atom-driven financial story
SET search_path TO dipgos, public;

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::text AS tenant_id,
    'diamer-basha'::text AS project_code,
    'mw-01-main-dam'::text AS contract_code,
    'sow-mw01-rcc'::text AS sow_code,
    '44444444-4444-4444-4444-444444444779'::text AS proc_dam_pit_id,
    '44444444-4444-4444-4444-444444444555'::text AS proc_benching_id
)
INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
SELECT scope.proc_dam_pit_id, scope.sow_code, 'Dam Pit Excavation', 'active', 'Excavation Lead', (CURRENT_DATE - INTERVAL '29 days')::date, (CURRENT_DATE + INTERVAL '1 day')::date, 62.0, 120
FROM scope
ON CONFLICT (id) DO UPDATE
SET sow_id = EXCLUDED.sow_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    lead = EXCLUDED.lead,
    start_date = EXCLUDED.start_date,
    due_date = EXCLUDED.due_date,
    progress = EXCLUDED.progress,
    sequence = EXCLUDED.sequence;

WITH scope AS (
  SELECT
    'sow-mw01-rcc'::text AS sow_code,
    '44444444-4444-4444-4444-444444444555'::text AS proc_benching_id
)
INSERT INTO dipgos.contract_sow_clauses (id, sow_id, title, status, lead, start_date, due_date, progress, sequence)
SELECT scope.proc_benching_id, scope.sow_code, 'Batching & Dewatering Ops', 'active', 'Pumping Lead', (CURRENT_DATE - INTERVAL '29 days')::date, (CURRENT_DATE + INTERVAL '1 day')::date, 58.0, 130
FROM scope
ON CONFLICT (id) DO UPDATE
SET sow_id = EXCLUDED.sow_id,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    lead = EXCLUDED.lead,
    start_date = EXCLUDED.start_date,
    due_date = EXCLUDED.due_date,
    progress = EXCLUDED.progress,
    sequence = EXCLUDED.sequence;

WITH scope AS (
  SELECT
    '44444444-4444-4444-4444-444444444779'::text AS proc_dam_pit_id,
    '44444444-4444-4444-4444-444444444555'::text AS proc_benching_id
)
UPDATE dipgos.contract_sow_clauses scc
SET
  start_date = (CURRENT_DATE - INTERVAL '29 days')::date,
  due_date   = (CURRENT_DATE + INTERVAL '1 day')::date
FROM scope
WHERE scc.id IN (scope.proc_dam_pit_id, scope.proc_benching_id);

-- refresh progress KPIs so schedule UI reflects utilisation
WITH scope AS (
  SELECT
    'process'::dipgos.scope_level AS scope_level,
    'diamer-basha'::text AS project_id,
    'mw-01-main-dam'::text AS contract_id,
    'sow-mw01-rcc'::text AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::text AS proc_dam_pit_id,
    '44444444-4444-4444-4444-444444444555'::text AS proc_benching_id
)
DELETE FROM dipgos.kpi_fact
USING scope
WHERE process_id IN (scope.proc_dam_pit_id, scope.proc_benching_id)
  AND metric_code IN ('schedule_progress_pct', 'prod_actual_pct', 'spi', 'cpi', 'quality_conf');

WITH scope AS (
  SELECT
    'process'::dipgos.scope_level AS scope_level,
    'diamer-basha'::text AS project_id,
    'mw-01-main-dam'::text AS contract_id,
    'sow-mw01-rcc'::text AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::text AS proc_dam_pit_id,
    '44444444-4444-4444-4444-444444444555'::text AS proc_benching_id
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
  currency_code,
  extra
)
SELECT
  scope.scope_level,
  scope.project_id,
  scope.contract_id,
  scope.sow_rcc_id,
  scope.proc_dam_pit_id,
  metric.metric_code,
  CURRENT_DATE,
  metric.actual_value,
  metric.planned_value,
  'USD',
  '{}'::jsonb
FROM scope
CROSS JOIN (
  VALUES
    ('schedule_progress_pct', 62.0, 100.0),
    ('prod_actual_pct', 60.0, 100.0),
    ('spi', 0.97, 1.00),
    ('cpi', 1.02, 1.00),
    ('quality_conf', 86.0, 95.0)
) AS metric(metric_code, actual_value, planned_value)
UNION ALL
SELECT
  scope.scope_level,
  scope.project_id,
  scope.contract_id,
  scope.sow_rcc_id,
  scope.proc_benching_id,
  metric.metric_code,
  CURRENT_DATE,
  metric.actual_value,
  metric.planned_value,
  'USD',
  '{}'::jsonb
FROM scope
CROSS JOIN (
  VALUES
    ('schedule_progress_pct', 58.0, 100.0),
    ('prod_actual_pct', 55.0, 100.0),
    ('spi', 0.94, 1.00),
    ('cpi', 0.98, 1.00),
    ('quality_conf', 88.0, 95.0)
) AS metric(metric_code, actual_value, planned_value);

-- ensure aggregated KPI views pick up the new process facts
REFRESH MATERIALIZED VIEW CONCURRENTLY dipgos.mv_kpi_sow;
REFRESH MATERIALIZED VIEW CONCURRENTLY dipgos.mv_kpi_contract;
REFRESH MATERIALIZED VIEW CONCURRENTLY dipgos.mv_kpi_project;
