CREATE TABLE IF NOT EXISTS job_manual_actual_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('labor', 'material', 'equipment', 'subcontractor', 'other')),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity >= 0),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  total_cost numeric(12,2) NOT NULL CHECK (total_cost >= 0),
  note text,
  section_name text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT fk_job_manual_actual_cost_lines_job FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_job_manual_actual_cost_lines_job
  ON job_manual_actual_cost_lines(org_id, job_id)
  WHERE deleted_at IS NULL;

ALTER TABLE job_manual_actual_cost_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_manual_actual_cost_lines_select ON job_manual_actual_cost_lines;
CREATE POLICY job_manual_actual_cost_lines_select ON job_manual_actual_cost_lines
  FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
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
  );

DROP POLICY IF EXISTS job_manual_actual_cost_lines_insert ON job_manual_actual_cost_lines;
CREATE POLICY job_manual_actual_cost_lines_insert ON job_manual_actual_cost_lines
  FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
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
  );

DROP POLICY IF EXISTS job_manual_actual_cost_lines_update ON job_manual_actual_cost_lines;
CREATE POLICY job_manual_actual_cost_lines_update ON job_manual_actual_cost_lines
  FOR UPDATE
  USING (
    org_id = fn_current_org_id()
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
  )
  WITH CHECK (
    org_id = fn_current_org_id()
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
  );

DROP TRIGGER IF EXISTS trg_updated_at_job_manual_actual_cost_lines ON job_manual_actual_cost_lines;
CREATE TRIGGER trg_updated_at_job_manual_actual_cost_lines
  BEFORE UPDATE ON job_manual_actual_cost_lines
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_soft_delete_job_manual_actual_cost_line(
  p_job_manual_actual_cost_line_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_line_id uuid;
BEGIN
  UPDATE job_manual_actual_cost_lines
  SET
    deleted_at = COALESCE(p_deleted_at, now()),
    updated_at = COALESCE(p_deleted_at, now()),
    updated_by = fn_current_user_id()
  WHERE id = p_job_manual_actual_cost_line_id
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
  RETURNING id INTO v_line_id;

  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'Manual actual cost line not found or not permitted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_line_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_soft_delete_job_manual_actual_cost_line(uuid, timestamptz) TO authenticated;

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

  DELETE FROM job_manual_actual_cost_lines
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
