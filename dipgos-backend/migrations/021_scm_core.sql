-- 021_scm_core.sql
-- Core Supply Chain Management tables scoped to process → SOW → contract → project hierarchy
SET search_path TO dipgos, public;

CREATE TABLE IF NOT EXISTS dipgos.scm_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  category TEXT,
  industry_tags TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scm_items_tenant_code
  ON dipgos.scm_items (tenant_id, code);

CREATE TABLE IF NOT EXISTS dipgos.scm_demand_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  schedule_id UUID NULL,
  item_id UUID NOT NULL REFERENCES dipgos.scm_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned',
  priority INTEGER,
  quantity_required NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_committed NUMERIC(18,4) NOT NULL DEFAULT 0,
  needed_date DATE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_demand_process_status
  ON dipgos.scm_demand_items (process_id, status);

CREATE TABLE IF NOT EXISTS dipgos.scm_requisitions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  demand_item_id UUID REFERENCES dipgos.scm_demand_items(id) ON DELETE SET NULL,
  requisition_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  requested_qty NUMERIC(18,4),
  approved_qty NUMERIC(18,4),
  needed_date DATE,
  requester TEXT,
  approver TEXT,
  justification TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_requisitions_process_status
  ON dipgos.scm_requisitions (process_id, status);

CREATE TABLE IF NOT EXISTS dipgos.scm_purchase_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  requisition_id UUID REFERENCES dipgos.scm_requisitions(id) ON DELETE SET NULL,
  po_number TEXT,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ordered_qty NUMERIC(18,4),
  committed_value NUMERIC(18,2),
  currency TEXT DEFAULT 'USD',
  expected_date DATE,
  actual_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_purchase_orders_process_status
  ON dipgos.scm_purchase_orders (process_id, status);

CREATE TABLE IF NOT EXISTS dipgos.scm_shipments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES dipgos.scm_purchase_orders(id) ON DELETE SET NULL,
  tracking_code TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  origin TEXT,
  destination TEXT,
  etd DATE,
  eta DATE,
  actual_arrival DATE,
  carrier TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_shipments_process_status
  ON dipgos.scm_shipments (process_id, status);

CREATE TABLE IF NOT EXISTS dipgos.scm_inventory_snapshots (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE,
  contract_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  sow_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  process_id UUID REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES dipgos.scm_items(id) ON DELETE CASCADE,
  location_label TEXT,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_on_hand NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_reserved NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_available NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_inventory_process_date
  ON dipgos.scm_inventory_snapshots (process_id, snapshot_date);

CREATE TABLE IF NOT EXISTS dipgos.scm_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  project_id UUID,
  contract_id UUID,
  sow_id UUID,
  process_id UUID,
  source TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scm_events_scope_time
  ON dipgos.scm_events (process_id, occurred_at DESC);
