-- 009_atom_manifestation.sql
-- Atom manifestation attributes backing Manifestation Layer tab
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.atom_manifestation (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  vendor TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  model TEXT NOT NULL,
  attribute_name TEXT NOT NULL,
  attribute_value TEXT NULL,
  units TEXT NULL,
  validation TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor, machine_type, model, attribute_name)
);

CREATE INDEX IF NOT EXISTS idx_atom_manifestation_vendor_model
  ON dipgos.atom_manifestation (tenant_id, machine_type, vendor, model);

CREATE INDEX IF NOT EXISTS idx_atom_manifestation_attr
  ON dipgos.atom_manifestation (attribute_name);
