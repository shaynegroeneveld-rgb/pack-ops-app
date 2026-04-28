-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at before any UPDATE
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Get next human-readable number for an org (thread-safe via FOR UPDATE)
CREATE OR REPLACE FUNCTION fn_next_org_number(
  p_org_id     uuid,
  p_type       text,
  p_prefix     text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO org_counters (org_id, counter_type, last_value)
    VALUES (p_org_id, p_type, 1)
    ON CONFLICT (org_id, counter_type)
    DO UPDATE SET last_value = org_counters.last_value + 1
    RETURNING last_value INTO v_next;
  RETURN p_prefix || '-' || v_next::text;
END;
$$;

-- Get the current user's ID from the Supabase JWT
-- Returns NULL for system operations (triggers fired without a user context)
CREATE OR REPLACE FUNCTION fn_current_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

-- Get the current user's org_id (used in RLS policies)
CREATE OR REPLACE FUNCTION fn_current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT org_id FROM users WHERE id = fn_current_user_id() LIMIT 1;
$$;

-- Get the current user's role (used in RLS policies)
CREATE OR REPLACE FUNCTION fn_current_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT role FROM users WHERE id = fn_current_user_id() LIMIT 1;
$$;

-- Check if current user is a foreman (used in RLS policies)
CREATE OR REPLACE FUNCTION fn_is_foreman()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT COALESCE(is_foreman, false) FROM users WHERE id = fn_current_user_id() LIMIT 1;
$$;

-- Check if current user has can_approve_time flag
CREATE OR REPLACE FUNCTION fn_can_approve_time()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT COALESCE(can_approve_time, false) FROM users WHERE id = fn_current_user_id() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_write_initial_status_transition(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_to_status text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO status_transitions (
    org_id, entity_type, entity_id, from_status, to_status, transitioned_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id, NULL, p_to_status, fn_current_user_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_validate_polymorphic_entity(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_entity_type NOT IN ('contacts', 'leads', 'quotes', 'jobs', 'invoices', 'payments', 'time_entries', 'expenses', 'action_items') THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1
       FROM %I
       WHERE id = $1
         AND org_id = $2
         AND deleted_at IS NULL
     )',
    p_entity_type
  )
  INTO v_exists
  USING p_entity_id, p_org_id;

  RETURN COALESCE(v_exists, false);
END;
$$;

CREATE OR REPLACE FUNCTION fn_validate_polymorphic_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT fn_validate_polymorphic_entity(NEW.org_id, NEW.entity_type::text, NEW.entity_id) THEN
    RAISE EXCEPTION
      'Invalid polymorphic reference: %.% for org %',
      NEW.entity_type, NEW.entity_id, NEW.org_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- STATE MACHINE VALIDATION FUNCTIONS
-- Pure functions (IMMUTABLE) — no side effects, safe to call anywhere.
-- Each returns true if the transition is allowed, false otherwise.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_valid_lead_transition(
  from_s lead_status,
  to_s   lead_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'new'          AND to_s IN ('contacted', 'lost')                    THEN true
    WHEN from_s = 'contacted'    AND to_s IN ('qualified', 'unresponsive', 'lost')    THEN true
    WHEN from_s = 'qualified'    AND to_s IN ('won', 'lost')                          THEN true
    WHEN from_s = 'unresponsive' AND to_s IN ('contacted', 'lost')                    THEN true
    -- 'won' and 'lost' are terminal states.
    -- Reactivation (lost → new) is an admin-level override handled in the app layer,
    -- not a normal workflow transition.
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_valid_quote_transition(
  from_s quote_status,
  to_s   quote_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'draft'    AND to_s IN ('sent')                                      THEN true
    WHEN from_s = 'sent'     AND to_s IN ('viewed', 'accepted', 'rejected', 'expired') THEN true
    WHEN from_s = 'viewed'   AND to_s IN ('accepted', 'rejected', 'expired')           THEN true
    -- Rejected/expired quotes return to draft for revision (new version is created)
    WHEN from_s = 'rejected' AND to_s = 'draft'                                        THEN true
    WHEN from_s = 'expired'  AND to_s = 'draft'                                        THEN true
    -- 'accepted' is immutable once set
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_valid_job_transition(
  from_s job_status,
  to_s   job_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'scheduled'        AND to_s IN ('in_progress', 'cancelled')              THEN true
    WHEN from_s = 'in_progress'      AND to_s IN ('waiting', 'work_complete', 'cancelled') THEN true
    WHEN from_s = 'waiting'          AND to_s IN ('in_progress', 'cancelled')              THEN true
    -- work_complete → in_progress supports rework / scope increase scenarios
    WHEN from_s = 'work_complete'    AND to_s IN ('ready_to_invoice', 'in_progress')       THEN true
    WHEN from_s = 'ready_to_invoice' AND to_s IN ('invoiced')                              THEN true
    -- invoiced → ready_to_invoice supports voided invoice scenario
    WHEN from_s = 'invoiced'         AND to_s IN ('closed', 'ready_to_invoice')            THEN true
    -- 'closed' and 'cancelled' are terminal
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_valid_invoice_transition(
  from_s invoice_status,
  to_s   invoice_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'draft'          AND to_s IN ('sent', 'void')                                   THEN true
    WHEN from_s = 'sent'           AND to_s IN ('viewed', 'partially_paid', 'paid', 'overdue', 'void') THEN true
    WHEN from_s = 'viewed'         AND to_s IN ('sent', 'draft', 'partially_paid', 'paid', 'overdue', 'void') THEN true
    WHEN from_s = 'partially_paid' AND to_s IN ('draft', 'sent', 'viewed', 'overdue', 'paid', 'void') THEN true
    WHEN from_s = 'overdue'        AND to_s IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'void') THEN true
    -- 'paid' and 'void' are terminal
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_valid_time_entry_transition(
  from_s time_entry_status,
  to_s   time_entry_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'pending'  AND to_s IN ('approved', 'rejected') THEN true
    -- Rejected entries can be corrected and resubmitted
    WHEN from_s = 'rejected' AND to_s = 'pending'                 THEN true
    ELSE false
  END;
END;
$$;


-- ============================================================
-- STATUS TRANSITION TRIGGER FUNCTIONS
-- BEFORE UPDATE triggers on each entity table.
-- Validates the transition, writes to status_transitions, sets timestamps.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_enforce_lead_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only runs when status actually changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_lead_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid lead status transition: % → %. Check fn_valid_lead_transition for allowed transitions.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
    -- Write to transition history
    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'leads', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());
    -- Set derived timestamps
    IF NEW.status = 'won'  THEN NEW.won_at  = now(); END IF;
    IF NEW.status = 'lost' THEN NEW.lost_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_quote_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_quote_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid quote status transition: % → %.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'quotes', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());
    IF NEW.status = 'sent'     THEN NEW.sent_at     = now(); END IF;
    IF NEW.status = 'viewed'   THEN NEW.viewed_at   = now(); END IF;
    IF NEW.status = 'accepted' THEN NEW.accepted_at = now(); END IF;
    IF NEW.status = 'rejected' THEN NEW.rejected_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_job_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_job_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid job status transition: % → %.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'jobs', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());
    -- Set actual_start on first time entering in_progress
    IF NEW.status = 'in_progress' AND OLD.actual_start IS NULL THEN
      NEW.actual_start = now();
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.actual_end = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_invoice_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_invoice_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid invoice status transition: % → %.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'invoices', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());
    IF NEW.status = 'sent'    THEN NEW.sent_at   = now(); END IF;
    IF NEW.status = 'viewed'  THEN NEW.viewed_at = now(); END IF;
    IF NEW.status = 'paid'    THEN NEW.paid_at   = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_time_entry_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_time_entry_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid time entry status transition: % → %.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'time_entries', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());
    IF NEW.status = 'approved' THEN
      NEW.approved_by = fn_current_user_id();
      NEW.approved_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_locked_quote_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    IF ROW(
      NEW.lead_id,
      NEW.contact_id,
      NEW.number,
      NEW.version,
      NEW.parent_quote_id,
      NEW.title,
      NEW.internal_notes,
      NEW.customer_notes,
      NEW.subtotal,
      NEW.tax_rate,
      NEW.tax_amount,
      NEW.total,
      NEW.expires_at,
      NEW.rejection_reason,
      NEW.deleted_at
    ) IS DISTINCT FROM ROW(
      OLD.lead_id,
      OLD.contact_id,
      OLD.number,
      OLD.version,
      OLD.parent_quote_id,
      OLD.title,
      OLD.internal_notes,
      OLD.customer_notes,
      OLD.subtotal,
      OLD.tax_rate,
      OLD.tax_amount,
      OLD.total,
      OLD.expires_at,
      OLD.rejection_reason,
      OLD.deleted_at
    ) THEN
      RAISE EXCEPTION
        'Accepted quotes are immutable. Create a revision instead.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_field_job_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF fn_current_role() = 'field' THEN
    IF ROW(
      NEW.contact_id,
      NEW.quote_id,
      NEW.number,
      NEW.title,
      NEW.description,
      NEW.scheduled_start,
      NEW.scheduled_end,
      NEW.estimated_hours,
      NEW.estimated_cost,
      NEW.created_by,
      NEW.deleted_at
    ) IS DISTINCT FROM ROW(
      OLD.contact_id,
      OLD.quote_id,
      OLD.number,
      OLD.title,
      OLD.description,
      OLD.scheduled_start,
      OLD.scheduled_end,
      OLD.estimated_hours,
      OLD.estimated_cost,
      OLD.created_by,
      OLD.deleted_at
    ) THEN
      RAISE EXCEPTION
        'Field users may only update operational job fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_insert_initial_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) ? 'status' THEN
    PERFORM fn_write_initial_status_transition(
      NEW.org_id,
      TG_TABLE_NAME,
      NEW.id,
      to_jsonb(NEW) ->> 'status'
    );
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- ENTITY EVENT EMISSION FUNCTION
-- AFTER INSERT OR UPDATE trigger. Fires on all key entity tables.
-- Writes a structured event to entity_events for the automation engine.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_emit_entity_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_event_type  text;
  v_payload     jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := TG_TABLE_NAME || '.created';
    v_payload := jsonb_build_object('id', NEW.id);

  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft delete takes priority over other event classifications
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_event_type := TG_TABLE_NAME || '.deleted';
      v_payload := jsonb_build_object('id', NEW.id);

    -- Status change is the most important event class
    ELSIF to_jsonb(NEW) ? 'status'
      AND (to_jsonb(OLD) ->> 'status') IS DISTINCT FROM (to_jsonb(NEW) ->> 'status')
    THEN
      v_event_type := TG_TABLE_NAME || '.status_changed';
      v_payload := jsonb_build_object(
        'id',          NEW.id,
        'from_status', to_jsonb(OLD) ->> 'status',
        'to_status',   to_jsonb(NEW) ->> 'status'
      );

    ELSE
      v_event_type := TG_TABLE_NAME || '.updated';
      v_payload := jsonb_build_object('id', NEW.id);
    END IF;
  END IF;

  INSERT INTO entity_events
    (org_id, entity_type, entity_id, event_type, payload, emitted_by)
  VALUES
    (NEW.org_id, TG_TABLE_NAME, NEW.id, v_event_type, v_payload, fn_current_user_id());

  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$;


-- ============================================================
-- AUDIT LOG WRITE FUNCTION
-- AFTER INSERT OR UPDATE trigger. Fires on all audited tables.
-- INSERT: writes one row with full row snapshot.
-- UPDATE: writes one row per changed field (skips noise columns).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_write_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_old      jsonb;
  v_new      jsonb;
  v_key      text;
  -- Columns excluded from field-level UPDATE diffs (noise / derived values)
  v_skip     text[] := ARRAY['updated_at', 'updated_by', 'balance_due'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log
      (org_id, entity_type, entity_id, operation, row_snapshot, changed_by)
    VALUES
      (NEW.org_id, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), fn_current_user_id());

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Emit one row per changed field
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN v_key = ANY(v_skip);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        INSERT INTO audit_log
          (org_id, entity_type, entity_id, operation, field_name, old_value, new_value, changed_by)
        VALUES
          (NEW.org_id, TG_TABLE_NAME, NEW.id, 'UPDATE',
           v_key, v_old ->> v_key, v_new ->> v_key, fn_current_user_id());
      END IF;
    END LOOP;
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

CREATE OR REPLACE FUNCTION fn_recalculate_invoice_state(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE invoices
  SET amount_paid = (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE invoice_id = p_invoice_id
      AND deleted_at IS NULL
  )
  WHERE id = p_invoice_id;

  UPDATE invoices
  SET status = CASE
      WHEN status = 'void' THEN status
      WHEN amount_paid >= total AND total > 0 THEN 'paid'::invoice_status
      WHEN amount_paid > 0 AND amount_paid < total THEN 'partially_paid'::invoice_status
      WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE AND sent_at IS NOT NULL THEN 'overdue'::invoice_status
      WHEN viewed_at IS NOT NULL THEN 'viewed'::invoice_status
      WHEN sent_at IS NOT NULL THEN 'sent'::invoice_status
      ELSE 'draft'::invoice_status
    END
  WHERE id = p_invoice_id
    AND deleted_at IS NULL
    AND status <> 'void';
END;
$$;


