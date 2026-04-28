DROP POLICY IF EXISTS time_entries_update ON time_entries;

CREATE POLICY time_entries_update ON time_entries FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR fn_can_approve_time()
      OR (user_id = fn_current_user_id() AND status = 'pending')
      OR (fn_is_foreman() AND fn_current_user_assigned_to_job(job_id))
    )
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR fn_can_approve_time()
      OR (user_id = fn_current_user_id() AND status = 'pending')
      OR (fn_is_foreman() AND fn_current_user_assigned_to_job(job_id))
    )
  );
