import type { Invoice } from "@/domain/invoices/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface InvoiceFilter {
  statuses?: Invoice["status"][];
  contactId?: Invoice["contactId"];
}

export interface CreateInvoiceInput {
  contactId: Invoice["contactId"];
  jobId?: Invoice["jobId"];
  issueDate?: string | null;
  dueDate?: string | null;
}

export interface UpdateInvoiceInput {
  issueDate?: string | null;
  dueDate?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
}

export type InvoicesRepository = Repository<
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  InvoiceFilter
>;
