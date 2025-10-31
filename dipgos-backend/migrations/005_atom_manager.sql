-- 005_atom_manager.sql
-- Atom Manager schema, views, and seed data (idempotent)
SET search_path TO dipgos, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'atom_category') THEN
    CREATE TYPE atom_category AS ENUM (
      'actors',
      'materials',
      'machinery',
      'consumables',
      'tools',
      'equipment',
      'systems',
      'technologies',
      'financials'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS dipgos.contractors (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  login_email TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dipgos.atom_groups (
  id UUID PRIMARY KEY,
  category atom_category NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID NULL REFERENCES dipgos.atom_groups(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, parent_id, name, tenant_id)
);

CREATE TABLE IF NOT EXISTS dipgos.atom_types (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES dipgos.atom_groups(id) ON DELETE CASCADE,
  category atom_category NOT NULL,
  name TEXT NOT NULL,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, name, tenant_id)
);

CREATE TABLE IF NOT EXISTS dipgos.atoms (
  id UUID PRIMARY KEY,
  atom_type_id UUID NOT NULL REFERENCES dipgos.atom_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  contractor_id UUID NULL REFERENCES dipgos.contractors(id) ON DELETE SET NULL,
  home_entity_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dipgos.atom_deployments (
  id UUID PRIMARY KEY,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  start_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_ts TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'active',
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atom_groups_parent ON dipgos.atom_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_atom_groups_tenant ON dipgos.atom_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atom_types_group ON dipgos.atom_types(group_id);
CREATE INDEX IF NOT EXISTS idx_atom_types_tenant ON dipgos.atom_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atoms_home_entity ON dipgos.atoms(home_entity_id);
CREATE INDEX IF NOT EXISTS idx_atoms_type ON dipgos.atoms(atom_type_id);
CREATE INDEX IF NOT EXISTS idx_atoms_tenant ON dipgos.atoms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atom_deployments_atom ON dipgos.atom_deployments(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_deployments_process ON dipgos.atom_deployments(process_id);
CREATE INDEX IF NOT EXISTS idx_atom_deployments_active ON dipgos.atom_deployments(tenant_id, status, end_ts);

-- Atom counts rollup
CREATE OR REPLACE VIEW dipgos.vw_atom_counts AS
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
  totals.entity_id,
  totals.category,
  totals.tenant_id,
  totals.total,
  COALESCE(engaged.engaged, 0) AS engaged,
  totals.total - COALESCE(engaged.engaged, 0) AS idle,
  NOW()::timestamptz AS as_of
FROM atom_rollup totals
JOIN dipgos.entities e ON e.entity_id = totals.entity_id
LEFT JOIN engaged_rollup engaged
  ON engaged.entity_id = totals.entity_id
 AND engaged.category = totals.category
 AND engaged.tenant_id = totals.tenant_id;

-- Repository tree view (per entity)
CREATE OR REPLACE VIEW dipgos.vw_repository_tree AS
WITH RECURSIVE entity_closure AS (
  SELECT entity_id AS descendant_id, entity_id AS ancestor_id
  FROM dipgos.entities
  UNION ALL
  SELECT child.entity_id, entity_closure.ancestor_id
  FROM dipgos.entities child
  JOIN entity_closure ON child.parent_id = entity_closure.descendant_id
),
active_deployments AS (
  SELECT atom_id, process_id, tenant_id
  FROM dipgos.atom_deployments
  WHERE COALESCE(end_ts, NOW()) >= NOW()
),
group_closure AS (
  SELECT id AS descendant_id, id AS ancestor_id
  FROM dipgos.atom_groups
  UNION ALL
  SELECT child.id, group_closure.ancestor_id
  FROM dipgos.atom_groups child
  JOIN group_closure ON child.parent_id = group_closure.descendant_id
),
atom_items AS (
  SELECT a.id, a.atom_type_id, a.home_entity_id, a.tenant_id, t.category
  FROM dipgos.atoms a
  JOIN dipgos.atom_types t ON t.id = a.atom_type_id
  WHERE a.active
),
atom_item_rollup AS (
  SELECT entity_closure.ancestor_id AS entity_id,
         atom_items.atom_type_id,
         atom_items.tenant_id,
         COUNT(*) AS total
  FROM atom_items
  JOIN entity_closure ON atom_items.home_entity_id = entity_closure.descendant_id
  GROUP BY entity_closure.ancestor_id, atom_items.atom_type_id, atom_items.tenant_id
),
type_engaged AS (
  SELECT entity_closure.ancestor_id AS entity_id,
         a.atom_type_id,
         a.tenant_id,
         COUNT(DISTINCT d.atom_id) AS engaged
  FROM active_deployments d
  JOIN dipgos.atoms a ON a.id = d.atom_id
  JOIN entity_closure ON d.process_id = entity_closure.descendant_id
  GROUP BY entity_closure.ancestor_id, a.atom_type_id, a.tenant_id
),
type_rows AS (
  SELECT
    totals.entity_id,
    t.id AS node_id,
    t.group_id AS parent_id,
    'type'::text AS node_type,
    t.category::text AS category,
    t.name,
    totals.tenant_id,
    totals.total,
    COALESCE(engaged.engaged, 0) AS engaged,
    totals.total - COALESCE(engaged.engaged, 0) AS idle
  FROM atom_item_rollup totals
  JOIN dipgos.atom_types t ON t.id = totals.atom_type_id
  LEFT JOIN type_engaged engaged
    ON engaged.entity_id = totals.entity_id
   AND engaged.atom_type_id = totals.atom_type_id
   AND engaged.tenant_id = totals.tenant_id
),
group_totals AS (
  SELECT
    type_rows.entity_id,
    group_closure.ancestor_id AS group_id,
    type_rows.tenant_id,
    SUM(type_rows.total) AS total,
    SUM(type_rows.engaged) AS engaged
  FROM type_rows
  JOIN dipgos.atom_types t ON t.id = type_rows.node_id
  JOIN group_closure ON t.group_id = group_closure.descendant_id
  GROUP BY type_rows.entity_id, group_closure.ancestor_id, type_rows.tenant_id
),
group_rows AS (
  SELECT
    group_totals.entity_id,
    g.id AS node_id,
    COALESCE(g.parent_id, NULL) AS parent_id,
    'group'::text AS node_type,
    g.category::text AS category,
    g.name,
    group_totals.tenant_id,
    group_totals.total,
    group_totals.engaged,
    group_totals.total - group_totals.engaged AS idle
  FROM group_totals
  JOIN dipgos.atom_groups g ON g.id = group_totals.group_id
)
SELECT
  entity_id,
  node_id::text,
  parent_id::text,
  node_type,
  category,
  name,
  tenant_id,
  total,
  engaged,
  idle
FROM type_rows
UNION ALL
SELECT
  entity_id,
  node_id::text,
  parent_id::text,
  node_type,
  category,
  name,
  tenant_id,
  total,
  engaged,
  idle
FROM group_rows;

-- Seed demo hierarchy (tenant + entities) ----------------------------
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT project_id, 'project', 'diamer-basha', 'Diamer Basha Dam', NULL, tenant_id FROM seed
ON CONFLICT (entity_id) DO NOTHING;

WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT contract_id, 'contract', 'mw-01-main-dam', 'MW-01 Main Dam', project_id, tenant_id FROM seed
ON CONFLICT (entity_id) DO NOTHING;

WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT sow_id, 'sow', 'mw-01-rcc', 'RCC Works', contract_id, tenant_id FROM seed
ON CONFLICT (entity_id) DO NOTHING;

WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
)
INSERT INTO dipgos.entities (entity_id, level, code, name, parent_id, tenant_id)
SELECT process_id, 'process', 'mw-01-rcc-pouring', 'RCC Daily Pour', sow_id, tenant_id FROM seed
ON CONFLICT (entity_id) DO NOTHING;

-- Seed contractor
INSERT INTO dipgos.contractors (id, name, login_email)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Allied Works JV', 'contractor@example.com')
ON CONFLICT (id) DO NOTHING;

-- Seed atom groups and types
WITH seed AS (
  SELECT '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id
)
INSERT INTO dipgos.atom_groups (id, category, name, parent_id, tenant_id)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'actors', 'Stakeholders', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000002', 'actors', 'Teams', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000003', 'actors', 'Workforce', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000005', 'actors', 'Professional', 'b0000000-0000-0000-0000-000000000003', (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000004', 'actors', 'Labor', 'b0000000-0000-0000-0000-000000000003', (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000010', 'materials', 'Machinery', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000011', 'materials', 'Excavators', 'b0000000-0000-0000-0000-000000000010', (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000012', 'materials', 'Bulldozers', 'b0000000-0000-0000-0000-000000000010', (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000020', 'consumables', 'Fuel', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000021', 'consumables', 'Electricity', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000030', 'tools', 'Hand Tools', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000040', 'equipment', 'Site Equipment', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000050', 'systems', 'Control Systems', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000060', 'technologies', 'Digital', NULL, (SELECT tenant_id FROM seed)),
  ('b0000000-0000-0000-0000-000000000070', 'financials', 'Budget Lines', NULL, (SELECT tenant_id FROM seed))
ON CONFLICT (id) DO NOTHING;

INSERT INTO dipgos.atom_types (id, group_id, category, name, spec, tenant_id)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'actors', 'Plumber Crew', '{"certified": true}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'actors', 'Turbine Mechanic', '{"experienceYears": 8}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000005', 'actors', 'Electrical Engineer', '{"discipline": "Power systems"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005', 'actors', 'Mechanical Engineer', '{"discipline": "Plant & equipment"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'actors', 'Industrial Engineer', '{"discipline": "Lean delivery"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000005', 'actors', 'Civil Engineer', '{"discipline": "Structures"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000011', 'materials', 'Excavator CAT 336', '{"capacityTons": 36}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000012', 'materials', 'Bulldozer D8T', '{"horsepower": 354}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000020', 'consumables', 'Diesel Tank', '{"liters": 5000}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000030', 'tools', 'Survey Kit', '{"items": 12}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000040', 'equipment', 'Concrete Batch Plant', '{"throughput": "120m3/h"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000050', 'systems', 'PLC Control Cabinet', '{"vendor": "Siemens"}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000050', 'b0000000-0000-0000-0000-000000000060', 'technologies', 'Drones - Survey', '{"rangeKm": 12}'::jsonb, '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000060', 'b0000000-0000-0000-0000-000000000070', 'financials', 'Equipment Leasing', '{"currency": "USD"}'::jsonb, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Seed atoms for demo project/contract
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS contractor_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id
)
INSERT INTO dipgos.atoms (id, atom_type_id, name, unit, contractor_id, home_entity_id, spec, tenant_id)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Plumber Crew A', 'crew', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"experience": "Tier-1"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Plumber Crew B', 'crew', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"experience": "Tier-2"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Turbine Mechanic Alpha', 'person', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"certified": true}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'Electrical Engineer · Grid Integration', 'person', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"licenses": ["PE", "NFPA70E"], "experienceYears": 11}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'Mechanical Engineer · Heavy Plant', 'person', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"licenses": ["API 673"], "experienceYears": 9}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', 'Industrial Engineer · Lean Delivery', 'person', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"certifications": ["Lean Black Belt"], "experienceYears": 8}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 'Civil Engineer · RCC Structures', 'person', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"licenses": ["PEC Registered Engineer"], "experienceYears": 12}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', 'Excavator CAT 336 #12', 'unit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"hours": 1200}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000011', 'Bulldozer D8T #7', 'unit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"hours": 750}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000020', 'Diesel Tank 5kL', 'tank', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"location": "Fuel Yard"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021', 'Survey Kit Set', 'kit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"calibrated": "2024-01-10"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000030', 'c0000000-0000-0000-0000-000000000030', 'Batch Plant Alpha', 'unit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"status": "commissioned"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000040', 'c0000000-0000-0000-0000-000000000040', 'PLC Cabinet North', 'unit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"firmware": "v15"}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 'Survey Drone 01', 'unit', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"flightHours": 90}'::jsonb, (SELECT tenant_id FROM seed)),
  ('d0000000-0000-0000-0000-000000000060', 'c0000000-0000-0000-0000-000000000060', 'Excavation Lease Lot', 'budget', (SELECT contractor_id FROM seed), (SELECT contract_id FROM seed), '{"valueUSD": 250000}'::jsonb, (SELECT tenant_id FROM seed))
ON CONFLICT (id) DO NOTHING;

-- Seed deployments (active and historic)
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
)
INSERT INTO dipgos.atom_deployments (id, atom_id, process_id, start_ts, end_ts, status, tenant_id)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', (SELECT process_id FROM seed), NOW() - INTERVAL '14 days', NULL, 'active', (SELECT tenant_id FROM seed)),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', (SELECT process_id FROM seed), NOW() - INTERVAL '10 days', NULL, 'active', (SELECT tenant_id FROM seed)),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000010', (SELECT process_id FROM seed), NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days', 'completed', (SELECT tenant_id FROM seed)),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000021', (SELECT process_id FROM seed), NOW() - INTERVAL '7 days', NULL, 'active', (SELECT tenant_id FROM seed))
ON CONFLICT (id) DO NOTHING;
