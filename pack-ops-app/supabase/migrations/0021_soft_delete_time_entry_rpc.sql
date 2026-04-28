CREATE OR REPLACE FUNCTION fn_soft_delete_time_entry(
  p_time_entry_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_time_entry_id uuid;
BEGIN
  UPDATE time_entries
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_time_entry_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR fn_can_approve_time()
      OR (user_id = fn_current_user_id() AND status = 'pending')
      OR (fn_is_foreman() AND fn_current_user_assigned_to_job(job_id))
    )
  RETURNING id INTO v_time_entry_id;

  IF v_time_entry_id IS NULL THEN
    RAISE EXCEPTION 'Time entry not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_time_entry_id;
END;
$$;
