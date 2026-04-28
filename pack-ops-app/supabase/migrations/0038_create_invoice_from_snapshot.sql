CREATE OR REPLACE FUNCTION fn_create_invoice_from_snapshot(
  p_org_id uuid,
  p_job_id uuid,
  p_contact_id uuid,
  p_number text,
  p_tax_rate numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_due_date date DEFAULT NULL,
  p_customer_notes text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := gen_random_uuid();
  v_line jsonb;
BEGIN
  IF fn_current_org_id() <> p_org_id THEN
    RAISE EXCEPTION 'Invoice creation must target the current org.';
  END IF;

  IF fn_current_role() NOT IN ('owner', 'office') THEN
    RAISE EXCEPTION 'Only owner or office can create invoices.';
  END IF;

  IF jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Invoice must contain at least one line item.';
  END IF;

  INSERT INTO invoices (
    id,
    org_id,
    job_id,
    contact_id,
    number,
    status,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    due_date,
    customer_notes,
    internal_notes,
    created_by,
    updated_by
  ) VALUES (
    v_invoice_id,
    p_org_id,
    p_job_id,
    p_contact_id,
    p_number,
    'draft',
    p_subtotal,
    p_tax_rate,
    p_tax_amount,
    p_total,
    p_due_date,
    p_customer_notes,
    p_internal_notes,
    fn_current_user_id(),
    fn_current_user_id()
  );

  FOR v_line IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    INSERT INTO invoice_line_items (
      id,
      org_id,
      invoice_id,
      description,
      unit,
      unit_price,
      quantity,
      subtotal,
      sort_order
    ) VALUES (
      gen_random_uuid(),
      p_org_id,
      v_invoice_id,
      COALESCE(v_line ->> 'description', ''),
      COALESCE(v_line ->> 'unit', 'each'),
      COALESCE((v_line ->> 'unitPrice')::numeric, 0),
      COALESCE((v_line ->> 'quantity')::numeric, 1),
      COALESCE((v_line ->> 'subtotal')::numeric, 0),
      COALESCE((v_line ->> 'sortOrder')::integer, 0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_create_invoice_from_snapshot(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  text,
  text,
  jsonb
) TO authenticated;
