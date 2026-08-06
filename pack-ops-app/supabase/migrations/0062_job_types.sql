-- ============================================================
-- JOB TYPES
-- Simple org-scoped reference catalog. Each entry captures a
-- recurring kind of work (e.g. "Genny Install", "Panel Upgrade")
-- with free-text notes: code rules, special tools, gotchas.
-- Optionally attached to quotes and jobs so field/office staff
-- can review the notes while quoting or working the job.
-- ============================================================

CREATE TABLE job_types (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  notes        text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES users(id),
  updated_by   uuid        REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX idx_job_types_org    ON job_types(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_job_types_active ON job_types(org_id) WHERE is_active = true AND deleted_at IS NULL;

ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;

-- All roles can read (needed while quoting or working a job). Only owner/office write.
CREATE POLICY job_types_select ON job_types FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL);
CREATE POLICY job_types_insert ON job_types FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY job_types_update ON job_types FOR UPDATE
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

CREATE OR REPLACE FUNCTION fn_soft_delete_job_type(
  p_job_type_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_job_type_id uuid;
BEGIN
  UPDATE job_types
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_job_type_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_job_type_id;

  IF v_job_type_id IS NULL THEN
    RAISE EXCEPTION 'Job type not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_job_type_id;
END;
$$;
