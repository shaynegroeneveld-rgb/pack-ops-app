-- ============================================================
-- FINANCE RECONCILIATION + MONTHLY CLOSE
-- Workflow state for account reconciliation and month locking.
-- ============================================================

CREATE TABLE finance_reconciliation_sessions (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  account_id         uuid          NOT NULL,
  start_date         date          NOT NULL,
  end_date           date          NOT NULL,
  opening_balance    numeric(12,2),
  closing_balance    numeric(12,2),
  imported_total     numeric(12,2) NOT NULL DEFAULT 0,
  matched_total      numeric(12,2) NOT NULL DEFAULT 0,
  unreconciled_total numeric(12,2) NOT NULL DEFAULT 0,
  status             text          NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed')),
  completed_at       timestamptz,
  completed_by       uuid          REFERENCES users(id),
  created_by         uuid          REFERENCES users(id),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, account_id, start_date, end_date),
  CONSTRAINT fk_finance_reconciliation_account
    FOREIGN KEY (org_id, account_id) REFERENCES finance_accounts(org_id, id),
  CONSTRAINT chk_finance_reconciliation_date_order CHECK (end_date >= start_date)
);

CREATE INDEX idx_finance_reconciliation_sessions_org_account
  ON finance_reconciliation_sessions(org_id, account_id, start_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_monthly_closes (
  id                                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                              uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  month                               date        NOT NULL,
  status                              text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'closed')),
  unreconciled_imports_count          integer     NOT NULL DEFAULT 0,
  missing_receipts_count              integer     NOT NULL DEFAULT 0,
  uncategorized_transactions_count    integer     NOT NULL DEFAULT 0,
  draft_transactions_count            integer     NOT NULL DEFAULT 0,
  outstanding_invoices_count          integer     NOT NULL DEFAULT 0,
  outstanding_bills_count             integer     NOT NULL DEFAULT 0,
  possible_duplicates_count           integer     NOT NULL DEFAULT 0,
  snoozed_review_items_count          integer     NOT NULL DEFAULT 0,
  closed_at                           timestamptz,
  closed_by                           uuid        REFERENCES users(id),
  created_by                          uuid        REFERENCES users(id),
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),
  deleted_at                          timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, month),
  CONSTRAINT chk_finance_monthly_closes_month_start CHECK (date_trunc('month', month)::date = month)
);

CREATE INDEX idx_finance_monthly_closes_org_month
  ON finance_monthly_closes(org_id, month DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_updated_at_finance_reconciliation_sessions
  BEFORE UPDATE ON finance_reconciliation_sessions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_monthly_closes
  BEFORE UPDATE ON finance_monthly_closes FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE finance_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_monthly_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_reconciliation_sessions_select ON finance_reconciliation_sessions FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_reconciliation_sessions_insert ON finance_reconciliation_sessions FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_reconciliation_sessions_update ON finance_reconciliation_sessions FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY finance_monthly_closes_select ON finance_monthly_closes FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_monthly_closes_insert ON finance_monthly_closes FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_monthly_closes_update ON finance_monthly_closes FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
