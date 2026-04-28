-- ============================================================
-- FINANCE REVIEW QUEUE SUPPORT
-- Receipt state and import-document links for bookkeeping review.
-- ============================================================

ALTER TABLE imported_transactions
  ADD COLUMN linked_document_intake_id uuid,
  ADD COLUMN receipt_status text NOT NULL DEFAULT 'unknown'
    CHECK (receipt_status IN ('unknown', 'missing', 'linked', 'not_required', 'snoozed')),
  ADD COLUMN receipt_snoozed_until date;

ALTER TABLE finance_document_intake
  ADD COLUMN linked_imported_transaction_id uuid;

ALTER TABLE imported_transactions
  ADD CONSTRAINT fk_imported_transactions_document_intake
    FOREIGN KEY (org_id, linked_document_intake_id) REFERENCES finance_document_intake(org_id, id);

ALTER TABLE finance_document_intake
  ADD CONSTRAINT fk_finance_document_intake_imported_transaction
    FOREIGN KEY (org_id, linked_imported_transaction_id) REFERENCES imported_transactions(org_id, id);

CREATE INDEX idx_imported_transactions_receipt_status
  ON imported_transactions(org_id, receipt_status, receipt_snoozed_until)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_imported_transactions_document_intake
  ON imported_transactions(linked_document_intake_id)
  WHERE linked_document_intake_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_finance_document_intake_imported_transaction
  ON finance_document_intake(linked_imported_transaction_id)
  WHERE linked_imported_transaction_id IS NOT NULL AND deleted_at IS NULL;
