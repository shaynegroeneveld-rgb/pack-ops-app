import type {
  ContactId,
  DocumentId,
  FinanceAccountId,
  FinanceApBillId,
  FinanceApPaymentId,
  FinanceArInvoiceId,
  FinanceArPaymentId,
  FinanceCategoryId,
  FinanceDocumentIntakeId,
  FinanceDocumentLineItemId,
  FinanceImportedTransactionId,
  FinanceImportBatchId,
  FinanceTransactionId,
  FinanceMonthlyCloseId,
  FinanceReconciliationSessionId,
  JobId,
  InvoiceId,
  OrgId,
  UserId,
} from "@/domain/ids";
import type { CatalogItem } from "@/domain/materials/types";
import type { AuditedEntity } from "@/domain/shared/base";

export const FINANCE_ACCOUNT_TYPES = ["bank", "credit_card", "cash", "loan", "other"] as const;
export type FinanceAccountType = (typeof FINANCE_ACCOUNT_TYPES)[number];

export const FINANCE_CATEGORY_TYPES = ["income", "expense"] as const;
export type FinanceCategoryType = (typeof FINANCE_CATEGORY_TYPES)[number];

export const FINANCE_TRANSACTION_TYPES = ["income", "expense"] as const;
export type FinanceTransactionType = (typeof FINANCE_TRANSACTION_TYPES)[number];

export const FINANCE_TRANSACTION_STATUSES = ["draft", "posted", "void"] as const;
export type FinanceTransactionStatus = (typeof FINANCE_TRANSACTION_STATUSES)[number];

export const FINANCE_IMPORTED_TRANSACTION_STATUSES = [
  "new",
  "needs_review",
  "matched",
  "transfer",
  "duplicate",
  "ignored",
] as const;
export type FinanceImportedTransactionStatus = (typeof FINANCE_IMPORTED_TRANSACTION_STATUSES)[number];

export const FINANCE_DOCUMENT_INTAKE_STATUSES = ["new", "needs_review", "matched", "ignored"] as const;
export type FinanceDocumentIntakeStatus = (typeof FINANCE_DOCUMENT_INTAKE_STATUSES)[number];

export const FINANCE_DOCUMENT_TYPES = ["supplier_invoice", "receipt", "statement", "payment_confirmation", "unknown"] as const;
export type FinanceDocumentType = (typeof FINANCE_DOCUMENT_TYPES)[number];

export const FINANCE_DOCUMENT_EXTRACTION_STATUSES = ["needs_review", "approved", "rejected"] as const;
export type FinanceDocumentExtractionStatus = (typeof FINANCE_DOCUMENT_EXTRACTION_STATUSES)[number];

export const FINANCE_RECEIPT_STATUSES = ["unknown", "missing", "linked", "not_required", "snoozed"] as const;
export type FinanceReceiptStatus = (typeof FINANCE_RECEIPT_STATUSES)[number];

export const FINANCE_RECONCILIATION_STATUSES = ["open", "in_progress", "completed"] as const;
export type FinanceReconciliationStatus = (typeof FINANCE_RECONCILIATION_STATUSES)[number];

export const FINANCE_MONTHLY_CLOSE_STATUSES = ["open", "in_progress", "closed"] as const;
export type FinanceMonthlyCloseStatus = (typeof FINANCE_MONTHLY_CLOSE_STATUSES)[number];

export const FINANCE_AR_STATUSES = ["draft", "sent", "partially_paid", "paid", "overdue"] as const;
export type FinanceArStatus = (typeof FINANCE_AR_STATUSES)[number];

export const FINANCE_AP_STATUSES = ["draft", "posted", "partially_paid", "paid", "overdue"] as const;
export type FinanceApStatus = (typeof FINANCE_AP_STATUSES)[number];

export interface FinanceAccount extends AuditedEntity {
  id: FinanceAccountId;
  orgId: OrgId;
  name: string;
  type: FinanceAccountType;
  institution: string | null;
  lastFour: string | null;
  openingBalance: number;
  isActive: boolean;
  createdBy: UserId | null;
}

export interface CreateFinanceAccountInput {
  name: string;
  type: FinanceAccountType;
  institution?: string | null;
  lastFour?: string | null;
  openingBalance?: number;
  isActive?: boolean;
}

