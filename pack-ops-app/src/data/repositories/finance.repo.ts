import type { Contact } from "@/domain/contacts/types";
import type {
  CreateFinanceAccountInput,
  CreateFinanceApBillInput,
  CreateFinanceCategoryInput,
  CreateFinanceDocumentIntakeInput,
  CreateImportBatchInput,
  CreateFinanceTransactionInput,
  FinanceDocumentIntake,
  FinanceAccount,
  FinanceApBill,
  FinanceArInvoice,
  FinanceCategory,
  FinanceDocumentOption,
  FinanceImportBatch,
  FinanceJobOption,
  FinanceMonthlyClose,
  FinanceMonthlyCloseValidation,
  FinanceReconciliationSession,
  FinanceReconciliationSummary,
  FinanceTransaction,
  FinanceTransactionFilter,
  ImportedTransaction,
  UpdateFinanceAccountInput,
  UpdateFinanceCategoryInput,
  UpdateFinanceTransactionInput,
} from "@/domain/finance/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface FinanceAccountFilter {
  search?: string;
  includeInactive?: boolean;
}

export interface FinanceCategoryFilter {
  search?: string;
  type?: FinanceCategory["type"] | "all";
  includeInactive?: boolean;
}

export type FinanceAccountsRepository = Repository<
  FinanceAccount,
  CreateFinanceAccountInput,
  UpdateFinanceAccountInput,
  FinanceAccountFilter
>;

export type FinanceCategoriesRepository = Repository<
  FinanceCategory,
  CreateFinanceCategoryInput,
  UpdateFinanceCategoryInput,
  FinanceCategoryFilter
>;

export type FinanceTransactionsRepository = Repository<
  FinanceTransaction,
  CreateFinanceTransactionInput,
  UpdateFinanceTransactionInput,
  FinanceTransactionFilter
>;

export interface FinanceLookupRepository {
  listContacts(): Promise<Contact[]>;
  listJobs(): Promise<FinanceJobOption[]>;
  listDocuments(): Promise<FinanceDocumentOption[]>;
}

export interface FinanceImportsRepository {
  listBatches(): Promise<FinanceImportBatch[]>;
  createBatch(input: CreateImportBatchInput & {
    importedBy: string | null;
    suggestions: Array<{
      contactId: string | null;
      categoryId: string | null;
      jobId: string | null;
      confidence: number;
      reason: string | null;
      receiptStatus?: ImportedTransaction["receiptStatus"];
    }>;
  }): Promise<FinanceImportBatch>;
  listImportedTransactions(): Promise<ImportedTransaction[]>;
  updateImportedTransactionStatus(
    id: string,
    input: {
      status: ImportedTransaction["status"];
      matchedTransactionId?: string | null;
      reviewedBy: string | null;
      reviewedAt: string;
    },
  ): Promise<ImportedTransaction>;
  updateImportedTransactionReviewFields(
    id: string,
    input: {
      status?: ImportedTransaction["status"];
      suggestedContactId?: string | null;
      suggestedCategoryId?: string | null;
      linkedDocumentIntakeId?: string | null;
      receiptStatus?: ImportedTransaction["receiptStatus"];
      receiptSnoozedUntil?: string | null;
      reviewedBy?: string | null;
      reviewedAt?: string | null;
    },
  ): Promise<ImportedTransaction>;
}

export interface FinanceDocumentIntakeRepository {
  list(): Promise<FinanceDocumentIntake[]>;
  create(input: CreateFinanceDocumentIntakeInput & {
    uploadedBy: string | null;
    suggestion: {
      contactId: string | null;
      categoryId: string | null;
      jobId: string | null;
      confidence: number;
      reason: string | null;
    };
  }): Promise<FinanceDocumentIntake>;
  updateStatus(
    id: string,
    input: {
      status: FinanceDocumentIntake["status"];
      linkedTransactionId?: string | null;
    },
  ): Promise<FinanceDocumentIntake>;
  linkImportedTransaction(id: string, importedTransactionId: string | null): Promise<FinanceDocumentIntake>;
}

export interface FinanceReconciliationRepository {
  listSessions(filter?: { accountId?: string; startDate?: string; endDate?: string }): Promise<FinanceReconciliationSession[]>;
  upsertSession(input: {
    accountId: string;
    startDate: string;
    endDate: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
    summary: FinanceReconciliationSummary;
    status: FinanceReconciliationSession["status"];
    actorUserId: string | null;
  }): Promise<FinanceReconciliationSession>;
  completeSession(id: string, input: { summary: FinanceReconciliationSummary; completedBy: string | null }): Promise<FinanceReconciliationSession>;
}

export interface FinanceMonthlyCloseRepository {
  getByMonth(month: string): Promise<FinanceMonthlyClose | null>;
  upsertMonth(input: {
    month: string;
    status: FinanceMonthlyClose["status"];
    validation: FinanceMonthlyCloseValidation;
    actorUserId: string | null;
  }): Promise<FinanceMonthlyClose>;
  updateStatus(month: string, input: {
    status: FinanceMonthlyClose["status"];
    validation: FinanceMonthlyCloseValidation;
    actorUserId: string | null;
  }): Promise<FinanceMonthlyClose>;
}

export interface FinanceArRepository {
  syncFromInvoices(): Promise<FinanceArInvoice[]>;
  list(filter?: { status?: "all" | "outstanding" | "overdue" }): Promise<FinanceArInvoice[]>;
  matchPayment(input: {
    arInvoiceId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
    actorUserId: string | null;
  }): Promise<FinanceArInvoice>;
}

export interface FinanceApRepository {
  list(filter?: { status?: "all" | "outstanding" | "overdue" }): Promise<FinanceApBill[]>;
  createBill(input: CreateFinanceApBillInput & { actorUserId: string | null }): Promise<FinanceApBill>;
  matchPayment(input: {
    apBillId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
    actorUserId: string | null;
  }): Promise<FinanceApBill>;
}
