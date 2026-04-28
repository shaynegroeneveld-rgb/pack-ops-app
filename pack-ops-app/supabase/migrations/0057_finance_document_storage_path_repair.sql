-- ============================================================
-- FINANCE DOCUMENT STORAGE PATH REPAIR
-- Keep finance document intake storage paths bucket-relative for
-- Supabase Storage signed URL generation.
-- ============================================================

UPDATE finance_document_intake
SET storage_path = regexp_replace(storage_path, '\?.*$', '')
WHERE storage_path LIKE '%?%';

UPDATE finance_document_intake
SET storage_path = regexp_replace(storage_path, '^.*?/storage/v1/object/(sign|public)/documents/', '')
WHERE storage_path ~ '/storage/v1/object/(sign|public)/documents/';

UPDATE finance_document_intake
SET storage_path = regexp_replace(storage_path, '^/+documents/+', '')
WHERE storage_path ~ '^/+documents/+';

UPDATE finance_document_intake
SET storage_path = regexp_replace(storage_path, '^/+', '')
WHERE storage_path ~ '^/+';

UPDATE finance_document_intake
SET
  file_name = COALESCE(NULLIF(file_name, ''), substring(storage_path from '[^/]+$'), 'unknown-document'),
  mime_type = COALESCE(
    NULLIF(mime_type, ''),
    CASE
      WHEN lower(storage_path) LIKE '%.pdf' THEN 'application/pdf'
      WHEN lower(storage_path) LIKE '%.png' THEN 'image/png'
      WHEN lower(storage_path) LIKE '%.jpg' OR lower(storage_path) LIKE '%.jpeg' THEN 'image/jpeg'
      WHEN lower(storage_path) LIKE '%.webp' THEN 'image/webp'
      ELSE NULL
    END
  ),
  file_size = COALESCE(file_size, size_bytes),
  uploaded_at = COALESCE(uploaded_at, created_at)
WHERE file_name = ''
   OR mime_type IS NULL
   OR mime_type = ''
   OR file_size IS NULL
   OR uploaded_at IS NULL;
