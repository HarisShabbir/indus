-- 008_atoms_reporting.sql
-- Additional structures for Atom Manager deployment reporting
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_journey (
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('warehouse','in_transit','on_site','engaged')),
  ts TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(atom_id, status, ts)
);

CREATE INDEX IF NOT EXISTS idx_atom_journey_atom_ts ON dipgos.atom_journey(atom_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_atom_journey_status_ts ON dipgos.atom_journey(status, ts DESC);

CREATE TABLE IF NOT EXISTS dipgos.change_requests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  contract_id UUID NULL,
  sow_id UUID NULL,
  process_id UUID NULL,
  atom_type TEXT NOT NULL,
  model TEXT NOT NULL,
  requested_units INT NOT NULL CHECK (requested_units > 0),
  est_cost NUMERIC(18,2) NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending_pm_approval',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_scope ON dipgos.change_requests(project_id, contract_id, sow_id, process_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_tenant ON dipgos.change_requests(tenant_id);

-- View for calculating deployment hours per atom (continuous assumption)
CREATE OR REPLACE VIEW dipgos.vw_deployment_hours AS
SELECT
  d.id AS deployment_id,
  d.atom_id,
  d.process_id,
  d.start_ts,
  COALESCE(d.end_ts, now()) AS effective_end_ts,
  EXTRACT(EPOCH FROM (COALESCE(d.end_ts, now()) - d.start_ts)) / 3600.0 AS hours_completed
FROM dipgos.atom_deployments d;

-- Group atoms by type/model/vendor etc.
CREATE OR REPLACE VIEW dipgos.vw_deployment_groups AS
WITH latest_journey AS (
  SELECT DISTINCT ON (j.atom_id)
    j.atom_id,
    j.status,
    j.ts
  FROM dipgos.atom_journey j
  ORDER BY j.atom_id, j.ts DESC
)
SELECT
  d.tenant_id,
  atype.category AS atom_type,
  atype.name AS model,
  COALESCE(a.spec->>'vendor', atype.spec->>'vendor') AS vendor,
  COALESCE(NULLIF(a.spec, '{}'::jsonb), atype.spec) AS capacity,
  dh.process_id,
  COUNT(*) FILTER (WHERE latest_journey.status = 'engaged') AS engaged_count,
  COUNT(*) FILTER (WHERE latest_journey.status <> 'engaged' OR latest_journey.status IS NULL) AS idle_count,
  COUNT(*) AS total_count,
  SUM(dh.hours_completed) AS hours_completed,
  MIN(dh.start_ts) AS deployment_start_earliest
FROM dipgos.atom_deployments d
JOIN dipgos.atoms a ON a.id = d.atom_id
JOIN dipgos.atom_types atype ON atype.id = a.atom_type_id
JOIN dipgos.vw_deployment_hours dh ON dh.deployment_id = d.id
LEFT JOIN latest_journey ON latest_journey.atom_id = d.atom_id
GROUP BY
  d.tenant_id,
  atype.category,
  atype.name,
  COALESCE(a.spec->>'vendor', atype.spec->>'vendor'),
  COALESCE(NULLIF(a.spec, '{}'::jsonb), atype.spec),
  dh.process_id;

-- Work completed rollup using DPPR
CREATE OR REPLACE VIEW dipgos.vw_work_completed AS
WITH scope_dppr AS (
  SELECT
    entity_id,
    SUM(qty_done) AS qty_done,
    SUM(pv) AS pv,
    SUM(ev) AS ev,
    SUM(ac) AS ac,
    MAX(report_date) AS latest_date
  FROM dipgos.dppr
  GROUP BY entity_id
)
SELECT
  e.entity_id,
  scope_dppr.qty_done,
  CASE WHEN scope_dppr.pv = 0 THEN NULL ELSE scope_dppr.ev / scope_dppr.pv END AS percent_complete,
  scope_dppr.ev,
  scope_dppr.pv,
  scope_dppr.ac,
  scope_dppr.latest_date
FROM scope_dppr
JOIN dipgos.entities e ON e.entity_id = scope_dppr.entity_id;
