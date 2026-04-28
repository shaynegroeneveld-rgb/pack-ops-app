-- ============================================================
-- SEED FUNCTION: BUILT-IN AUTOMATION RULES
-- Called when a new org is provisioned.
-- These 8 rules are always present. is_builtin = true means
-- they cannot be deleted via API, only muted.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_seed_builtin_rules(p_org_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO automation_rules
    (org_id, name, description, is_builtin, is_enabled,
     trigger_type, trigger_config, condition_config, action_type, action_config)
  VALUES

  -- 1. No time logged on in-progress job
  (p_org_id,
   'No time logged alert',
   'Alert when an in-progress job has no time entries for 48 hours',
   true, true,
   'no_activity',
   '{"entity_type":"jobs","required_status":"in_progress","activity_type":"time_entry","threshold_hours":48}',
   null,
   'create_action_item',
   '{"category":"follow_up","priority":"high","title":"No time logged on in-progress job","assign_to_role":"office"}'
  ),

  -- 2. Ready to invoice
  (p_org_id,
   'Ready to invoice alert',
   'Create action item when a job is work_complete with no invoice draft after 24 hours',
   true, true,
   'no_activity',
   '{"entity_type":"jobs","required_status":"work_complete","activity_type":"invoice","threshold_hours":24}',
   null,
   'create_action_item',
   '{"category":"create_invoice","priority":"high","title":"Job is ready to invoice","assign_to_role":"office"}'
  ),

  -- 3. Over budget
  (p_org_id,
   'Over budget alert',
   'Alert when actual job cost exceeds estimate by 15%',
   true, true,
   'field_value',
   '{"entity_type":"jobs","field":"cost_over_estimate_percent","operator":"gt","threshold":15}',
   null,
   'create_action_item',
   '{"category":"review_budget","priority":"urgent","title":"Job cost exceeds estimate by 15%","assign_to_role":"owner"}'
  ),

  -- 4. Stale job
  (p_org_id,
   'Stale job alert',
   'Flag an in-progress job with no status change for 7 days',
   true, true,
   'no_activity',
   '{"entity_type":"jobs","required_status":"in_progress","activity_type":"status_change","threshold_hours":168}',
   null,
   'create_action_item',
   '{"category":"follow_up","priority":"normal","title":"Job has had no progress for 7 days","assign_to_role":"office"}'
  ),

  -- 5. Invoice payment reminder (email to contact)
  (p_org_id,
   'Overdue invoice reminder email',
   'Send payment reminder email when invoice passes due date unpaid',
   true, true,
   'time_elapsed',
   '{"entity_type":"invoices","reference_field":"due_date","offset_hours":0}',
   '{"field":"status","operator":"not_in","values":["paid","void"]}',
   'send_email',
   '{"template":"invoice_overdue_reminder","recipient":"contact"}'
  ),

  -- 6. Invoice 7 days overdue (action item)
  (p_org_id,
   'Invoice 7 days overdue — follow-up task',
   'Create action item for follow-up call when invoice is 7 days past due date',
   true, true,
   'time_elapsed',
   '{"entity_type":"invoices","reference_field":"due_date","offset_hours":168}',
   '{"field":"status","operator":"not_in","values":["paid","void"]}',
   'create_action_item',
   '{"category":"resolve_overdue","priority":"urgent","title":"Invoice is 7 days overdue — call client","assign_to_role":"office"}'
  ),

  -- 7. Quote no response (5 days)
  (p_org_id,
   'Quote follow-up reminder',
   'Create follow-up action item when a sent quote has no response for 5 days',
   true, true,
   'time_elapsed',
   '{"entity_type":"quotes","reference_field":"sent_at","offset_hours":120}',
   '{"field":"status","operator":"in","values":["sent","viewed"]}',
   'create_action_item',
   '{"category":"follow_up","priority":"normal","title":"Quote sent 5 days ago with no response","assign_to_role":"office"}'
  ),

  -- 8. Unresponsive lead (3 days)
  (p_org_id,
   'Unresponsive lead alert',
   'Alert when a contacted lead has no recorded activity for 3 days',
   true, true,
   'no_activity',
   '{"entity_type":"leads","required_status":"contacted","activity_type":"any","threshold_hours":72}',
   null,
   'create_action_item',
   '{"category":"follow_up","priority":"normal","title":"Lead has had no activity for 3 days","assign_to_role":"office"}'
  );
END;
$$;


-- ============================================================
-- END OF SCHEMA
-- ============================================================