export type UpdateFinanceAccountInput = Partial<CreateFinanceAccountInput>;

export interface FinanceCategory extends AuditedEntity {
  id: FinanceCategoryId;
  orgId: OrgId;
  name: string;
  type: FinanceCategoryType;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdBy: UserId | null;
}

export interface CreateFinanceCategoryInput {
  name: string;
  type: FinanceCategoryType;
  description?: string | null;
  isActive?: boolean;
}

export type UpdateFinanceCategoryInput = Partial<CreateFinanceCategoryInput>;

export interface FinanceTransaction extends AuditedEntity {
  id: FinanceTransactionId;
  orgId: OrgId;
  type: FinanceTransactionType;
  status: FinanceTransactionStatus;
  transactionDate: string;
  contactId: ContactId | null;
  accountId: FinanceAccountId;
  categoryId: FinanceCategoryId;
  jobId: JobId | null;
  documentId: DocumentId | null;
  memo: string | null;
  referenceNumber: string | null;
  subtotal: number;
  tax: number;
  total: number;
  createdBy: UserId | null;
}

export interface CreateFinanceTransactionInput {
  type: FinanceTransactionType;
  status?: FinanceTransactionStatus;
  transactionDate: string;
  contactId?: ContactId | null;
  accountId: FinanceAccountId;
  categoryId: FinanceCategoryId;
  jobId?: JobId | null;
  documentId?: DocumentId | null;
  memo?: string | null;
  referenceNumber?: string | null;
  subtotal: number;
  tax?: number;
  total: number;
}

export type UpdateFinanceTransactionInput = Partial<CreateFinanceTransactionInput>;

export interface FinanceTransactionFilter {
  search?: string;
  type?: FinanceTransactionType | "all";
  status?: FinanceTransactionStatus | "all";
  accountId?: FinanceAccountId | "all";
  categoryId?: FinanceCategoryId | "all";
}

export interface FinanceJobOption {
  id: JobId;
  number: string;
  title: string;
}

export interface FinanceDocumentOption {
  id: DocumentId;
  fileName: string;
}

export interface FinanceSuggestion {
  contactId: ContactId | null;
  categoryId: FinanceCategoryId | null;
  jobId: JobId | null;
  confidence: number;
  reason: string | null;
}

export interface FinanceImportBatch extends AuditedEntity {
  id: FinanceImportBatchId;
  orgId: OrgId;
  sourceAccountId: FinanceAccountId;
  sourceType: "bank" | "credit_card";
  fileName: string;
  rowCount: number;
  importedBy: UserId | null;
}

export interface ImportedTransaction extends AuditedEntity {
  id: FinanceImportedTransactionId;
  orgId: OrgId;
  batchId: FinanceImportBatchId;
  sourceAccountId: FinanceAccountId;
  status: FinanceImportedTransactionStatus;
  transactionDate: string;
  rawDescription: string;
  rawMemo: string | null;
  amount: number;
  suggestedContactId: ContactId | null;
  suggestedCategoryId: FinanceCategoryId | null;
  suggestedJobId: JobId | null;
  suggestionConfidence: number;
  suggestionReason: string | null;
  matchedTransactionId: FinanceTransactionId | null;
  linkedDocumentIntakeId: FinanceDocumentIntakeId | null;
  receiptStatus: FinanceReceiptStatus;
  receiptSnoozedUntil: string | null;
  reviewedBy: UserId | null;
  reviewedAt: string | null;
}

export interface CreateImportBatchInput {
  sourceAccountId: FinanceAccountId;
  sourceType: "bank" | "credit_card";
  fileName: string;
  rows: Array<{
    transactionDate: string;
    rawDescription: string;
    rawMemo?: string | null;
    amount: number;
  }>;
}

