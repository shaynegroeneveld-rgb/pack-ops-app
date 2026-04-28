-- ============================================================
-- Pack Ops — Complete Database Schema
-- Phase 0: Foundation
-- ============================================================
-- Execution order matters. Read top to bottom.
-- All FK additions that would create circular dependencies
-- are deferred with ALTER TABLE at the end of each section.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- trigram indexes for name search


-- ============================================================
-- ENUM TYPES
-- ============================================================

-- Users
CREATE TYPE user_role AS ENUM (
  'owner',
  'office',
  'field',
  'bookkeeper'
);

-- Contacts
CREATE TYPE contact_type AS ENUM (
  'person',
  'company'
);

-- Leads
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'unresponsive',
  'lost',
  'won'
);

CREATE TYPE lead_source AS ENUM (
  'referral',
  'website',
  'cold_call',
  'repeat_customer',
  'social_media',
  'other'
);

-- Quotes
CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired'
);

-- Jobs
CREATE TYPE job_status AS ENUM (
  'scheduled',
  'in_progress',
  'waiting',
  'work_complete',
  'ready_to_invoice',
  'invoiced',
  'closed',
  'cancelled'
);

CREATE TYPE job_waiting_reason AS ENUM (
  'parts',
  'permit',
  'customer_decision',
  'weather',
  'other'
);

CREATE TYPE job_assignment_role AS ENUM (
  'lead',
  'technician',
  'helper'
);

-- Invoices
CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'void'
);

-- Payments
CREATE TYPE payment_method AS ENUM (
  'cash',
  'check',
  'bank_transfer',
  'credit_card',
  'stripe',
  'other'
);

-- Time entries
CREATE TYPE time_entry_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- Expenses
CREATE TYPE expense_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE expense_category AS ENUM (
  'materials',
  'equipment',
  'subcontractor',
  'fuel',
  'permits',
  'travel',
  'other'
);

-- Documents
CREATE TYPE document_category AS ENUM (
  'permit',
  'contract',
  'signature',
  'receipt',
  'report',
  'photo',
  'other'
);

-- Action items
CREATE TYPE action_item_category AS ENUM (
  'follow_up',
  'approve_time',
  'create_invoice',
  'resolve_overdue',
  'review_budget',
  'schedule_job',
  'other'
);

CREATE TYPE action_item_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE action_item_status AS ENUM (
  'open',
  'snoozed',
  'resolved',
  'dismissed'
);

-- Automation
CREATE TYPE automation_trigger_type AS ENUM (
  'status_changed',
  'field_value',
  'time_elapsed',
  'no_activity',
  'scheduled',
  'webhook_received'
);

CREATE TYPE automation_action_type AS ENUM (
  'create_action_item',
  'send_notification',
  'send_email',
  'update_field',
  'webhook_post'
);

-- Audit
CREATE TYPE audit_operation AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE'
);


