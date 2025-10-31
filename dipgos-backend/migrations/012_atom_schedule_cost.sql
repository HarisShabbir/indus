-- 012_atom_schedule_cost.sql
-- Atom scheduling and payment records to support Atom Manager extensions
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_schedule_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  milestone TEXT,
  status TEXT,
  criticality TEXT,
  planned_start DATE,
  planned_finish DATE,
  actual_start DATE,
  actual_finish DATE,
  percent_complete NUMERIC(6, 3),
  variance_days NUMERIC(8, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atom_schedule_scope
  ON dipgos.atom_schedule_entries (tenant_id, project_id, contract_id, sow_id, process_id);
CREATE INDEX IF NOT EXISTS idx_atom_schedule_atom
  ON dipgos.atom_schedule_entries (atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_schedule_status
  ON dipgos.atom_schedule_entries (status);

CREATE TABLE IF NOT EXISTS dipgos.atom_payment_records (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NULL REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  vendor TEXT,
  invoice_number TEXT,
  payment_milestone TEXT,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_date DATE,
  variance_days NUMERIC(8, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atom_payment_scope
  ON dipgos.atom_payment_records (tenant_id, project_id, contract_id, sow_id, process_id);
CREATE INDEX IF NOT EXISTS idx_atom_payment_status
  ON dipgos.atom_payment_records (status, due_date);
CREATE INDEX IF NOT EXISTS idx_atom_payment_atom
  ON dipgos.atom_payment_records (atom_id);

WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '22222222-2222-2222-2222-222222222333'::uuid AS contract_power_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '33333333-3333-3333-3333-333333333334'::uuid AS sow_struct_id,
    '33333333-3333-3333-3333-333333333555'::uuid AS sow_power_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS proc_rcc_pour_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS proc_batching_id,
    '44444444-4444-4444-4444-444444444666'::uuid AS proc_formwork_id,
    '44444444-4444-4444-4444-444444444777'::uuid AS proc_tbm_id,
    '44444444-4444-4444-4444-444444444778'::uuid AS proc_electro_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS proc_dam_pit_id
)
INSERT INTO dipgos.atom_schedule_entries (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  milestone, status, criticality,
  planned_start, planned_finish, actual_start, actual_finish,
  percent_complete, variance_days, notes, created_at, updated_at
)
VALUES
  ('f0000000-0000-0000-0000-000000000001', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_rcc_pour_id FROM seed),
   'd0000000-0000-0000-0000-000000000001',
   'RCC lift 34 - gallery section', 'at_risk', 'high',
   CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '3 days',
   CURRENT_DATE - INTERVAL '4 days', NULL,
   0.55, 1.50,
   'Crew is catching up after concrete supply hiccup.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000002', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_batching_id FROM seed),
   'd0000000-0000-0000-0000-000000000030',
   'Batch plant calibration cycle', 'on_track', 'medium',
   CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '1 days',
   CURRENT_DATE - INTERVAL '2 days', NULL,
   0.78, -0.50,
   'Automated batching routines holding steady.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000003', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_struct_id FROM seed), (SELECT proc_formwork_id FROM seed),
   'd0000000-0000-0000-0000-000000000003',
   'Power intake embedded items', 'delayed', 'critical',
   CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE - INTERVAL '2 days',
   CURRENT_DATE - INTERVAL '10 days', NULL,
   0.32, 6.00,
   'Waiting on custom penstock rings from supplier.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000004', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_dam_pit_id FROM seed),
   'd0000000-0000-0000-0000-000000000011',
   'Dam pit push to riverbed elevation', 'on_track', 'medium',
   CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE + INTERVAL '20 days',
   CURRENT_DATE - INTERVAL '44 days', NULL,
   0.61, 0.75,
   'Equipment utilisation steady, no supply chain alerts.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000005', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_power_id FROM seed), (SELECT proc_tbm_id FROM seed),
   'd0000000-0000-0000-0000-000000000050',
   'TBM launch avionics install', 'at_risk', 'high',
   CURRENT_DATE + INTERVAL '4 days', CURRENT_DATE + INTERVAL '10 days',
   NULL, NULL,
   0.05, NULL,
   'Drone team staging LiDAR navigation beacons.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000006', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_power_id FROM seed), (SELECT sow_power_id FROM seed), (SELECT proc_electro_id FROM seed),
   'd0000000-0000-0000-0000-000000000040',
   'Electromechanical wiring - gallery D', 'completed', 'medium',
   CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '12 days',
   CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE - INTERVAL '11 days',
   1.00, -1.00,
   'Commissioning team signed off, ready for energisation.', NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000007', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_struct_id FROM seed), (SELECT proc_formwork_id FROM seed),
   'd0000000-0000-0000-0000-000000000002',
   'Formwork cycle - spillway block B', 'on_track', 'medium',
   CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE + INTERVAL '2 days',
   CURRENT_DATE - INTERVAL '8 days', NULL,
   0.68, 0.00,
   'Prefabricated panels reduced cycle time.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '22222222-2222-2222-2222-222222222333'::uuid AS contract_power_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '33333333-3333-3333-3333-333333333334'::uuid AS sow_struct_id,
    '33333333-3333-3333-3333-333333333555'::uuid AS sow_power_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS proc_rcc_pour_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS proc_batching_id,
    '44444444-4444-4444-4444-444444444666'::uuid AS proc_formwork_id,
    '44444444-4444-4444-4444-444444444777'::uuid AS proc_tbm_id,
    '44444444-4444-4444-4444-444444444778'::uuid AS proc_electro_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS proc_dam_pit_id
)
INSERT INTO dipgos.atom_payment_records (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  vendor, invoice_number, payment_milestone,
  amount, currency, status, due_date, paid_date, variance_days, notes,
  created_at, updated_at
)
VALUES
  ('a1000000-0000-0000-0000-000000000001', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_rcc_pour_id FROM seed),
   'd0000000-0000-0000-0000-000000000001',
   'Aurora Build JV', 'INV-2024-045', 'Crew mobilisation cycle',
   185000.00, 'USD', 'paid', CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE - INTERVAL '18 days', -3.00,
   'Mobilisation advance cleared after QA documentation.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000002', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_batching_id FROM seed),
   'd0000000-0000-0000-0000-000000000030',
   'BatchTech Europe', 'INV-2024-112', 'Batch plant preventive maintenance',
   92000.00, 'USD', 'in_review', CURRENT_DATE - INTERVAL '5 days', NULL, 2.00,
   'Awaiting performance certificate sign-off.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000003', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_struct_id FROM seed), (SELECT proc_formwork_id FROM seed),
   'd0000000-0000-0000-0000-000000000003',
   'HydroSteel Fabricators', 'INV-2024-132', 'Embedded items fabrication',
   158600.00, 'USD', 'overdue', CURRENT_DATE - INTERVAL '12 days', NULL, 7.00,
   'Supplier escalated—custom penstock rings pending site acceptance.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000004', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_struct_id FROM seed), (SELECT proc_formwork_id FROM seed),
   'd0000000-0000-0000-0000-000000000002',
   'Aurora Build JV', 'INV-2024-127', 'Skilled labour cycle 07',
   76400.00, 'USD', 'paid', CURRENT_DATE - INTERVAL '18 days', CURRENT_DATE - INTERVAL '10 days', -1.00,
   'Performance bonus applied for cycle productivity.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000005', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_id FROM seed), (SELECT sow_rcc_id FROM seed), (SELECT proc_dam_pit_id FROM seed),
   'd0000000-0000-0000-0000-000000000011',
   'Caterpillar Leasing', 'INV-2024-201', 'Dozer fleet lease - Q2',
   226500.00, 'USD', 'pending', CURRENT_DATE + INTERVAL '12 days', NULL, NULL,
   'Lease renewal aligned with excavation phase extension.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000006', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_power_id FROM seed), (SELECT sow_power_id FROM seed), (SELECT proc_electro_id FROM seed),
   'd0000000-0000-0000-0000-000000000040',
   'Siemens Pakistan', 'INV-2024-305', 'PLC cabinet commissioning',
   312400.00, 'USD', 'paid', CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE - INTERVAL '4 days', 0.50,
   'Early payment captured to secure extended warranty.', NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000007', (SELECT tenant_id FROM seed), (SELECT project_id FROM seed), (SELECT contract_power_id FROM seed), (SELECT sow_power_id FROM seed), (SELECT proc_tbm_id FROM seed),
   'd0000000-0000-0000-0000-000000000050',
   'SkySurvey Drones', 'INV-2024-341', 'Navigation beacon deployment',
   46800.00, 'USD', 'submitted', CURRENT_DATE + INTERVAL '7 days', NULL, NULL,
   'Invoice submitted with progressive rollout evidence.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
