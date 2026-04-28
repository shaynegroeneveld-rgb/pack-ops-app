CREATE OR REPLACE FUNCTION fn_reset_workspace_data(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF fn_current_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only owners can reset workspace data.';
  END IF;

  IF fn_current_org_id() <> p_org_id THEN
    RAISE EXCEPTION 'Workspace reset must target the current org.';
  END IF;

  DELETE FROM action_items
  WHERE org_id = p_org_id
    AND entity_type IN ('jobs', 'time_entries');

  DELETE FROM notes
  WHERE org_id = p_org_id
    AND entity_type = 'jobs';

  DELETE FROM documents
  WHERE org_id = p_org_id
    AND entity_type = 'jobs';

  DELETE FROM active_timers
  WHERE org_id = p_org_id;

  DELETE FROM schedule_blocks
  WHERE org_id = p_org_id;

  DELETE FROM job_assignments
  WHERE org_id = p_org_id;

  DELETE FROM job_materials
  WHERE org_id = p_org_id;

  DELETE FROM time_entries
  WHERE org_id = p_org_id;

  DELETE FROM quote_line_items
  WHERE org_id = p_org_id;

  DELETE FROM jobs
  WHERE org_id = p_org_id;

  DELETE FROM quotes
  WHERE org_id = p_org_id;

  DELETE FROM leads
  WHERE org_id = p_org_id;

  DELETE FROM status_transitions
  WHERE org_id = p_org_id
    AND entity_type IN ('jobs', 'quotes', 'leads', 'time_entries');
END;
$$;

GRANT EXECUTE ON FUNCTION fn_reset_workspace_data(uuid) TO authenticated;
