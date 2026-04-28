-- ============================================================
-- FINANCE PDF INVOICE EXTRACTION
-- Lightweight PDF extraction metadata and reviewable parsed line
-- item support.
-- ============================================================

ALTER TABLE finance_document_intake
  ADD COLUMN IF NOT EXISTS extraction_method text NOT NULL DEFAULT 'metadata'
    CHECK (extraction_method IN ('metadata', 'pdf_text', 'ocr')),
  ADD COLUMN IF NOT EXISTS pdf_text_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_text_char_count integer NOT NULL DEFAULT 0 CHECK (pdf_text_char_count >= 0),
  ADD COLUMN IF NOT EXISTS ocr_status text NOT NULL DEFAULT 'not_needed'
    CHECK (ocr_status IN ('not_needed', 'needed', 'unavailable', 'completed')),
  ADD COLUMN IF NOT EXISTS ocr_error text;

ALTER TABLE finance_document_line_items
  ADD COLUMN IF NOT EXISTS extraction_source text NOT NULL DEFAULT 'manual'
    CHECK (extraction_source IN ('manual', 'pdf_parse', 'ocr')),
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

ALTER TABLE finance_document_line_items
  DROP CONSTRAINT IF EXISTS finance_document_line_items_review_status_check;

ALTER TABLE finance_document_line_items
  ADD CONSTRAINT finance_document_line_items_review_status_check
    CHECK (review_status IN ('new', 'approved', 'updated_material', 'created_material', 'ignored'));

CREATE INDEX IF NOT EXISTS idx_finance_document_line_items_extraction_source
  ON finance_document_line_items(org_id, document_intake_id, extraction_source)
  WHERE deleted_at IS NULL;
