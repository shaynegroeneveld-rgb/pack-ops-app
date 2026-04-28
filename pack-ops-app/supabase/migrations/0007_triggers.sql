-- ============================================================
-- PAYMENT → INVOICE AMOUNT_PAID SYNC FUNCTION
-- Recalculates invoice.amount_paid after any payment insert or soft delete.
-- This keeps balance_due (generated column) accurate at all times.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_sync_invoice_amount_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  PERFORM fn_recalculate_invoice_state(v_invoice_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_automation_rule_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF fn_current_role() = 'office' THEN
    IF ROW(
      NEW.name,
      NEW.description,
      NEW.is_builtin,
      NEW.is_enabled,
      NEW.trigger_type,
      NEW.trigger_config,
      NEW.condition_config,
      NEW.action_type,
      NEW.action_config,
      NEW.last_evaluated_at,
      NEW.execution_count,
      NEW.created_by,
      NEW.deleted_at
    ) IS DISTINCT FROM ROW(
      OLD.name,
      OLD.description,
      OLD.is_builtin,
      OLD.is_enabled,
      OLD.trigger_type,
      OLD.trigger_config,
      OLD.condition_config,
      OLD.action_type,
      OLD.action_config,
      OLD.last_evaluated_at,
      OLD.execution_count,
      OLD.created_by,
      OLD.deleted_at
    ) THEN
      RAISE EXCEPTION
        'Office users may only toggle automation_rules.is_muted'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- APPLY TRIGGERS
-- Order: updated_at (BEFORE) → state machine (BEFORE) → events + audit (AFTER)
-- ============================================================

-- updated_at (BEFORE UPDATE on all mutable tables)
CREATE TRIGGER trg_updated_at_orgs
  BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_users
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_contacts
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_leads
  BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_quotes
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_quote_line_items
  BEFORE UPDATE ON quote_line_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_jobs
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_job_assignments
  BEFORE UPDATE ON job_assignments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_schedule_blocks
  BEFORE UPDATE ON schedule_blocks FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_invoices
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_invoice_line_items
  BEFORE UPDATE ON invoice_line_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_payments
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_time_entries
  BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_expenses
  BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_catalog_items
  BEFORE UPDATE ON catalog_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_action_items
  BEFORE UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_automation_rules
  BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- State machine enforcement (BEFORE UPDATE — blocks invalid transitions before they land)
CREATE TRIGGER trg_guard_locked_quotes
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fn_guard_locked_quote_update();
CREATE TRIGGER trg_guard_field_jobs
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fn_guard_field_job_update();
CREATE TRIGGER trg_sm_leads
  BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_enforce_lead_transition();
CREATE TRIGGER trg_sm_quotes
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fn_enforce_quote_transition();
CREATE TRIGGER trg_sm_jobs
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fn_enforce_job_transition();
CREATE TRIGGER trg_sm_invoices
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_enforce_invoice_transition();
CREATE TRIGGER trg_sm_time_entries
  BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION fn_enforce_time_entry_transition();

-- Initial status history (AFTER INSERT)
CREATE TRIGGER trg_status_init_leads
  AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION fn_insert_initial_status_transition();
CREATE TRIGGER trg_status_init_quotes
  AFTER INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION fn_insert_initial_status_transition();
CREATE TRIGGER trg_status_init_jobs
  AFTER INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION fn_insert_initial_status_transition();
CREATE TRIGGER trg_status_init_invoices
  AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION fn_insert_initial_status_transition();
CREATE TRIGGER trg_status_init_time_entries
  AFTER INSERT ON time_entries FOR EACH ROW EXECUTE FUNCTION fn_insert_initial_status_transition();

-- Polymorphic entity validation
CREATE TRIGGER trg_validate_documents_entity
  BEFORE INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION fn_validate_polymorphic_reference();
CREATE TRIGGER trg_validate_notes_entity
  BEFORE INSERT OR UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION fn_validate_polymorphic_reference();
CREATE TRIGGER trg_validate_action_items_entity
  BEFORE INSERT OR UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION fn_validate_polymorphic_reference();

-- Entity event emission (AFTER INSERT OR UPDATE)
CREATE TRIGGER trg_events_contacts
  AFTER INSERT OR UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_leads
  AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_quotes
  AFTER INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_jobs
  AFTER INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_invoices
  AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_payments
  AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_time_entries
  AFTER INSERT OR UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_expenses
  AFTER INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();
CREATE TRIGGER trg_events_action_items
  AFTER INSERT OR UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION fn_emit_entity_event();

-- Audit log (AFTER INSERT OR UPDATE on key business entities)
CREATE TRIGGER trg_audit_contacts
  AFTER INSERT OR UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_leads
  AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_quotes
  AFTER INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_jobs
  AFTER INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_invoices
  AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_payments
  AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_time_entries
  AFTER INSERT OR UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();
CREATE TRIGGER trg_audit_expenses
  AFTER INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log();

-- Payment → invoice sync (AFTER INSERT OR UPDATE on payments)
CREATE TRIGGER trg_sync_invoice_paid
  AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fn_sync_invoice_amount_paid();
CREATE TRIGGER trg_guard_automation_rules
  BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION fn_guard_automation_rule_update();


