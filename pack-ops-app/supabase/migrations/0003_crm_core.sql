
CREATE TABLE contacts (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type          contact_type  NOT NULL DEFAULT 'person',
  name          text          NOT NULL,
  company_name  text,                   -- populated when type = 'person' and they have a company
  email         text,
  phone         text,
  -- Address stored as flat fields, not jsonb, for queryability
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  postcode      text,
  country       text          NOT NULL DEFAULT 'CA',
  tags          text[]        NOT NULL DEFAULT '{}',
  notes         text,
  created_by    uuid          REFERENCES users(id),
  updated_by    uuid          REFERENCES users(id),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX idx_contacts_org        ON contacts(org_id)                       WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_name_trgm  ON contacts USING GIN(name gin_trgm_ops); -- fuzzy name search
CREATE INDEX idx_contacts_email      ON contacts(org_id, email)                WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_contacts_tags       ON contacts USING GIN(tags);


-- ============================================================
-- LEADS
-- A sales engagement with a contact.
-- One contact can have many leads over time (repeat business, separate projects).
-- ============================================================

CREATE TABLE leads (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid         NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id       uuid         NOT NULL,
  assigned_to      uuid         REFERENCES users(id),
  status           lead_status  NOT NULL DEFAULT 'new',
  source           lead_source  NOT NULL DEFAULT 'other',
  title            text         NOT NULL,
  description      text,
  estimated_value  numeric(12,2),
  -- Populated automatically by status transition trigger
  won_at           timestamptz,
  lost_at          timestamptz,
  lost_reason      text,
  created_by       uuid         REFERENCES users(id),
  updated_by       uuid         REFERENCES users(id),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_leads_contact
    FOREIGN KEY (org_id, contact_id) REFERENCES contacts(org_id, id)
);

CREATE INDEX idx_leads_org      ON leads(org_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_contact  ON leads(contact_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON leads(assigned_to)     WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status   ON leads(org_id, status)  WHERE deleted_at IS NULL;


-- ============================================================
-- QUOTES
-- A priced proposal attached to a lead (or directly to a contact).
-- Accepted quotes create a job. Accepted quotes are locked (immutable).
-- Revisions create a new quote with parent_quote_id reference.
-- ============================================================

CREATE TABLE quotes (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- A quote may come from a lead (pipeline flow) or be created directly (office flow)
  lead_id          uuid,
  contact_id       uuid          NOT NULL,
  number           text          NOT NULL,   -- e.g. Q-1001
  version          integer       NOT NULL DEFAULT 1,
  -- Revision chain: rejected/expired quotes can be revised
  parent_quote_id  uuid,
  status           quote_status  NOT NULL DEFAULT 'draft',
  title            text          NOT NULL,
  internal_notes   text,
  customer_notes   text,         -- printed on PDF
  subtotal         numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate         numeric(5,4)  NOT NULL DEFAULT 0,  -- e.g. 0.1000 = 10%
  tax_amount       numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,
  expires_at       timestamptz,
  -- Timestamps set by status transition trigger
  sent_at          timestamptz,
  viewed_at        timestamptz,
  accepted_at      timestamptz,
  rejected_at      timestamptz,
  rejection_reason text,
  created_by       uuid          REFERENCES users(id),
  updated_by       uuid          REFERENCES users(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  UNIQUE (org_id, number),
  UNIQUE (org_id, id),
  CONSTRAINT fk_quotes_lead
    FOREIGN KEY (org_id, lead_id) REFERENCES leads(org_id, id),
  CONSTRAINT fk_quotes_contact
    FOREIGN KEY (org_id, contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_quotes_parent
    FOREIGN KEY (org_id, parent_quote_id) REFERENCES quotes(org_id, id)
);

CREATE INDEX idx_quotes_org      ON quotes(org_id)              WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_contact  ON quotes(contact_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_lead     ON quotes(lead_id)             WHERE lead_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_quotes_status   ON quotes(org_id, status)      WHERE deleted_at IS NULL;
-- Partial index for expiry check (time-based automation scans this)
CREATE INDEX idx_quotes_expires  ON quotes(expires_at)
  WHERE status IN ('sent', 'viewed') AND deleted_at IS NULL;


-- ============================================================
-- QUOTE LINE ITEMS
-- ============================================================

CREATE TABLE quote_line_items (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  quote_id         uuid          NOT NULL,
  -- Optional link to catalog item — description/price snapshot stored here
  -- so catalog changes don't alter existing quotes
  catalog_item_id  uuid,         -- FK to catalog_items added after that table
  description      text          NOT NULL,
  unit             text          NOT NULL DEFAULT 'each',
  unit_price       numeric(12,2) NOT NULL DEFAULT 0,
  quantity         numeric(10,3) NOT NULL DEFAULT 1,
  discount_percent numeric(5,2)  NOT NULL DEFAULT 0,
  subtotal         numeric(12,2) NOT NULL DEFAULT 0,  -- calculated: (unit_price * qty) * (1 - discount/100)
  sort_order       integer       NOT NULL DEFAULT 0,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT fk_qli_quote
    FOREIGN KEY (org_id, quote_id) REFERENCES quotes(org_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_qli_quote ON quote_line_items(quote_id);


