import type { Invoice } from "@/domain/invoices/types";

import type { CreateInvoiceInput, UpdateInvoiceInput } from "@/data/repositories/invoices.repo";
import type { RepositoryMapper } from "@/data/mappers/shared";

export interface InvoiceRow {
  id: string;
  org_id: string;
  job_id: string | null;
  contact_id: string;
  number: string;
  status: Invoice["status"];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  due_date: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const invoicesMapper: RepositoryMapper<
  InvoiceRow,
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  Partial<InvoiceRow>,
  Partial<InvoiceRow>
> = {
  toDomain(row) {
    return {
      id: row.id as Invoice["id"],
      orgId: row.org_id as Invoice["orgId"],
      jobId: row.job_id as Invoice["jobId"],
      contactId: row.contact_id as Invoice["contactId"],
      number: row.number,
      status: row.status,
      issueDate: null,
      dueDate: row.due_date,
      sentAt: row.sent_at,
      viewedAt: row.viewed_at,
      paidAt: row.paid_at,
      subtotal: row.subtotal,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      total: row.total,
      amountPaid: row.amount_paid,
      balanceDue: row.balance_due,
      createdBy: row.created_by as Invoice["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      contact_id: input.contactId,
      job_id: input.jobId ?? null,
      due_date: input.dueDate ?? null,
    };
  },
  toPatch(input) {
    return {
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
      ...(input.sentAt !== undefined ? { sent_at: input.sentAt } : {}),
      ...(input.viewedAt !== undefined ? { viewed_at: input.viewedAt } : {}),
    };
  },
};
