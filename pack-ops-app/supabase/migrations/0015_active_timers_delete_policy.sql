CREATE POLICY active_timers_delete ON active_timers FOR DELETE
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  );
