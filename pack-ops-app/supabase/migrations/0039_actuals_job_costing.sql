alter table public.job_materials
  add column if not exists display_name text,
  add column if not exists sku_snapshot text,
  add column if not exists unit_snapshot text,
  add column if not exists unit_cost numeric(12,2),
  add column if not exists unit_sell numeric(12,2),
  add column if not exists markup_percent numeric(8,2),
  add column if not exists source_assembly_id uuid,
  add column if not exists source_assembly_name text,
  add column if not exists source_assembly_multiplier numeric(10,2);

alter table public.time_entries
  add column if not exists start_time text,
  add column if not exists end_time text;
