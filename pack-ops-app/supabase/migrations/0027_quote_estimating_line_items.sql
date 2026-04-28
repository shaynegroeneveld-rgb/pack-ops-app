ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS labor_rate numeric(10,2) NOT NULL DEFAULT 0 CHECK (labor_rate >= 0);

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'material', 'assembly')),
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'item' CHECK (line_kind IN ('item', 'labor')),
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_sell numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total_sell numeric(12,2) NOT NULL DEFAULT 0;

UPDATE quote_line_items
SET
  unit_sell = COALESCE(unit_sell, unit_price),
  line_total_sell = COALESCE(line_total_sell, subtotal),
  unit_cost = COALESCE(unit_cost, 0),
  line_total_cost = COALESCE(line_total_cost, 0)
WHERE TRUE;
