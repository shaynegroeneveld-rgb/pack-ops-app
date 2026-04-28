-- ============================================================
-- ROW LEVEL SECURITY
-- Enabled on every table. No exceptions.
-- Two enforcement layers:
--   1. RLS (database) — cannot be bypassed by any client
--   2. Route guards (frontend) — UX layer, hides irrelevant UI
-- ============================================================

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;

-- ---- USERS ----
CREATE POLICY users_select ON users FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL);
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() = 'owner');
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (fn_current_role() = 'owner' OR id = fn_current_user_id())
  );

-- ---- CONTACTS ----
-- Office + owner can see/edit all. Field and bookkeeper have no contact access.
CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY contacts_insert ON contacts FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- LEADS ----
CREATE POLICY leads_select ON leads FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- QUOTES ----
CREATE POLICY quotes_select ON quotes FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY quotes_insert ON quotes FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY quotes_update ON quotes FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- QUOTE LINE ITEMS ---- (inherit parent quote permissions)
CREATE POLICY qli_select ON quote_line_items FOR SELECT
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY qli_insert ON quote_line_items FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY qli_update ON quote_line_items FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY qli_delete ON quote_line_items FOR DELETE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- JOBS ----
-- Owner + office: all jobs. Field: assigned jobs only.
CREATE POLICY jobs_select ON jobs FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
CREATE POLICY jobs_insert ON jobs FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY jobs_update ON jobs FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );

-- ---- JOB ASSIGNMENTS ----
CREATE POLICY job_assignments_select ON job_assignments FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
      OR (fn_is_foreman() AND job_id IN (
        SELECT job_id FROM job_assignments ja2
        WHERE ja2.user_id = fn_current_user_id() AND ja2.deleted_at IS NULL
      ))
    )
  );
CREATE POLICY job_assignments_insert ON job_assignments FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY job_assignments_update ON job_assignments FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- SCHEDULE BLOCKS ----
CREATE POLICY schedule_blocks_select ON schedule_blocks FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (fn_current_role() IN ('owner', 'office') OR user_id = fn_current_user_id())
  );
CREATE POLICY schedule_blocks_insert ON schedule_blocks FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY schedule_blocks_update ON schedule_blocks FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- INVOICES ----
-- Owner, office, bookkeeper only. Field workers never see invoicing.
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY invoices_update ON invoices FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

-- ---- INVOICE LINE ITEMS ----
CREATE POLICY ili_select ON invoice_line_items FOR SELECT
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY ili_insert ON invoice_line_items FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY ili_update ON invoice_line_items FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY ili_delete ON invoice_line_items FOR DELETE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

-- ---- PAYMENTS ----
CREATE POLICY payments_select ON payments FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));
CREATE POLICY payments_update ON payments FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

-- ---- TIME ENTRIES ----
-- Field: own entries only. Foreman: own + same-job entries. Office/owner: all.
CREATE POLICY time_entries_select ON time_entries FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
      OR (fn_is_foreman() AND job_id IN (
        SELECT job_id FROM job_assignments
        WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
      ))
    )
  );
-- Field workers insert their own time only
CREATE POLICY time_entries_insert ON time_entries FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (fn_current_role() = 'field' AND user_id = fn_current_user_id())
    )
  );
-- Update: office/owner unrestricted; field can only update own pending entries
CREATE POLICY time_entries_update ON time_entries FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR fn_can_approve_time()
      OR (user_id = fn_current_user_id() AND status = 'pending')
      OR (fn_is_foreman() AND job_id IN (
        SELECT job_id FROM job_assignments
        WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
      ))
    )
  );

-- ---- EXPENSES ----
-- Field: own expenses. Office/owner: all.
CREATE POLICY expenses_select ON expenses FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR submitted_by = fn_current_user_id()
    )
  );
CREATE POLICY expenses_insert ON expenses FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (fn_current_role() = 'field' AND submitted_by = fn_current_user_id())
    )
  );
CREATE POLICY expenses_update ON expenses FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (submitted_by = fn_current_user_id() AND status = 'pending')
    )
  );

-- ---- CATALOG ITEMS ----
-- All roles can read (needed for quote building). Only owner/office write.
CREATE POLICY catalog_select ON catalog_items FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL);
CREATE POLICY catalog_insert ON catalog_items FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY catalog_update ON catalog_items FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- DOCUMENTS ----
-- Visible to the roles that can see the parent entity (field: assigned jobs only)
CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office', 'bookkeeper')
      OR (
        fn_current_role() = 'field'
        AND entity_type = 'jobs'
        AND entity_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
CREATE POLICY documents_insert ON documents FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office', 'bookkeeper')
      OR (
        fn_current_role() = 'field'
        AND entity_type = 'jobs'
        AND entity_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
CREATE POLICY documents_update ON documents FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- NOTES ----
CREATE POLICY notes_select ON notes FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND entity_type = 'jobs'
        AND entity_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
CREATE POLICY notes_insert ON notes FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND entity_type = 'jobs'
        AND entity_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
CREATE POLICY notes_update ON notes FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (fn_current_role() IN ('owner', 'office') OR created_by = fn_current_user_id())
  );

-- ---- ACTION ITEMS ----
-- Owner + office see all. Field users see items assigned to them.
CREATE POLICY action_items_select ON action_items FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR assigned_to = fn_current_user_id()
    )
  );
CREATE POLICY action_items_insert ON action_items FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY action_items_update ON action_items FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR assigned_to = fn_current_user_id()
    )
  );

-- ---- AUTOMATION RULES ----
-- Owner configures. Office can read + mute.
CREATE POLICY automation_rules_select ON automation_rules FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY automation_rules_insert ON automation_rules FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() = 'owner');
CREATE POLICY automation_rules_update ON automation_rules FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() = 'owner'
      -- Office can only toggle is_muted, nothing else
      OR (fn_current_role() = 'office')
    )
  );

-- ---- ENTITY EVENTS ----
CREATE POLICY entity_events_select ON entity_events FOR SELECT
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

-- ---- AUDIT LOG ----
-- Owner only. This is the sensitive change history.
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (org_id = fn_current_org_id() AND fn_current_role() = 'owner');

-- ---- STATUS TRANSITIONS ----
CREATE POLICY status_transitions_select ON status_transitions FOR SELECT
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));


