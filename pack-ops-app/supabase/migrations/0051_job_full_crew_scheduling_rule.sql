ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS requires_full_crew_together boolean NOT NULL DEFAULT false;
