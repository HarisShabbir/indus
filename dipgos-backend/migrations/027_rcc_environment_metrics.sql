CREATE TABLE IF NOT EXISTS dipgos.rcc_environment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sow_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    label TEXT NOT NULL,
    unit TEXT,
    value_numeric NUMERIC,
    value_text TEXT,
    status TEXT NOT NULL DEFAULT 'ok',
    thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rcc_environment_metrics_sow_id_idx ON dipgos.rcc_environment_metrics (sow_id);

INSERT INTO dipgos.rcc_environment_metrics (sow_id, metric, label, unit, value_numeric, status, thresholds, metadata)
VALUES
    ('sow-mw01-rcc', 'daily_pour_volume', 'Daily pour volume', 'm3', 2.8, 'warning', '{"max": 3, "warn_max": 2.5}'::jsonb, '{"group": "Production", "rule": "Max 3 m3 / block / day"}'::jsonb),
    ('sow-mw01-rcc', 'cumulative_volume', 'Cumulative volume placed', 'm3', 15240, 'ok', '{}'::jsonb, '{"group": "Production"}'::jsonb),
    ('sow-mw01-rcc', 'core_temperature', 'Core concrete temperature', '°C', 24.1, 'ok', '{"max": 50, "warn_max": 40}'::jsonb, '{"group": "Environmental"}'::jsonb),
    ('sow-mw01-rcc', 'air_temperature', 'Ambient air temperature', '°C', 16.5, 'ok', '{"max": 38, "warn_max": 32}'::jsonb, '{"group": "Environmental"}'::jsonb),
    ('sow-mw01-rcc', 'moisture', 'Aggregate moisture', '%', 5.6, 'warning', '{"min": 3, "max": 5}'::jsonb, '{"group": "Environmental"}'::jsonb),
    ('sow-mw01-rcc', 'humidity', 'Relative humidity', '%', 48, 'ok', '{"min": 30, "max": 70}'::jsonb, '{"group": "Environmental"}'::jsonb),
    ('sow-mw01-rcc', 'ph_value', 'Water pH value', NULL, 7.2, 'ok', '{"min": 6, "max": 8}'::jsonb, '{"group": "Quality"}'::jsonb),
    ('sow-mw01-rcc', 'turbidity', 'Water turbidity', 'NTU', 3.1, 'ok', '{"max": 5}'::jsonb, '{"group": "Quality"}'::jsonb),
    ('sow-mw01-rcc', 'cement_inventory', 'Cement inventory on site', 'tons', 460, 'warning', '{"min": 500, "warn_min": 450}'::jsonb, '{"group": "Logistics", "storage": "Warehouse A"}'::jsonb),
    ('sow-mw01-rcc', 'cement_supplier', 'Cement supplier', NULL, NULL, 'ok', '{}'::jsonb, '{"group": "Logistics", "value": "PakCem JV"}'::jsonb),
    ('sow-mw01-rcc', 'delivery_schedule', 'Next delivery window', NULL, NULL, 'warning', '{}'::jsonb, '{"group": "Logistics", "value": "Batch delayed · ETA 18:00"}'::jsonb),
    ('sow-mw01-rcc', 'lab_reports', 'Lab test reports', NULL, NULL, 'ok', '{}'::jsonb, '{"group": "Quality", "value": "Compression tests cleared"}'::jsonb),
    ('sow-mw01-rcc', 'technical_specs', 'Technical qualification status', NULL, NULL, 'ok', '{}'::jsonb, '{"group": "Quality", "value": "Mix design M80 validated"}'::jsonb),
    ('sow-mw01-rcc', 'cost_variance', 'Cost variance (cum.)', 'PKR M', 12.4, 'warning', '{"max": 10}'::jsonb, '{"group": "Financial"}'::jsonb),
    ('sow-mw01-rcc', 'block_pour_rate', 'Blocks poured today', NULL, 4, 'ok', '{}'::jsonb, '{"group": "Production"}'::jsonb);
