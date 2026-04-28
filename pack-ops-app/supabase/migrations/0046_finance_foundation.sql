-- ============================================================
-- FINANCE FOUNDATION
-- Simple bookkeeping capture layer. No reconciliation, reports,
-- payroll, or tax automation in this slice.
-- ============================================================

CREATE TABLE finance_accounts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  type            text          NOT NULL DEFAULT 'bank'
    CHECK (type IN ('bank', 'credit_card', 'cash', 'loan', 'other')),
  institution     text,
  last_four       text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  is_active       boolean       NOT NULL DEFAULT true,
  created_by      uuid          REFERENCES users(id),
  updated_by      uuid          REFERENCES users(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, name)
);

CREATE INDEX idx_finance_accounts_org
  ON finance_accounts(org_id)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_categories (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text          NOT NULL,
  type        text          NOT NULL
    CHECK (type IN ('income', 'expense')),
  description text,
  is_default  boolean       NOT NULL DEFAULT false,
  is_active   boolean       NOT NULL DEFAULT true,
  created_by  uuid          REFERENCES users(id),
  updated_by  uuid          REFERENCES users(id),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, type, name)
);

ALTER TABLE documents
  ADD CONSTRAINT documents_org_id_id_key UNIQUE (org_id, id);

CREATE INDEX idx_finance_categories_org_type
  ON finance_categories(org_id, type)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_transactions (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type               text          NOT NULL CHECK (type IN ('income', 'expense')),
  status             text          NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  transaction_date   date          NOT NULL DEFAULT CURRENT_DATE,
  contact_id         uuid,
  account_id         uuid          NOT NULL,
  category_id        uuid          NOT NULL,
  job_id             uuid,
  document_id        uuid,
  memo               text,
  reference_number   text,
  subtotal           numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax                numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total              numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  created_by         uuid          REFERENCES users(id),
  updated_by         uuid          REFERENCES users(id),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_transactions_contact
    FOREIGN KEY (org_id, contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_finance_transactions_account
    FOREIGN KEY (org_id, account_id) REFERENCES finance_accounts(org_id, id),
  CONSTRAINT fk_finance_transactions_category
    FOREIGN KEY (org_id, category_id) REFERENCES finance_categories(org_id, id),
  CONSTRAINT fk_finance_transactions_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_finance_transactions_document
    FOREIGN KEY (org_id, document_id) REFERENCES documents(org_id, id)
);

CREATE INDEX idx_finance_transactions_org_date
  ON finance_transactions(org_id, transaction_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_finance_transactions_contact
  ON finance_transactions(contact_id)
  WHERE contact_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_finance_transactions_account
  ON finance_transactions(account_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_finance_transactions_category
  ON finance_transactions(category_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_finance_transactions_job
  ON finance_transactions(job_id)
  WHERE job_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_updated_at_finance_accounts
  BEFORE UPDATE ON finance_accounts FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_categories
  BEFORE UPDATE ON finance_categories FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_transactions
  BEFORE UPDATE ON finance_transactions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_accounts_select ON finance_accounts FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_accounts_insert ON finance_accounts FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_accounts_update ON finance_accounts FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY finance_categories_select ON finance_categories FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_categories_insert ON finance_categories FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_categories_update ON finance_categories FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY finance_transactions_select ON finance_transactions FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_transactions_insert ON finance_transactions FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_transactions_update ON finance_transactions FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

DROP POLICY IF EXISTS contacts_select ON contacts;
DROP POLICY IF EXISTS contacts_insert ON contacts;
DROP POLICY IF EXISTS contacts_update ON contacts;

CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY contacts_insert ON contacts FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

INSERT INTO finance_accounts (org_id, name, type, is_active, created_at, updated_at)
SELECT orgs.id, defaults.name, defaults.type, true, now(), now()
FROM orgs
CROSS JOIN (
  VALUES
    ('Operating Bank', 'bank'),
    ('Company Credit Card', 'credit_card'),
    ('Cash', 'cash')
) AS defaults(name, type)
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO finance_categories (org_id, name, type, description, is_default, is_active, created_at, updated_at)
SELECT orgs.id, defaults.name, defaults.type, defaults.description, true, true, now(), now()
FROM orgs
CROSS JOIN (
  VALUES
    ('Sales Income', 'income', 'Income from completed electrical work.'),
    ('Materials', 'expense', 'Materials, parts, and supplies.'),
    ('Subcontractors', 'expense', 'Subcontracted labor and specialty services.'),
    ('Equipment', 'expense', 'Equipment rental, tools, and jobsite equipment.'),
    ('Fuel and Vehicle', 'expense', 'Fuel, parking, repairs, and vehicle costs.'),
    ('Permits and Fees', 'expense', 'Permit, inspection, and filing fees.'),
    ('Office and Admin', 'expense', 'Administrative and office operating costs.'),
    ('Other Expense', 'expense', 'Expenses that do not fit another category.')
) AS defaults(name, type, description)
ON CONFLICT (org_id, type, name) DO NOTHING;
