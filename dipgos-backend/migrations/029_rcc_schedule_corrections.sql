-- RCC schedule and block layer corrections to align with provided dataset.
-- Re-seed activities with correct durations/dates/float.
-- Re-seed block layers for blocks 12–24 with provided volumes.

BEGIN;

-- Refresh block layers for blocks 12–24
DELETE FROM dipgos.rcc_block_layers WHERE block_number BETWEEN 12 AND 24;

-- Block 15 template (also applied to 16,17,18,19)
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
VALUES
    (15, 'B12-15', 905, 235, 33.6, 7, 55272),
    (15, 'B12-15', 915, 215, 33.6, 10, 72240),
    (15, 'B12-15', 925, 205, 33.6, 10, 68880),
    (15, 'B12-15', 935, 195, 33.6, 10, 65520),
    (15, 'B12-15', 945, 185, 33.6, 10, 62160),
    (15, 'B12-15', 955, 165, 33.6, 10, 55440),
    (15, 'B12-15', 965, 145, 33.6, 10, 48720),
    (15, 'B12-15', 975, 135, 33.6, 10, 45360),
    (15, 'B12-15', 990, 125, 33.6, 15, 63000);

-- Apply same volumes to blocks 16–18 (group B16-18) and block 19 (group B19-21)
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
SELECT b, g, elevation_m, width_m, length_m, height_m, volume_m3
FROM (
    VALUES (16, 'B16-18'), (17, 'B16-18'), (18, 'B16-18'), (19, 'B19-21')
) bg(b, g)
JOIN (
    VALUES
        (905, 235, 33.6, 7, 55272),
        (915, 215, 33.6, 10, 72240),
        (925, 205, 33.6, 10, 68880),
        (935, 195, 33.6, 10, 65520),
        (945, 185, 33.6, 10, 62160),
        (955, 165, 33.6, 10, 55440),
        (965, 145, 33.6, 10, 48720),
        (975, 135, 33.6, 10, 45360),
        (990, 125, 33.6, 15, 63000)
) v(elevation_m, width_m, length_m, height_m, volume_m3) ON TRUE;

-- Block 14 and 20 volumes (reduced lower lifts)
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
VALUES
    (14, 'B12-15', 905, 235, 33.6, 7, 13818),
    (14, 'B12-15', 915, 215, 33.6, 10, 36120),
    (14, 'B12-15', 925, 205, 33.6, 10, 68880),
    (14, 'B12-15', 935, 195, 33.6, 10, 65520),
    (14, 'B12-15', 945, 185, 33.6, 10, 62160),
    (14, 'B12-15', 955, 165, 33.6, 10, 55440),
    (14, 'B12-15', 965, 145, 33.6, 10, 48720),
    (14, 'B12-15', 975, 135, 33.6, 10, 45360),
    (14, 'B12-15', 990, 125, 33.6, 15, 63000),
    (20, 'B19-21', 905, 235, 33.6, 7, 13818),
    (20, 'B19-21', 915, 215, 33.6, 10, 36120),
    (20, 'B19-21', 925, 205, 33.6, 10, 68880),
    (20, 'B19-21', 935, 195, 33.6, 10, 65520),
    (20, 'B19-21', 945, 185, 33.6, 10, 62160),
    (20, 'B19-21', 955, 165, 33.6, 10, 55440),
    (20, 'B19-21', 965, 145, 33.6, 10, 48720),
    (20, 'B19-21', 975, 135, 33.6, 10, 45360),
    (20, 'B19-21', 990, 125, 33.6, 15, 63000);

