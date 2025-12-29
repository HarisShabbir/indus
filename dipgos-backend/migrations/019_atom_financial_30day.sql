-- 019_atom_financial_30day.sql
-- Extended 30-day synthetic scheduling and financial data for key atoms
SET search_path TO dipgos, public;

WITH seed AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS process_excavation_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS process_pump_id,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom_id,
    'b0000000-0000-0000-0000-000000000062'::uuid AS pump_group_id,
    'c0000000-0000-0000-0000-000000000090'::uuid AS pump_type_id,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom_id
)
INSERT INTO dipgos.atom_groups (id, category, name, parent_id, tenant_id)
SELECT pump_group_id, 'equipment', 'Dewatering Systems', 'b0000000-0000-0000-0000-000000000040', tenant_id
FROM seed
ON CONFLICT (id) DO NOTHING;

WITH seed AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    'b0000000-0000-0000-0000-000000000062'::uuid AS pump_group_id,
    'c0000000-0000-0000-0000-000000000090'::uuid AS pump_type_id
)
INSERT INTO dipgos.atom_types (id, group_id, category, name, spec, tenant_id)
SELECT pump_type_id, pump_group_id, 'equipment', 'Dewatering Pump Skid', '{"flowRateGPM": 450, "power": "45kW"}'::jsonb, tenant_id
FROM seed
ON CONFLICT (id) DO NOTHING;

WITH seed AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    'c0000000-0000-0000-0000-000000000090'::uuid AS pump_type_id,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom_id
)
INSERT INTO dipgos.atoms (id, atom_type_id, name, unit, contractor_id, home_entity_id, spec, tenant_id)
SELECT pump_atom_id, pump_type_id, 'Dewatering Pump Skid 3B', 'unit', NULL, contract_id, '{"location": "North gallery", "serial": "DP-3B"}'::jsonb, tenant_id
FROM seed
ON CONFLICT (id) DO NOTHING;

-- Long-running schedule entries for excavator and pump
WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS excavation_process,
    '44444444-4444-4444-4444-444444444555'::uuid AS pump_process,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
)
INSERT INTO dipgos.atom_schedule_entries (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  milestone, status, criticality, planned_start, planned_finish,
  actual_start, actual_finish, percent_complete, variance_days, notes
)
SELECT
  'f3000000-0000-0000-0000-000000000901'::uuid,
  tenant_id, project_id, contract_id, sow_rcc_id, excavation_process, excavator_atom,
  'Excavation cycle M-17', 'active', 'high',
  CURRENT_DATE - INTERVAL '29 days',
  CURRENT_DATE + INTERVAL '1 day',
  CURRENT_DATE - INTERVAL '29 days',
  NULL,
  0.62,
  -1.0,
  'Excavator CAT 395 assigned to dam pit bench progression.'
FROM scope
ON CONFLICT (id) DO UPDATE
SET planned_start = EXCLUDED.planned_start,
    planned_finish = EXCLUDED.planned_finish,
    actual_start = EXCLUDED.actual_start,
    percent_complete = EXCLUDED.percent_complete,
    variance_days = EXCLUDED.variance_days,
    notes = EXCLUDED.notes,
    updated_at = NOW();

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS pump_process,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
)
INSERT INTO dipgos.atom_schedule_entries (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  milestone, status, criticality, planned_start, planned_finish,
  actual_start, actual_finish, percent_complete, variance_days, notes
)
SELECT
  'f3000000-0000-0000-0000-000000000902'::uuid,
  tenant_id, project_id, contract_id, sow_rcc_id, pump_process, pump_atom,
  'Dewatering operations Q3', 'active', 'medium',
  CURRENT_DATE - INTERVAL '29 days',
  CURRENT_DATE + INTERVAL '1 day',
  CURRENT_DATE - INTERVAL '29 days',
  NULL,
  0.58,
  0.5,
  'Skid-mounted dewatering pumps maintaining gallery inflow targets.'
FROM scope
ON CONFLICT (id) DO UPDATE
SET planned_start = EXCLUDED.planned_start,
    planned_finish = EXCLUDED.planned_finish,
    actual_start = EXCLUDED.actual_start,
    percent_complete = EXCLUDED.percent_complete,
    variance_days = EXCLUDED.variance_days,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Refresh 30-day daily scheduling snapshots for excavator and pump
WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
),
series AS (
  SELECT gs::date AS schedule_date
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
DELETE FROM dipgos.atom_schedule_daily d
USING scope
WHERE d.tenant_id = scope.tenant_id
  AND d.atom_id IN (scope.excavator_atom, scope.pump_atom)
  AND d.schedule_date IN (SELECT schedule_date FROM series);

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
),
series AS (
  SELECT
    gs::date AS schedule_date,
    EXTRACT(dow FROM gs)::int AS dow
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
INSERT INTO dipgos.atom_schedule_daily (
  id, tenant_id, atom_id, schedule_date,
  total_busy_minutes, total_idle_minutes, total_allocations,
  volume_committed, volume_unit, notes, payload
)
SELECT
  md5('excavator-' || series.schedule_date::text)::uuid,
  scope.tenant_id,
  scope.excavator_atom,
  series.schedule_date,
  420 + (series.dow % 3) * 30 AS busy_minutes,
  120 + (series.dow % 2) * 15 AS idle_minutes,
  4,
  NULL,
  NULL,
  'Excavation shift for ' || to_char(series.schedule_date, 'Mon DD') || '.',
  jsonb_build_object(
    'timeSlots', jsonb_build_array(
      jsonb_build_object('start', '07:00', 'end', '11:00', 'process', 'Dam pit excavation', 'location', 'Bench A', 'status', 'busy'),
      jsonb_build_object('start', '11:00', 'end', '12:00', 'process', 'Lunch / refuel', 'location', 'Camp pad', 'status', 'idle'),
      jsonb_build_object('start', '12:00', 'end', '16:00', 'process', 'Bench trimming', 'location', 'Bench A', 'status', 'busy'),
      jsonb_build_object('start', '16:00', 'end', '17:30', 'process', 'Maintenance & checks', 'location', 'Service bay', 'status', 'idle')
    )
  )
FROM scope, series
ON CONFLICT (tenant_id, atom_id, schedule_date) DO UPDATE
SET total_busy_minutes = EXCLUDED.total_busy_minutes,
    total_idle_minutes = EXCLUDED.total_idle_minutes,
    total_allocations = EXCLUDED.total_allocations,
    notes = EXCLUDED.notes,
    payload = EXCLUDED.payload,
    updated_at = NOW();

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
),
series AS (
  SELECT
    gs::date AS schedule_date,
    EXTRACT(dow FROM gs)::int AS dow
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
INSERT INTO dipgos.atom_schedule_daily (
  id, tenant_id, atom_id, schedule_date,
  total_busy_minutes, total_idle_minutes, total_allocations,
  volume_committed, volume_unit, notes, payload
)
SELECT
  md5('pump-' || series.schedule_date::text)::uuid,
  scope.tenant_id,
  scope.pump_atom,
  series.schedule_date,
  360 + (series.dow % 4) * 20 AS busy_minutes,
  180 + (series.dow % 2) * 15 AS idle_minutes,
  3,
  NULL,
  NULL,
  'Dewatering shift logged for ' || to_char(series.schedule_date, 'Mon DD') || '.',
  jsonb_build_object(
    'timeSlots', jsonb_build_array(
      jsonb_build_object('start', '06:30', 'end', '10:00', 'process', 'Pump monitoring', 'location', 'North gallery', 'status', 'monitoring'),
      jsonb_build_object('start', '10:00', 'end', '12:00', 'process', 'Standby buffer', 'location', 'Skid 3B', 'status', 'idle'),
      jsonb_build_object('start', '12:00', 'end', '15:30', 'process', 'Discharge checks', 'location', 'Spillway header', 'status', 'busy'),
      jsonb_build_object('start', '15:30', 'end', '17:30', 'process', 'Flushing & prep', 'location', 'Settling pond', 'status', 'busy')
    ),
    'sensorSlots', jsonb_build_array(
      jsonb_build_object('label', 'Water level', 'state', 'Stable', 'elapsedHours', 6, 'targetHours', 6, 'status', 'monitoring'),
      jsonb_build_object('label', 'Vibration', 'state', 'Within limits', 'elapsedHours', 2, 'targetHours', 2, 'status', 'completed')
    )
  )
FROM scope, series
ON CONFLICT (tenant_id, atom_id, schedule_date) DO UPDATE
SET total_busy_minutes = EXCLUDED.total_busy_minutes,
    total_idle_minutes = EXCLUDED.total_idle_minutes,
    total_allocations = EXCLUDED.total_allocations,
    notes = EXCLUDED.notes,
    payload = EXCLUDED.payload,
    updated_at = NOW();

-- Refresh financial allocations for 30-day window
WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS excavation_process,
    '44444444-4444-4444-4444-444444444555'::uuid AS pump_process,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
),
series AS (
  SELECT gs::date AS allocation_date
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
DELETE FROM dipgos.atom_financial_allocations f
USING scope
WHERE f.tenant_id = scope.tenant_id
  AND f.atom_id IN (scope.excavator_atom, scope.pump_atom)
  AND f.allocation_date IN (SELECT allocation_date FROM series);

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444779'::uuid AS excavation_process,
    'd0000000-0000-0000-0000-000000000090'::uuid AS excavator_atom
),
series AS (
  SELECT
    gs::date AS allocation_date,
    EXTRACT(dow FROM gs)::int AS dow
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
INSERT INTO dipgos.atom_financial_allocations (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  basis, allocation_date, start_ts, end_ts,
  busy_minutes, idle_minutes, billable_minutes, non_billable_minutes,
  quantity, unit, time_rate, unit_rate, standby_rate,
  overtime_multiplier, surcharge_multiplier,
  location, shift, status, notes, non_billable_reason, sensor_condition,
  planned_billable_minutes, planned_earned
)
SELECT
  md5('fin-excavator-' || series.allocation_date::text)::uuid,
  scope.tenant_id,
  scope.project_id,
  scope.contract_id,
  scope.sow_rcc_id,
  scope.excavation_process,
  scope.excavator_atom,
  CASE WHEN series.dow = 6 THEN 'sensor' ELSE 'time' END,
  series.allocation_date,
  date_trunc('day', series.allocation_date)::timestamptz + INTERVAL '7 hours',
  date_trunc('day', series.allocation_date)::timestamptz + INTERVAL '17 hours',
  420 + (series.dow % 3) * 30 AS busy_minutes,
  120 + (series.dow % 2) * 15 AS idle_minutes,
  360 + (series.dow % 3) * 30 AS billable_minutes,
  30 + (series.dow % 2) * 15 AS non_billable_minutes,
  NULL,
  NULL,
  165.00,
  NULL,
  NULL,
  CASE WHEN series.dow IN (0, 6) THEN 1.35 ELSE 1.10 END AS overtime_multiplier,
  CASE WHEN series.dow IN (0, 6) THEN 1.08 ELSE 1.02 END AS surcharge_multiplier,
  'Dam pit bench A',
  CASE WHEN series.dow IN (0, 6) THEN 'Weekend' ELSE 'Day' END,
  'billable',
  'Excavator production shift for ' || to_char(series.allocation_date, 'Mon DD') || '.',
  CASE WHEN series.dow = 3 THEN 'Partial standby for blasting prep.' ELSE NULL END,
  CASE WHEN series.dow = 6 THEN 'Sensor verification during night shift.' ELSE NULL END,
  360 + (series.dow % 3) * 30 AS planned_billable_minutes,
  ((360 + (series.dow % 3) * 30) / 60.0) * 165.00 * CASE WHEN series.dow IN (0, 6) THEN 1.35 ELSE 1.10 END * CASE WHEN series.dow IN (0, 6) THEN 1.08 ELSE 1.02 END
FROM scope, series
ON CONFLICT (id) DO NOTHING;

WITH scope AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS tenant_id,
    '11111111-1111-1111-1111-111111111111'::uuid AS project_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id,
    '33333333-3333-3333-3333-333333333333'::uuid AS sow_rcc_id,
    '44444444-4444-4444-4444-444444444555'::uuid AS pump_process,
    'd0000000-0000-0000-0000-0000000000A0'::uuid AS pump_atom
),
series AS (
  SELECT
    gs::date AS allocation_date,
    EXTRACT(dow FROM gs)::int AS dow
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs
)
INSERT INTO dipgos.atom_financial_allocations (
  id, tenant_id, project_id, contract_id, sow_id, process_id, atom_id,
  basis, allocation_date, start_ts, end_ts,
  busy_minutes, idle_minutes, billable_minutes, non_billable_minutes,
  quantity, unit, time_rate, unit_rate, standby_rate,
  overtime_multiplier, surcharge_multiplier,
  location, shift, status, notes, non_billable_reason, sensor_condition,
  planned_billable_minutes, planned_earned
)
SELECT
  md5('fin-pump-' || series.allocation_date::text)::uuid,
  scope.tenant_id,
  scope.project_id,
  scope.contract_id,
  scope.sow_rcc_id,
  scope.pump_process,
  scope.pump_atom,
  CASE WHEN series.dow IN (2, 5) THEN 'sensor' ELSE 'time' END,
  series.allocation_date,
  date_trunc('day', series.allocation_date)::timestamptz + INTERVAL '6 hours',
  date_trunc('day', series.allocation_date)::timestamptz + INTERVAL '16 hours',
  360 + (series.dow % 4) * 20 AS busy_minutes,
  180 + (series.dow % 2) * 15 AS idle_minutes,
  300 + (series.dow % 4) * 20 AS billable_minutes,
  60 + (series.dow % 2) * 15 AS non_billable_minutes,
  NULL,
  NULL,
  85.00,
  NULL,
  45.00,
  CASE WHEN series.dow IN (0, 6) THEN 1.25 ELSE 1.05 END AS overtime_multiplier,
  CASE WHEN series.dow IN (0, 6) THEN 1.10 ELSE 1.03 END AS surcharge_multiplier,
  'North gallery pump skid',
  CASE WHEN series.dow IN (0, 6) THEN 'Night' ELSE 'Day' END,
  CASE WHEN series.dow = 1 THEN 'standby' ELSE 'billable' END,
  'Dewatering run for ' || to_char(series.allocation_date, 'Mon DD') || '.',
  CASE WHEN series.dow = 1 THEN 'Standby to balance inflow after rainfall.' ELSE NULL END,
  CASE WHEN series.dow IN (2, 5) THEN 'Water table stabilised after monitoring cycle.' ELSE NULL END,
  300 + (series.dow % 4) * 20 AS planned_billable_minutes,
  ((300 + (series.dow % 4) * 20) / 60.0) * 85.00 * CASE WHEN series.dow IN (0, 6) THEN 1.25 ELSE 1.05 END * CASE WHEN series.dow IN (0, 6) THEN 1.10 ELSE 1.03 END
FROM scope, series
ON CONFLICT (id) DO NOTHING;
