-- 015_atom_daily_schedule.sql
-- Daily atom scheduling allocations with rich time/volume/sensor slots
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_schedule_daily (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  atom_id UUID NOT NULL REFERENCES dipgos.atoms(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  total_busy_minutes INTEGER NOT NULL DEFAULT 0,
  total_idle_minutes INTEGER NOT NULL DEFAULT 0,
  total_allocations INTEGER NOT NULL DEFAULT 0,
  volume_committed NUMERIC(14, 2),
  volume_unit TEXT,
  notes TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, atom_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_atom_schedule_daily_atom
  ON dipgos.atom_schedule_daily (atom_id, schedule_date DESC);

CREATE INDEX IF NOT EXISTS idx_atom_schedule_daily_tenant
  ON dipgos.atom_schedule_daily (tenant_id, schedule_date DESC);

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS civil_engineer,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_rcc_pour,
    '44444444-4444-4444-4444-444444444555'::uuid AS process_batching,
    '44444444-4444-4444-4444-444444444666'::uuid AS process_formwork
)
INSERT INTO dipgos.atom_schedule_daily (
  id,
  tenant_id,
  atom_id,
  schedule_date,
  total_busy_minutes,
  total_idle_minutes,
  total_allocations,
  volume_committed,
  volume_unit,
  notes,
  payload
)
SELECT
  entry.id,
  tenant_id,
  civil_engineer,
  entry.schedule_date,
  entry.busy_minutes,
  entry.idle_minutes,
  entry.allocations,
  entry.volume_committed,
  entry.volume_unit,
  entry.notes,
  entry.payload
FROM params
CROSS JOIN (
  VALUES
    (
      'a2000000-0000-0000-0000-000000000701'::uuid,
      CURRENT_DATE,
      540,
      120,
      6,
      26.0,
      'bags',
      'Extended day to close RCC lift thermal checks.',
      jsonb_build_object(
        'timeSlots', jsonb_build_array(
          jsonb_build_object('start', '06:30', 'end', '08:30', 'process', 'Formwork → Pier Cap', 'location', 'Lift L14 staging', 'status', 'busy'),
          jsonb_build_object('start', '08:30', 'end', '09:00', 'process', 'Crew prep', 'location', 'Pour deck', 'status', 'idle'),
          jsonb_build_object('start', '09:00', 'end', '12:15', 'process', 'Concrete placement', 'location', 'RCC Lift L14', 'status', 'busy'),
          jsonb_build_object('start', '12:15', 'end', '13:00', 'process', 'Lunch / toolbox', 'location', 'Site canteen', 'status', 'idle'),
          jsonb_build_object('start', '13:00', 'end', '16:00', 'process', 'Thermal monitoring & QA', 'location', 'Cooling circuit N2', 'status', 'monitoring'),
          jsonb_build_object('start', '16:00', 'end', '20:30', 'process', 'Sensor validation & pour sign-off', 'location', 'Lift L14 gallery', 'status', 'busy')
        ),
        'volumeSlots', jsonb_build_array(
          jsonb_build_object('material', 'Cement', 'quantity', 20, 'unit', 'bags', 'process', 'Concrete placement', 'window', '09:00–11:30', 'status', 'committed'),
          jsonb_build_object('material', 'Admixture A', 'quantity', 240, 'unit', 'liters', 'process', 'Thermal monitoring & QA', 'window', '13:00–14:30', 'status', 'in_use'),
          jsonb_build_object('material', 'Cooling water', 'quantity', 18, 'unit', 'm³', 'process', 'Sensor validation & pour sign-off', 'window', '16:00–19:30', 'status', 'monitoring')
        ),
        'sensorSlots', jsonb_build_array(
          jsonb_build_object('label', 'Temperature monitoring', 'state', 'Monitoring', 'elapsedHours', 4, 'targetHours', 8, 'status', 'monitoring'),
          jsonb_build_object('label', 'Strength maturity', 'state', 'Strength Achieved', 'elapsedHours', 8, 'targetHours', 8, 'status', 'completed'),
          jsonb_build_object('label', 'Cooling loop delta', 'state', 'Extended', 'elapsedHours', 2, 'targetHours', 3, 'status', 'extended')
        )
      )
    ),
    (
      'a2000000-0000-0000-0000-000000000702'::uuid,
      CURRENT_DATE - INTERVAL '1 day',
      480,
      180,
      5,
      18.0,
      'bags',
      'Shift focused on reinforcement congestion resolution.',
      jsonb_build_object(
        'timeSlots', jsonb_build_array(
          jsonb_build_object('start', '07:00', 'end', '09:30', 'process', 'Rebar congestion audit', 'location', 'Lift L13 core', 'status', 'busy'),
          jsonb_build_object('start', '09:30', 'end', '10:30', 'process', 'Design coordination', 'location', 'Field office', 'status', 'busy'),
          jsonb_build_object('start', '10:30', 'end', '12:00', 'process', 'Idle buffer', 'location', 'Standby', 'status', 'idle'),
          jsonb_build_object('start', '12:00', 'end', '15:00', 'process', 'Pour window supervision', 'location', 'Lift L13', 'status', 'busy'),
          jsonb_build_object('start', '15:00', 'end', '17:00', 'process', 'Toolbox & mentoring', 'location', 'QA trailer', 'status', 'busy'),
          jsonb_build_object('start', '17:00', 'end', '20:00', 'process', 'Monitoring', 'location', 'Cooling loop', 'status', 'monitoring')
        ),
        'volumeSlots', jsonb_build_array(
          jsonb_build_object('material', 'Rebar couplers', 'quantity', 36, 'unit', 'sets', 'process', 'Rebar congestion audit', 'window', '07:30–09:00', 'status', 'consumed'),
          jsonb_build_object('material', 'Cement', 'quantity', 18, 'unit', 'bags', 'process', 'Pour window supervision', 'window', '12:00–14:30', 'status', 'committed')
        ),
        'sensorSlots', jsonb_build_array(
          jsonb_build_object('label', 'Temperature monitoring', 'state', 'Monitoring', 'elapsedHours', 5, 'targetHours', 8, 'status', 'monitoring'),
          jsonb_build_object('label', 'Strength maturity', 'state', 'Monitoring', 'elapsedHours', 6, 'targetHours', 8, 'status', 'monitoring')
        )
      )
    ),
    (
      'a2000000-0000-0000-0000-000000000703'::uuid,
      CURRENT_DATE - INTERVAL '2 days',
      420,
      180,
      4,
      22.0,
      'bags',
      'Night shift support for thermal transition.',
      jsonb_build_object(
        'timeSlots', jsonb_build_array(
          jsonb_build_object('start', '05:30', 'end', '07:30', 'process', 'Night shift handover', 'location', 'Lift L12 gallery', 'status', 'busy'),
          jsonb_build_object('start', '07:30', 'end', '09:00', 'process', 'Idle buffer', 'location', 'Standby', 'status', 'idle'),
          jsonb_build_object('start', '09:00', 'end', '12:00', 'process', 'Concrete placement', 'location', 'Lift L13 face', 'status', 'busy'),
          jsonb_build_object('start', '12:00', 'end', '13:30', 'process', 'Crew rest', 'location', 'Site canteen', 'status', 'idle'),
          jsonb_build_object('start', '13:30', 'end', '18:00', 'process', 'Monitoring & QA report-out', 'location', 'QA control room', 'status', 'monitoring')
        ),
        'volumeSlots', jsonb_build_array(
          jsonb_build_object('material', 'Cement', 'quantity', 22, 'unit', 'bags', 'process', 'Concrete placement', 'window', '09:00–11:30', 'status', 'consumed')
        ),
        'sensorSlots', jsonb_build_array(
          jsonb_build_object('label', 'Temperature monitoring', 'state', 'Monitoring', 'elapsedHours', 3, 'targetHours', 8, 'status', 'monitoring'),
          jsonb_build_object('label', 'Cooling loop delta', 'state', 'Monitoring', 'elapsedHours', 2, 'targetHours', 3, 'status', 'monitoring')
        )
      )
    )
) AS entry(id, schedule_date, busy_minutes, idle_minutes, allocations, volume_committed, volume_unit, notes, payload)
ON CONFLICT (id) DO UPDATE
SET total_busy_minutes = EXCLUDED.total_busy_minutes,
    total_idle_minutes = EXCLUDED.total_idle_minutes,
    total_allocations = EXCLUDED.total_allocations,
    volume_committed = EXCLUDED.volume_committed,
    volume_unit = EXCLUDED.volume_unit,
    notes = EXCLUDED.notes,
    payload = EXCLUDED.payload,
    updated_at = NOW();

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000010'::uuid AS excavator_atom
)
INSERT INTO dipgos.atom_schedule_daily (
  id,
  tenant_id,
  atom_id,
  schedule_date,
  total_busy_minutes,
  total_idle_minutes,
  total_allocations,
  volume_committed,
  volume_unit,
  notes,
  payload
)
SELECT
  entry.id,
  tenant_id,
  excavator_atom,
  entry.schedule_date,
  entry.busy_minutes,
  entry.idle_minutes,
  entry.allocations,
  entry.volume_committed,
  entry.volume_unit,
  entry.notes,
  entry.payload
