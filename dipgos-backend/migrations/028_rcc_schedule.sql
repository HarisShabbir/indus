-- RCC schedule, progress, alarms, and financial link schema (additive)

CREATE TABLE IF NOT EXISTS dipgos.rcc_block_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_number INTEGER NOT NULL,
    block_group_code TEXT NOT NULL,
    elevation_m NUMERIC(8,2) NOT NULL,
    width_m NUMERIC(10,2),
    length_m NUMERIC(10,2),
    height_m NUMERIC(10,2),
    volume_m3 NUMERIC(14,2),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rcc_block_layers_unique ON dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, length_m, height_m);
CREATE INDEX IF NOT EXISTS rcc_block_layers_block_idx ON dipgos.rcc_block_layers (block_number);
CREATE INDEX IF NOT EXISTS rcc_block_layers_group_idx ON dipgos.rcc_block_layers (block_group_code, block_number);

CREATE TABLE IF NOT EXISTS dipgos.rcc_schedule_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_code TEXT UNIQUE NOT NULL,
    activity_name TEXT NOT NULL,
    block_group_code TEXT NOT NULL,
    block_number INTEGER,
    original_duration_days INTEGER NOT NULL,
    baseline_start DATE NOT NULL,
    baseline_finish DATE NOT NULL,
    total_float_days INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','stopped','delayed','complete','canceled')),
    planned_volume_m3 NUMERIC(14,2),
    actual_volume_m3 NUMERIC(14,2) NOT NULL DEFAULT 0,
    percent_complete NUMERIC(6,2) NOT NULL DEFAULT 0,
    planned_start DATE,
    planned_finish DATE,
    actual_start DATE,
    actual_finish DATE,
    variance_days INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rcc_schedule_activities_group_idx ON dipgos.rcc_schedule_activities (block_group_code, block_number);
CREATE INDEX IF NOT EXISTS rcc_schedule_activities_status_idx ON dipgos.rcc_schedule_activities (status);

CREATE TABLE IF NOT EXISTS dipgos.rcc_activity_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES dipgos.rcc_schedule_activities (id) ON DELETE CASCADE,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_by TEXT,
    volume_placed_m3 NUMERIC(14,2),
    percent_complete NUMERIC(6,2),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rcc_activity_progress_activity_idx ON dipgos.rcc_activity_progress (activity_id, reported_at DESC);

CREATE TABLE IF NOT EXISTS dipgos.rcc_alarm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_number INTEGER NOT NULL,
    block_group_code TEXT NOT NULL,
    activity_id UUID REFERENCES dipgos.rcc_schedule_activities (id) ON DELETE SET NULL,
    alarm_code TEXT,
    severity TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cleared')),
    raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at TIMESTAMPTZ,
    message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rcc_alarm_events_block_idx ON dipgos.rcc_alarm_events (block_number, status);
CREATE INDEX IF NOT EXISTS rcc_alarm_events_activity_idx ON dipgos.rcc_alarm_events (activity_id, status);

CREATE TABLE IF NOT EXISTS dipgos.rcc_financial_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES dipgos.rcc_schedule_activities (id) ON DELETE CASCADE,
    cost_code TEXT,
    gl_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rcc_financial_link_activity_idx ON dipgos.rcc_financial_link (activity_id);

