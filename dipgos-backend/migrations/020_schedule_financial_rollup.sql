-- 020_schedule_financial_rollup.sql
-- Align scheduling allocations with financial rollups
SET search_path TO dipgos, public;

CREATE OR REPLACE VIEW dipgos.vw_atom_schedule_financial_rollup AS
WITH allocation_costs AS (
  SELECT
    tenant_id,
    project_id,
    contract_id,
    sow_id,
    process_id,
    SUM(
      COALESCE(billable_minutes, 0) / 60.0 * COALESCE(time_rate, 0)
      + COALESCE(non_billable_minutes, 0) / 60.0 * COALESCE(standby_rate, 0)
      + COALESCE(quantity, 0) * COALESCE(unit_rate, 0)
    ) AS actual_cost,
    SUM(COALESCE(planned_earned, 0)) AS planned_value
  FROM dipgos.atom_financial_allocations
  GROUP BY tenant_id, project_id, contract_id, sow_id, process_id
),
process_progress AS (
  SELECT
    tenant_id,
    process_id,
    AVG(COALESCE(percent_complete, 0)) AS percent_complete
  FROM dipgos.atom_schedule_entries
  WHERE process_id IS NOT NULL
  GROUP BY tenant_id, process_id
),
process_rollup AS (
  SELECT
    ac.tenant_id,
    ac.project_id,
    ac.contract_id,
    ac.sow_id,
    ac.process_id,
    ac.actual_cost,
    ac.planned_value,
    CASE
      WHEN ac.planned_value IS NULL OR ac.planned_value = 0 THEN NULL
      ELSE COALESCE(pp.percent_complete, 0)
    END AS percent_complete,
    COALESCE(ac.planned_value, 0) * COALESCE(pp.percent_complete, 0) AS earned_value
  FROM allocation_costs ac
  LEFT JOIN process_progress pp
    ON pp.tenant_id = ac.tenant_id
   AND pp.process_id = ac.process_id
  WHERE ac.process_id IS NOT NULL
),
sow_rollup AS (
  SELECT
    tenant_id,
    project_id,
    contract_id,
    sow_id,
    SUM(actual_cost) AS actual_cost,
    SUM(planned_value) AS planned_value,
    SUM(earned_value) AS earned_value
  FROM process_rollup
  WHERE sow_id IS NOT NULL
  GROUP BY tenant_id, project_id, contract_id, sow_id
),
contract_rollup AS (
  SELECT
    tenant_id,
    project_id,
    contract_id,
    SUM(actual_cost) AS actual_cost,
    SUM(planned_value) AS planned_value,
    SUM(earned_value) AS earned_value
  FROM process_rollup
  WHERE contract_id IS NOT NULL
  GROUP BY tenant_id, project_id, contract_id
),
project_rollup AS (
  SELECT
    tenant_id,
    project_id,
    SUM(actual_cost) AS actual_cost,
    SUM(planned_value) AS planned_value,
    SUM(earned_value) AS earned_value
  FROM process_rollup
  GROUP BY tenant_id, project_id
)
SELECT
  'process'::text AS level,
  tenant_id,
  project_id,
  contract_id,
  sow_id,
  process_id,
  process_id AS entity_id,
  actual_cost,
  planned_value,
  percent_complete,
  earned_value
FROM process_rollup
UNION ALL
SELECT
  'sow'::text AS level,
  tenant_id,
  project_id,
  contract_id,
  sow_id,
  NULL AS process_id,
  sow_id AS entity_id,
  actual_cost,
  planned_value,
  CASE WHEN planned_value = 0 THEN NULL ELSE earned_value / NULLIF(planned_value, 0) END AS percent_complete,
  earned_value
FROM sow_rollup
UNION ALL
SELECT
  'contract'::text AS level,
  tenant_id,
  project_id,
  contract_id,
  NULL AS sow_id,
  NULL AS process_id,
  contract_id AS entity_id,
  actual_cost,
  planned_value,
  CASE WHEN planned_value = 0 THEN NULL ELSE earned_value / NULLIF(planned_value, 0) END AS percent_complete,
  earned_value
FROM contract_rollup
UNION ALL
SELECT
  'project'::text AS level,
  tenant_id,
  project_id,
  NULL AS contract_id,
  NULL AS sow_id,
  NULL AS process_id,
  project_id AS entity_id,
  actual_cost,
  planned_value,
  CASE WHEN planned_value = 0 THEN NULL ELSE earned_value / NULLIF(planned_value, 0) END AS percent_complete,
  earned_value
FROM project_rollup;
