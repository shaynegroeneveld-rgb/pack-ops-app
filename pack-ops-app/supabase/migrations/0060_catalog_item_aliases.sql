alter table public.catalog_items
add column if not exists aliases text[] not null default '{}'::text[];
