-- 004_financial_view.sql
-- Financial view hierarchy, metrics and rollups
SET search_path TO dipgos, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_level') THEN
    CREATE TYPE entity_level AS ENUM ('project', 'contract', 'sow', 'process');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS dipgos.entities (
  entity_id UUID PRIMARY KEY,
  level entity_level NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID NULL,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'entities_parent_fk'
      AND conrelid = 'dipgos.entities'::regclass
  ) THEN
    ALTER TABLE dipgos.entities
      ADD CONSTRAINT entities_parent_fk
      FOREIGN KEY (parent_id) REFERENCES dipgos.entities(entity_id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_entities_parent ON dipgos.entities(parent_id);
CREATE INDEX IF NOT EXISTS idx_entities_level ON dipgos.entities(level);
CREATE INDEX IF NOT EXISTS idx_entities_tenant ON dipgos.entities(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_level_code ON dipgos.entities(level, code);

CREATE TABLE IF NOT EXISTS dipgos.evm_metrics (
  entity_id UUID NOT NULL,
  period_date DATE NOT NULL,
  ev NUMERIC(18, 2),
  pv NUMERIC(18, 2),
  ac NUMERIC(18, 2),
  spi NUMERIC(10, 4),
  cpi NUMERIC(10, 4),
  percent_complete NUMERIC(10, 4),
  PRIMARY KEY (entity_id, period_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evm_metrics_entity_fk'
      AND conrelid = 'dipgos.evm_metrics'::regclass
  ) THEN
    ALTER TABLE dipgos.evm_metrics
      ADD CONSTRAINT evm_metrics_entity_fk
      FOREIGN KEY (entity_id) REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_evm_metrics_period ON dipgos.evm_metrics(entity_id, period_date DESC);

CREATE TABLE IF NOT EXISTS dipgos.allocations (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'allocations_entity_fk'
      AND conrelid = 'dipgos.allocations'::regclass
  ) THEN
    ALTER TABLE dipgos.allocations
      ADD CONSTRAINT allocations_entity_fk
      FOREIGN KEY (entity_id) REFERENCES dipgos.entities(entity_id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_allocations_entity ON dipgos.allocations(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_allocations_tenant ON dipgos.allocations(tenant_id);

CREATE TABLE IF NOT EXISTS dipgos.fund_inflows (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  account TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  txn_date DATE NOT NULL,
  source TEXT,
  tenant_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_inflows_project ON dipgos.fund_inflows(project_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fund_inflows_tenant ON dipgos.fund_inflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fund_inflows_lookup ON dipgos.fund_inflows(tenant_id, project_id, txn_date);

CREATE TABLE IF NOT EXISTS dipgos.fund_expected (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  account TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  expected_date DATE NOT NULL,
  tenant_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_expected_project ON dipgos.fund_expected(project_id, expected_date DESC);
CREATE INDEX IF NOT EXISTS idx_fund_expected_tenant ON dipgos.fund_expected(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fund_expected_lookup ON dipgos.fund_expected(tenant_id, project_id, expected_date);

CREATE TABLE IF NOT EXISTS dipgos.fund_outflows (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  contract_id UUID,
  sow_id UUID,
  process_id UUID,
  category TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  txn_date DATE NOT NULL,
  tenant_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_outflows_project ON dipgos.fund_outflows(project_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fund_outflows_contract ON dipgos.fund_outflows(contract_id);
CREATE INDEX IF NOT EXISTS idx_fund_outflows_tenant ON dipgos.fund_outflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fund_outflows_lookup ON dipgos.fund_outflows(tenant_id, project_id, contract_id, txn_date);

CREATE TABLE IF NOT EXISTS dipgos.expense_expected (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  contract_id UUID,
  sow_id UUID,
  process_id UUID,
  category TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  expected_date DATE NOT NULL,
  tenant_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_expected_project ON dipgos.expense_expected(project_id, expected_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_expected_contract ON dipgos.expense_expected(contract_id);
CREATE INDEX IF NOT EXISTS idx_expense_expected_tenant ON dipgos.expense_expected(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_expected_lookup ON dipgos.expense_expected(tenant_id, project_id, contract_id, expected_date);

CREATE OR REPLACE VIEW dipgos.vw_evm_rollup AS
WITH RECURSIVE entity_tree AS (
  SELECT
    entity_id,
    parent_id,
    level,
    entity_id AS ancestor_id
  FROM dipgos.entities
  UNION ALL
  SELECT
    child.entity_id,
    child.parent_id,
    child.level,
    tree.ancestor_id
  FROM entity_tree tree
  JOIN dipgos.entities child ON child.parent_id = tree.entity_id
),
latest_metrics AS (
  SELECT
    entity_id,
    ev,
    pv,
    ac,
    COALESCE(spi, CASE WHEN pv IS NULL OR pv = 0 THEN NULL ELSE ev / NULLIF(pv, 0) END) AS spi,
    COALESCE(cpi, CASE WHEN ac IS NULL OR ac = 0 THEN NULL ELSE ev / NULLIF(ac, 0) END) AS cpi,
    percent_complete,
    period_date,
    ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY period_date DESC) AS rn
  FROM dipgos.evm_metrics
),
latest_per_entity AS (
  SELECT
    entity_id,
    ev,
    pv,
    ac,
    spi,
    cpi,
    percent_complete,
    period_date
  FROM latest_metrics
  WHERE rn = 1
),
closure AS (
  SELECT
    ancestor.entity_id AS ancestor_id,
    descendant.entity_id AS descendant_id
  FROM dipgos.entities ancestor
  JOIN dipgos.entities descendant ON ancestor.entity_id = descendant.entity_id
  UNION ALL
  SELECT
    closure.ancestor_id,
    child.entity_id AS descendant_id
  FROM closure
  JOIN dipgos.entities child ON child.parent_id = closure.descendant_id
)
SELECT
  e.level,
  e.entity_id,
  e.parent_id,
  SUM(COALESCE(m.ev, 0)) AS ev,
  SUM(COALESCE(m.pv, 0)) AS pv,
  SUM(COALESCE(m.ac, 0)) AS ac,
  CASE WHEN SUM(COALESCE(m.pv, 0)) = 0 THEN NULL ELSE SUM(COALESCE(m.ev, 0)) / NULLIF(SUM(COALESCE(m.pv, 0)), 0) END AS spi,
  CASE WHEN SUM(COALESCE(m.ac, 0)) = 0 THEN NULL ELSE SUM(COALESCE(m.ev, 0)) / NULLIF(SUM(COALESCE(m.ac, 0)), 0) END AS cpi,
  AVG(m.percent_complete) AS percent_complete,
  MAX(m.period_date)::timestamptz AS as_of
FROM dipgos.entities e
LEFT JOIN closure cl ON cl.ancestor_id = e.entity_id
LEFT JOIN latest_per_entity m ON m.entity_id = cl.descendant_id
GROUP BY e.level, e.entity_id, e.parent_id;

CREATE OR REPLACE VIEW dipgos.vw_financial_allocation AS
WITH latest_allocation AS (
  SELECT
    entity_id,
    amount,
    status,
    ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC, id DESC) AS rn
  FROM dipgos.allocations
),
project_map AS (
  WITH RECURSIVE tree AS (
    SELECT
      entity_id,
      parent_id,
      entity_id AS project_entity
    FROM dipgos.entities
    WHERE level = 'project'
    UNION ALL
    SELECT
      child.entity_id,
      child.parent_id,
      tree.project_entity
    FROM tree
    JOIN dipgos.entities child ON child.parent_id = tree.entity_id
  )
  SELECT entity_id, project_entity FROM tree
)
SELECT
  pm.project_entity AS project_id,
  e.level,
  e.entity_id,
  e.code,
  e.name AS description,
  COALESCE(la.amount, 0) AS amount,
  COALESCE(la.status, 'unallocated') AS status
FROM dipgos.entities e
JOIN project_map pm ON pm.entity_id = e.entity_id
LEFT JOIN latest_allocation la ON la.entity_id = e.entity_id AND la.rn = 1
WHERE e.level IN ('project', 'contract');

CREATE OR REPLACE VIEW dipgos.vw_expenses_rollup AS
WITH RECURSIVE closure AS (
  SELECT
    ancestor.entity_id AS ancestor_id,
    descendant.entity_id AS descendant_id
  FROM dipgos.entities ancestor
  JOIN dipgos.entities descendant ON ancestor.entity_id = descendant.entity_id
  UNION ALL
  SELECT
    closure.ancestor_id,
    child.entity_id AS descendant_id
  FROM closure
  JOIN dipgos.entities child ON child.parent_id = closure.descendant_id
),
latest_allocation AS (
  SELECT
    entity_id,
    amount,
    status,
    ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC, id DESC) AS rn
  FROM dipgos.allocations
),
base_actuals AS (
  SELECT
    COALESCE(process_id, sow_id, contract_id) AS entity_id,
    SUM(amount) AS actual
  FROM dipgos.fund_outflows
  GROUP BY COALESCE(process_id, sow_id, contract_id)
),
actuals AS (
  SELECT
    cl.ancestor_id AS entity_id,
    SUM(COALESCE(b.actual, 0)) AS actual
  FROM closure cl
  LEFT JOIN base_actuals b ON b.entity_id = cl.descendant_id
  GROUP BY cl.ancestor_id
)
SELECT
  pm.project_entity AS project_id,
  e.level,
  e.entity_id,
  e.parent_id,
  e.code,
  e.name AS description,
  COALESCE(contract_entity.code, e.code) AS contract_code,
  COALESCE(a.actual, 0) AS actual,
  COALESCE(a.actual, 0) AS paid,
  COALESCE(la.amount, 0) - COALESCE(a.actual, 0) AS balance,
  CASE
    WHEN la.amount IS NULL THEN 'unallocated'
    WHEN COALESCE(a.actual, 0) = 0 THEN 'pending'
    WHEN COALESCE(a.actual, 0) > la.amount THEN 'over-budget'
    ELSE 'running'
  END AS status
FROM dipgos.entities e
JOIN (
  WITH RECURSIVE tree AS (
    SELECT
      entity_id,
      parent_id,
      entity_id AS project_entity
    FROM dipgos.entities
    WHERE level = 'project'
    UNION ALL
    SELECT
      child.entity_id,
      child.parent_id,
      tree.project_entity
    FROM tree
    JOIN dipgos.entities child ON child.parent_id = tree.entity_id
  )
  SELECT entity_id, project_entity FROM tree
) pm ON pm.entity_id = e.entity_id
LEFT JOIN actuals a ON a.entity_id = e.entity_id
LEFT JOIN latest_allocation la ON la.entity_id = e.entity_id AND la.rn = 1
LEFT JOIN dipgos.entities contract_entity ON (
  CASE
    WHEN e.level = 'contract' THEN e.entity_id
    WHEN e.level = 'sow' THEN e.parent_id
    ELSE NULL
  END
) = contract_entity.entity_id
WHERE e.level IN ('contract', 'sow');

CREATE OR REPLACE VIEW dipgos.vw_fund_flow AS
WITH project_nodes AS (
  SELECT
    e.entity_id AS project_id,
    e.entity_id::text AS node_id,
    e.name AS node_label,
    'project'::text AS node_type,
    NULL::text AS parent_node_id,
    NULL::numeric AS amount
  FROM dipgos.entities e
  WHERE e.level = 'project'
),
contract_nodes AS (
  SELECT
    e2.parent_id AS project_id,
    e2.entity_id::text AS node_id,
    e2.name AS node_label,
    'contract'::text AS node_type,
    e2.parent_id::text AS parent_node_id,
    NULL::numeric AS amount
  FROM dipgos.entities e2
  WHERE e2.level = 'contract'
),
inflow_nodes AS (
  SELECT
    fi.project_id,
    'inflow:' || fi.id::text AS node_id,
    fi.account AS node_label,
    'inflow'::text AS node_type,
    fi.project_id::text AS parent_node_id,
    fi.amount AS amount
  FROM dipgos.fund_inflows fi
),
expected_inflow_nodes AS (
  SELECT
    fe.project_id,
    'inflow_expected:' || fe.id::text AS node_id,
    fe.account AS node_label,
    'inflow_expected'::text AS node_type,
    fe.project_id::text AS parent_node_id,
    fe.amount AS amount
  FROM dipgos.fund_expected fe
),
outflow_nodes AS (
  SELECT
    fo.project_id,
    'outflow:' || fo.id::text AS node_id,
    fo.category AS node_label,
    'outflow'::text AS node_type,
    COALESCE(fo.contract_id, fo.project_id)::text AS parent_node_id,
    fo.amount AS amount
  FROM dipgos.fund_outflows fo
),
expected_outflow_nodes AS (
  SELECT
    eo.project_id,
    'outflow_expected:' || eo.id::text AS node_id,
    eo.category AS node_label,
    'outflow_expected'::text AS node_type,
    COALESCE(eo.contract_id, eo.project_id)::text AS parent_node_id,
    eo.amount AS amount
  FROM dipgos.expense_expected eo
)
SELECT * FROM project_nodes
UNION ALL
SELECT * FROM contract_nodes
UNION ALL
SELECT * FROM inflow_nodes
UNION ALL
SELECT * FROM expected_inflow_nodes
UNION ALL
SELECT * FROM outflow_nodes
UNION ALL
SELECT * FROM expected_outflow_nodes;
