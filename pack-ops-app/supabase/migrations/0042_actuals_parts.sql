ALTER TABLE job_materials
  ADD COLUMN IF NOT EXISTS section_name text;

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS section_name text;
