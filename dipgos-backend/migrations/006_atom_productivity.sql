-- 006_atom_productivity.sql
-- Atom productivity logging tables and views
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_productivity_logs (
  id UUID PRIMARY KEY,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  deployment_id UUID NULL REFERENCES dipgos.atom_deployments(id) ON DELETE SET NULL,
  scope_entity_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  shift TEXT NOT NULL DEFAULT 'day',
  output_quantity NUMERIC(14, 2) NULL,
  output_unit TEXT NULL,
  productive_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  idle_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  quality_score NUMERIC(5, 2) NULL,
  notes TEXT NULL,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, atom_id, log_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_atom_prod_logs_atom ON dipgos.atom_productivity_logs(atom_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_atom_prod_logs_scope ON dipgos.atom_productivity_logs(scope_entity_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_atom_prod_logs_tenant ON dipgos.atom_productivity_logs(tenant_id, log_date DESC);

CREATE OR REPLACE FUNCTION dipgos.touch_atom_productivity_logs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atom_prod_touch ON dipgos.atom_productivity_logs;
CREATE TRIGGER trg_atom_prod_touch
BEFORE UPDATE ON dipgos.atom_productivity_logs
FOR EACH ROW
EXECUTE FUNCTION dipgos.touch_atom_productivity_logs();

CREATE OR REPLACE VIEW dipgos.vw_atom_productivity_daily AS
SELECT
  logs.scope_entity_id,
  scope.level AS scope_level,
  scope.code AS scope_code,
  logs.atom_id,
  a.name AS atom_name,
  t.category,
  t.name AS atom_type,
  logs.log_date,
  COALESCE(logs.shift, 'day') AS shift,
  logs.output_quantity,
  logs.output_unit,
  logs.productive_hours,
  logs.idle_hours,
  logs.quality_score,
  (COALESCE(logs.productive_hours, 0) + COALESCE(logs.idle_hours, 0)) AS total_hours,
  CASE
    WHEN COALESCE(logs.productive_hours, 0) + COALESCE(logs.idle_hours, 0) = 0 THEN NULL
    ELSE (logs.productive_hours / NULLIF(logs.productive_hours + logs.idle_hours, 0))
  END AS utilisation_ratio,
  logs.tenant_id,
  logs.created_at,
  logs.updated_at
FROM dipgos.atom_productivity_logs logs
JOIN dipgos.atoms a ON a.id = logs.atom_id
JOIN dipgos.atom_types t ON t.id = a.atom_type_id
JOIN dipgos.entities scope ON scope.entity_id = logs.scope_entity_id;

CREATE OR REPLACE VIEW dipgos.vw_atom_productivity_rollup AS
SELECT
  scope_entity_id,
  scope_level,
  scope_code,
  category,
  tenant_id,
  COUNT(*) AS log_entries,
  SUM(productive_hours) AS productive_hours,
  SUM(idle_hours) AS idle_hours,
  AVG(utilisation_ratio) AS avg_utilisation,
  AVG(quality_score) AS avg_quality,
  SUM(output_quantity) AS total_output
FROM dipgos.vw_atom_productivity_daily
GROUP BY scope_entity_id, scope_level, scope_code, category, tenant_id;

-- Seed productivity samples for demo atoms (idempotent)
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000001'::uuid AS plumber_crew_a,
    'd0000000-0000-0000-0000-000000000010'::uuid AS excavator_cat,
    'd1000000-0000-0000-0000-000000000001'::uuid AS tower_crane_1,
    'e0000000-0000-0000-0000-000000000001'::uuid AS deploy_plumber_a,
    'e0000000-0000-0000-0000-000000000003'::uuid AS deploy_excavator,
    'e1000000-0000-0000-0000-000000000001'::uuid AS deploy_crane,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_rcc,
    '44444444-4444-4444-4444-444444444445'::uuid AS process_erection
)
INSERT INTO dipgos.atom_productivity_logs (
  id, atom_id, deployment_id, scope_entity_id, log_date, shift, output_quantity, output_unit,
  productive_hours, idle_hours, quality_score, notes, tenant_id
)
SELECT
  'f0000000-0000-0000-0000-000000000001'::uuid,
  plumber_crew_a,
  deploy_plumber_a,
  process_rcc,
  (CURRENT_DATE - INTERVAL '2 days')::date,
  'day',
  480,
  'm3 poured',
  8,
  1,
  92,
  'Poured blocks B12-B14',
  tenant_id
FROM params
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000010'::uuid AS excavator_cat,
    'e0000000-0000-0000-0000-000000000003'::uuid AS deploy_excavator,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_rcc
)
INSERT INTO dipgos.atom_productivity_logs (
  id, atom_id, deployment_id, scope_entity_id, log_date, shift, output_quantity, output_unit,
  productive_hours, idle_hours, quality_score, notes, tenant_id
)
SELECT
  'f0000000-0000-0000-0000-000000000002'::uuid,
  excavator_cat,
  deploy_excavator,
  process_rcc,
  (CURRENT_DATE - INTERVAL '1 day')::date,
  'day',
  320,
  'm3 excavated',
  6.5,
  2,
  87,
  'Excavated plunge pool',
  tenant_id
FROM params
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd1000000-0000-0000-0000-000000000001'::uuid AS tower_crane_1,
    'e1000000-0000-0000-0000-000000000001'::uuid AS deploy_crane,
    '44444444-4444-4444-4444-444444444445'::uuid AS process_erection
)
INSERT INTO dipgos.atom_productivity_logs (
  id, atom_id, deployment_id, scope_entity_id, log_date, shift, output_quantity, output_unit,
  productive_hours, idle_hours, quality_score, notes, tenant_id
)
SELECT
  'f0000000-0000-0000-0000-000000000003'::uuid,
  tower_crane_1,
  deploy_crane,
  process_erection,
  (CURRENT_DATE - INTERVAL '1 day')::date,
  'night',
  28,
  'lifts',
  7.2,
  0.8,
  95,
  'Night shift steel segments',
  tenant_id
FROM params
ON CONFLICT (id) DO NOTHING;
