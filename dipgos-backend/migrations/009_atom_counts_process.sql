-- 009_atom_counts_process.sql
-- Improve atom count rollups to surface process-level scopes and categories that only
-- have actively deployed atoms (no home assignment within the hierarchy).
SET search_path TO dipgos, public;

DROP VIEW IF EXISTS dipgos.vw_atom_counts;

CREATE VIEW dipgos.vw_atom_counts AS
WITH RECURSIVE entity_closure AS (
  SELECT entity_id AS descendant_id, entity_id AS ancestor_id
  FROM dipgos.entities
  UNION ALL
  SELECT child.entity_id, entity_closure.ancestor_id
  FROM dipgos.entities child
  JOIN entity_closure ON child.parent_id = entity_closure.descendant_id
),
atom_scope AS (
  SELECT a.id AS atom_id, a.home_entity_id, t.category, a.tenant_id
  FROM dipgos.atoms a
  JOIN dipgos.atom_types t ON t.id = a.atom_type_id
  WHERE a.active
),
active_deployments AS (
  SELECT atom_id, process_id, tenant_id
  FROM dipgos.atom_deployments
  WHERE COALESCE(end_ts, NOW()) >= NOW()
),
atom_rollup AS (
  SELECT
    entity_closure.ancestor_id AS entity_id,
    atom_scope.category,
    atom_scope.tenant_id,
    COUNT(*) AS total
  FROM atom_scope
  JOIN entity_closure ON atom_scope.home_entity_id = entity_closure.descendant_id
  GROUP BY entity_closure.ancestor_id, atom_scope.category, atom_scope.tenant_id
),
process_rollup AS (
  SELECT
    d.process_id AS entity_id,
    t.category,
    a.tenant_id,
    COUNT(DISTINCT d.atom_id) AS total
  FROM active_deployments d
  JOIN dipgos.atoms a ON a.id = d.atom_id
  JOIN dipgos.atom_types t ON t.id = a.atom_type_id
  GROUP BY d.process_id, t.category, a.tenant_id
),
all_totals AS (
  SELECT entity_id, category, tenant_id, total FROM atom_rollup
  UNION ALL
  SELECT entity_id, category, tenant_id, total FROM process_rollup
),
normalised_totals AS (
  SELECT
    entity_id,
    category,
    tenant_id,
    SUM(total)::bigint AS total
  FROM all_totals
  GROUP BY entity_id, category, tenant_id
),
engaged_rollup AS (
  SELECT
    entity_closure.ancestor_id AS entity_id,
    t.category,
    a.tenant_id,
    COUNT(DISTINCT d.atom_id) AS engaged
  FROM active_deployments d
  JOIN dipgos.atoms a ON a.id = d.atom_id
  JOIN dipgos.atom_types t ON t.id = a.atom_type_id
  JOIN entity_closure ON d.process_id = entity_closure.descendant_id
  GROUP BY entity_closure.ancestor_id, t.category, a.tenant_id
)
SELECT
  e.level,
  COALESCE(normalised_totals.entity_id, engaged_rollup.entity_id) AS entity_id,
  COALESCE(normalised_totals.category, engaged_rollup.category) AS category,
  COALESCE(normalised_totals.tenant_id, engaged_rollup.tenant_id) AS tenant_id,
  COALESCE(normalised_totals.total, engaged_rollup.engaged, 0::bigint) AS total,
  COALESCE(engaged_rollup.engaged, 0::bigint) AS engaged,
  GREATEST(
    COALESCE(normalised_totals.total, engaged_rollup.engaged, 0::bigint) - COALESCE(engaged_rollup.engaged, 0::bigint),
    0::bigint
  ) AS idle,
  NOW()::timestamptz AS as_of
FROM normalised_totals
FULL OUTER JOIN engaged_rollup
  ON engaged_rollup.entity_id = normalised_totals.entity_id
 AND engaged_rollup.category = normalised_totals.category
 AND engaged_rollup.tenant_id = normalised_totals.tenant_id
JOIN dipgos.entities e
  ON e.entity_id = COALESCE(normalised_totals.entity_id, engaged_rollup.entity_id);