FROM params
CROSS JOIN (
  VALUES
    (
      'a2000000-0000-0000-0000-000000000801'::uuid,
      CURRENT_DATE,
      630,
      90,
      5,
      520.0,
      'm³',
      'High-output shift on bench excavation.',
      jsonb_build_object(
        'timeSlots', jsonb_build_array(
          jsonb_build_object('start', '07:00', 'end', '10:30', 'process', 'Excavation → Bench Cut', 'location', 'Dam pit east wall', 'status', 'busy'),
          jsonb_build_object('start', '10:30', 'end', '11:30', 'process', 'Refuel & service', 'location', 'Maintenance bay', 'status', 'idle'),
          jsonb_build_object('start', '11:30', 'end', '15:00', 'process', 'Haul → Dump 3', 'location', 'Dump 3', 'status', 'busy'),
          jsonb_build_object('start', '15:00', 'end', '16:00', 'process', 'Operator break', 'location', 'Rest area', 'status', 'idle'),
          jsonb_build_object('start', '16:00', 'end', '20:30', 'process', 'Excavation → Bench Cut', 'location', 'Dam pit east wall', 'status', 'busy')
        ),
        'volumeSlots', jsonb_build_array(
          jsonb_build_object('material', 'Overburden', 'quantity', 320, 'unit', 'm³', 'process', 'Excavation → Bench Cut', 'window', '07:00–10:30', 'status', 'moved'),
          jsonb_build_object('material', 'Rockfill', 'quantity', 200, 'unit', 'm³', 'process', 'Haul → Dump 3', 'window', '11:30–15:00', 'status', 'moved')
        ),
        'sensorSlots', jsonb_build_array(
          jsonb_build_object('label', 'Payload monitoring', 'state', 'Monitoring', 'elapsedHours', 6, 'targetHours', 10, 'status', 'monitoring'),
          jsonb_build_object('label', 'Cycle analytics', 'state', 'Monitoring', 'elapsedHours', 6, 'targetHours', 10, 'status', 'monitoring')
        )
      )
    )
) AS entry(id, schedule_date, busy_minutes, idle_minutes, allocations, volume_committed, volume_unit, notes, payload)
ON CONFLICT (id) DO UPDATE
SET total_busy_minutes = EXCLUDED.total_busy_minutes,
    total_idle_minutes = EXCLUDED.total_idle_minutes,
    total_allocations = EXCLUDED.total_allocations,
    volume_committed = EXCLUDED.volume_committed,
    volume_unit = EXCLUDED.volume_unit,
    notes = EXCLUDED.notes,
    payload = EXCLUDED.payload,
    updated_at = NOW();
