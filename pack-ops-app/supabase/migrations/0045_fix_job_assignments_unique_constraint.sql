-- Fix job_assignments unique constraint so soft-deleted rows don't block re-assignment.
--
-- The original UNIQUE (job_id, user_id) is a full constraint that includes soft-deleted rows.
-- This means: assign → remove → reassign fails at sync with "duplicate key value violates
-- unique constraint job_assignments_job_id_user_id_key".
--
-- Fix: drop the full constraint and replace with a partial unique index that only applies to
-- active (non-deleted) rows.

-- Drop the old full unique constraint
ALTER TABLE job_assignments
  DROP CONSTRAINT IF EXISTS job_assignments_job_id_user_id_key;

-- Add a partial unique index — only one active assignment per (job_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_assignments_active_job_user
  ON job_assignments (job_id, user_id)
  WHERE deleted_at IS NULL;

-- Add an RPC so the sync recovery layer can reactivate a soft-deleted assignment without
-- relying on a direct table UPDATE (which RLS blocks for non-owner rows).
CREATE OR REPLACE FUNCTION fn_reactivate_job_assignment(
  p_job_id       uuid,
  p_user_id      uuid,
  p_role         text,
  p_assigned_by  uuid,
  p_updated_at   timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Only owner / office may reassign
  IF fn_current_role() NOT IN ('owner', 'office') THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;

  UPDATE job_assignments
  SET
    deleted_at  = NULL,
    role        = p_role::job_assignment_role,
    assigned_by = p_assigned_by,
    updated_at  = COALESCE(p_updated_at, now())
  WHERE job_id   = p_job_id
    AND user_id  = p_user_id
    AND org_id   = fn_current_org_id()
    AND deleted_at IS NOT NULL          -- only reactivate soft-deleted rows
  RETURNING id INTO v_id;

  RETURN v_id; -- NULL if nothing was reactivated (caller decides what to do)
END;
$$;

GRANT EXECUTE ON FUNCTION fn_reactivate_job_assignment(uuid, uuid, text, uuid, timestamptz) TO authenticated;
