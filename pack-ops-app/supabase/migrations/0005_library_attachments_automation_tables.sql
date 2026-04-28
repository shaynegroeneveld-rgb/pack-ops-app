-- ============================================================
-- CATALOG ITEMS
-- Price list for services and materials.
-- Quoted prices are snapshots; catalog changes don't alter sent quotes.
-- ============================================================

CREATE TABLE catalog_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  category     text,
  unit         text        NOT NULL DEFAULT 'each',
  unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  cost_price   numeric(12,2),             -- internal cost (not shown to customer)
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES users(id),
  updated_by   uuid        REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX idx_catalog_org    ON catalog_items(org_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_catalog_active ON catalog_items(org_id)          WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_catalog_name   ON catalog_items USING GIN(name gin_trgm_ops);

-- Now that catalog_items exists, add the deferred FK from quote_line_items
ALTER TABLE quote_line_items
  ADD CONSTRAINT fk_qli_catalog_item
  FOREIGN KEY (org_id, catalog_item_id) REFERENCES catalog_items(org_id, id);


-- ============================================================
-- DOCUMENTS (polymorphic attachment)
-- Attaches to any entity via entity_type + entity_id.
-- File content lives in Supabase Storage; this table is the metadata record.
-- ============================================================

CREATE TABLE documents (
  id            uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid               NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type   text               NOT NULL,
  entity_id     uuid               NOT NULL,
  category      document_category  NOT NULL DEFAULT 'other',
  display_name  text               NOT NULL,
  storage_path  text               NOT NULL,  -- Supabase Storage bucket path
  file_size     bigint,
  mime_type     text,
  uploaded_by   uuid               REFERENCES users(id),
  -- verified_at: owner or office confirms a document (e.g. permit is approved)
  verified_at   timestamptz,
  verified_by   uuid               REFERENCES users(id),
  created_at    timestamptz        NOT NULL DEFAULT now(),
  updated_at    timestamptz        NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_org    ON documents(org_id)                  WHERE deleted_at IS NULL;


-- ============================================================
-- NOTES (polymorphic)
-- Timestamped text notes on any entity.
-- is_internal = false means the note is customer-visible (e.g. on invoice PDF).
-- ============================================================

CREATE TABLE notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  body         text        NOT NULL,
  is_internal  boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_org    ON notes(org_id)                  WHERE deleted_at IS NULL;


-- ============================================================
-- ACTION ITEMS (the work queue)
-- Every automation output lands here.
-- Also manually creatable by office/owner.
-- The deduplication index prevents duplicate open items per entity+category.
-- ============================================================

CREATE TABLE action_items (
  id                  uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid                  NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type         text                  NOT NULL,
  entity_id           uuid                  NOT NULL,
  category            action_item_category  NOT NULL,
  priority            action_item_priority  NOT NULL DEFAULT 'normal',
  title               text                  NOT NULL,
  description         text,
  assigned_to         uuid                  REFERENCES users(id),
  due_at              timestamptz,
  status              action_item_status    NOT NULL DEFAULT 'open',
  snoozed_until       timestamptz,
  -- Set when status → snoozed, cleared when status → open
  -- automation_rule_id FK added after automation_rules table is created
  automation_rule_id  uuid,
  resolved_by         uuid                  REFERENCES users(id),
  resolved_at         timestamptz,
  dismissed_by        uuid                  REFERENCES users(id),
  dismissed_at        timestamptz,
  -- NULL = system-created by automation engine
  created_by          uuid                  REFERENCES users(id),
  created_at          timestamptz           NOT NULL DEFAULT now(),
  updated_at          timestamptz           NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_action_items_org      ON action_items(org_id)                  WHERE deleted_at IS NULL;
CREATE INDEX idx_action_items_entity   ON action_items(entity_type, entity_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_action_items_assigned ON action_items(assigned_to, status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_action_items_status   ON action_items(org_id, status)          WHERE deleted_at IS NULL;
CREATE INDEX idx_action_items_due      ON action_items(due_at)
  WHERE status = 'open' AND deleted_at IS NULL;
-- Deduplication: only one open/snoozed action item per entity+category at a time
-- Prevents the automation engine from spamming duplicate items
CREATE UNIQUE INDEX idx_action_items_dedup
  ON action_items(entity_type, entity_id, category)
  WHERE status IN ('open', 'snoozed') AND deleted_at IS NULL;


-- ============================================================
-- AUTOMATION RULES
-- Stored configuration for the automation engine.
-- is_builtin = true rules are seeded per org and cannot be deleted,
-- only muted (is_muted = true).
-- ============================================================

CREATE TABLE automation_rules (
  id                uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid                      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name              text                      NOT NULL,
  description       text,
  is_builtin        boolean                   NOT NULL DEFAULT false,
  is_enabled        boolean                   NOT NULL DEFAULT true,
  -- Orgs can mute builtin rules without deleting them
  is_muted          boolean                   NOT NULL DEFAULT false,
  trigger_type      automation_trigger_type   NOT NULL,
  -- Structured config for the trigger condition
  -- Example: {"entity_type":"jobs","status":"in_progress","activity_type":"time_entry","threshold_hours":48}
  trigger_config    jsonb                     NOT NULL DEFAULT '{}',
  -- Optional secondary condition evaluated after trigger fires
  -- Example: {"field":"status","operator":"not_in","values":["paid","void"]}
  condition_config  jsonb,
  action_type       automation_action_type    NOT NULL,
  -- Structured config for the action
  -- Example: {"category":"create_invoice","priority":"high","assign_to_role":"office"}
  action_config     jsonb                     NOT NULL DEFAULT '{}',
  -- Updated by engine after each evaluation pass
  last_evaluated_at timestamptz,
  execution_count   integer                   NOT NULL DEFAULT 0,
  created_by        uuid                      REFERENCES users(id),
  created_at        timestamptz               NOT NULL DEFAULT now(),
  updated_at        timestamptz               NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_automation_rules_org     ON automation_rules(org_id)                   WHERE deleted_at IS NULL;
-- Index for the time-based engine: fetch all enabled, unmuted rules by trigger type
CREATE INDEX idx_automation_rules_active  ON automation_rules(org_id, trigger_type)
  WHERE is_enabled = true AND is_muted = false AND deleted_at IS NULL;

-- Now that automation_rules exists, add the deferred FK from action_items
ALTER TABLE action_items
  ADD CONSTRAINT fk_action_items_rule
  FOREIGN KEY (automation_rule_id) REFERENCES automation_rules(id);


-- ============================================================
-- ENTITY EVENTS (append-only event stream)
-- Written by triggers on every significant entity change.
-- The automation engine's event-based rules subscribe to this stream.
-- Never updated or deleted. bigserial for ordered scanning.
-- ============================================================

CREATE TABLE entity_events (
  id           bigserial   PRIMARY KEY,
  org_id       uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  -- Dot-notation event type: 'job.status_changed', 'invoice.created', 'time_entry.approved'
  event_type   text        NOT NULL,
  -- Structured event payload — shape varies by event_type
  payload      jsonb       NOT NULL DEFAULT '{}',
  -- NULL = emitted by system/trigger (no human actor)
  emitted_by   uuid        REFERENCES users(id),
  emitted_at   timestamptz NOT NULL DEFAULT now()
  -- No updated_at, no deleted_at — this is an immutable append-only log
);

CREATE INDEX idx_entity_events_entity  ON entity_events(entity_type, entity_id);
CREATE INDEX idx_entity_events_type    ON entity_events(org_id, event_type);
CREATE INDEX idx_entity_events_time    ON entity_events(emitted_at);
-- Partial index for automation engine: unprocessed events by type
CREATE INDEX idx_entity_events_recent  ON entity_events(org_id, event_type, emitted_at DESC);


-- ============================================================
-- AUDIT LOG (append-only field-level change log)
-- INSERT: one row with full row snapshot
-- UPDATE: one row per changed field (excludes updated_at, updated_by, balance_due)
-- No hard deletes: soft deletes appear as UPDATE rows with field_name = 'deleted_at'
-- ============================================================

CREATE TABLE audit_log (
  id            bigserial       PRIMARY KEY,
  org_id        uuid            NOT NULL,   -- intentionally no FK: log outlives data
  entity_type   text            NOT NULL,
  entity_id     uuid            NOT NULL,
  operation     audit_operation NOT NULL,
  -- field_name is NULL for INSERT (full row logged in row_snapshot instead)
  field_name    text,
  old_value     text,
  new_value     text,
  -- Full row JSON for INSERT and DELETE operations
  row_snapshot  jsonb,
  -- Intentionally no FK on changed_by: user may be deleted, log must persist
  changed_by    uuid,
  changed_at    timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_time   ON audit_log(changed_at);
CREATE INDEX idx_audit_log_org    ON audit_log(org_id);
-- Index for "what changed on this entity recently" query
CREATE INDEX idx_audit_log_entity_time ON audit_log(entity_id, changed_at DESC);


-- ============================================================
-- STATUS TRANSITIONS (append-only status history)
-- Written by the per-entity transition trigger functions.
-- Provides clean, queryable status history without parsing audit_log.
-- ============================================================

CREATE TABLE status_transitions (
  id               bigserial   PRIMARY KEY,
  org_id           uuid        NOT NULL,   -- intentionally no FK
  entity_type      text        NOT NULL,
  entity_id        uuid        NOT NULL,
  -- NULL from_status = initial status assignment (INSERT)
  from_status      text,
  to_status        text        NOT NULL,
  transitioned_by  uuid,                   -- NULL = system
  transitioned_at  timestamptz NOT NULL DEFAULT now(),
  reason           text
);

CREATE INDEX idx_status_transitions_entity ON status_transitions(entity_type, entity_id);
CREATE INDEX idx_status_transitions_org    ON status_transitions(org_id, entity_type);
CREATE INDEX idx_status_transitions_time   ON status_transitions(transitioned_at);


