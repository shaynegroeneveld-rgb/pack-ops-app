CREATE OR REPLACE FUNCTION fn_valid_quote_transition(
  from_s quote_status,
  to_s   quote_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN from_s = 'draft'    AND to_s IN ('sent')                                      THEN true
    WHEN from_s = 'sent'     AND to_s IN ('viewed', 'accepted', 'rejected', 'expired') THEN true
    WHEN from_s = 'viewed'   AND to_s IN ('accepted', 'rejected', 'expired')           THEN true
    WHEN from_s = 'accepted' AND to_s IN ('sent', 'draft')                             THEN true
    WHEN from_s = 'rejected' AND to_s = 'draft'                                        THEN true
    WHEN from_s = 'expired'  AND to_s = 'draft'                                        THEN true
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_locked_quote_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM jobs
    JOIN invoices ON invoices.job_id = jobs.id
    WHERE jobs.quote_id = OLD.id
      AND jobs.deleted_at IS NULL
      AND invoices.deleted_at IS NULL
  ) THEN
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
      NEW.deleted_at,
      NEW.status
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
      OLD.deleted_at,
      OLD.status
    ) THEN
      RAISE EXCEPTION
        'This quote is tied to an invoice. Editing is locked to avoid inconsistencies.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
