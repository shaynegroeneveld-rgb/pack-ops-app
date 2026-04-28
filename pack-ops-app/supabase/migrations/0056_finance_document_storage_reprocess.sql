-- ============================================================
-- FINANCE DOCUMENT STORAGE AND REPROCESS SUPPORT
-- Ensure document intake rows have explicit storage metadata for
-- signed viewing and extraction backfills.
-- ============================================================

ALTER TABLE finance_document_intake
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

UPDATE finance_document_intake
SET
  file_size = COALESCE(file_size, size_bytes),
  uploaded_at = COALESCE(uploaded_at, created_at)
WHERE file_size IS NULL
   OR uploaded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_finance_document_intake_low_confidence
  ON finance_document_intake(org_id, extraction_confidence, created_at DESC)
  WHERE deleted_at IS NULL
    AND extraction_status = 'needs_review';
