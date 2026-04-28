-- ============================================================
-- FINANCE DOCUMENT EXTRACTION QUALITY
-- Classification and reviewable invoice header extraction metadata.
-- ============================================================

ALTER TABLE finance_document_intake
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'unknown'
    CHECK (document_type IN ('supplier_invoice', 'receipt', 'statement', 'payment_confirmation', 'unknown')),
  ADD COLUMN IF NOT EXISTS document_type_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (document_type_confidence >= 0 AND document_type_confidence <= 1),
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'needs_review'
    CHECK (extraction_status IN ('needs_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  ADD COLUMN IF NOT EXISTS extracted_invoice_number text,
  ADD COLUMN IF NOT EXISTS vendor_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (vendor_confidence >= 0 AND vendor_confidence <= 1),
  ADD COLUMN IF NOT EXISTS invoice_number_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (invoice_number_confidence >= 0 AND invoice_number_confidence <= 1),
  ADD COLUMN IF NOT EXISTS invoice_date_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (invoice_date_confidence >= 0 AND invoice_date_confidence <= 1),
  ADD COLUMN IF NOT EXISTS subtotal_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (subtotal_confidence >= 0 AND subtotal_confidence <= 1),
  ADD COLUMN IF NOT EXISTS tax_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (tax_confidence >= 0 AND tax_confidence <= 1),
  ADD COLUMN IF NOT EXISTS total_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (total_confidence >= 0 AND total_confidence <= 1),
  ADD COLUMN IF NOT EXISTS normalized_vendor_contact_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_normalization_confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (vendor_normalization_confidence >= 0 AND vendor_normalization_confidence <= 1),
  ADD COLUMN IF NOT EXISTS extraction_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS extraction_reviewed_at timestamptz;

ALTER TABLE finance_document_intake
  ADD CONSTRAINT fk_finance_document_intake_normalized_vendor
  FOREIGN KEY (org_id, normalized_vendor_contact_id) REFERENCES contacts(org_id, id)
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_finance_document_intake_extraction_status
  ON finance_document_intake(org_id, extraction_status, document_type)
  WHERE deleted_at IS NULL;
