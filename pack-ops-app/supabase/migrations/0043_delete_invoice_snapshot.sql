CREATE OR REPLACE FUNCTION fn_delete_invoice_snapshot(
  p_invoice_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  UPDATE invoices
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_invoice_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_invoice_id;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM invoice_line_items
  WHERE org_id = fn_current_org_id()
    AND invoice_id = p_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_delete_invoice_snapshot(uuid, timestamptz) TO authenticated;
