export const USER_ROLES = ["owner", "office", "field", "bookkeeper"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONTACT_TYPES = ["person", "company"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "quoting",
  "waiting",
  "lost",
  "won",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "referral",
  "website",
  "cold_call",
  "repeat_customer",
  "social_media",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const JOB_STATUSES = [
  "scheduled",
  "in_progress",
  "waiting",
  "work_complete",
  "ready_to_invoice",
  "invoiced",
  "closed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_WAITING_REASONS = [
  "parts",
  "permit",
  "customer_decision",
  "weather",
  "other",
] as const;
export type JobWaitingReason = (typeof JOB_WAITING_REASONS)[number];

export const JOB_ASSIGNMENT_ROLES = ["lead", "technician", "helper"] as const;
export type JobAssignmentRole = (typeof JOB_ASSIGNMENT_ROLES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "check",
  "bank_transfer",
  "credit_card",
  "stripe",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TIME_ENTRY_STATUSES = ["pending", "approved", "rejected"] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "materials",
  "equipment",
  "subcontractor",
  "fuel",
  "permits",
  "travel",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DOCUMENT_CATEGORIES = [
  "permit",
  "contract",
  "signature",
  "receipt",
  "report",
  "photo",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const ACTION_ITEM_CATEGORIES = [
  "follow_up",
  "approve_time",
  "create_invoice",
  "resolve_overdue",
  "review_budget",
  "schedule_job",
  "other",
] as const;
export type ActionItemCategory = (typeof ACTION_ITEM_CATEGORIES)[number];

export const ACTION_ITEM_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

export const ACTION_ITEM_STATUSES = ["open", "snoozed", "resolved", "dismissed"] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const AUTOMATION_TRIGGER_TYPES = [
  "status_changed",
  "field_value",
  "time_elapsed",
  "no_activity",
  "scheduled",
  "webhook_received",
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  "create_action_item",
  "send_notification",
  "send_email",
  "update_field",
  "webhook_post",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const AUDIT_OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;
export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

export const ENTITY_TYPES = [
  "contacts",
  "leads",
  "quotes",
  "jobs",
  "invoices",
  "payments",
  "time_entries",
  "expenses",
  "action_items",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
