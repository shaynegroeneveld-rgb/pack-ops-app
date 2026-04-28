import type {
  CreateFinanceAccountInput,
  CreateFinanceCategoryInput,
  FinanceDocumentIntake,
  CreateFinanceTransactionInput,
  FinanceAccount,
  FinanceApBill,
  FinanceApPayment,
  FinanceArInvoice,
  FinanceArPayment,
  FinanceCategory,
  FinanceImportBatch,
  FinanceMonthlyClose,
  FinanceReconciliationSession,
  FinanceTransaction,
  ImportedTransaction,
  UpdateFinanceAccountInput,
  UpdateFinanceCategoryInput,
  UpdateFinanceTransactionInput,
} from "@/domain/finance/types";

export interface FinanceAccountRow {
  id: string;
  org_id: string;
  name: string;
  type: FinanceAccount["type"];
  institution: string | null;
  last_four: string | null;
  opening_balance: number | string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceCategoryRow {
  id: string;
  org_id: string;
  name: string;
  type: FinanceCategory["type"];
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceTransactionRow {
  id: string;
  org_id: string;
  type: FinanceTransaction["type"];
  status: FinanceTransaction["status"];
  transaction_date: string;
  contact_id: string | null;
  account_id: string;
  category_id: string;
  job_id: string | null;
  document_id: string | null;
  memo: string | null;
  reference_number: string | null;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceImportBatchRow {
  id: string;
  org_id: string;
  source_account_id: string;
  source_type: FinanceImportBatch["sourceType"];
  file_name: string;
  row_count: number;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ImportedTransactionRow {
  id: string;
  org_id: string;
  batch_id: string;
  source_account_id: string;
  status: ImportedTransaction["status"];
  transaction_date: string;
  raw_description: string;
  raw_memo: string | null;
  amount: number | string;
  suggested_contact_id: string | null;
  suggested_category_id: string | null;
  suggested_job_id: string | null;
  suggestion_confidence: number | string;
  suggestion_reason: string | null;
  matched_transaction_id: string | null;
  linked_document_intake_id: string | null;
  receipt_status: ImportedTransaction["receiptStatus"];
  receipt_snoozed_until: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceDocumentIntakeRow {
  id: string;
  org_id: string;
  status: FinanceDocumentIntake["status"];
  source?: FinanceDocumentIntake["source"];
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  file_size?: number | null;
  uploaded_at?: string | null;
  document_type?: FinanceDocumentIntake["documentType"];
  document_type_confidence?: number | string;
  extraction_status?: FinanceDocumentIntake["extractionStatus"];
  extraction_confidence?: number | string;
  extraction_method?: FinanceDocumentIntake["extractionMethod"];
  pdf_text_extracted_at?: string | null;
  pdf_text_char_count?: number | string | null;
  ocr_status?: FinanceDocumentIntake["ocrStatus"];
  ocr_error?: string | null;
  sender_email?: string | null;
  sender_name?: string | null;
  email_subject?: string | null;
  email_received_at?: string | null;
  external_source_id?: string | null;
  gmail_message_id?: string | null;
  gmail_attachment_id?: string | null;
  extracted_vendor: string | null;
  extracted_invoice_number?: string | null;
  extracted_date: string | null;
  extracted_subtotal: number | string | null;
  extracted_tax: number | string | null;
  extracted_total: number | string | null;
  vendor_confidence?: number | string;
  invoice_number_confidence?: number | string;
  invoice_date_confidence?: number | string;
  subtotal_confidence?: number | string;
  tax_confidence?: number | string;
  total_confidence?: number | string;
  normalized_vendor_contact_id?: string | null;
  vendor_normalization_confidence?: number | string;
  extraction_reviewed_by?: string | null;
  extraction_reviewed_at?: string | null;
  suggested_contact_id: string | null;
  suggested_category_id: string | null;
  suggested_job_id: string | null;
  suggestion_confidence: number | string;
  suggestion_reason: string | null;
  linked_transaction_id: string | null;
  linked_imported_transaction_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceReconciliationSessionRow {
  id: string;
  org_id: string;
  account_id: string;
  start_date: string;
  end_date: string;
  opening_balance: number | string | null;
  closing_balance: number | string | null;
  imported_total: number | string;
  matched_total: number | string;
  unreconciled_total: number | string;
  status: FinanceReconciliationSession["status"];
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceMonthlyCloseRow {
  id: string;
  org_id: string;
  month: string;
  status: FinanceMonthlyClose["status"];
  unreconciled_imports_count: number;
  missing_receipts_count: number;
  uncategorized_transactions_count: number;
  draft_transactions_count: number;
  outstanding_invoices_count: number;
  outstanding_bills_count: number;
  possible_duplicates_count: number;
  snoozed_review_items_count: number;
  closed_at: string | null;
  closed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceArInvoiceRow {
  id: string;
  org_id: string;
  invoice_id: string;
  customer_contact_id: string;
  customer_name: string;
  job_id: string | null;
  job_label: string | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  amount_paid: number | string;
  amount_outstanding: number | string;
  status: FinanceArInvoice["status"];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceArPaymentRow {
  id: string;
  org_id: string;
  ar_invoice_id: string;
  imported_transaction_id: string | null;
  paid_at: string;
  amount: number | string;
  reference: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceApBillRow {
  id: string;
  org_id: string;
  vendor_contact_id: string | null;
  vendor_name: string;
  bill_date: string;
  due_date: string | null;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  amount_paid: number | string;
  amount_outstanding: number | string;
  status: FinanceApBill["status"];
  document_intake_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceApPaymentRow {
  id: string;
  org_id: string;
  ap_bill_id: string;
  imported_transaction_id: string | null;
  paid_at: string;
  amount: number | string;
  reference: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function money(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function nullableMoney(value: number | string | null): number | null {
  return value == null ? null : money(value);
}

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export const financeAccountMapper = {
  toDomain(row: FinanceAccountRow): FinanceAccount {
    return {
      id: row.id as FinanceAccount["id"],
      orgId: row.org_id as FinanceAccount["orgId"],
      name: row.name,
      type: row.type,
      institution: row.institution,
      lastFour: row.last_four,
      openingBalance: money(row.opening_balance),
      isActive: row.is_active,
      createdBy: row.created_by as FinanceAccount["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input: CreateFinanceAccountInput) {
    return {
      name: input.name.trim(),
      type: input.type,
      institution: emptyToNull(input.institution),
      last_four: emptyToNull(input.lastFour),
      opening_balance: input.openingBalance ?? 0,
      is_active: input.isActive ?? true,
    };
  },
  toPatch(input: UpdateFinanceAccountInput) {
    return {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.institution !== undefined ? { institution: emptyToNull(input.institution) } : {}),
      ...(input.lastFour !== undefined ? { last_four: emptyToNull(input.lastFour) } : {}),
      ...(input.openingBalance !== undefined ? { opening_balance: input.openingBalance } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  },
};

export const financeCategoryMapper = {
  toDomain(row: FinanceCategoryRow): FinanceCategory {
    return {
      id: row.id as FinanceCategory["id"],
      orgId: row.org_id as FinanceCategory["orgId"],
      name: row.name,
      type: row.type,
      description: row.description,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdBy: row.created_by as FinanceCategory["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input: CreateFinanceCategoryInput) {
    return {
      name: input.name.trim(),
      type: input.type,
      description: emptyToNull(input.description),
      is_active: input.isActive ?? true,
    };
  },
  toPatch(input: UpdateFinanceCategoryInput) {
    return {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.description !== undefined ? { description: emptyToNull(input.description) } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  },
};

export const financeTransactionMapper = {
  toDomain(row: FinanceTransactionRow): FinanceTransaction {
    return {
      id: row.id as FinanceTransaction["id"],
      orgId: row.org_id as FinanceTransaction["orgId"],
      type: row.type,
      status: row.status,
      transactionDate: row.transaction_date,
      contactId: row.contact_id as FinanceTransaction["contactId"],
      accountId: row.account_id as FinanceTransaction["accountId"],
      categoryId: row.category_id as FinanceTransaction["categoryId"],
      jobId: row.job_id as FinanceTransaction["jobId"],
      documentId: row.document_id as FinanceTransaction["documentId"],
      memo: row.memo,
      referenceNumber: row.reference_number,
      subtotal: money(row.subtotal),
      tax: money(row.tax),
      total: money(row.total),
      createdBy: row.created_by as FinanceTransaction["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input: CreateFinanceTransactionInput) {
    return {
      type: input.type,
      status: input.status ?? "posted",
      transaction_date: input.transactionDate,
      contact_id: input.contactId ?? null,
      account_id: input.accountId,
      category_id: input.categoryId,
      job_id: input.jobId ?? null,
      document_id: input.documentId ?? null,
      memo: emptyToNull(input.memo),
      reference_number: emptyToNull(input.referenceNumber),
      subtotal: input.subtotal,
      tax: input.tax ?? 0,
      total: input.total,
    };
  },
  toPatch(input: UpdateFinanceTransactionInput) {
    return {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.transactionDate !== undefined ? { transaction_date: input.transactionDate } : {}),
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
      ...(input.accountId !== undefined ? { account_id: input.accountId } : {}),
      ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
      ...(input.jobId !== undefined ? { job_id: input.jobId } : {}),
      ...(input.documentId !== undefined ? { document_id: input.documentId } : {}),
      ...(input.memo !== undefined ? { memo: emptyToNull(input.memo) } : {}),
      ...(input.referenceNumber !== undefined ? { reference_number: emptyToNull(input.referenceNumber) } : {}),
      ...(input.subtotal !== undefined ? { subtotal: input.subtotal } : {}),
      ...(input.tax !== undefined ? { tax: input.tax } : {}),
      ...(input.total !== undefined ? { total: input.total } : {}),
    };
  },
};

export const financeImportBatchMapper = {
  toDomain(row: FinanceImportBatchRow): FinanceImportBatch {
    return {
      id: row.id as FinanceImportBatch["id"],
      orgId: row.org_id as FinanceImportBatch["orgId"],
      sourceAccountId: row.source_account_id as FinanceImportBatch["sourceAccountId"],
      sourceType: row.source_type,
      fileName: row.file_name,
      rowCount: row.row_count,
      importedBy: row.imported_by as FinanceImportBatch["importedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const importedTransactionMapper = {
  toDomain(row: ImportedTransactionRow): ImportedTransaction {
    return {
      id: row.id as ImportedTransaction["id"],
      orgId: row.org_id as ImportedTransaction["orgId"],
      batchId: row.batch_id as ImportedTransaction["batchId"],
      sourceAccountId: row.source_account_id as ImportedTransaction["sourceAccountId"],
      status: row.status,
      transactionDate: row.transaction_date,
      rawDescription: row.raw_description,
      rawMemo: row.raw_memo,
      amount: money(row.amount),
      suggestedContactId: row.suggested_contact_id as ImportedTransaction["suggestedContactId"],
      suggestedCategoryId: row.suggested_category_id as ImportedTransaction["suggestedCategoryId"],
      suggestedJobId: row.suggested_job_id as ImportedTransaction["suggestedJobId"],
      suggestionConfidence: money(row.suggestion_confidence),
      suggestionReason: row.suggestion_reason,
      matchedTransactionId: row.matched_transaction_id as ImportedTransaction["matchedTransactionId"],
      linkedDocumentIntakeId: row.linked_document_intake_id as ImportedTransaction["linkedDocumentIntakeId"],
      receiptStatus: row.receipt_status,
      receiptSnoozedUntil: row.receipt_snoozed_until,
      reviewedBy: row.reviewed_by as ImportedTransaction["reviewedBy"],
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeDocumentIntakeMapper = {
  toDomain(row: FinanceDocumentIntakeRow): FinanceDocumentIntake {
    return {
      id: row.id as FinanceDocumentIntake["id"],
      orgId: row.org_id as FinanceDocumentIntake["orgId"],
      status: row.status,
      source: row.source ?? "manual",
      fileName: row.file_name,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      sizeBytes: row.file_size ?? row.size_bytes,
      uploadedAt: row.uploaded_at ?? null,
      documentType: row.document_type ?? "unknown",
      documentTypeConfidence: money(row.document_type_confidence ?? 0),
      extractionStatus: row.extraction_status ?? "needs_review",
      extractionConfidence: money(row.extraction_confidence ?? 0),
      extractionMethod: row.extraction_method ?? "metadata",
      pdfTextExtractedAt: row.pdf_text_extracted_at ?? null,
      pdfTextCharCount: Number(row.pdf_text_char_count ?? 0),
      ocrStatus: row.ocr_status ?? "not_needed",
      ocrError: row.ocr_error ?? null,
      senderEmail: row.sender_email ?? null,
      senderName: row.sender_name ?? null,
      emailSubject: row.email_subject ?? null,
      emailReceivedAt: row.email_received_at ?? null,
      externalSourceId: row.external_source_id ?? null,
      gmailMessageId: row.gmail_message_id ?? null,
      gmailAttachmentId: row.gmail_attachment_id ?? null,
      extractedVendor: row.extracted_vendor,
      extractedInvoiceNumber: row.extracted_invoice_number ?? null,
      extractedDate: row.extracted_date,
      extractedSubtotal: nullableMoney(row.extracted_subtotal),
      extractedTax: nullableMoney(row.extracted_tax),
      extractedTotal: nullableMoney(row.extracted_total),
      vendorConfidence: money(row.vendor_confidence ?? 0),
      invoiceNumberConfidence: money(row.invoice_number_confidence ?? 0),
      invoiceDateConfidence: money(row.invoice_date_confidence ?? 0),
      subtotalConfidence: money(row.subtotal_confidence ?? 0),
      taxConfidence: money(row.tax_confidence ?? 0),
      totalConfidence: money(row.total_confidence ?? 0),
      normalizedVendorContactId: row.normalized_vendor_contact_id as FinanceDocumentIntake["normalizedVendorContactId"],
      vendorNormalizationConfidence: money(row.vendor_normalization_confidence ?? 0),
      extractionReviewedBy: row.extraction_reviewed_by as FinanceDocumentIntake["extractionReviewedBy"],
      extractionReviewedAt: row.extraction_reviewed_at ?? null,
      suggestedContactId: row.suggested_contact_id as FinanceDocumentIntake["suggestedContactId"],
      suggestedCategoryId: row.suggested_category_id as FinanceDocumentIntake["suggestedCategoryId"],
      suggestedJobId: row.suggested_job_id as FinanceDocumentIntake["suggestedJobId"],
      suggestionConfidence: money(row.suggestion_confidence),
      suggestionReason: row.suggestion_reason,
      linkedTransactionId: row.linked_transaction_id as FinanceDocumentIntake["linkedTransactionId"],
      linkedImportedTransactionId: row.linked_imported_transaction_id as FinanceDocumentIntake["linkedImportedTransactionId"],
      uploadedBy: row.uploaded_by as FinanceDocumentIntake["uploadedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeReconciliationSessionMapper = {
  toDomain(row: FinanceReconciliationSessionRow): FinanceReconciliationSession {
    return {
      id: row.id as FinanceReconciliationSession["id"],
      orgId: row.org_id as FinanceReconciliationSession["orgId"],
      accountId: row.account_id as FinanceReconciliationSession["accountId"],
      startDate: row.start_date,
      endDate: row.end_date,
      openingBalance: nullableMoney(row.opening_balance),
      closingBalance: nullableMoney(row.closing_balance),
      importedTotal: money(row.imported_total),
      matchedTotal: money(row.matched_total),
      unreconciledTotal: money(row.unreconciled_total),
      status: row.status,
      completedAt: row.completed_at,
      completedBy: row.completed_by as FinanceReconciliationSession["completedBy"],
      createdBy: row.created_by as FinanceReconciliationSession["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeMonthlyCloseMapper = {
  toDomain(row: FinanceMonthlyCloseRow): FinanceMonthlyClose {
    return {
      id: row.id as FinanceMonthlyClose["id"],
      orgId: row.org_id as FinanceMonthlyClose["orgId"],
      month: row.month,
      status: row.status,
      unreconciledImportsCount: row.unreconciled_imports_count,
      missingReceiptsCount: row.missing_receipts_count,
      uncategorizedTransactionsCount: row.uncategorized_transactions_count,
      draftTransactionsCount: row.draft_transactions_count,
      outstandingInvoicesCount: row.outstanding_invoices_count,
      outstandingBillsCount: row.outstanding_bills_count,
      possibleDuplicatesCount: row.possible_duplicates_count,
      snoozedReviewItemsCount: row.snoozed_review_items_count,
      closedAt: row.closed_at,
      closedBy: row.closed_by as FinanceMonthlyClose["closedBy"],
      createdBy: row.created_by as FinanceMonthlyClose["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeArInvoiceMapper = {
  toDomain(row: FinanceArInvoiceRow): FinanceArInvoice {
    return {
      id: row.id as FinanceArInvoice["id"],
      orgId: row.org_id as FinanceArInvoice["orgId"],
      invoiceId: row.invoice_id as FinanceArInvoice["invoiceId"],
      customerContactId: row.customer_contact_id as FinanceArInvoice["customerContactId"],
      customerName: row.customer_name,
      jobId: row.job_id as FinanceArInvoice["jobId"],
      jobLabel: row.job_label,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      subtotal: money(row.subtotal),
      tax: money(row.tax),
      total: money(row.total),
      amountPaid: money(row.amount_paid),
      amountOutstanding: money(row.amount_outstanding),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeArPaymentMapper = {
  toDomain(row: FinanceArPaymentRow): FinanceArPayment {
    return {
      id: row.id as FinanceArPayment["id"],
      orgId: row.org_id as FinanceArPayment["orgId"],
      arInvoiceId: row.ar_invoice_id as FinanceArPayment["arInvoiceId"],
      importedTransactionId: row.imported_transaction_id as FinanceArPayment["importedTransactionId"],
      paidAt: row.paid_at,
      amount: money(row.amount),
      reference: row.reference,
      createdBy: row.created_by as FinanceArPayment["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeApBillMapper = {
  toDomain(row: FinanceApBillRow): FinanceApBill {
    return {
      id: row.id as FinanceApBill["id"],
      orgId: row.org_id as FinanceApBill["orgId"],
      vendorContactId: row.vendor_contact_id as FinanceApBill["vendorContactId"],
      vendorName: row.vendor_name,
      billDate: row.bill_date,
      dueDate: row.due_date,
      subtotal: money(row.subtotal),
      tax: money(row.tax),
      total: money(row.total),
      amountPaid: money(row.amount_paid),
      amountOutstanding: money(row.amount_outstanding),
      status: row.status,
      documentIntakeId: row.document_intake_id as FinanceApBill["documentIntakeId"],
      createdBy: row.created_by as FinanceApBill["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};

export const financeApPaymentMapper = {
  toDomain(row: FinanceApPaymentRow): FinanceApPayment {
    return {
      id: row.id as FinanceApPayment["id"],
      orgId: row.org_id as FinanceApPayment["orgId"],
      apBillId: row.ap_bill_id as FinanceApPayment["apBillId"],
      importedTransactionId: row.imported_transaction_id as FinanceApPayment["importedTransactionId"],
      paidAt: row.paid_at,
      amount: money(row.amount),
      reference: row.reference,
      createdBy: row.created_by as FinanceApPayment["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
};
