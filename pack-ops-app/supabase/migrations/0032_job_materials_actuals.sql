CREATE TABLE IF NOT EXISTS job_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('used', 'needed')),
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  note text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT fk_job_materials_job FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_job_materials_catalog FOREIGN KEY (org_id, catalog_item_id) REFERENCES catalog_items(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_job_materials_job ON job_materials(org_id, job_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_materials_catalog ON job_materials(org_id, catalog_item_id) WHERE deleted_at IS NULL;

ALTER TABLE job_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_materials_select ON job_materials FOR SELECT
  USING (
    org_id = fn_current_org_id() AND deleted_at IS NULL
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND job_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );

CREATE POLICY job_materials_insert ON job_materials FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND job_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );

CREATE POLICY job_materials_update ON job_materials FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND job_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND (
      fn_current_role() IN ('owner', 'office')
      OR (
        fn_current_role() = 'field'
        AND job_id IN (
          SELECT job_id FROM job_assignments
          WHERE user_id = fn_current_user_id() AND deleted_at IS NULL
        )
      )
    )
  );
