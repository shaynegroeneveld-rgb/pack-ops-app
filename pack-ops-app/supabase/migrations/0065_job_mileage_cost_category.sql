ALTER TABLE job_manual_actual_cost_lines
  DROP CONSTRAINT IF EXISTS job_manual_actual_cost_lines_category_check;

ALTER TABLE job_manual_actual_cost_lines
  ADD CONSTRAINT job_manual_actual_cost_lines_category_check
  CHECK (category IN ('labor', 'material', 'mileage', 'equipment', 'subcontractor', 'other'));
