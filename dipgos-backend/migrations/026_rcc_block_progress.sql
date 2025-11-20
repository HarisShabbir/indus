CREATE TABLE IF NOT EXISTS dipgos.rcc_block_progress (
    id TEXT PRIMARY KEY,
    sow_id TEXT NOT NULL REFERENCES dipgos.contract_sows(id) ON DELETE CASCADE,
    block_no INTEGER NOT NULL,
    lift_no INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
    temperature NUMERIC(5,2),
    density NUMERIC(6,2),
    batch_id TEXT,
    vendor TEXT,
    ipc_value NUMERIC(12,2),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcc_block_progress_sow ON dipgos.rcc_block_progress(sow_id);
CREATE INDEX IF NOT EXISTS idx_rcc_block_progress_block_lift ON dipgos.rcc_block_progress(sow_id, block_no, lift_no);
