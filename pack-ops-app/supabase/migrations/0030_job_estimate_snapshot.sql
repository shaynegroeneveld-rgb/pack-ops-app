ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS estimate_snapshot jsonb;
