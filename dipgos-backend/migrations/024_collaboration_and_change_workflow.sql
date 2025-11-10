CREATE TABLE IF NOT EXISTS dipgos.collaboration_members (
  id UUID PRIMARY KEY,
  thread_id TEXT NOT NULL,
  persona TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  history_access TEXT NOT NULL DEFAULT 'full',
  created_by TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaboration_members_thread ON dipgos.collaboration_members(thread_id);

ALTER TABLE dipgos.change_requests ADD COLUMN IF NOT EXISTS approver TEXT;
ALTER TABLE dipgos.change_requests ADD COLUMN IF NOT EXISTS approval_group TEXT;
ALTER TABLE dipgos.change_requests ADD COLUMN IF NOT EXISTS decision_notes TEXT;
ALTER TABLE dipgos.change_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE dipgos.change_requests ADD COLUMN IF NOT EXISTS alert_id TEXT;

CREATE TABLE IF NOT EXISTS dipgos.change_request_actions (
  id BIGSERIAL PRIMARY KEY,
  change_request_id UUID NOT NULL REFERENCES dipgos.change_requests(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  actor_group TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_request_actions_cr ON dipgos.change_request_actions(change_request_id);
