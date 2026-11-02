-- A job's status can be corrected directly without artificial intermediate states.
-- Existing row permissions and the transition audit trigger remain in force.
-- This changes the job label only; it does not create/send invoices or record payments.
CREATE OR REPLACE FUNCTION fn_valid_job_transition(from_s job_status, to_s job_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT from_s IS NOT NULL AND to_s IS NOT NULL AND from_s <> to_s;
$$;
