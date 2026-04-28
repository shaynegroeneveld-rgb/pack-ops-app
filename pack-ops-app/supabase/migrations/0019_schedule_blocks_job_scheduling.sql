DROP TABLE IF EXISTS schedule_blocks CASCADE;

CREATE TABLE schedule_blocks (
  id             uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid            NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id         uuid            NOT NULL,
  user_id        uuid,
  start_at       timestamptz     NOT NULL,
  end_at         timestamptz     NOT NULL,
  duration_hours numeric(8,2)    NOT NULL CHECK (duration_hours > 0),
  notes          text,
  created_by     uuid            REFERENCES users(id),
  updated_by     uuid            REFERENCES users(id),
  created_at     timestamptz     NOT NULL DEFAULT now(),
  updated_at     timestamptz     NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT chk_schedule_blocks_order CHECK (end_at > start_at),
  CONSTRAINT fk_schedule_blocks_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_blocks_user
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);

CREATE INDEX idx_schedule_blocks_org_start
  ON schedule_blocks(org_id, start_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_schedule_blocks_job_start
  ON schedule_blocks(job_id, start_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_schedule_blocks_user_start
  ON schedule_blocks(user_id, start_at)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_blocks_select ON schedule_blocks FOR SELECT
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND (
          user_id = fn_current_user_id()
          OR fn_current_user_assigned_to_job(job_id)
        )
      )
    )
  );

CREATE POLICY schedule_blocks_insert ON schedule_blocks FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
  );

CREATE POLICY schedule_blocks_update ON schedule_blocks FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office')
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
  );

CREATE TRIGGER trg_updated_at_schedule_blocks
  BEFORE UPDATE ON schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();
