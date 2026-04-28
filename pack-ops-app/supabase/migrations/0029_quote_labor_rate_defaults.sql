ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS labor_cost_rate numeric(10,2) NOT NULL DEFAULT 65 CHECK (labor_cost_rate >= 0),
  ADD COLUMN IF NOT EXISTS labor_sell_rate numeric(10,2) NOT NULL DEFAULT 95 CHECK (labor_sell_rate >= 0);

UPDATE quotes
SET
  labor_cost_rate = COALESCE(labor_cost_rate, 65),
  labor_sell_rate = COALESCE(NULLIF(labor_sell_rate, 0), NULLIF(labor_rate, 0), 95)
WHERE TRUE;
