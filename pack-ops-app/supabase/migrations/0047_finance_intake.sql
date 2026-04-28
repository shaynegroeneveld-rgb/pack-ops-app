-- ============================================================
-- FINANCE INTAKE
-- Imported bank/card rows and document inbox records stay separate
-- from final transactions until reviewed.
-- ============================================================

CREATE TABLE finance_import_batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_account_id uuid        NOT NULL,
  source_type       text        NOT NULL CHECK (source_type IN ('bank', 'credit_card')),
  file_name         text        NOT NULL,
  row_count         integer     NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  imported_by       uuid        REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_import_batches_account
    FOREIGN KEY (org_id, source_account_id) REFERENCES finance_accounts(org_id, id)
);

CREATE INDEX idx_finance_import_batches_org
  ON finance_import_batches(org_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE imported_transactions (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  batch_id               uuid          NOT NULL,
  source_account_id      uuid          NOT NULL,
  status                 text          NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'needs_review', 'matched', 'transfer', 'duplicate', 'ignored')),
  transaction_date       date          NOT NULL,
  raw_description        text          NOT NULL,
  raw_memo               text,
  amount                 numeric(12,2) NOT NULL,
  suggested_contact_id   uuid,
  suggested_category_id  uuid,
  suggested_job_id       uuid,
  suggestion_confidence  numeric(4,3)  NOT NULL DEFAULT 0 CHECK (suggestion_confidence >= 0 AND suggestion_confidence <= 1),
  suggestion_reason      text,
  matched_transaction_id uuid,
  reviewed_by            uuid          REFERENCES users(id),
  reviewed_at            timestamptz,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_imported_transactions_batch
    FOREIGN KEY (org_id, batch_id) REFERENCES finance_import_batches(org_id, id),
  CONSTRAINT fk_imported_transactions_account
    FOREIGN KEY (org_id, source_account_id) REFERENCES finance_accounts(org_id, id),
  CONSTRAINT fk_imported_transactions_contact
    FOREIGN KEY (org_id, suggested_contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_imported_transactions_category
    FOREIGN KEY (org_id, suggested_category_id) REFERENCES finance_categories(org_id, id),
  CONSTRAINT fk_imported_transactions_job
    FOREIGN KEY (org_id, suggested_job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_imported_transactions_transaction
    FOREIGN KEY (org_id, matched_transaction_id) REFERENCES finance_transactions(org_id, id)
);

CREATE INDEX idx_imported_transactions_org_status
  ON imported_transactions(org_id, status, transaction_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_imported_transactions_batch
  ON imported_transactions(batch_id)
  WHERE deleted_at IS NULL;

CREATE TABLE finance_document_intake (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  status                 text          NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'needs_review', 'matched', 'ignored')),
  file_name              text          NOT NULL,
  storage_path           text          NOT NULL,
  mime_type              text,
  size_bytes             bigint,
  extracted_vendor       text,
  extracted_date         date,
  extracted_subtotal     numeric(12,2),
  extracted_tax          numeric(12,2),
  extracted_total        numeric(12,2),
  suggested_contact_id   uuid,
  suggested_category_id  uuid,
  suggested_job_id       uuid,
  suggestion_confidence  numeric(4,3)  NOT NULL DEFAULT 0 CHECK (suggestion_confidence >= 0 AND suggestion_confidence <= 1),
  suggestion_reason      text,
  linked_transaction_id  uuid,
  uploaded_by            uuid          REFERENCES users(id),
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_document_intake_contact
    FOREIGN KEY (org_id, suggested_contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_finance_document_intake_category
    FOREIGN KEY (org_id, suggested_category_id) REFERENCES finance_categories(org_id, id),
  CONSTRAINT fk_finance_document_intake_job
    FOREIGN KEY (org_id, suggested_job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_finance_document_intake_transaction
    FOREIGN KEY (org_id, linked_transaction_id) REFERENCES finance_transactions(org_id, id)
);

CREATE INDEX idx_finance_document_intake_org_status
  ON finance_document_intake(org_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_updated_at_finance_import_batches
  BEFORE UPDATE ON finance_import_batches FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_imported_transactions
  BEFORE UPDATE ON imported_transactions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_finance_document_intake
  BEFORE UPDATE ON finance_document_intake FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE finance_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_document_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_import_batches_select ON finance_import_batches FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_import_batches_insert ON finance_import_batches FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_import_batches_update ON finance_import_batches FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY imported_transactions_select ON imported_transactions FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY imported_transactions_insert ON imported_transactions FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY imported_transactions_update ON imported_transactions FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY finance_document_intake_select ON finance_document_intake FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_document_intake_insert ON finance_document_intake FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY finance_document_intake_update ON finance_document_intake FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
