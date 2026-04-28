-- Fix recursive RLS evaluation on job_assignments.
-- The original policy queried job_assignments from inside its own USING clause,
-- which causes infinite recursion during policy evaluation.

CREATE OR REPLACE FUNCTION fn_current_user_assigned_to_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1
    FROM job_assignments
    WHERE job_id = p_job_id
      AND user_id = fn_current_user_id()
      AND deleted_at IS NULL
  );
$$;

DROP POLICY IF EXISTS jobs_select ON jobs;
CREATE POLICY jobs_select ON jobs FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND fn_current_user_assigned_to_job(id)
      )
    )
  );

DROP POLICY IF EXISTS jobs_update ON jobs;
CREATE POLICY jobs_update ON jobs FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND fn_current_user_assigned_to_job(id)
      )
    )
  );

DROP POLICY IF EXISTS job_assignments_select ON job_assignments;
CREATE POLICY job_assignments_select ON job_assignments FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
      OR (
        fn_is_foreman()
        AND fn_current_user_assigned_to_job(job_id)
      )
    )
  );
