-- ============================================================
-- GMAIL FINANCE DOCUMENT IMPORT
-- Gmail OAuth state, encrypted token storage, and email provenance
-- for finance document intake.
-- ============================================================

ALTER TABLE finance_document_intake
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'gmail')),
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_source_id text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_attachment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_document_intake_gmail_attachment
  ON finance_document_intake(org_id, gmail_message_id, gmail_attachment_id)
  WHERE deleted_at IS NULL
    AND source = 'gmail'
    AND gmail_message_id IS NOT NULL
    AND gmail_attachment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_document_intake_source
  ON finance_document_intake(org_id, source, email_received_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  requested_by   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_hash     text        NOT NULL UNIQUE,
  expires_at     timestamptz NOT NULL,
  consumed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_oauth_states_org
  ON gmail_oauth_states(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gmail_connections (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  connected_by             uuid        REFERENCES users(id),
  gmail_email              text,
  access_token_ciphertext  bytea       NOT NULL,
  refresh_token_ciphertext bytea,
  token_expires_at         timestamptz,
  history_id               text,
  last_sync_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz,
  UNIQUE (org_id)
);

CREATE TRIGGER trg_updated_at_gmail_connections
  BEFORE UPDATE ON gmail_connections FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE gmail_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmail_oauth_states_insert ON gmail_oauth_states FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND requested_by = auth.uid()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY gmail_connections_update ON gmail_connections FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
