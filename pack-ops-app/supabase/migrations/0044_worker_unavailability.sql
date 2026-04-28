CREATE TABLE IF NOT EXISTS worker_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  day date NOT NULL,
  reason text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT worker_unavailability_user_fkey
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_unavailability_one_active_day
  ON worker_unavailability(org_id, user_id, day)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_worker_unavailability_org_day
  ON worker_unavailability(org_id, day)
  WHERE deleted_at IS NULL;

ALTER TABLE worker_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_unavailability_select ON worker_unavailability;
CREATE POLICY worker_unavailability_select ON worker_unavailability
  FOR SELECT
  USING (
    org_id IN (
      SELECT users.org_id
      FROM users
      WHERE users.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS worker_unavailability_insert ON worker_unavailability;
CREATE POLICY worker_unavailability_insert ON worker_unavailability
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT users.org_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'office')
    )
  );

DROP POLICY IF EXISTS worker_unavailability_update ON worker_unavailability;
CREATE POLICY worker_unavailability_update ON worker_unavailability
  FOR UPDATE
  USING (
    org_id IN (
      SELECT users.org_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'office')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT users.org_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('owner', 'office')
    )
  );

DROP TRIGGER IF EXISTS trg_updated_at_worker_unavailability ON worker_unavailability;
CREATE TRIGGER trg_updated_at_worker_unavailability
  BEFORE UPDATE ON worker_unavailability
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

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

  DELETE FROM worker_unavailability
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
