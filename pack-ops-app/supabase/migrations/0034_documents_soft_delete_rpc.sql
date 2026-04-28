CREATE OR REPLACE FUNCTION fn_soft_delete_document(
  p_document_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_document_id uuid;
BEGIN
  UPDATE documents
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now())
  WHERE id = p_document_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office', 'bookkeeper')
      OR (
        fn_current_role() = 'field'
        AND entity_type = 'jobs'
        AND entity_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  RETURNING id INTO v_document_id;

  IF v_document_id IS NULL THEN
    RAISE EXCEPTION 'Document not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_soft_delete_document(uuid, timestamptz) TO authenticated;
