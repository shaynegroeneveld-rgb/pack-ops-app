import type { InvoiceStatus } from "@/domain/enums";
import type { ContactId, InvoiceId, InvoiceLineItemId, JobId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Invoice extends AuditedEntity {
  id: InvoiceId;
  orgId: OrgId;
  jobId: JobId | null;
  contactId: ContactId;
  number: string;
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  createdBy: UserId | null;
}

export interface InvoiceLineItem extends AuditedEntity {
  id: InvoiceLineItemId;
  orgId: OrgId;
  invoiceId: InvoiceId;
  sortOrder: number;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type InvoiceGenerationSource = "quote" | "actuals";

export interface InvoicePreviewCompany {
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLines: string[];
  logoDataUrl: string | null;
}

export interface InvoicePreviewCustomer {
  customerName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}

export interface InvoicePreviewLine {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sectionName?: string | null;
  category?: "material" | "labor" | "other";
  note?: string | null;
  unitCost?: number | null;
  markupPercent?: number | null;
  sourceKind?: "quote-line" | "actual-material" | "actual-labor" | "manual";
  generatedSourceId?: string | null;
  origin?: "generated" | "manual";
  isEdited?: boolean;
}

export interface EditableInvoiceDraftLine extends InvoicePreviewLine {
  origin: "generated" | "manual";
  isEdited: boolean;
}

export interface SavedInvoiceLine {
  id: InvoiceLineItemId;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sectionName: string | null;
  sortOrder: number;
}

export interface SavedInvoiceSummary {
  id: InvoiceId;
  jobId: JobId;
  contactId: ContactId;
  number: string;
  status: InvoiceStatus;
  createdAt: string;
  dueDate: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  customerNotes: string | null;
  internalNotes: string | null;
  lines: SavedInvoiceLine[];
}

export interface ActualInvoiceControls {
  materialMarkupPercent: number;
  laborSellRate: number;
  taxRate: number;
  invoicePartName?: string | null;
}

export interface ActualsInvoiceMaterialInput {
  id: string;
  catalogItemId: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  note: string | null;
  sectionName?: string | null;
}

export interface ActualsInvoiceLaborInput {
  id: string;
  description: string;
  hours: number;
  note: string | null;
  sectionName?: string | null;
}

export interface ActualsInvoicePreviewBase {
  source: "actuals";
  jobId: JobId;
  contactId: ContactId;
  company: InvoicePreviewCompany;
  customer: InvoicePreviewCustomer;
  invoiceNumberPreview: string;
  issueDate: string;
  jobReference: string;
  customerNotes: string | null;
  internalNotes: string | null;
  materials: ActualsInvoiceMaterialInput[];
  labor: ActualsInvoiceLaborInput[];
}

export interface InvoiceGenerationPreview {
  source: InvoiceGenerationSource;
  jobId: JobId;
  contactId: ContactId;
  company: InvoicePreviewCompany;
  customer: InvoicePreviewCustomer;
  invoiceNumberPreview: string;
  issueDate: string;
  jobReference: string;
  lines: InvoicePreviewLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  customerNotes: string | null;
  internalNotes: string | null;
  actualInvoiceControls: ActualInvoiceControls | null;
}
