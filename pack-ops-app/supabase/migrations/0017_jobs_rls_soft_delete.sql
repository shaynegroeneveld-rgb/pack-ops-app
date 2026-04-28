DROP POLICY IF EXISTS jobs_update ON jobs;

CREATE POLICY jobs_update ON jobs FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND fn_current_user_assigned_to_job(id)
      )
    )
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND fn_current_user_assigned_to_job(id)
      )
    )
  );
