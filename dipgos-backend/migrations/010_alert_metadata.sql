-- 010_alert_metadata.sql
SET search_path TO dipgos, public;

ALTER TABLE dipgos.alerts
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- optional: ensure we always have scope keys.
CREATE INDEX IF NOT EXISTS idx_alerts_metadata_scope ON dipgos.alerts USING GIN ((metadata -> 'scope'));
CREATE INDEX IF NOT EXISTS idx_alerts_metadata_category ON dipgos.alerts USING GIN ((metadata -> 'category'));
