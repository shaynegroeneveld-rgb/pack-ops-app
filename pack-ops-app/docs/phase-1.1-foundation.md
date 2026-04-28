# Phase 1.1 Foundation

## Exact Implementation Plan

1. Install the local toolchain and project dependencies.
2. Add Supabase CLI scripts and environment contract.
3. Define seed assets for a minimal dev org and role mix.
4. Finalize repository contracts and mapper boundaries.
5. Finalize Dexie outbox and sync contract shapes.
6. Verify type safety locally.
7. Verify remote migration and typegen path once project-admin credentials are available.

## Dependency List

Runtime:

- `@supabase/supabase-js`
- `@tanstack/react-query`
- `dexie`
- `react`
- `react-dom`
- `zustand`

Dev:

- `typescript`
- `@types/node`
- `@types/react`
- `@types/react-dom`
- `supabase`

Local toolchain:

- workspace-local Node.js runtime in `.tools/node-v22.15.0-darwin-arm64`

## Migration / Apply Steps

1. Export `SUPABASE_ACCESS_TOKEN`.
2. Copy `.env.example` to `.env.local` and set the anon key.
3. Run `npm run supabase:link`.
4. Run `npm run supabase:db:push`.
5. Run `npm run supabase:types`.
6. Apply `supabase/seed/0001_dev_org_users.sql`.

## Repository Contract Design

- Repositories accept command DTOs and optional repository context.
- Repositories return domain entities only.
- Repositories do not expose raw Supabase row shapes.
- Row-to-domain mapping lives in `src/data/mappers`.
- Domain derivations stay in `src/domain/**/derived.ts`.
- Invoice repositories never derive canonical invoice status.

## Sync Contract Design

- Every local mutation becomes a `SyncEnvelope`.
- Outbox items are append-only until acknowledged.
- Pull sync is cursor-based by entity table.
- Conflict resolution strategy stays centralized in `src/data/sync/conflicts.ts`.
- `time_entries` preserve-both on conflict; all other entities default to last-write-wins.

## What Must Be Tested Before Phase 2

1. `npm run typecheck` passes.
2. Supabase CLI can link to the target project.
3. Migrations apply in order with no SQL errors.
4. `src/data/supabase/types.ts` is generated from the linked project.
5. Seed data inserts cleanly after auth users exist.
6. Mapper round-trips are correct for contacts, jobs, and invoices.
7. Dexie outbox entries match the sync envelope contract.
8. No service or repository code computes canonical invoice status.
