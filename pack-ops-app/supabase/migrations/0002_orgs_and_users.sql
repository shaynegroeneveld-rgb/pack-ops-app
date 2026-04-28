-- ============================================================
-- ORGANISATIONS (multi-tenancy root)
-- ============================================================

CREATE TABLE orgs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  -- Business settings: tax rate, currency, timezone, invoice prefix, etc.
  settings    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-org counters for human-readable reference numbers (Q-1001, J-1002, INV-1003)
-- Using a dedicated table rather than sequences allows per-org numbering
CREATE TABLE org_counters (
  org_id        uuid  NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  counter_type  text  NOT NULL,  -- 'quote' | 'job' | 'invoice'
  last_value    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, counter_type)
);


-- ============================================================
-- USERS
-- Extends Supabase auth.users. One profile per auth identity.
-- ============================================================

CREATE TABLE users (
  -- FK to Supabase auth.users — cascades on auth deletion
  id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id            uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  full_name         text        NOT NULL,
  email             text        NOT NULL,
  phone             text,
  role              user_role   NOT NULL DEFAULT 'field',
  -- Capability flags: additive permissions on top of base role
  is_foreman        boolean     NOT NULL DEFAULT false,
  can_approve_time  boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  avatar_url        text,
  -- Snapshot rate used for job cost calculations on time entries
  hourly_rate       numeric(10,2),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX idx_users_org    ON users(org_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role   ON users(org_id, role)  WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(org_id)        WHERE is_active = true AND deleted_at IS NULL;


-- ============================================================
-- CONTACTS
-- Permanent record of a person or company. Never changes type.
-- "Customer" is derived (has at least one scheduled job), not stored.
-- ============================================================
