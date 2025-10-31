-- 011_alarm_enrichment.sql
-- Enrich alarm records with workflow metadata and scheduling cues.
SET search_path TO dipgos, public;

ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE dipgos.alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_alerts_status ON dipgos.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON dipgos.alerts(category);