-- Seed geometry and volume layers (additive; scoped to RCC blocks 12–29)
WITH layers AS (
    SELECT * FROM (VALUES
        -- Block 15 (template for 15–19)
        (15, 'B12-15', 905, 235, 33.6, 7.0, 55272.00),
        (15, 'B12-15', 915, 215, 33.6, 10.0, 72240.00),
        (15, 'B12-15', 925, 205, 33.6, 10.0, 68880.00),
        (15, 'B12-15', 935, 195, 33.6, 10.0, 65520.00),
        (15, 'B12-15', 945, 185, 33.6, 10.0, 62160.00),
        (15, 'B12-15', 955, 165, 33.6, 10.0, 55440.00),
        (15, 'B12-15', 965, 145, 33.6, 10.0, 48720.00),
        (15, 'B12-15', 975, 135, 33.6, 10.0, 45360.00),
        (15, 'B12-15', 990, 125, 33.6, 15.0, 63000.00),
        -- Block 20 & 14 profile
        (20, 'B19-21', 905, 235, 33.6, 7.0, 13818.00),
        (20, 'B19-21', 915, 215, 33.6, 10.0, 36120.00),
        (20, 'B19-21', 925, 205, 33.6, 10.0, 68880.00),
        (20, 'B19-21', 935, 195, 33.6, 10.0, 65520.00),
        (20, 'B19-21', 945, 185, 33.6, 10.0, 62160.00),
        (20, 'B19-21', 955, 165, 33.6, 10.0, 55440.00),
        (20, 'B19-21', 965, 145, 33.6, 10.0, 48720.00),
        (20, 'B19-21', 975, 135, 33.6, 10.0, 45360.00),
        (20, 'B19-21', 990, 125, 33.6, 15.0, 63000.00),
        (14, 'B12-15', 905, 235, 33.6, 7.0, 13818.00),
        (14, 'B12-15', 915, 215, 33.6, 10.0, 36120.00),
        (14, 'B12-15', 925, 205, 33.6, 10.0, 68880.00),
        (14, 'B12-15', 935, 195, 33.6, 10.0, 65520.00),
        (14, 'B12-15', 945, 185, 33.6, 10.0, 62160.00),
        (14, 'B12-15', 955, 165, 33.6, 10.0, 55440.00),
        (14, 'B12-15', 965, 145, 33.6, 10.0, 48720.00),
        (14, 'B12-15', 975, 135, 33.6, 10.0, 45360.00),
        (14, 'B12-15', 990, 125, 33.6, 15.0, 63000.00),
        -- Blocks 12, 13, 21 summary profile
        (12, 'B12-15', 925, 205, 33.6, 10.0, 22960.00),
        (12, 'B12-15', 935, 195, 33.6, 10.0, 65520.00),
        (12, 'B12-15', 945, 185, 33.6, 10.0, 62160.00),
        (12, 'B12-15', 955, 165, 33.6, 10.0, 55440.00),
        (12, 'B12-15', 965, 145, 33.6, 10.0, 48720.00),
        (12, 'B12-15', 975, 135, 33.6, 10.0, 45360.00),
        (12, 'B12-15', 990, 125, 33.6, 15.0, 63000.00),
        (13, 'B12-15', 925, 205, 33.6, 10.0, 22960.00),
        (13, 'B12-15', 935, 195, 33.6, 10.0, 65520.00),
        (13, 'B12-15', 945, 185, 33.6, 10.0, 62160.00),
        (13, 'B12-15', 955, 165, 33.6, 10.0, 55440.00),
        (13, 'B12-15', 965, 145, 33.6, 10.0, 48720.00),
        (13, 'B12-15', 975, 135, 33.6, 10.0, 45360.00),
        (13, 'B12-15', 990, 125, 33.6, 15.0, 63000.00),
        (21, 'B19-21', 925, 205, 33.6, 10.0, 22960.00),
        (21, 'B19-21', 935, 195, 33.6, 10.0, 65520.00),
        (21, 'B19-21', 945, 185, 33.6, 10.0, 62160.00),
        (21, 'B19-21', 955, 165, 33.6, 10.0, 55440.00),
        (21, 'B19-21', 965, 145, 33.6, 10.0, 48720.00),
        (21, 'B19-21', 975, 135, 33.6, 10.0, 45360.00),
        (21, 'B19-21', 990, 125, 33.6, 15.0, 63000.00),
        -- Block 22 detail
        (22, 'B22-24', 955, 165, 33.6, 5.0, 27720.00),
        (22, 'B22-24', 965, 145, 33.6, 10.0, 48720.00),
        (22, 'B22-24', 975, 135, 33.6, 10.0, 45360.00),
        (22, 'B22-24', 990, 125, 33.6, 15.0, 63000.00),
        -- Generic layers for remaining blocks to complete 12–29 coverage (baseline widths)
        (23, 'B22-24', 955, 165, 33.6, 10.0, 55440.00),
        (24, 'B22-24', 965, 145, 33.6, 10.0, 48720.00),
        (25, 'B25-27', 950, 165, 33.6, 10.0, 55440.00),
        (26, 'B25-27', 955, 165, 33.6, 10.0, 55440.00),
        (27, 'B25-27', 965, 145, 33.6, 10.0, 48720.00),
        (28, 'B28-29', 950, 165, 33.6, 10.0, 55440.00),
        (29, 'B28-29', 962, 150, 33.6, 10.0, 50400.00)
    ) AS t(block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
)
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3, metadata)
SELECT block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3,
       jsonb_build_object('source', 'seed_028_rcc_schedule')
