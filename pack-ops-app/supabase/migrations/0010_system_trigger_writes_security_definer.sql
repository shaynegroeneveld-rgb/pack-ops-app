-- System trigger writers must bypass app-user RLS on append-only system tables.
-- These functions are invoked by triggers on business tables and should execute
-- with the privileges of the function owner, not the calling app user.

CREATE OR REPLACE FUNCTION fn_write_initial_status_transition(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_to_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  INSERT INTO status_transitions (
    org_id, entity_type, entity_id, from_status, to_status, transitioned_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id, NULL, p_to_status, fn_current_user_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_lead_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT fn_valid_lead_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid lead status transition: % → %. Check fn_valid_lead_transition for allowed transitions.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO status_transitions
      (org_id, entity_type, entity_id, from_status, to_status, transitioned_by)
    VALUES
      (NEW.org_id, 'leads', NEW.id, OLD.status::text, NEW.status::text, fn_current_user_id());

    IF NEW.status = 'won' THEN NEW.won_at = now(); END IF;
    IF NEW.status = 'lost' THEN NEW.lost_at = now(); END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_quote_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
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

    IF NEW.status = 'sent' THEN NEW.sent_at = now(); END IF;
    IF NEW.status = 'viewed' THEN NEW.viewed_at = now(); END IF;
    IF NEW.status = 'accepted' THEN NEW.accepted_at = now(); END IF;
    IF NEW.status = 'rejected' THEN NEW.rejected_at = now(); END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_job_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
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
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
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

    IF NEW.status = 'sent' THEN NEW.sent_at = now(); END IF;
    IF NEW.status = 'viewed' THEN NEW.viewed_at = now(); END IF;
    IF NEW.status = 'paid' THEN NEW.paid_at = now(); END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_time_entry_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
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

CREATE OR REPLACE FUNCTION fn_insert_initial_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  PERFORM fn_write_initial_status_transition(
    NEW.org_id,
    TG_TABLE_NAME,
    NEW.id,
    to_jsonb(NEW) ->> 'status'
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_emit_entity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_event_type text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := TG_TABLE_NAME || '.created';
    v_payload := jsonb_build_object('id', NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_event_type := TG_TABLE_NAME || '.deleted';
      v_payload := jsonb_build_object('id', NEW.id);
    ELSIF to_jsonb(NEW) ? 'status'
      AND (to_jsonb(OLD) ->> 'status') IS DISTINCT FROM (to_jsonb(NEW) ->> 'status')
    THEN
      v_event_type := TG_TABLE_NAME || '.status_changed';
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'from_status', to_jsonb(OLD) ->> 'status',
        'to_status', to_jsonb(NEW) ->> 'status'
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

  RETURN NULL;
END;
$$;
