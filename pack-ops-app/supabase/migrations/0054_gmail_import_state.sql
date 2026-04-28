-- ============================================================
-- GMAIL IMPORT STATE
-- Lightweight scheduled import bookkeeping for bounded daily syncs.
-- ============================================================

ALTER TABLE gmail_connections
  ADD COLUMN IF NOT EXISTS last_successful_import_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_window_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_window_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_import_emails_scanned integer NOT NULL DEFAULT 0 CHECK (last_import_emails_scanned >= 0),
  ADD COLUMN IF NOT EXISTS last_import_attachments_imported integer NOT NULL DEFAULT 0 CHECK (last_import_attachments_imported >= 0),
  ADD COLUMN IF NOT EXISTS last_import_items_skipped integer NOT NULL DEFAULT 0 CHECK (last_import_items_skipped >= 0);