FROM layers
ON CONFLICT (block_number, block_group_code, elevation_m, length_m, height_m) DO NOTHING;

-- Seed schedule activities (baseline dates converted to ISO YYYY-MM-DD)
INSERT INTO dipgos.rcc_schedule_activities (activity_code, activity_name, block_group_code, block_number, original_duration_days, baseline_start, baseline_finish, total_float_days, status, planned_start, planned_finish, planned_volume_m3, metadata)
VALUES
    ('B12-15', 'Block 12–15 summary', 'B12-15', NULL, 400, '2026-03-26', '2027-04-30', 0, 'not_started', '2026-03-26', '2027-04-30', 0, '{"summary": true}'::jsonb),
    ('DC12~15#05', 'RCC Concrete Preparation', 'B12-15', NULL, 15, '2026-03-26', '2026-04-10', 0, 'not_started', '2026-03-26', '2026-04-10', 0, '{}'::jsonb),
    ('DC12~15#10', 'Block #15 EL.898~901m', 'B12-15', 15, 5, '2026-04-10', '2026-04-15', 0, 'not_started', '2026-04-10', '2026-04-15', 55272, '{}'::jsonb),
    ('DC12~15#15', 'Block #14~15 up to EL.928m', 'B12-15', 15, 120, '2026-04-15', '2026-08-13', 0, 'not_started', '2026-04-15', '2026-08-13', 228322, '{}'::jsonb),
    ('DC12~15#20', 'Block #13~15 up to EL.945m', 'B12-15', 15, 85, '2026-08-13', '2026-11-06', 0, 'not_started', '2026-08-13', '2026-11-06', 173760, '{}'::jsonb),
    ('DC12~15#30', 'Block #12~15 up to EL.990m', 'B12-15', NULL, 175, '2026-11-06', '2027-04-30', 0, 'not_started', '2026-11-06', '2027-04-30', 63000, '{}'::jsonb),
    ('B16-18', 'Block 16–18 summary', 'B16-18', NULL, 401, '2026-03-06', '2027-04-11', 19, 'not_started', '2026-03-06', '2027-04-11', 0, '{"summary": true}'::jsonb),
    ('DC16~18#05', 'RCC Concrete Preparation', 'B16-18', NULL, 21, '2026-03-06', '2026-03-27', 19, 'not_started', '2026-03-06', '2026-03-27', 0, '{}'::jsonb),
    ('DC16~18#10', 'Block #16~18 EL.898~901m', 'B16-18', 16, 5, '2026-03-27', '2026-04-01', 19, 'not_started', '2026-03-27', '2026-04-01', 55272, '{}'::jsonb),
    ('DC16~18#12', 'Block #16~18 EL.901~907m', 'B16-18', 16, 30, '2026-04-01', '2026-05-01', 19, 'not_started', '2026-04-01', '2026-05-01', 72240, '{}'::jsonb),
    ('DC16~18#15', 'Block #16~18 EL.907~928m', 'B16-18', 16, 100, '2026-05-01', '2026-08-09', 19, 'not_started', '2026-05-01', '2026-08-09', 228322, '{}'::jsonb),
    ('DC16~18#20', 'Block #16~18 EL.928~949m', 'B16-18', 16, 100, '2026-08-09', '2026-11-17', 19, 'not_started', '2026-08-09', '2026-11-17', 173760, '{}'::jsonb),
    ('DC16~18#30', 'Block #16~18 EL.949~984m', 'B16-18', 16, 130, '2026-11-17', '2027-03-27', 19, 'not_started', '2026-11-17', '2027-03-27', 150000, '{}'::jsonb),
    ('DC16~18#40', 'Block #16~18 EL.984~990m', 'B16-18', 16, 15, '2027-03-27', '2027-04-11', 19, 'not_started', '2027-03-27', '2027-04-11', 63000, '{}'::jsonb),
    ('B19-21', 'Block 19–21 summary', 'B19-21', NULL, 430, '2026-01-29', '2027-04-04', 26, 'not_started', '2026-01-29', '2027-04-04', 0, '{"summary": true}'::jsonb),
    ('DC19~21#05', 'RCC Concrete Preparation', 'B19-21', NULL, 20, '2026-01-29', '2026-02-18', 26, 'not_started', '2026-01-29', '2026-02-18', 0, '{}'::jsonb),
    ('DC19~21#10', 'Block #19~21 EL.898~901m', 'B19-21', 20, 5, '2026-02-18', '2026-02-23', 26, 'not_started', '2026-02-18', '2026-02-23', 55272, '{}'::jsonb),
    ('DC19~21#12', 'Block #19~21 EL.901~907m', 'B19-21', 20, 30, '2026-02-23', '2026-03-25', 26, 'not_started', '2026-02-23', '2026-03-25', 72240, '{}'::jsonb),
    ('DC19~21#15', 'Block #19~21 EL.907~931m', 'B19-21', 20, 110, '2026-03-25', '2026-07-13', 26, 'not_started', '2026-03-25', '2026-07-13', 228322, '{}'::jsonb),
    ('DC19~21#20', 'Block #19~21 EL.931~952m', 'B19-21', 20, 100, '2026-07-13', '2026-10-21', 26, 'not_started', '2026-07-13', '2026-10-21', 173760, '{}'::jsonb),
    ('DC19~21#30', 'Block #19~21 EL.952~984m', 'B19-21', 20, 140, '2026-10-21', '2027-03-10', 26, 'not_started', '2026-10-21', '2027-03-10', 150000, '{}'::jsonb),
    ('DC19~21#40', 'Block #19~21 EL.984~990m', 'B19-21', 20, 25, '2027-03-10', '2027-04-04', 26, 'not_started', '2027-03-10', '2027-04-04', 63000, '{}'::jsonb),
    ('B22-24', 'Block 22–24 summary', 'B22-24', NULL, 414, '2026-01-05', '2027-02-23', 66, 'not_started', '2026-01-05', '2027-02-23', 0, '{"summary": true}'::jsonb),
    ('DC22~24#05', 'RCC Concrete Preparation', 'B22-24', 22, 20, '2026-01-05', '2026-01-25', 79, 'not_started', '2026-01-05', '2026-01-25', 0, '{}'::jsonb),
    ('DC22~24#10', 'Block #22~23 EL.920~923m', 'B22-24', 22, 2, '2026-01-26', '2026-01-28', 78, 'not_started', '2026-01-26', '2026-01-28', 30000, '{}'::jsonb),
    ('DC22~24#20', 'Block #22~24 EL.923~938m', 'B22-24', 22, 90, '2026-01-28', '2026-04-28', 78, 'not_started', '2026-01-28', '2026-04-28', 120000, '{}'::jsonb),
    ('DC22~24#30', 'Block #22~24 EL.938~953m', 'B22-24', 22, 90, '2026-05-29', '2026-08-27', 47, 'not_started', '2026-05-29', '2026-08-27', 120000, '{}'::jsonb),
    ('DC22~24#40', 'Block #22~24 EL.953~965m', 'B22-24', 22, 60, '2026-08-27', '2026-10-26', 66, 'not_started', '2026-08-27', '2026-10-26', 100000, '{}'::jsonb),
    ('DC22~24#50', 'Block #22~24 EL.965~990m', 'B22-24', 22, 120, '2026-10-26', '2027-02-23', 66, 'not_started', '2026-10-26', '2027-02-23', 184800, '{}'::jsonb),
    ('B25-27', 'Block 25–27 summary', 'B25-27', NULL, 49, '2026-01-05', '2027-02-23', 0, 'not_started', '2026-01-05', '2027-02-23', 0, '{"summary": true}'::jsonb),
    ('DC25~27#05', 'RCC Concrete Preparation', 'B25-27', 25, 8, '2027-03-13', '2027-03-20', 0, 'not_started', '2027-03-13', '2027-03-20', 0, '{}'::jsonb),
    ('DC25~27#10', 'Block #25~27 EL.950~953m', 'B25-27', 25, 7, '2027-03-21', '2027-03-27', 0, 'not_started', '2027-03-21', '2027-03-27', 55440, '{}'::jsonb),
    ('DC25~27#20', 'Block #25~27 EL.953~959m', 'B25-27', 25, 20, '2027-03-28', '2027-04-16', 0, 'not_started', '2027-03-28', '2027-04-16', 98000, '{}'::jsonb),
    ('DC25~27#30', 'Waiting for strength for diversion water', 'B25-27', NULL, 14, '2027-04-17', '2027-04-30', 0, 'not_started', '2027-04-17', '2027-04-30', 0, '{}'::jsonb),
    ('B28-29', 'Block 28–29 summary', 'B28-29', NULL, 59, '2027-02-26', '2027-04-25', 0, 'not_started', '2027-02-26', '2027-04-25', 0, '{"summary": true}'::jsonb),
    ('DC28~29#05', 'RCC Concrete Preparation', 'B28-29', 28, 8, '2027-02-26', '2027-03-05', 0, 'not_started', '2027-02-26', '2027-03-05', 0, '{}'::jsonb),
    ('DC28~29#10', 'Block #28~29 EL.950~953m', 'B28-29', 28, 7, '2027-03-06', '2027-03-12', 0, 'not_started', '2027-03-06', '2027-03-12', 55440, '{}'::jsonb),
    ('DC28~29#20', 'Block #28~29 EL.953~962m', 'B28-29', 28, 25, '2027-03-13', '2027-04-06', 0, 'not_started', '2027-03-13', '2027-04-06', 110000, '{}'::jsonb),
    ('DC28~29#30', 'Block #28~29 EL.962~968m', 'B28-29', 28, 19, '2027-04-07', '2027-04-25', 0, 'not_started', '2027-04-07', '2027-04-25', 80000, '{}'::jsonb),
    -- Tunnel/excavation activities
    ('LBG1005', 'Access Tunnel Construction 750m (as per portal invert at EL.980m)', 'LBG', NULL, 380, '2025-07-05', '2026-07-20', 120, 'not_started', '2025-07-05', '2026-07-20', NULL, '{}'::jsonb),
    ('LBG1010', 'Underground excavation and supporting Cum.100m(from pit)', 'LBG', NULL, 55, '2025-10-03', '2025-11-27', 59, 'not_started', '2025-10-03', '2025-11-27', NULL, '{}'::jsonb),
    ('LBG1020', 'Underground excavation and supporting Cum.150m', 'LBG', NULL, 30, '2026-07-20', '2026-08-19', 120, 'not_started', '2026-07-20', '2026-08-19', NULL, '{}'::jsonb),
    ('LBG1030', 'Underground excavation and supporting Cum.202m', 'LBG', NULL, 35, '2026-08-19', '2026-09-23', 120, 'not_started', '2026-08-19', '2026-09-23', NULL, '{}'::jsonb),
    ('RBG1010', 'Underground excavation and supporting Cum.159m (from pit)', 'RBG', NULL, 102, '2025-07-16', '2025-10-26', 51, 'not_started', '2025-07-16', '2025-10-26', NULL, '{}'::jsonb),
    ('RBG1020', 'Underground excavation and supporting Cum.200m', 'RBG', NULL, 25, '2026-06-15', '2026-07-10', 144, 'not_started', '2026-06-15', '2026-07-10', NULL, '{}'::jsonb),
    ('RBG1030', 'Underground excavation and supporting Cum.300m', 'RBG', NULL, 60, '2026-07-10', '2026-09-08', 144, 'not_started', '2026-07-10', '2026-09-08', NULL, '{}'::jsonb),
    ('RBG1040', 'Underground excavation and supporting Cum.400m', 'RBG', NULL, 60, '2026-09-08', '2026-11-07', 144, 'not_started', '2026-09-08', '2026-11-07', NULL, '{}'::jsonb)
ON CONFLICT (activity_code) DO NOTHING;

-- Baseline planned volume backfill from geometry rollups where missing
UPDATE dipgos.rcc_schedule_activities a
SET planned_volume_m3 = COALESCE(a.planned_volume_m3, agg.total_volume)
FROM (
    SELECT block_number, SUM(volume_m3) AS total_volume
    FROM dipgos.rcc_block_layers
    GROUP BY block_number
) agg
WHERE a.block_number IS NOT NULL
  AND a.planned_volume_m3 IS NULL
  AND a.block_number = agg.block_number;
