-- Let a job type carry a default assembly so picking that job type on a
-- quote can auto-fill its materials/labor, ready to tweak.

ALTER TABLE job_types
ADD COLUMN IF NOT EXISTS default_assembly_id uuid,
ADD CONSTRAINT fk_job_types_default_assembly
  FOREIGN KEY (org_id, default_assembly_id) REFERENCES assemblies(org_id, id);

CREATE INDEX idx_job_types_default_assembly ON job_types(default_assembly_id)
  WHERE default_assembly_id IS NOT NULL AND deleted_at IS NULL;
