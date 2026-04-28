DROP POLICY IF EXISTS active_timers_update ON active_timers;

CREATE POLICY active_timers_update ON active_timers FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  );
