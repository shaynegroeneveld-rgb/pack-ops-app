CREATE OR REPLACE FUNCTION fn_soft_delete_job_assignment(
  p_job_assignment_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_job_assignment_id uuid;
BEGIN
  UPDATE job_assignments
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now())
  WHERE id = p_job_assignment_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_job_assignment_id;

  IF v_job_assignment_id IS NULL THEN
    RAISE EXCEPTION 'Job assignment not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_job_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_soft_delete_job_assignment(uuid, timestamptz) TO authenticated;
