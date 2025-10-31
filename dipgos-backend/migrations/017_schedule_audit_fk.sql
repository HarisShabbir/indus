-- 017_schedule_audit_fk.sql
-- Allow schedule audit records to persist after source allocation deletion
SET search_path TO dipgos, public;

ALTER TABLE dipgos.atom_schedule_audit
  DROP CONSTRAINT IF EXISTS atom_schedule_audit_schedule_id_fkey;
