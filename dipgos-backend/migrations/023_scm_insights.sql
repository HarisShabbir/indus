-- 023_scm_insights.sql
-- Extend SCM data model with insights, canvas layouts, and alert rules

CREATE TABLE IF NOT EXISTS dipgos.scm_insights (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  project_id UUID,
  contract_id UUID,
  sow_id UUID,
  process_id UUID,
  scope_level TEXT NOT NULL,
  metric TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_insights_scope
  ON dipgos.scm_insights (scope_level, project_id, contract_id, sow_id, process_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dipgos.scm_canvas_layouts (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  project_id UUID,
  contract_id UUID,
  sow_id UUID,
  process_id UUID,
  layout JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_canvas_layouts_scope
  ON dipgos.scm_canvas_layouts (contract_id, process_id);

CREATE TABLE IF NOT EXISTS dipgos.scm_alert_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'warning',
  action JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_alert_rules_enabled
  ON dipgos.scm_alert_rules (enabled, severity);

-- Seed sample alert rules for procurement process readiness
INSERT INTO dipgos.scm_alert_rules (id, tenant_id, name, description, scope, condition, severity, action)
VALUES
  (
    'aaaaaaaa-2222-3333-4444-555555555551',
    '11111111-1111-1111-1111-111111111111',
    'Material readiness critical',
    'Trigger alert when commitment coverage drops below 60% within two weeks of need date.',
    jsonb_build_object('scope', 'process'),
    jsonb_build_object('metric', 'coveragePct', 'operator', '<', 'threshold', 60, 'lookaheadDays', 14),
    'critical',
    jsonb_build_object(
      'notify',
      jsonb_build_array('procurement_lead', 'project_controls'),
      'recommendations',
      jsonb_build_array('Escalate with supplier', 'Review alternate sourcing')
    )
  ),
  (
    'bbbbbbbb-2222-3333-4444-555555555552',
    '11111111-1111-1111-1111-111111111111',
    'Shipment at risk',
    'Raise warning when shipment eta slips beyond planned arrival.',
    jsonb_build_object('scope', 'shipment'),
    jsonb_build_object('metric', 'etaDelayDays', 'operator', '>', 'threshold', 0),
    'warning',
    jsonb_build_object(
      'notify',
      jsonb_build_array('logistics_coordinator'),
      'recommendations',
      jsonb_build_array('Update delivery plan', 'Coordinate with transportation vendor')
    )
  )
ON CONFLICT (id) DO NOTHING;