export interface FinanceDocumentIntake extends AuditedEntity {
  id: FinanceDocumentIntakeId;
  orgId: OrgId;
  status: FinanceDocumentIntakeStatus;
  source: "manual" | "gmail";
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  documentType: FinanceDocumentType;
  documentTypeConfidence: number;
  extractionStatus: FinanceDocumentExtractionStatus;
  extractionConfidence: number;
  extractionMethod: "metadata" | "pdf_text" | "ocr";
  pdfTextExtractedAt: string | null;
  pdfTextCharCount: number;
  ocrStatus: "not_needed" | "needed" | "unavailable" | "completed";
  ocrError: string | null;
  senderEmail: string | null;
  senderName: string | null;
  emailSubject: string | null;
  emailReceivedAt: string | null;
  externalSourceId: string | null;
  gmailMessageId: string | null;
  gmailAttachmentId: string | null;
  extractedVendor: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedSubtotal: number | null;
  extractedTax: number | null;
  extractedTotal: number | null;
  vendorConfidence: number;
  invoiceNumberConfidence: number;
  invoiceDateConfidence: number;
  subtotalConfidence: number;
  taxConfidence: number;
  totalConfidence: number;
  normalizedVendorContactId: ContactId | null;
  vendorNormalizationConfidence: number;
  extractionReviewedBy: UserId | null;
  extractionReviewedAt: string | null;
  suggestedContactId: ContactId | null;
  suggestedCategoryId: FinanceCategoryId | null;
  suggestedJobId: JobId | null;
  suggestionConfidence: number;
  suggestionReason: string | null;
  linkedTransactionId: FinanceTransactionId | null;
  linkedImportedTransactionId: FinanceImportedTransactionId | null;
  uploadedBy: UserId | null;
}

export interface CreateFinanceDocumentIntakeInput {
  fileName: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  extractedVendor?: string | null;
  extractedDate?: string | null;
  extractedSubtotal?: number | null;
  extractedTax?: number | null;
  extractedTotal?: number | null;
}

export const FINANCE_DOCUMENT_LINE_ITEM_REVIEW_STATUSES = [
  "new",
  "approved",
  "updated_material",
  "created_material",
  "ignored",
] as const;
export type FinanceDocumentLineItemReviewStatus = (typeof FINANCE_DOCUMENT_LINE_ITEM_REVIEW_STATUSES)[number];

export interface FinanceDocumentLineItem extends AuditedEntity {
  id: FinanceDocumentLineItemId;
  orgId: OrgId;
  documentIntakeId: FinanceDocumentIntakeId;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  supplierPrice: number;
  internalCost: number;
  matchedCatalogItemId: CatalogItem["id"] | null;
  matchConfidence: number;
  matchReason: string | null;
  reviewStatus: FinanceDocumentLineItemReviewStatus;
  appliedCatalogItemId: CatalogItem["id"] | null;
  appliedAt: string | null;
  appliedBy: UserId | null;
  ignoredReason: string | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}

export interface CreateFinanceDocumentLineItemInput {
  documentIntakeId: FinanceDocumentIntakeId;
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number | null;
}

export interface FinanceDocumentLineItemMaterialSuggestion {
  lineItem: FinanceDocumentLineItem;
  matchedMaterial: CatalogItem | null;
  confidence: number;
  reason: string | null;
  currentPrice: number | null;
  newPrice: number;
  percentChange: number | null;
}

export interface FinanceImportDocumentMatchSuggestion {
  importedTransactionId: FinanceImportedTransactionId;
  documentIntakeId: FinanceDocumentIntakeId;
  confidence: number;
  reasons: string[];
}

export type FinanceReviewQueueItemKind =
  | "import_review"
  | "document_review"
  | "missing_receipt"
  | "possible_duplicate"
  | "possible_transfer"
  | "low_confidence"
  | "import_document_match";

export interface FinanceReviewQueueItem {
  id: string;
  kind: FinanceReviewQueueItemKind;
  title: string;
  detail: string;
  amount: number | null;
  date: string | null;
  confidence: number | null;
  importedTransactionId?: FinanceImportedTransactionId;
  documentIntakeId?: FinanceDocumentIntakeId;
}

export interface FinanceSuggestionRule {
  id: string;
  label: string;
  keywords: string[];
  categoryName?: string;
  contactAlias?: string;
  isTransfer?: boolean;
  receiptRequired?: boolean;
}

export interface FinanceReconciliationSession extends AuditedEntity {
  id: FinanceReconciliationSessionId;
  orgId: OrgId;
  accountId: FinanceAccountId;
  startDate: string;
  endDate: string;
  openingBalance: number | null;
  closingBalance: number | null;
  importedTotal: number;
  matchedTotal: number;
  unreconciledTotal: number;
  status: FinanceReconciliationStatus;
  completedAt: string | null;
  completedBy: UserId | null;
  createdBy: UserId | null;
}