-- Blocks 12,13,21 volumes
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
VALUES
    (12, 'B12-15', 925, 205, 33.6, 10, 22960),
    (12, 'B12-15', 935, 195, 33.6, 10, 65520),
    (12, 'B12-15', 945, 185, 33.6, 10, 62160),
    (12, 'B12-15', 955, 165, 33.6, 10, 55440),
    (12, 'B12-15', 965, 145, 33.6, 10, 48720),
    (12, 'B12-15', 975, 135, 33.6, 10, 45360),
    (12, 'B12-15', 990, 125, 33.6, 15, 63000),
    (13, 'B12-15', 925, 205, 33.6, 10, 22960),
    (13, 'B12-15', 935, 195, 33.6, 10, 65520),
    (13, 'B12-15', 945, 185, 33.6, 10, 62160),
    (13, 'B12-15', 955, 165, 33.6, 10, 55440),
    (13, 'B12-15', 965, 145, 33.6, 10, 48720),
    (13, 'B12-15', 975, 135, 33.6, 10, 45360),
    (13, 'B12-15', 990, 125, 33.6, 15, 63000),
    (21, 'B19-21', 925, 205, 33.6, 10, 22960),
    (21, 'B19-21', 935, 195, 33.6, 10, 65520),
    (21, 'B19-21', 945, 185, 33.6, 10, 62160),
    (21, 'B19-21', 955, 165, 33.6, 10, 55440),
    (21, 'B19-21', 965, 145, 33.6, 10, 48720),
    (21, 'B19-21', 975, 135, 33.6, 10, 45360),
    (21, 'B19-21', 990, 125, 33.6, 15, 63000);

-- Block 22 volumes
INSERT INTO dipgos.rcc_block_layers (block_number, block_group_code, elevation_m, width_m, length_m, height_m, volume_m3)
VALUES
    (22, 'B22-24', 955, 165, 33.6, 5, 27720),
    (22, 'B22-24', 965, 145, 33.6, 10, 48720),
    (22, 'B22-24', 975, 135, 33.6, 10, 45360),
    (22, 'B22-24', 990, 125, 33.6, 15, 63000);

