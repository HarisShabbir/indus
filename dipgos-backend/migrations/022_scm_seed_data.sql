-- Seed rich SCM data linked to Diamer Basha hierarchy for demo canvas
WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_items (id, tenant_id, code, description, unit, category, industry_tags, metadata)
VALUES
  ('55555555-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), 'STEEL-16MM', '16mm reinforcing bar bundle', 'ton', 'Steel', ARRAY['structure','steel'], jsonb_build_object('leadTimeDays', 14)),
  ('55555555-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), 'CEM-42.5', 'Cement OPC 42.5 bulk', 'ton', 'Concrete', ARRAY['materials','cement'], jsonb_build_object('leadTimeDays', 10)),
  ('55555555-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), 'SENS-VIBE', 'Vibration monitoring sensor', 'ea', 'Instrumentation', ARRAY['monitoring','iot'], jsonb_build_object('leadTimeDays', 21))
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_demand_items (
  id, tenant_id, project_id, contract_id, sow_id, process_id,
  item_id, status, priority, quantity_required, quantity_committed,
  needed_date, notes, metadata
)
VALUES
  -- Dam Pit Excavation stages
  ('66666666-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '55555555-1111-1111-1111-111111111103'::uuid, 'planned', 1, 18, 4, CURRENT_DATE + 28,
   'Sensors required before excavation can proceed.', jsonb_build_object('stage','Design','swimlane','Consultant','location','Instrumentation hut','timeBucket','Week 37','tags',ARRAY['QA','monitoring'])),
  ('66666666-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '55555555-1111-1111-1111-111111111102'::uuid, 'committed', 2, 420, 260, CURRENT_DATE + 21,
   'Bulk cement for shotcrete lining.', jsonb_build_object('stage','Off-Site Works','swimlane','Supplier','location','Grinding station','timeBucket','Week 38','tags',ARRAY['materials','long-lead'])),
  ('66666666-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '55555555-1111-1111-1111-111111111101'::uuid, 'in_flight', 3, 320, 180, CURRENT_DATE + 14,
   'Rebar cages for retaining walls.', jsonb_build_object('stage','Logistics','swimlane','Contractor','location','Batching yard','timeBucket','Week 39','tags',ARRAY['structure','critical'])),
  ('66666666-1111-1111-1111-111111111104'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '55555555-1111-1111-1111-111111111101'::uuid, 'delivered', 4, 120, 120, CURRENT_DATE - 7,
   'Delivered rebar lots awaiting installation.', jsonb_build_object('stage','Site Works','swimlane','Subcontractor','location','Dam pit staging','timeBucket','Week 35','tags',ARRAY['installed','progress'])) ,
  -- Formwork and rebar process
  ('66666666-2222-2222-2222-222222222201'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '55555555-1111-1111-1111-111111111101'::uuid, 'planned', 1, 280, 0, CURRENT_DATE + 35,
   'Heavy gauge rebar for spillway forms.', jsonb_build_object('stage','Design','swimlane','Engineer','location','Design office','timeBucket','Week 40','tags',ARRAY['design','QA'])),
  ('66666666-2222-2222-2222-222222222202'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '55555555-1111-1111-1111-111111111102'::uuid, 'committed', 2, 260, 260, CURRENT_DATE + 24,
   'High early strength cement for precast forms.', jsonb_build_object('stage','Off-Site Works','swimlane','Supplier','location','Precast yard','timeBucket','Week 41','tags',ARRAY['materials','precast'])),
  ('66666666-2222-2222-2222-222222222203'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '55555555-1111-1111-1111-111111111103'::uuid, 'in_flight', 3, 22, 10, CURRENT_DATE + 18,
   'Monitoring sensors for formwork vibration.', jsonb_build_object('stage','Logistics','swimlane','Consultant','location','QA lab','timeBucket','Week 41','tags',ARRAY['monitoring','QA'])),
  ('66666666-2222-2222-2222-222222222204'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '55555555-1111-1111-1111-111111111101'::uuid, 'delivered', 4, 150, 150, CURRENT_DATE - 3,
   'Prefabricated cage sets staged for installation.', jsonb_build_object('stage','Site Works','swimlane','Contractor','location','Slip form deck','timeBucket','Week 36','tags',ARRAY['installed','progress']))
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_requisitions (
  id, tenant_id, project_id, contract_id, sow_id, process_id,
  demand_item_id, requisition_code, status, requested_qty, approved_qty,
  needed_date, requester, approver, justification, metadata
)
VALUES
  ('77777777-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '66666666-1111-1111-1111-111111111102'::uuid, 'REQ-DB-2045', 'approved', 420, 260, CURRENT_DATE + 21,
   'Procurement Lead', 'Project Controls', 'Secure cement supply.', jsonb_build_object('stage','Off-Site Works')),
  ('77777777-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '66666666-1111-1111-1111-111111111103'::uuid, 'REQ-DB-2051', 'released', 320, 180, CURRENT_DATE + 14,
   'Rebar Superintendent', 'Construction Manager', 'Fabricate rebar cages.', jsonb_build_object('stage','Logistics')),
  ('77777777-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '66666666-2222-2222-2222-222222222202'::uuid, 'REQ-DB-2070', 'approved', 260, 260, CURRENT_DATE + 24,
   'Precast Manager', 'Contracts', 'Precast grout order.', jsonb_build_object('stage','Off-Site Works')),
  ('77777777-1111-1111-1111-111111111104'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '66666666-2222-2222-2222-222222222203'::uuid, 'REQ-DB-2076', 'released', 22, 10, CURRENT_DATE + 18,
   'QA Manager', 'Technical Director', 'Sensor deployment for QC.', jsonb_build_object('stage','Logistics'))
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_purchase_orders (
  id, tenant_id, project_id, contract_id, sow_id, process_id,
  requisition_id, po_number, supplier, status, ordered_qty,
  committed_value, currency, expected_date, actual_date, metadata
)
VALUES
  ('88888888-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '77777777-1111-1111-1111-111111111101'::uuid, 'PO-DB-9001', 'Maple Cement LLC', 'open', 260, 145000, 'USD', CURRENT_DATE + 16, NULL,
   jsonb_build_object('incoterm','FOB','stage','Off-Site Works')),
  ('88888888-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '77777777-1111-1111-1111-111111111102'::uuid, 'PO-DB-9005', 'Northern Steel Fab', 'partial', 180, 210000, 'USD', CURRENT_DATE + 10, NULL,
   jsonb_build_object('fabricator','Yard B','stage','Logistics')),
  ('88888888-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '77777777-1111-1111-1111-111111111103'::uuid, 'PO-DB-9011', 'Blue River Precast', 'open', 260, 132500, 'USD', CURRENT_DATE + 17, NULL,
   jsonb_build_object('stage','Off-Site Works')),
  ('88888888-1111-1111-1111-111111111104'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '77777777-1111-1111-1111-111111111104'::uuid, 'PO-DB-9014', 'CoreSense Monitoring', 'open', 10, 48000, 'USD', CURRENT_DATE + 12, NULL,
   jsonb_build_object('stage','Logistics'))
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_shipments (
  id, tenant_id, project_id, contract_id, sow_id, process_id,
  purchase_order_id, tracking_code, status, origin, destination,
  etd, eta, actual_arrival, carrier, metadata
)
VALUES
  ('99999999-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '88888888-1111-1111-1111-111111111101'::uuid, 'SHIP-DB-1201', 'at_port', 'Port Qasim', 'Karachi Rail Hub', CURRENT_DATE - 2, CURRENT_DATE + 5, NULL, 'APL Logistics',
   jsonb_build_object('mode','Sea-Rail','stage','Logistics','lane','Import Clearance')),
  ('99999999-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '88888888-1111-1111-1111-111111111102'::uuid, 'SHIP-DB-1205', 'in_transit', 'Karachi Rail Hub', 'Dam Site Laydown', CURRENT_DATE - 1, CURRENT_DATE + 3, NULL, 'Pakistan Rail Freight',
   jsonb_build_object('mode','Rail','stage','Logistics','lane','Line Haul')),
  ('99999999-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '88888888-1111-1111-1111-111111111103'::uuid, 'SHIP-DB-1210', 'dispatched', 'Precast Yard', 'Dam Site Precast Zone', CURRENT_DATE, CURRENT_DATE + 4, NULL, 'Blue River Haulage',
   jsonb_build_object('mode','Truck','stage','Logistics','lane','Last Mile'))
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_id_rcc,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_dam_pit,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.scm_inventory_snapshots (
  id, tenant_id, project_id, contract_id, sow_id, process_id,
  item_id, location_label, snapshot_date, quantity_on_hand,
  quantity_reserved, quantity_available, unit_cost, metadata
)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111101'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_dam_pit FROM params),
   '55555555-1111-1111-1111-111111111101'::uuid, 'Laydown Yard A', CURRENT_DATE - 1, 140, 60, 80, 1200, jsonb_build_object('stage','Site Works')),
  ('aaaaaaaa-1111-1111-1111-111111111102'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), NULL, NULL,
   '55555555-1111-1111-1111-111111111102'::uuid, 'Central Cement Silo', CURRENT_DATE - 2, 620, 180, 440, 180, jsonb_build_object('stage','Off-Site Works')),
  ('aaaaaaaa-1111-1111-1111-111111111103'::uuid, (SELECT tenant_id FROM params), (SELECT project_id FROM params), (SELECT contract_id FROM params), (SELECT sow_id_rcc FROM params), (SELECT process_formwork FROM params),
   '55555555-1111-1111-1111-111111111103'::uuid, 'QA Lab Store', CURRENT_DATE - 1, 18, 6, 12, 3800, jsonb_build_object('stage','Logistics'))
ON CONFLICT (id) DO NOTHING;
