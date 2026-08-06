-- Attach an optional job type to jobs and quotes so its notes
-- (code rules, special tools, gotchas) can surface while quoting
-- and while working the job.

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS job_type_id uuid,
ADD CONSTRAINT fk_jobs_job_type
  FOREIGN KEY (org_id, job_type_id) REFERENCES job_types(org_id, id);

CREATE INDEX idx_jobs_job_type ON jobs(job_type_id) WHERE job_type_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS job_type_id uuid,
ADD CONSTRAINT fk_quotes_job_type
  FOREIGN KEY (org_id, job_type_id) REFERENCES job_types(org_id, id);

CREATE INDEX idx_quotes_job_type ON quotes(job_type_id) WHERE job_type_id IS NOT NULL AND deleted_at IS NULL;
