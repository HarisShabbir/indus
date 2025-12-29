CREATE TABLE IF NOT EXISTS dipgos.process_input_samples (
    id UUID PRIMARY KEY,
    sow_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    input_id TEXT NOT NULL,
    source_name TEXT,
    status TEXT NOT NULL,
    status_message TEXT,
    value_numeric DOUBLE PRECISION,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_input_samples_input ON dipgos.process_input_samples (input_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_input_samples_sow ON dipgos.process_input_samples (sow_id, created_at DESC);
