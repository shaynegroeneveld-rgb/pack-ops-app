-- ============================================================
-- JOBS
-- The structural center of the schema.
-- Every other operational entity references jobs.
-- Jobs can be created from a quote (pipeline flow) or directly (field flow).
-- ============================================================

CREATE TABLE jobs (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid                NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id      uuid                NOT NULL,
  -- Nullable: emergency callouts, T&M work, and repeat jobs have no quote
  quote_id        uuid,
  number          text                NOT NULL,   -- e.g. J-1001
  title           text                NOT NULL,
  description     text,
  status          job_status          NOT NULL DEFAULT 'scheduled',
  -- Only populated when status = 'waiting'. Enforced by CHECK constraint below.
  waiting_reason  job_waiting_reason,
  -- Schedule
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  -- Actual times set by status transition trigger
  actual_start    timestamptz,
  actual_end      timestamptz,
  -- Estimates carried over from quote at job creation (snapshot, not live-linked)
  estimated_hours numeric(8,2),
  estimated_cost  numeric(12,2),
  -- Job site address (may differ from contact address)
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  postcode        text,
  tags            text[]              NOT NULL DEFAULT '{}',
  internal_notes  text,
  created_by      uuid                REFERENCES users(id),
  updated_by      uuid                REFERENCES users(id),
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (org_id, number),
  UNIQUE (org_id, id),
  -- waiting_reason must be set when status is 'waiting'
  CONSTRAINT chk_waiting_reason_required
    CHECK (status != 'waiting' OR waiting_reason IS NOT NULL),
  -- waiting_reason must be null when status is not 'waiting'
  CONSTRAINT chk_waiting_reason_only_when_waiting
    CHECK (status = 'waiting' OR waiting_reason IS NULL),
  CONSTRAINT fk_jobs_contact
    FOREIGN KEY (org_id, contact_id) REFERENCES contacts(org_id, id),
  CONSTRAINT fk_jobs_quote
    FOREIGN KEY (org_id, quote_id) REFERENCES quotes(org_id, id)
);

CREATE INDEX idx_jobs_org        ON jobs(org_id)                   WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_contact    ON jobs(contact_id)               WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_status     ON jobs(org_id, status)           WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_scheduled  ON jobs(org_id, scheduled_start)  WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_quote      ON jobs(quote_id)                 WHERE quote_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_jobs_tags       ON jobs USING GIN(tags);
-- Partial index for scheduling automation (active jobs only)
CREATE INDEX idx_jobs_active     ON jobs(org_id, scheduled_start)
  WHERE status NOT IN ('closed', 'cancelled') AND deleted_at IS NULL;


-- ============================================================
-- JOB ASSIGNMENTS
-- Many-to-many between jobs and users with a role per assignment.
-- ============================================================

CREATE TABLE job_assignments (
  id           uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid                 NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id       uuid                 NOT NULL,
  user_id      uuid                 NOT NULL,
  role         job_assignment_role  NOT NULL DEFAULT 'technician',
  assigned_by  uuid                 REFERENCES users(id),
  assigned_at  timestamptz          NOT NULL DEFAULT now(),
  created_at   timestamptz          NOT NULL DEFAULT now(),
  updated_at   timestamptz          NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  -- Prevent duplicate assignment to same job
  UNIQUE (job_id, user_id),
  CONSTRAINT fk_job_assignments_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_job_assignments_user
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);

CREATE INDEX idx_job_assignments_job  ON job_assignments(job_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_job_assignments_user ON job_assignments(user_id)  WHERE deleted_at IS NULL;


-- ============================================================
-- SCHEDULE BLOCKS
-- Block a user's availability (holiday, training, sick leave).
-- Referenced during scheduling conflict detection.
-- ============================================================

CREATE TABLE schedule_blocks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  title       text        NOT NULL,
  reason      text,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  is_all_day  boolean     NOT NULL DEFAULT false,
  created_by  uuid        REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT chk_schedule_block_order CHECK (end_at > start_at),
  CONSTRAINT fk_schedule_blocks_user
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);

CREATE INDEX idx_schedule_blocks_user ON schedule_blocks(user_id, start_at)  WHERE deleted_at IS NULL;
CREATE INDEX idx_schedule_blocks_org  ON schedule_blocks(org_id, start_at)   WHERE deleted_at IS NULL;


-- ============================================================
-- INVOICES
-- balance_due is a generated column: always = total - amount_paid.
-- amount_paid is updated automatically by payment trigger.
-- ============================================================

CREATE TABLE invoices (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid            NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id          uuid            NOT NULL,
  contact_id      uuid            NOT NULL,
  number          text            NOT NULL,   -- e.g. INV-1001
  status          invoice_status  NOT NULL DEFAULT 'draft',
  subtotal        numeric(12,2)   NOT NULL DEFAULT 0,
  tax_rate        numeric(5,4)    NOT NULL DEFAULT 0,
  tax_amount      numeric(12,2)   NOT NULL DEFAULT 0,
  total           numeric(12,2)   NOT NULL DEFAULT 0,
  amount_paid     numeric(12,2)   NOT NULL DEFAULT 0,
  -- Generated column: never written directly, always derived
  balance_due     numeric(12,2)   GENERATED ALWAYS AS (total - amount_paid) STORED,
  due_date        date,
  -- Timestamps set by status transition trigger
  sent_at         timestamptz,
  viewed_at       timestamptz,
  paid_at         timestamptz,
  internal_notes  text,
  customer_notes  text,
  created_by      uuid            REFERENCES users(id),
  updated_by      uuid            REFERENCES users(id),
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (org_id, number),
  UNIQUE (org_id, id),
  CONSTRAINT fk_invoices_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_invoices_contact
    FOREIGN KEY (org_id, contact_id) REFERENCES contacts(org_id, id)
);

