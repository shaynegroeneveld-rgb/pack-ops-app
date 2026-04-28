ALTER TABLE schedule_blocks
  ADD COLUMN time_bucket text NOT NULL DEFAULT 'anytime'
  CHECK (time_bucket IN ('am', 'pm', 'anytime'));
