ALTER TYPE lead_status RENAME VALUE 'qualified' TO 'quoting';
ALTER TYPE lead_status RENAME VALUE 'unresponsive' TO 'waiting';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

DROP POLICY IF EXISTS leads_update ON leads;

CREATE POLICY leads_update ON leads FOR UPDATE
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office'))
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office'));

CREATE OR REPLACE FUNCTION fn_valid_lead_transition(
  from_s lead_status,
  to_s   lead_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN from_s <> to_s;
END;
$$;