export interface FinanceReconciliationSummary {
  importedTotal: number;
  matchedTotal: number;
  unmatchedTotal: number;
  difference: number;
}

export interface FinanceMonthlyClose extends AuditedEntity {
  id: FinanceMonthlyCloseId;
  orgId: OrgId;
  month: string;
  status: FinanceMonthlyCloseStatus;
  unreconciledImportsCount: number;
  missingReceiptsCount: number;
  uncategorizedTransactionsCount: number;
  draftTransactionsCount: number;
  outstandingInvoicesCount: number;
  outstandingBillsCount: number;
  possibleDuplicatesCount: number;
  snoozedReviewItemsCount: number;
  closedAt: string | null;
  closedBy: UserId | null;
  createdBy: UserId | null;
}

export interface FinanceMonthlyCloseValidation {
  unreconciledImports: number;
  missingReceipts: number;
  uncategorizedTransactions: number;
  draftTransactions: number;
  outstandingInvoices: number;
  outstandingBills: number;
  possibleDuplicates: number;
  snoozedReviewItems: number;
}

export interface FinanceCategoryBreakdownRow {
  categoryId: FinanceCategoryId | null;
  categoryName: string;
  type: FinanceCategoryType;
  total: number;
  percentage: number;
}

export interface FinanceProfitLossSummary {
  revenue: number;
  expenses: number;
  netProfit: number;
  transactionCount: number;
  categoryBreakdown: FinanceCategoryBreakdownRow[];
}

export interface FinanceExpenseCategorySummary {
  totalExpenses: number;
  rows: FinanceCategoryBreakdownRow[];
}

export interface FinanceJobProfitabilityRow {
  jobId: JobId | null;
  jobNumber: string;
  jobTitle: string;
  revenue: number;
  materials: number;
  labour: number;
  subcontractors: number;
  totalCost: number;
  profit: number;
  margin: number;
}

export interface FinanceGstSummary {
  gstCollected: number;
  gstPaid: number;
  netGst: number;
}

export interface FinanceAgingBucket {
  label: "current" | "30_days" | "60_days" | "90_plus";
  count: number;
  total: number;
}

export interface FinanceAgingSummary {
  totalOutstanding: number;
  buckets: FinanceAgingBucket[];
}

export interface FinanceMonthlyCloseMetrics {
  revenue: number;
  expenses: number;
  profit: number;
  gst: number;
  transactionCount: number;
  missingReceiptsCount: number;
  outstandingAr: number;
  outstandingAp: number;
}

export interface FinanceArInvoice extends AuditedEntity {
  id: FinanceArInvoiceId;
  orgId: OrgId;
  invoiceId: InvoiceId;
  customerContactId: ContactId;
  customerName: string;
  jobId: JobId | null;
  jobLabel: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountOutstanding: number;
  status: FinanceArStatus;
}

export interface FinanceArPayment extends AuditedEntity {
  id: FinanceArPaymentId;
  orgId: OrgId;
  arInvoiceId: FinanceArInvoiceId;
  importedTransactionId: FinanceImportedTransactionId | null;
  paidAt: string;
  amount: number;
  reference: string | null;
  createdBy: UserId | null;
}

export interface FinanceApBill extends AuditedEntity {
  id: FinanceApBillId;
  orgId: OrgId;
  vendorContactId: ContactId | null;
  vendorName: string;
  billDate: string;
  dueDate: string | null;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountOutstanding: number;
  status: FinanceApStatus;
  documentIntakeId: FinanceDocumentIntakeId | null;
  createdBy: UserId | null;
}

export interface CreateFinanceApBillInput {
  vendorContactId?: ContactId | null;
  vendorName: string;
  billDate: string;
  dueDate?: string | null;
  subtotal: number;
  tax?: number;
  total: number;
  documentIntakeId?: FinanceDocumentIntakeId | null;
}

export interface FinanceApPayment extends AuditedEntity {
  id: FinanceApPaymentId;
  orgId: OrgId;
  apBillId: FinanceApBillId;
  importedTransactionId: FinanceImportedTransactionId | null;
  paidAt: string;
  amount: number;
  reference: string | null;
  createdBy: UserId | null;
}
