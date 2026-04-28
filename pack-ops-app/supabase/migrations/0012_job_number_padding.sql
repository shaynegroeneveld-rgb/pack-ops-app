CREATE OR REPLACE FUNCTION fn_next_org_number(
  p_org_id uuid,
  p_type text,
  p_prefix text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO org_counters (org_id, counter_type, last_value)
    VALUES (p_org_id, p_type, 1)
    ON CONFLICT (org_id, counter_type)
    DO UPDATE SET last_value = org_counters.last_value + 1
    RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || lpad(v_next::text, 3, '0');
END;
$$;
