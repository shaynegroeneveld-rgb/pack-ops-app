import type {
  CreateQuoteRecordInput,
  Quote,
  UpdateQuoteRecordInput,
} from "@/domain/quotes/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface QuoteRow {
  id: string;
  org_id: string;
  lead_id: string | null;
  contact_id: string;
  parent_quote_id: string | null;
  number: string;
  version: number;
  status: Quote["status"];
  title: string;
  internal_notes: string | null;
  labor_cost_rate: number;
  labor_sell_rate: number;
  labor_rate: number;
  customer_notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const quotesMapper: RepositoryMapper<
  QuoteRow,
  Quote,
  CreateQuoteRecordInput,
  UpdateQuoteRecordInput,
  Partial<QuoteRow>,
  Partial<QuoteRow>
> = {
  toDomain(row) {
    return {
      id: row.id as Quote["id"],
      orgId: row.org_id as Quote["orgId"],
      leadId: row.lead_id as Quote["leadId"],
      contactId: row.contact_id as Quote["contactId"],
      parentQuoteId: row.parent_quote_id as Quote["parentQuoteId"],
      number: row.number,
      version: row.version,
      status: row.status,
      title: row.title,
      internalNotes: row.internal_notes,
      laborCostRate: row.labor_cost_rate,
      laborSellRate: row.labor_sell_rate,
      customerNotes: row.customer_notes,
      subtotal: row.subtotal,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      total: row.total,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      viewedAt: row.viewed_at,
      acceptedAt: row.accepted_at,
      rejectedAt: row.rejected_at,
      createdBy: row.created_by as Quote["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    const subtotal = roundMoney(input.subtotal ?? 0);
    const taxRate = input.taxRate ?? 0;
    const taxAmount = roundMoney(subtotal * taxRate);
    const total = roundMoney(subtotal + taxAmount);

    return {
      lead_id: input.leadId ?? null,
      contact_id: input.contactId,
      number: input.number,
      title: input.title,
      status: input.status ?? "draft",
      internal_notes: input.internalNotes ?? null,
      labor_cost_rate: input.laborCostRate ?? 65,
      labor_sell_rate: input.laborSellRate ?? 95,
      labor_rate: input.laborSellRate ?? 95,
      customer_notes: input.customerNotes ?? null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      expires_at: input.expiresAt ?? null,
    };
  },
  toPatch(input) {
    const hasSubtotal = input.subtotal !== undefined;
    const hasTaxRate = input.taxRate !== undefined;
    const subtotal = roundMoney(input.subtotal ?? 0);
    const taxRate = input.taxRate ?? 0;
    const taxAmount = roundMoney(subtotal * taxRate);
    const total = roundMoney(subtotal + taxAmount);

    return {
      ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.internalNotes !== undefined ? { internal_notes: input.internalNotes } : {}),
      ...(input.laborCostRate !== undefined ? { labor_cost_rate: input.laborCostRate } : {}),
      ...(input.laborSellRate !== undefined
        ? {
            labor_sell_rate: input.laborSellRate,
            labor_rate: input.laborSellRate,
          }
        : {}),
      ...(input.customerNotes !== undefined ? { customer_notes: input.customerNotes } : {}),
      ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
      ...(hasSubtotal ? { subtotal } : {}),
      ...(hasTaxRate ? { tax_rate: taxRate } : {}),
      ...(hasSubtotal || hasTaxRate ? { tax_amount: taxAmount, total } : {}),
    };
  },
};
