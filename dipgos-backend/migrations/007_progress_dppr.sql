-- 007_progress_dppr.sql
-- DPPR-driven progress schema, atoms enrichment, and seed data
SET search_path TO dipgos, public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dipgos.dppr (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  qty_done NUMERIC(18, 2),
  qty_planned NUMERIC(18, 2),
  ev NUMERIC(18, 2),
  pv NUMERIC(18, 2),
  ac NUMERIC(18, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dppr_entity_date ON dipgos.dppr(entity_id, report_date);
CREATE INDEX IF NOT EXISTS idx_dppr_timeline ON dipgos.dppr(entity_id, report_date DESC);

CREATE TABLE IF NOT EXISTS dipgos.atom_attributes (
  id UUID PRIMARY KEY,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dipgos.atom_mobilization (
  id UUID PRIMARY KEY,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  mobilized_on DATE NOT NULL,
  demobilized_on DATE,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dipgos.process_schedule (
  process_id UUID PRIMARY KEY REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  planned_start DATE,
  planned_finish DATE,
  sequence INTEGER,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  tenant_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION dipgos.touch_process_schedule()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_schedule_touch ON dipgos.process_schedule;
CREATE TRIGGER trg_process_schedule_touch
BEFORE UPDATE ON dipgos.process_schedule
FOR EACH ROW
EXECUTE FUNCTION dipgos.touch_process_schedule();

CREATE OR REPLACE VIEW dipgos.vw_progress_rollup AS
WITH RECURSIVE entity_closure AS (
  SELECT entity_id AS descendant_id, entity_id AS ancestor_id
  FROM dipgos.entities
  UNION ALL
  SELECT child.entity_id, entity_closure.ancestor_id
  FROM dipgos.entities child
  JOIN entity_closure ON child.parent_id = entity_closure.descendant_id
),
latest_dppr AS (
  SELECT *
  FROM (
    SELECT
      d.entity_id,
      d.report_date,
      d.qty_done,
      d.qty_planned,
      d.ev,
      d.pv,
      d.ac,
      d.notes,
      ROW_NUMBER() OVER (PARTITION BY d.entity_id ORDER BY d.report_date DESC) AS rn
    FROM dipgos.dppr d
  ) ranked
  WHERE rn = 1
),
aggregated AS (
  SELECT
    closure.ancestor_id AS entity_id,
    SUM(ld.ev) AS sum_ev,
    SUM(ld.pv) AS sum_pv,
    SUM(ld.ac) AS sum_ac,
    SUM(ld.qty_done) AS qty_done,
    SUM(ld.qty_planned) AS qty_planned,
    MAX(ld.report_date) AS as_of
  FROM latest_dppr ld
  JOIN entity_closure closure ON closure.descendant_id = ld.entity_id
  GROUP BY closure.ancestor_id
)
SELECT
  e.level,
  e.entity_id,
  e.parent_id,
  a.sum_ev AS ev,
  a.sum_pv AS pv,
  a.sum_ac AS ac,
  CASE
    WHEN a.sum_pv IS NULL OR a.sum_pv = 0 THEN NULL
    ELSE ROUND(a.sum_ev / NULLIF(a.sum_pv, 0), 4)
  END AS spi,
  CASE
    WHEN a.sum_ac IS NULL OR a.sum_ac = 0 THEN NULL
    ELSE ROUND(a.sum_ev / NULLIF(a.sum_ac, 0), 4)
  END AS cpi,
  CASE
    WHEN a.sum_pv IS NULL OR a.sum_pv = 0 THEN NULL
    ELSE ROUND(a.sum_ev / NULLIF(a.sum_pv, 0), 4)
  END AS percent_complete,
  0::NUMERIC AS slip_days,
  COALESCE(a.as_of, NOW()::date) AS as_of
FROM aggregated a
JOIN dipgos.entities e ON e.entity_id = a.entity_id;

CREATE OR REPLACE VIEW dipgos.vw_next_activities AS
WITH latest_process_dppr AS (
  SELECT
    d.entity_id,
    d.report_date,
    d.qty_done,
    d.qty_planned,
    ROW_NUMBER() OVER (PARTITION BY d.entity_id ORDER BY d.report_date DESC) AS rn
  FROM dipgos.dppr d
)
SELECT
  contract.entity_id AS contract_id,
  sow.entity_id AS sow_id,
  process.entity_id AS process_id,
  process.name,
  ps.planned_start,
  ps.ready OR COALESCE(ld.qty_done >= ld.qty_planned, FALSE) AS ready
FROM dipgos.process_schedule ps
JOIN dipgos.entities process ON process.entity_id = ps.process_id AND process.level = 'process'
LEFT JOIN dipgos.entities sow ON sow.entity_id = process.parent_id
LEFT JOIN dipgos.entities contract ON contract.entity_id = sow.parent_id
LEFT JOIN latest_process_dppr ld ON ld.entity_id = process.entity_id AND ld.rn = 1;

-- Seed hierarchy and DPPR sample data ---------------------------------------
WITH base AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS mw01_id,
    '22222222-2222-2222-2222-222222222333'::uuid AS mw02_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '33333333-3333-3333-3333-333333333334'::uuid AS sow_struct_id,
    '33333333-3333-3333-3333-333333333555'::uuid AS sow_power_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS proc_rcc_pour_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS proc_batching_id,
    '44444444-4444-4444-4444-444444444666'::uuid AS proc_formwork_id,
    '44444444-4444-4444-4444-444444444777'::uuid AS proc_tbm_launch_id,
    '44444444-4444-4444-4444-444444444778'::uuid AS proc_electro_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT project_id, 'project', 'diamer-basha', 'Diamer Basha Dam Program', NULL, tenant_id FROM base
ON CONFLICT (entity_id) DO UPDATE SET name = EXCLUDED.name;

WITH base AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS mw01_id,
    '22222222-2222-2222-2222-222222222333'::uuid AS mw02_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'contract', 'mw-01-main-dam', 'MW-01 Main Dam', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222333', 'contract', 'mw-02-powerhouse', 'MW-02 Powerhouse', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (entity_id) DO NOTHING;

WITH seeds AS (
  SELECT
    '33333333-3333-3333-3333-333333333333'::uuid AS entity_id,
    'mw-01-rcc'::text AS code,
    'RCC Dam Works'::text AS name,
    '22222222-2222-2222-2222-222222222222'::uuid AS parent_id
  UNION ALL
  SELECT
    '33333333-3333-3333-3333-333333333334'::uuid,
    'mw-01-struct',
    'Structural Works',
    '22222222-2222-2222-2222-222222222222'
  UNION ALL
  SELECT
    '33333333-3333-3333-3333-333333333555'::uuid,
    'mw-02-power',
    'Powerhouse Works',
    '22222222-2222-2222-2222-222222222333'
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT entity_id, 'sow', code, name, parent_id, '00000000-0000-0000-0000-000000000001'
FROM seeds
ON CONFLICT (entity_id) DO NOTHING;

WITH seeds AS (
  SELECT
    '44444444-4444-4444-4444-444444444444'::uuid AS entity_id,
    'mw-01-rcc-pouring'::text AS code,
    'RCC Daily Pour'::text AS name,
    '33333333-3333-3333-3333-333333333333'::uuid AS parent_id
  UNION ALL
  SELECT
    '44444444-4444-4444-4444-444444444555'::uuid,
    'mw-01-batching'::text,
    'Batching Plant Ops'::text,
    '33333333-3333-3333-3333-333333333333'::uuid
  UNION ALL
  SELECT
    '44444444-4444-4444-4444-444444444779'::uuid,
    'mw-01-dam-pit'::text,
    'Dam Pit Excavation'::text,
    '33333333-3333-3333-3333-333333333333'::uuid
  UNION ALL
  SELECT
    '44444444-4444-4444-4444-444444444666'::uuid,
    'mw-01-formwork'::text,
    'Formwork & Rebar'::text,
    '33333333-3333-3333-3333-333333333334'::uuid
  UNION ALL
  SELECT
    '44444444-4444-4444-4444-444444444777'::uuid,
    'mw-02-tbm-launch'::text,
    'TBM Launch Chamber'::text,
    '33333333-3333-3333-3333-333333333555'::uuid
  UNION ALL
  SELECT
    '44444444-4444-4444-4444-444444444778'::uuid,
    'mw-02-electro'::text,
    'Electromechanical Install'::text,
    '33333333-3333-3333-3333-333333333555'::uuid
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT entity_id, 'process', code, name, parent_id, '00000000-0000-0000-0000-000000000001'
FROM seeds
ON CONFLICT (entity_id) DO NOTHING;

INSERT INTO dipgos.process_schedule (process_id, planned_start, planned_finish, sequence, ready, tenant_id)
VALUES
  ('44444444-4444-4444-4444-444444444444', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '10 days', 10, TRUE, '00000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444555', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '5 days', 20, TRUE, '00000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444779', CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE + INTERVAL '240 days', 25, FALSE, '00000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444666', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '20 days', 30, FALSE, '00000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444777', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days', 40, FALSE, '00000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444778', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '30 days', 50, FALSE, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (process_id) DO UPDATE SET planned_start = EXCLUDED.planned_start, planned_finish = EXCLUDED.planned_finish, sequence = EXCLUDED.sequence, ready = EXCLUDED.ready;

WITH processes AS (
  SELECT *
  FROM (
    VALUES
      ('44444444-4444-4444-4444-444444444444'::uuid, 380::NUMERIC, 420::NUMERIC, 1.25::NUMERIC, 1.12::NUMERIC),
      ('44444444-4444-4444-4444-444444444555'::uuid, 220::NUMERIC, 260::NUMERIC, 1.18::NUMERIC, 1.05::NUMERIC),
      ('44444444-4444-4444-4444-444444444779'::uuid, 2157680::NUMERIC, 2157680::NUMERIC, 1.32::NUMERIC, 1.18::NUMERIC),
      ('44444444-4444-4444-4444-444444444666'::uuid, 180::NUMERIC, 240::NUMERIC, 1.30::NUMERIC, 1.08::NUMERIC),
      ('44444444-4444-4444-4444-444444444777'::uuid, 150::NUMERIC, 210::NUMERIC, 1.40::NUMERIC, 1.15::NUMERIC),
      ('44444444-4444-4444-4444-444444444778'::uuid, 140::NUMERIC, 200::NUMERIC, 1.42::NUMERIC, 1.12::NUMERIC)
  ) AS t(process_id, base_qty, plan_qty, cost_factor, actual_factor)
),
series AS (
  SELECT gs, CURRENT_DATE - INTERVAL '13 days' + (gs * INTERVAL '1 day') AS report_date
  FROM generate_series(0, 13) AS gs
)
INSERT INTO dipgos.dppr (id, entity_id, report_date, qty_done, qty_planned, ev, pv, ac, notes)
SELECT
  gen_random_uuid(),
  p.process_id,
  s.report_date::date,
  LEAST(p.plan_qty, p.base_qty + (s.gs * 8)),
  p.plan_qty,
  ROUND(LEAST(p.plan_qty, p.base_qty + (s.gs * 8)) * p.cost_factor, 2),
  ROUND(p.plan_qty * p.cost_factor, 2),
  ROUND(LEAST(p.plan_qty, p.base_qty + (s.gs * 8)) * p.actual_factor, 2),
  'Auto-generated DPPR sample'
FROM processes p
CROSS JOIN series s
ON CONFLICT (entity_id, report_date) DO NOTHING;

INSERT INTO dipgos.evm_metrics (entity_id, period_date, ev, pv, ac, spi, cpi, percent_complete)
SELECT
  entity_id,
  report_date,
  ev,
  pv,
  ac,
  CASE WHEN pv IS NULL OR pv = 0 THEN NULL ELSE ROUND(ev / NULLIF(pv, 0), 4) END,
  CASE WHEN ac IS NULL OR ac = 0 THEN NULL ELSE ROUND(ev / NULLIF(ac, 0), 4) END,
  CASE WHEN pv IS NULL OR pv = 0 THEN NULL ELSE ROUND(ev / NULLIF(pv, 0), 4) END
FROM dipgos.dppr
ON CONFLICT (entity_id, period_date) DO NOTHING;

INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', 'Maintenance Status', jsonb_build_object('lastService', (CURRENT_DATE - INTERVAL '12 days')::text, 'hours', 1820), '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', 'Tower Crane Sensors', jsonb_build_object('windLimit', 18, 'loadTest', '2025-09-18'), '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'd1000000-0000-0000-0000-000000000080', 'Crew Certification', jsonb_build_object('expiry', (CURRENT_DATE + INTERVAL '180 days')::text, 'supervisor', 'M. Khan'), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dipgos.atom_mobilization (id, atom_id, mobilized_on, demobilized_on, location, status, metadata, tenant_id)
VALUES
  (gen_random_uuid(), 'd0000000-0000-0000-0000-000000000010', CURRENT_DATE - INTERVAL '90 days', NULL, 'MW-01 Quarry Yard', 'active', jsonb_build_object('shift', 'night'), '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '120 days', NULL, 'MW-01 RCC Core', 'active', jsonb_build_object('operator', 'Allied Works JV'), '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'd1000000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE - INTERVAL '5 days', 'MW-02 Portal', 'completed', jsonb_build_object('notes', 'Demob for overhaul'), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
