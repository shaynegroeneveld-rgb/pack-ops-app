CREATE OR REPLACE FUNCTION fn_soft_delete_job_material(
  p_job_material_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_job_material_id uuid;
BEGIN
  UPDATE job_materials
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_job_material_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND job_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  RETURNING id INTO v_job_material_id;

  IF v_job_material_id IS NULL THEN
    RAISE EXCEPTION 'Job material not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_job_material_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_soft_delete_job_material(uuid, timestamptz) TO authenticated;
