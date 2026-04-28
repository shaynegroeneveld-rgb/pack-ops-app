CREATE OR REPLACE FUNCTION fn_soft_delete_schedule_block(
  p_schedule_block_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_schedule_block_id uuid;
BEGIN
  UPDATE schedule_blocks
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_schedule_block_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_schedule_block_id;

  IF v_schedule_block_id IS NULL THEN
    RAISE EXCEPTION 'Schedule block not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_schedule_block_id;
END;
$$;