CREATE INDEX idx_invoices_org      ON invoices(org_id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_job      ON invoices(job_id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_contact  ON invoices(contact_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status   ON invoices(org_id, status)    WHERE deleted_at IS NULL;
-- Partial index for overdue detection (automation time-based engine scans this)
CREATE INDEX idx_invoices_due      ON invoices(due_date)
  WHERE status NOT IN ('paid', 'void') AND deleted_at IS NULL;


-- ============================================================
-- INVOICE LINE ITEMS
-- Copied from quote line items at invoice creation (snapshot).
-- Changes to a quote after job creation do not affect the invoice.
-- ============================================================

CREATE TABLE invoice_line_items (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id  uuid          NOT NULL,
  description text          NOT NULL,
  unit        text          NOT NULL DEFAULT 'each',
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  quantity    numeric(10,3) NOT NULL DEFAULT 1,
  subtotal    numeric(12,2) NOT NULL DEFAULT 0,
  sort_order  integer       NOT NULL DEFAULT 0,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT fk_ili_invoice
    FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_ili_invoice ON invoice_line_items(invoice_id);


-- ============================================================
-- PAYMENTS
-- Multiple payments per invoice support partial pay.
-- Inserting a payment triggers recalculation of invoice.amount_paid.
-- ============================================================

CREATE TABLE payments (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid            NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id   uuid            NOT NULL,
  amount       numeric(12,2)   NOT NULL CHECK (amount > 0),
  method       payment_method  NOT NULL DEFAULT 'other',
  -- Free-form reference: cheque number, transaction ID, Stripe payment intent ID
  reference    text,
  received_at  date            NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  recorded_by  uuid            REFERENCES users(id),
  created_at   timestamptz     NOT NULL DEFAULT now(),
  updated_at   timestamptz     NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT fk_payments_invoice
    FOREIGN KEY (org_id, invoice_id) REFERENCES invoices(org_id, id)
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_org     ON payments(org_id)      WHERE deleted_at IS NULL;


-- ============================================================
-- TIME ENTRIES
-- ============================================================

CREATE TABLE time_entries (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid               NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id           uuid               NOT NULL,
  user_id          uuid               NOT NULL,
  date             date               NOT NULL,
  hours            numeric(6,2)       NOT NULL CHECK (hours > 0 AND hours <= 24),
  description      text,
  status           time_entry_status  NOT NULL DEFAULT 'pending',
  is_billable      boolean            NOT NULL DEFAULT true,
  -- Hourly rate snapshot: captured at submission time from users.hourly_rate
  -- Immutable once set — rate changes do not retroactively alter cost data
  hourly_rate      numeric(10,2),
  -- Set by status transition trigger when status → approved
  approved_by      uuid               REFERENCES users(id),
  approved_at      timestamptz,
  rejected_reason  text,
  created_by       uuid               REFERENCES users(id),
  updated_by       uuid               REFERENCES users(id),
  created_at       timestamptz        NOT NULL DEFAULT now(),
  updated_at       timestamptz        NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT fk_time_entries_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_time_entries_user
    FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);

CREATE INDEX idx_time_entries_job    ON time_entries(job_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_time_entries_user   ON time_entries(user_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_time_entries_status ON time_entries(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_time_entries_date   ON time_entries(org_id, date)   WHERE deleted_at IS NULL;
-- Partial index: pending entries needing approval
CREATE INDEX idx_time_entries_pending ON time_entries(org_id, job_id)
  WHERE status = 'pending' AND deleted_at IS NULL;


-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE expenses (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid              NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id           uuid              NOT NULL,
  submitted_by     uuid              NOT NULL,
  approved_by      uuid              REFERENCES users(id),
  category         expense_category  NOT NULL DEFAULT 'other',
  description      text              NOT NULL,
  amount           numeric(12,2)     NOT NULL CHECK (amount > 0),
  receipt_url      text,
  status           expense_status    NOT NULL DEFAULT 'pending',
  rejected_reason  text,
  expense_date     date              NOT NULL DEFAULT CURRENT_DATE,
  approved_at      timestamptz,
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT fk_expenses_job
    FOREIGN KEY (org_id, job_id) REFERENCES jobs(org_id, id),
  CONSTRAINT fk_expenses_submitted_by
    FOREIGN KEY (org_id, submitted_by) REFERENCES users(org_id, id)
);

CREATE INDEX idx_expenses_job    ON expenses(job_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_user   ON expenses(submitted_by)   WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_status ON expenses(org_id, status) WHERE deleted_at IS NULL;


