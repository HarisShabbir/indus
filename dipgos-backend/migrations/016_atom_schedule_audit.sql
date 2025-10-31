-- 016_atom_schedule_audit.sql
-- Audit trail for schedule adjustments made via the Atom Scheduling workspace
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_schedule_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES dipgos.atom_schedule_entries(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL DEFAULT 'atom-manager',
  change_type TEXT NOT NULL DEFAULT 'update',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_atom_schedule_audit_schedule
  ON dipgos.atom_schedule_audit (schedule_id, changed_at DESC);

