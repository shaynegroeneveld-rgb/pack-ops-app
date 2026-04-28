CREATE TABLE active_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  description text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT fk_active_timers_user
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id),
  CONSTRAINT fk_active_timers_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id)
);

CREATE UNIQUE INDEX idx_active_timers_one_running_per_user
  ON active_timers (org_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_active_timers_org_user
  ON active_timers (org_id, user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_set_updated_at_active_timers
  BEFORE UPDATE ON active_timers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE active_timers ENABLE ROW LEVEL SECURITY;

CREATE POLICY active_timers_select ON active_timers FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  );

CREATE POLICY active_timers_insert ON active_timers FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  );

CREATE POLICY active_timers_update ON active_timers FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR user_id = fn_current_user_id()
    )
  );
