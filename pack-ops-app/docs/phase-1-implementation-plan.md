# Phase 1 Implementation Plan

## Scope

Phase 1 prepares Pack Ops for implementation without building feature UI.

Deliverables:

- ordered SQL migrations from the reviewed schema
- domain contracts for entities, IDs, enums, DTOs, and derived helpers
- app folder structure
- Supabase client scaffolding
- Dexie local sync scaffolding
- auth, org, and permission shell

## Implementation Order

1. Split the reviewed schema into dependency-safe migrations.
2. Lock shared domain primitives: IDs, enums, entity refs, audit/base DTOs.
3. Add per-entity domain contracts and derived helper boundaries.
4. Scaffold the data layer with repository and sync seams.
5. Scaffold auth, org, and permission shells for later route protection.
6. Leave feature/UI folders empty until the domain/data contracts are stable.

## Migration Breakdown

1. `0001_extensions_and_enums.sql`
   Purpose: PostgreSQL extensions and shared enum definitions.
2. `0002_orgs_and_users.sql`
   Purpose: tenant root tables and user identity model.
3. `0003_crm_core.sql`
   Purpose: contacts, leads, quotes, and quote line items.
4. `0004_workbench_and_money_core.sql`
   Purpose: jobs, assignments, schedule, invoices, payments, time entries, expenses.
5. `0005_library_attachments_automation_tables.sql`
   Purpose: catalog, documents, notes, action items, automation tables, event/audit tables.
6. `0006_functions_and_guards.sql`
   Purpose: helper functions, transition guards, audit/event functions, invoice recompute logic.
7. `0007_triggers.sql`
   Purpose: trigger registration and execution ordering.
8. `0008_rls_policies.sql`
   Purpose: row-level security enablement and policies.
9. `0009_seed_builtin_rules.sql`
   Purpose: built-in automation seed function.

## Layer Responsibilities

### Domain

Owns:

- canonical entity contracts
- enums and branded IDs
- shared DTOs and entity refs
- derived workflow helpers
- automation rule metadata contracts

Does not own:

- network requests
- cache state
- UI state
- Supabase query code

### Data

Owns:

- Supabase client wiring
- IndexedDB schema and outbox
- repositories and persistence adapters
- sync push/pull orchestration
- conflict policy seam

Does not own:

- presentation formatting
- route-level access UX
- component-specific transforms

### Services

Owns:

- auth session interpretation
- current org resolution
- permission checks composed from domain roles/capabilities

Does not own:

- direct UI rendering
- feature-specific view models

### App Shell

Owns:

- route declarations
- app-wide providers
- top-level UI state shell
- auth guard boundaries

Does not own:

- feature workflow logic
- entity derivations
- database rules
