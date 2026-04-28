CREATE OR REPLACE FUNCTION fn_soft_delete_lead(
  p_lead_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  UPDATE leads
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_lead_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_lead_id;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_soft_delete_quote(
  p_quote_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  UPDATE quotes
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_quote_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_quote_id;

  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'Quote not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_soft_delete_catalog_item(
  p_catalog_item_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_catalog_item_id uuid;
BEGIN
  UPDATE catalog_items
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_catalog_item_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_catalog_item_id;

  IF v_catalog_item_id IS NULL THEN
    RAISE EXCEPTION 'Catalog item not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_catalog_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_soft_delete_assembly(
  p_assembly_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_assembly_id uuid;
BEGIN
  UPDATE assemblies
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_assembly_id
    AND org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  RETURNING id INTO v_assembly_id;

  IF v_assembly_id IS NULL THEN
    RAISE EXCEPTION 'Assembly not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_assembly_id;
END;
$$;
