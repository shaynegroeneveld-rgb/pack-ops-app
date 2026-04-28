-- ============================================================
-- FINANCE A/R + A/P
-- Simple receivables/payables workflow linked to invoices,
-- document intake, and imported transaction payment matching.
-- ============================================================

CREATE TABLE finance_ar_invoices (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id         uuid          NOT NULL,
  customer_contact_id uuid         NOT NULL,
  customer_name      text          NOT NULL,
  job_id             uuid,
  job_label          text,
  issue_date         date,
  due_date           date,
  subtotal           numeric(12,2) NOT NULL DEFAULT 0,
  tax                numeric(12,2) NOT NULL DEFAULT 0,
  total              numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid        numeric(12,2) NOT NULL DEFAULT 0,
  amount_outstanding numeric(12,2) NOT NULL DEFAULT 0,
  status             text          NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue')),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, invoice_id),
  CONSTRAINT fk_finance_ar_invoice
    FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id),
  CONSTRAINT fk_finance_ar_customer
    FOREIGN KEY (org_id, customer_contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_finance_ar_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id)
);

CREATE INDEX idx_finance_ar_invoices_status
  ON finance_ar_invoices(org_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_ar_payments (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ar_invoice_id           uuid          NOT NULL,
  imported_transaction_id uuid,
  paid_at                 date          NOT NULL DEFAULT CURRENT_DATE,
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  reference               text,
  created_by              uuid          REFERENCES users(id),
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_ar_payments_invoice
    FOREIGN KEY (org_id, ar_invoice_id) REFERENCES finance_ar_invoices(org_id, id),
  CONSTRAINT fk_finance_ar_payments_import
    FOREIGN KEY (org_id, imported_transaction_id) REFERENCES imported_transactions(org_id, id)
);

CREATE INDEX idx_finance_ar_payments_invoice
  ON finance_ar_payments(ar_invoice_id)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_ap_bills (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  vendor_contact_id  uuid,
  vendor_name        text          NOT NULL,
  bill_date          date          NOT NULL DEFAULT CURRENT_DATE,
  due_date           date,
  subtotal           numeric(12,2) NOT NULL DEFAULT 0,
  tax                numeric(12,2) NOT NULL DEFAULT 0,
  total              numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid        numeric(12,2) NOT NULL DEFAULT 0,
  amount_outstanding numeric(12,2) NOT NULL DEFAULT 0,
  status             text          NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted', 'partially_paid', 'paid', 'overdue')),
  document_intake_id uuid,
  created_by         uuid          REFERENCES users(id),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_ap_vendor
    FOREIGN KEY (org_id, vendor_contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_finance_ap_document
    FOREIGN KEY (org_id, document_intake_id) REFERENCES finance_document_intake(org_id, id)
);

CREATE INDEX idx_finance_ap_bills_status
  ON finance_ap_bills(org_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_ap_payments (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ap_bill_id              uuid          NOT NULL,
  imported_transaction_id uuid,
  paid_at                 date          NOT NULL DEFAULT CURRENT_DATE,
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  reference               text,
  created_by              uuid          REFERENCES users(id),
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_ap_payments_bill
    FOREIGN KEY (org_id, ap_bill_id) REFERENCES finance_ap_bills(org_id, id),
  CONSTRAINT fk_finance_ap_payments_import
    FOREIGN KEY (org_id, imported_transaction_id) REFERENCES imported_transactions(org_id, id)
);

CREATE INDEX idx_finance_ap_payments_bill
  ON finance_ap_payments(ap_bill_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_updated_at_finance_ar_invoices
  BEFORE UPDATE ON finance_ar_invoices FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_ar_payments
  BEFORE UPDATE ON finance_ar_payments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_ap_bills
  BEFORE UPDATE ON finance_ap_bills FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_ap_payments
  BEFORE UPDATE ON finance_ap_payments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE finance_ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ap_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ap_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_ar_invoices_all ON finance_ar_invoices FOR ALL
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'))
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_ar_payments_all ON finance_ar_payments FOR ALL
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'))
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_ap_bills_all ON finance_ap_bills FOR ALL
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'))
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_ap_payments_all ON finance_ap_payments FOR ALL
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'))
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
