# Supabase Workflow

## Required Inputs

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN` for CLI operations

## Phase 1.1 Order

1. `npm run supabase:link`
2. `npm run supabase:db:push`
3. `npm run supabase:types`
4. Run `supabase/seed/0001_dev_org_users.sql`

## Notes

- Client-side invoice status is read-only. Canonical invoice status remains database-owned.
- Repository implementations must map database rows into domain models before they leave the data layer.
- Derived workflow flags must remain in `src/domain/**/derived.ts`.