-- Re-seed schedule activities with provided durations/dates/float
INSERT INTO dipgos.rcc_schedule_activities (activity_code, activity_name, block_group_code, block_number, original_duration_days, baseline_start, baseline_finish, total_float_days, status, planned_start, planned_finish)
VALUES
    ('B12-15', 'Block 12-15 summary', 'B12-15', NULL, 400, '2026-03-26', '2027-04-30', 0, 'in_progress', '2026-03-26', '2027-04-30'),
    ('DC12~15#05', 'RCC Concrete Preparation', 'B12-15', NULL, 15, '2026-03-26', '2026-04-10', 0, 'not_started', '2026-03-26', '2026-04-10'),
    ('DC12~15#10', 'Block #15 EL.898~901m', 'B12-15', 15, 5, '2026-04-10', '2026-04-15', 0, 'not_started', '2026-04-10', '2026-04-15'),
    ('DC12~15#15', 'Block #14~15 up to EL.928m', 'B12-15', 15, 120, '2026-04-15', '2026-08-13', 0, 'not_started', '2026-04-15', '2026-08-13'),
    ('DC12~15#20', 'Block #13~15 up to EL.945m', 'B12-15', 15, 85, '2026-08-13', '2026-11-06', 0, 'not_started', '2026-08-13', '2026-11-06'),
    ('DC12~15#30', 'Block #12~15 up to EL.990m', 'B12-15', NULL, 175, '2026-11-06', '2027-04-30', 0, 'not_started', '2026-11-06', '2027-04-30'),
    ('B16-18', 'Block 16-18 summary', 'B16-18', NULL, 401, '2026-03-06', '2027-04-11', 19, 'not_started', '2026-03-06', '2027-04-11'),
    ('DC16~18#05', 'RCC Concrete Preparation', 'B16-18', NULL, 21, '2026-03-06', '2026-03-27', 19, 'not_started', '2026-03-06', '2026-03-27'),
    ('DC16~18#10', 'Block #16~18 EL.898~901m', 'B16-18', 16, 5, '2026-03-27', '2026-04-01', 19, 'not_started', '2026-03-27', '2026-04-01'),
    ('DC16~18#12', 'Block #16~18 EL.901~907m', 'B16-18', 16, 30, '2026-04-01', '2026-05-01', 19, 'not_started', '2026-04-01', '2026-05-01'),
    ('DC16~18#15', 'Block #16~18 EL.907~928m', 'B16-18', 16, 100, '2026-05-01', '2026-08-09', 19, 'not_started', '2026-05-01', '2026-08-09'),
    ('DC16~18#20', 'Block #16~18 EL.928~949m', 'B16-18', 16, 100, '2026-08-09', '2026-11-17', 19, 'not_started', '2026-08-09', '2026-11-17'),
    ('DC16~18#30', 'Block #16~18 EL.949~984m', 'B16-18', 16, 130, '2026-11-17', '2027-03-27', 19, 'not_started', '2026-11-17', '2027-03-27'),
    ('DC16~18#40', 'Block #16~18 EL.984~990m', 'B16-18', 16, 15, '2027-03-27', '2027-04-11', 19, 'not_started', '2027-03-27', '2027-04-11'),
    ('B19-21', 'Block 19-21 summary', 'B19-21', NULL, 430, '2026-01-29', '2027-04-04', 26, 'not_started', '2026-01-29', '2027-04-04'),
    ('DC19~21#05', 'RCC Concrete Preparation', 'B19-21', NULL, 20, '2026-01-29', '2026-02-18', 26, 'not_started', '2026-01-29', '2026-02-18'),
    ('DC19~21#10', 'Block #19~21 EL.898~901m', 'B19-21', 20, 5, '2026-02-18', '2026-02-23', 26, 'not_started', '2026-02-18', '2026-02-23'),
    ('DC19~21#12', 'Block #19~21 EL.901~907m', 'B19-21', 20, 30, '2026-02-23', '2026-03-25', 26, 'not_started', '2026-02-23', '2026-03-25'),
    ('DC19~21#15', 'Block #19~21 EL.907~931m', 'B19-21', 20, 110, '2026-03-25', '2026-07-13', 26, 'not_started', '2026-03-25', '2026-07-13'),
    ('DC19~21#20', 'Block #19~21 EL.931~952m', 'B19-21', 20, 100, '2026-07-13', '2026-10-21', 26, 'not_started', '2026-07-13', '2026-10-21'),
    ('DC19~21#30', 'Block #19~21 EL.952~984m', 'B19-21', 20, 140, '2026-10-21', '2027-03-10', 26, 'not_started', '2026-10-21', '2027-03-10'),
    ('DC19~21#40', 'Block #19~21 EL.984~990m', 'B19-21', 20, 25, '2027-03-10', '2027-04-04', 26, 'not_started', '2027-03-10', '2027-04-04'),
    ('B22-24', 'Block 22-24 summary', 'B22-24', NULL, 414, '2026-01-05', '2027-02-23', 66, 'not_started', '2026-01-05', '2027-02-23'),
    ('DC22~24#05', 'RCC Concrete Preparation', 'B22-24', 22, 20, '2026-01-05', '2026-01-25', 79, 'not_started', '2026-01-05', '2026-01-25'),
    ('DC22~24#10', 'Block #22~23 EL.920~923m', 'B22-24', 22, 2, '2026-01-26', '2026-01-28', 78, 'not_started', '2026-01-26', '2026-01-28'),
    ('DC22~24#20', 'Block #22~24 EL.923~938m', 'B22-24', 22, 90, '2026-01-28', '2026-04-28', 78, 'not_started', '2026-01-28', '2026-04-28'),
    ('DC22~24#30', 'Block #22~24 EL.938~953m', 'B22-24', 22, 90, '2026-05-29', '2026-08-27', 47, 'not_started', '2026-05-29', '2026-08-27'),
    ('DC22~24#40', 'Block #22~24 EL.953~965m', 'B22-24', 22, 60, '2026-08-27', '2026-10-26', 66, 'not_started', '2026-08-27', '2026-10-26'),
    ('DC22~24#50', 'Block #22~24 EL.965~990m', 'B22-24', 22, 120, '2026-10-26', '2027-02-23', 66, 'not_started', '2026-10-26', '2027-02-23'),
    ('B25-27', 'Block 25-27 summary', 'B25-27', NULL, 49, '2026-01-05', '2027-02-23', 0, 'not_started', '2026-01-05', '2027-02-23'),
    ('DC25~27#05', 'RCC Concrete Preparation', 'B25-27', 25, 8, '2027-03-13', '2027-03-20', 0, 'not_started', '2027-03-13', '2027-03-20'),
    ('DC25~27#10', 'Block #25~27 EL.950~953m', 'B25-27', 25, 7, '2027-03-21', '2027-03-27', 0, 'not_started', '2027-03-21', '2027-03-27'),
    ('DC25~27#20', 'Block #25~27 EL.953~959m', 'B25-27', 25, 20, '2027-03-28', '2027-04-16', 0, 'not_started', '2027-03-28', '2027-04-16'),
    ('DC25~27#30', 'Waiting for strength for diversion water', 'B25-27', NULL, 14, '2027-04-17', '2027-04-30', 0, 'not_started', '2027-04-17', '2027-04-30'),
    ('B28-29', 'Block 28-29 summary', 'B28-29', NULL, 59, '2027-02-26', '2027-04-25', 0, 'not_started', '2027-02-26', '2027-04-25'),
    ('DC28~29#05', 'RCC Concrete Preparation', 'B28-29', 28, 8, '2027-02-26', '2027-03-05', 0, 'not_started', '2027-02-26', '2027-03-05'),
    ('DC28~29#10', 'Block #28~29 EL.950~953m', 'B28-29', 28, 7, '2027-03-06', '2027-03-12', 0, 'not_started', '2027-03-06', '2027-03-12'),
    ('DC28~29#20', 'Block #28~29 EL.953~962m', 'B28-29', 28, 25, '2027-03-13', '2027-04-06', 0, 'not_started', '2027-03-13', '2027-04-06'),
    ('DC28~29#30', 'Block #28~29 EL.962~968m', 'B28-29', 28, 19, '2027-04-07', '2027-04-25', 0, 'not_started', '2027-04-07', '2027-04-25'),
    ('LBG1005', 'Access Tunnel Construction 750m (as per portal invert at EL.980m)', 'LBG', NULL, 380, '2025-07-05', '2026-07-20', 120, 'not_started', '2025-07-05', '2026-07-20'),
    ('LBG1010', 'Underground excavation and supporting Cum.100m(from pit)', 'LBG', NULL, 55, '2025-10-03', '2025-11-27', 59, 'not_started', '2025-10-03', '2025-11-27'),
    ('LBG1020', 'Underground excavation and supporting Cum.150m', 'LBG', NULL, 30, '2026-07-20', '2026-08-19', 120, 'not_started', '2026-07-20', '2026-08-19'),
    ('LBG1030', 'Underground excavation and supporting Cum.202m', 'LBG', NULL, 35, '2026-08-19', '2026-09-23', 120, 'not_started', '2026-08-19', '2026-09-23'),
    ('RBG1010', 'Underground excavation and supporting Cum.159m (from pit)', 'RBG', NULL, 102, '2025-07-16', '2025-10-26', 51, 'not_started', '2025-07-16', '2025-10-26'),
    ('RBG1020', 'Underground excavation and supporting Cum.200m', 'RBG', NULL, 25, '2026-06-15', '2026-07-10', 144, 'not_started', '2026-06-15', '2026-07-10'),
    ('RBG1030', 'Underground excavation and supporting Cum.300m', 'RBG', NULL, 60, '2026-07-10', '2026-09-08', 144, 'not_started', '2026-07-10', '2026-09-08'),
    ('RBG1040', 'Underground excavation and supporting Cum.400m', 'RBG', NULL, 60, '2026-09-08', '2026-11-07', 144, 'not_started', '2026-09-08', '2026-11-07')
ON CONFLICT (activity_code) DO UPDATE
SET block_group_code = EXCLUDED.block_group_code,
    block_number = EXCLUDED.block_number,
    original_duration_days = EXCLUDED.original_duration_days,
    baseline_start = EXCLUDED.baseline_start,
    baseline_finish = EXCLUDED.baseline_finish,
    total_float_days = EXCLUDED.total_float_days,
    planned_start = EXCLUDED.planned_start,
    planned_finish = EXCLUDED.planned_finish;

COMMIT;
