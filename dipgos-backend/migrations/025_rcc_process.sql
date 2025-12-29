-- RCC process schema for process/rule engine
CREATE TABLE IF NOT EXISTS dipgos.alarm_rules (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    severity TEXT NOT NULL,
    action TEXT,
    message TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_evaluated_at TIMESTAMPTZ,
    last_status TEXT,
    last_payload JSONB,
    last_fired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dipgos.process_stages (
    id TEXT PRIMARY KEY,
    sow_id TEXT NOT NULL REFERENCES dipgos.contract_sows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_process_stages_sow_id ON dipgos.process_stages(sow_id);

CREATE TABLE IF NOT EXISTS dipgos.process_operations (
    id TEXT PRIMARY KEY,
    stage_id TEXT NOT NULL REFERENCES dipgos.process_stages(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES dipgos.process_operations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('operation','sub-operation','alarm')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    rule_id TEXT REFERENCES dipgos.alarm_rules(id) ON DELETE SET NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_operations_stage_id ON dipgos.process_operations(stage_id);
CREATE INDEX IF NOT EXISTS idx_process_operations_rule_id ON dipgos.process_operations(rule_id);

CREATE TABLE IF NOT EXISTS dipgos.process_inputs (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES dipgos.process_operations(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    unit TEXT,
    source_type TEXT,
    source_name TEXT UNIQUE,
    thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
    current_value NUMERIC(12, 4),
    last_observed TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_process_inputs_operation_id ON dipgos.process_inputs(operation_id);
