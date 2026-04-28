import type { QuoteStatus } from "@/domain/enums";
import type { Document } from "@/domain/documents/types";
import type { ContactId, JobId, LeadId, OrgId, QuoteId, QuoteLineItemId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export type QuoteLineSourceType = "manual" | "material" | "assembly";
export type QuoteLineKind = "item" | "labor";

export interface Quote extends AuditedEntity {
  id: QuoteId;
  orgId: OrgId;
  leadId: LeadId | null;
  contactId: ContactId;
  parentQuoteId: QuoteId | null;
  number: string;
  version: number;
  status: QuoteStatus;
  title: string;
  internalNotes: string | null;
  customerNotes: string | null;
  subtotal: number;
  laborCostRate: number;
  laborSellRate: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  createdBy: UserId | null;
}

export interface QuoteView extends Quote {
  customerName: string;
  companyName: string | null;
  contactName: string;
  phone: string | null;
  email: string | null;
  siteAddress: string | null;
  linkedLeadLabel: string | null;
  linkedJobId: JobId | null;
  hasLinkedInvoice: boolean;
  attachments: Document[];
  lineItems: QuoteLineItem[];
  materialCostTotal: number;
  laborHoursTotal: number;
  laborCostTotal: number;
  sellSubtotal: number;
}

export interface CreateQuoteRecordInput {
  leadId?: LeadId | null;
  contactId: ContactId;
  number: string;
  title: string;
  status?: QuoteStatus;
  internalNotes?: string | null;
  customerNotes?: string | null;
  subtotal?: number;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  expiresAt?: string | null;
}

export interface UpdateQuoteRecordInput {
  leadId?: LeadId | null;
  title?: string;
  status?: QuoteStatus;
  internalNotes?: string | null;
  customerNotes?: string | null;
  subtotal?: number;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  expiresAt?: string | null;
}

export interface QuoteLineItem extends AuditedEntity {
  id: QuoteLineItemId;
  orgId: OrgId;
  quoteId: QuoteId;
  catalogItemId: string | null;
  sortOrder: number;
  description: string;
  sku: string | null;
  note: string | null;
  sectionName: string | null;
  sourceType: QuoteLineSourceType;
  lineKind: QuoteLineKind;
  quantity: number;
  unit: string;
  unitCost: number;
  unitSell: number;
  lineTotalCost: number;
  lineTotalSell: number;
}

export interface QuoteLineItemInput {
  id?: QuoteLineItemId;
  catalogItemId?: string | null;
  sortOrder?: number;
  description: string;
  sku?: string | null;
  note?: string | null;
  sectionName?: string | null;
  sourceType: QuoteLineSourceType;
  lineKind?: QuoteLineKind;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  unitSell?: number;
}

export interface CustomerQuotePreviewCompany {
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLines: string[];
  logoDataUrl: string | null;
}

export interface CustomerQuotePreview {
  company: CustomerQuotePreviewCompany;
  quote: QuoteView;
  issueDate: string;
  projectSite: string;
  scopeLines: string[];
  suppliedItems: string[];
  termsLines: string[];
}
