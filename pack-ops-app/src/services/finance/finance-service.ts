import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FinanceAccountsRepositoryImpl,
  FinanceCategoriesRepositoryImpl,
  FinanceDocumentIntakeRepositoryImpl,
  FinanceApRepositoryImpl,
  FinanceArRepositoryImpl,
  FinanceImportsRepositoryImpl,
  FinanceLookupRepositoryImpl,
  FinanceMonthlyCloseRepositoryImpl,
  FinanceReconciliationRepositoryImpl,
  FinanceTransactionsRepositoryImpl,
} from "@/data/repositories/finance.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type { CreateContactInput, UpdateContactInput } from "@/domain/contacts/types";
import type {
  CreateFinanceAccountInput,
  CreateFinanceApBillInput,
  CreateFinanceCategoryInput,
  CreateFinanceDocumentIntakeInput,
  CreateImportBatchInput,
  CreateFinanceTransactionInput,
  FinanceDocumentIntake,
  FinanceAgingSummary,
  FinanceExpenseCategorySummary,
  FinanceGstSummary,
  FinanceImportDocumentMatchSuggestion,
  FinanceMonthlyClose,
  FinanceMonthlyCloseValidation,
  FinanceMonthlyCloseMetrics,
  FinanceProfitLossSummary,
  FinanceReconciliationSummary,
  FinanceReviewQueueItem,
  FinanceJobProfitabilityRow,
  ImportedTransaction,
  FinanceTransactionFilter,
  UpdateFinanceAccountInput,
  UpdateFinanceCategoryInput,
  UpdateFinanceTransactionInput,
} from "@/domain/finance/types";
import type { User } from "@/domain/users/types";
import { ContactsRepositoryImpl } from "@/data/repositories/contacts.repository.impl";
import { normalizePersistenceError } from "@/services/shared/persistence-errors";
import {
  findRuleForText,
  inferReceiptStatus,
  normalizeRuleText,
  suggestImportDocumentMatches,
} from "@/services/finance/suggestion-rules";

function canManageFinance(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function requireFinanceAccess(user: User): void {
  if (!canManageFinance(user)) {
    throw new Error("You cannot manage finance records.");
  }
}

function requireName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeAmount(value: number | null | undefined, label: string): number {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} is required.`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  return Math.round(value * 100) / 100;
}

function normalizeOptionalAmount(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    throw new Error("Amount cannot be negative.");
  }
  return Math.round(value * 100) / 100;
}

export class FinanceService {
  readonly accounts;
  readonly categories;
  readonly transactions;
  readonly imports;
  readonly documentIntake;
  readonly reconciliation;
  readonly monthlyClose;
  readonly ar;
  readonly ap;
  readonly contacts;
  readonly lookups;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    client: SupabaseClient<Database>,
  ) {
    this.accounts = new FinanceAccountsRepositoryImpl(context, client as never);
    this.categories = new FinanceCategoriesRepositoryImpl(context, client as never);
    this.transactions = new FinanceTransactionsRepositoryImpl(context, client as never);
    this.imports = new FinanceImportsRepositoryImpl(context, client as never);
    this.documentIntake = new FinanceDocumentIntakeRepositoryImpl(context, client as never);
    this.reconciliation = new FinanceReconciliationRepositoryImpl(context, client as never);
    this.monthlyClose = new FinanceMonthlyCloseRepositoryImpl(context, client as never);
    this.ar = new FinanceArRepositoryImpl(context, client as never);
    this.ap = new FinanceApRepositoryImpl(context, client as never);
    this.contacts = new ContactsRepositoryImpl(context, client);
    this.lookups = new FinanceLookupRepositoryImpl(context, client);
  }

  async listAccounts() {
    requireFinanceAccess(this.currentUser);
    return this.accounts.list({ filter: { includeInactive: true } });
  }

  async createAccount(input: CreateFinanceAccountInput) {
    requireFinanceAccess(this.currentUser);
    return this.accounts.create({
      ...input,
      name: requireName(input.name, "Account name"),
      openingBalance: normalizeOptionalAmount(input.openingBalance),
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Account",
        operation: "save",
        table: "finance_accounts",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async updateAccount(id: string, input: UpdateFinanceAccountInput) {
    requireFinanceAccess(this.currentUser);
    return this.accounts.update(id, {
      ...input,
      ...(input.name !== undefined ? { name: requireName(input.name, "Account name") } : {}),
      ...(input.openingBalance !== undefined ? { openingBalance: normalizeOptionalAmount(input.openingBalance) } : {}),
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Account",
        operation: "save",
        table: "finance_accounts",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async archiveAccount(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.accounts.softDelete(id);
  }

  async listCategories() {
    requireFinanceAccess(this.currentUser);
    return this.categories.list({ filter: { includeInactive: true } });
  }

  async createCategory(input: CreateFinanceCategoryInput) {
    requireFinanceAccess(this.currentUser);
    return this.categories.create({
      ...input,
      name: requireName(input.name, "Category name"),
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Category",
        operation: "save",
        table: "finance_categories",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async updateCategory(id: string, input: UpdateFinanceCategoryInput) {
    requireFinanceAccess(this.currentUser);
    return this.categories.update(id, {
      ...input,
      ...(input.name !== undefined ? { name: requireName(input.name, "Category name") } : {}),
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Category",
        operation: "save",
        table: "finance_categories",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async archiveCategory(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.categories.softDelete(id);
  }

  async listTransactions(filter?: FinanceTransactionFilter) {
    requireFinanceAccess(this.currentUser);
    return filter ? this.transactions.list({ filter }) : this.transactions.list();
  }

  async createTransaction(input: CreateFinanceTransactionInput) {
    requireFinanceAccess(this.currentUser);
    return this.transactions.create(this.normalizeTransactionInput(input)).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Transaction",
        operation: "save",
        table: "finance_transactions",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async updateTransaction(id: string, input: UpdateFinanceTransactionInput) {
    requireFinanceAccess(this.currentUser);
    return this.transactions.update(id, this.normalizeTransactionInput(input)).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Transaction",
        operation: "save",
        table: "finance_transactions",
        migrationHint: "0046_finance_foundation.sql",
      });
    });
  }

  async archiveTransaction(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.transactions.softDelete(id);
  }

  async listContacts() {
    requireFinanceAccess(this.currentUser);
    return this.lookups.listContacts();
  }

  async createContact(input: CreateContactInput) {
    requireFinanceAccess(this.currentUser);
    return this.contacts.create({
      ...input,
      displayName: requireName(input.displayName, "Contact name"),
    });
  }

  async updateContact(id: string, input: UpdateContactInput) {
    requireFinanceAccess(this.currentUser);
    return this.contacts.update(id, {
      ...input,
      ...(input.displayName !== undefined ? { displayName: requireName(input.displayName, "Contact name") } : {}),
    });
  }

  async archiveContact(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.contacts.softDelete(id);
  }

  async listJobs() {
    requireFinanceAccess(this.currentUser);
    return this.lookups.listJobs();
  }

  async listDocuments() {
    requireFinanceAccess(this.currentUser);
    return this.lookups.listDocuments();
  }

  async listImportBatches() {
    requireFinanceAccess(this.currentUser);
    return this.imports.listBatches();
  }

  async importCsvBatch(input: CreateImportBatchInput) {
    requireFinanceAccess(this.currentUser);
    if (input.rows.length === 0) {
      throw new Error("CSV import has no rows.");
    }

    const [contacts, categories, jobs] = await Promise.all([
      this.lookups.listContacts(),
      this.categories.list({ filter: { includeInactive: false } }),
      this.lookups.listJobs(),
    ]);

    const categoryById = new Map<string, (typeof categories)[number]>(categories.map((category) => [category.id, category]));
    const suggestions = input.rows.map((row) => {
      const suggestion = suggestFinanceLinks({
        text: `${row.rawDescription} ${row.rawMemo ?? ""}`,
        contacts,
        categories,
        jobs,
      });
      return {
        ...suggestion,
        receiptStatus: inferReceiptStatus({
          amount: row.amount,
          text: `${row.rawDescription} ${row.rawMemo ?? ""}`,
          category: suggestion.categoryId ? categoryById.get(suggestion.categoryId) ?? null : null,
        }),
      };
    });

    return this.imports.createBatch({
      ...input,
      rows: input.rows,
      importedBy: this.context.actorUserId,
      suggestions,
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Import batch",
        operation: "save",
        table: "imported_transactions",
        migrationHint: "0047_finance_intake.sql",
      });
    });
  }

  async listImportedTransactions() {
    requireFinanceAccess(this.currentUser);
    return this.imports.listImportedTransactions();
  }

  async listReviewQueue(): Promise<{
    items: FinanceReviewQueueItem[];
    matches: FinanceImportDocumentMatchSuggestion[];
  }> {
    requireFinanceAccess(this.currentUser);
    const [imports, documents] = await Promise.all([
      this.imports.listImportedTransactions(),
      this.documentIntake.list(),
    ]);
    const matches = suggestImportDocumentMatches({ imports, documents });
    const matchByImportId = new Map(matches.map((match) => [match.importedTransactionId, match]));
    const items: FinanceReviewQueueItem[] = [];

    for (const row of imports) {
      if (row.status === "new" || row.status === "needs_review") {
        items.push({
          id: `import:${row.id}`,
          kind: "import_review",
          title: row.rawDescription,
          detail: row.suggestionReason ?? "Imported row needs review",
          amount: row.amount,
          date: row.transactionDate,
          confidence: row.suggestionConfidence,
          importedTransactionId: row.id,
        });
      }
      if (row.receiptStatus === "missing" || (row.amount < 0 && !row.linkedDocumentIntakeId && row.receiptStatus === "unknown")) {
        items.push({
          id: `receipt:${row.id}`,
          kind: "missing_receipt",
          title: `Missing receipt: ${row.rawDescription}`,
          detail: "Expense-like import has no linked document.",
          amount: row.amount,
          date: row.transactionDate,
          confidence: null,
          importedTransactionId: row.id,
        });
      }
      if (findRuleForText(`${row.rawDescription} ${row.rawMemo ?? ""}`)?.isTransfer) {
        items.push({
          id: `transfer:${row.id}`,
          kind: "possible_transfer",
          title: `Possible transfer: ${row.rawDescription}`,
          detail: "Rule matched transfer-like wording.",
          amount: row.amount,
          date: row.transactionDate,
          confidence: 0.7,
          importedTransactionId: row.id,
        });
      }
      const match = matchByImportId.get(row.id);
      if (match) {
        items.push({
          id: `match:${row.id}:${match.documentIntakeId}`,
          kind: "import_document_match",
          title: `Possible receipt match: ${row.rawDescription}`,
          detail: match.reasons.join(", "),
          amount: row.amount,
          date: row.transactionDate,
          confidence: match.confidence,
          importedTransactionId: row.id,
          documentIntakeId: match.documentIntakeId,
        });
      }
    }

    const duplicateGroups = new Map<string, ImportedTransaction[]>();
    for (const row of imports) {
      const key = `${row.transactionDate}:${row.amount}:${normalizeRuleText(row.rawDescription)}`;
      duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
    }
    for (const group of duplicateGroups.values()) {
      if (group.length > 1) {
        for (const row of group) {
          items.push({
            id: `duplicate:${row.id}`,
            kind: "possible_duplicate",
            title: `Possible duplicate: ${row.rawDescription}`,
            detail: "Same date, amount, and description as another import.",
            amount: row.amount,
            date: row.transactionDate,
            confidence: 0.9,
            importedTransactionId: row.id,
          });
        }
      }
    }

    for (const document of documents) {
      if (document.status === "new" || document.status === "needs_review") {
        items.push({
          id: `document:${document.id}`,
          kind: "document_review",
          title: document.fileName,
          detail: document.extractedVendor ?? "Document needs review",
          amount: document.extractedTotal,
          date: document.extractedDate,
          confidence: document.suggestionConfidence,
          documentIntakeId: document.id,
        });
      }
      if (document.suggestionConfidence > 0 && document.suggestionConfidence < 0.55) {
        items.push({
          id: `low-confidence-document:${document.id}`,
          kind: "low_confidence",
          title: `Low-confidence document: ${document.fileName}`,
          detail: document.suggestionReason ?? "Suggestion needs confirmation.",
          amount: document.extractedTotal,
          date: document.extractedDate,
          confidence: document.suggestionConfidence,
          documentIntakeId: document.id,
        });
      }
    }

    return { items, matches };
  }

  async approveImportedTransaction(row: ImportedTransaction) {
    requireFinanceAccess(this.currentUser);

    const fallbackCategory = row.suggestedCategoryId
      ?? (await this.categories.list({ filter: { type: row.amount >= 0 ? "income" : "expense" } }))[0]?.id;

    if (!fallbackCategory) {
      throw new Error("A category is required before approving this import.");
    }

    const transaction = await this.createTransaction({
      type: row.amount >= 0 ? "income" : "expense",
      status: "posted",
      transactionDate: row.transactionDate,
      contactId: row.suggestedContactId,
      accountId: row.sourceAccountId,
      categoryId: fallbackCategory,
      jobId: row.suggestedJobId,
      memo: row.rawDescription,
      referenceNumber: row.rawMemo,
      subtotal: Math.abs(row.amount),
      tax: 0,
      total: Math.abs(row.amount),
    });

    await this.imports.updateImportedTransactionStatus(row.id, {
      status: "matched",
      matchedTransactionId: transaction.id,
      reviewedBy: this.context.actorUserId,
      reviewedAt: new Date().toISOString(),
    });

    return transaction;
  }

  async linkImportToDocument(importedTransactionId: string, documentIntakeId: string) {
    requireFinanceAccess(this.currentUser);
    await Promise.all([
      this.imports.updateImportedTransactionReviewFields(importedTransactionId, {
        linkedDocumentIntakeId: documentIntakeId,
        receiptStatus: "linked",
        reviewedBy: this.context.actorUserId,
        reviewedAt: new Date().toISOString(),
      }),
      this.documentIntake.linkImportedTransaction(documentIntakeId, importedTransactionId),
    ]);
  }

  async finalizeMatchedImport(importedTransactionId: string, documentIntakeId: string) {
    requireFinanceAccess(this.currentUser);
    const imports = await this.imports.listImportedTransactions();
    const row = imports.find((candidate) => candidate.id === importedTransactionId);
    if (!row) {
      throw new Error("Imported transaction was not found.");
    }
    await this.linkImportToDocument(importedTransactionId, documentIntakeId);
    return this.approveImportedTransaction({ ...row, linkedDocumentIntakeId: documentIntakeId as ImportedTransaction["linkedDocumentIntakeId"] });
  }

  async rejectImportDocumentSuggestion(importedTransactionId: string) {
    requireFinanceAccess(this.currentUser);
    return this.imports.updateImportedTransactionReviewFields(importedTransactionId, {
      receiptStatus: "missing",
      reviewedBy: this.context.actorUserId,
      reviewedAt: new Date().toISOString(),
    });
  }

  async markImportedTransaction(id: string, status: "transfer" | "duplicate" | "ignored") {
    requireFinanceAccess(this.currentUser);
    return this.imports.updateImportedTransactionStatus(id, {
      status,
      reviewedBy: this.context.actorUserId,
      reviewedAt: new Date().toISOString(),
    });
  }

  async updateImportedReceiptStatus(
    id: string,
    input: { receiptStatus: ImportedTransaction["receiptStatus"]; snoozedUntil?: string | null },
  ) {
    requireFinanceAccess(this.currentUser);
    return this.imports.updateImportedTransactionReviewFields(id, {
      receiptStatus: input.receiptStatus,
      receiptSnoozedUntil: input.snoozedUntil ?? null,
      reviewedBy: this.context.actorUserId,
      reviewedAt: new Date().toISOString(),
    });
  }

  async bulkReviewImportedTransactions(input: {
    ids: string[];
    action: "approve" | "ignored" | "duplicate" | "transfer";
    categoryId?: string | null;
    contactId?: string | null;
  }) {
    requireFinanceAccess(this.currentUser);
    const imports = await this.imports.listImportedTransactions();
    const selected = imports.filter((row) => input.ids.includes(row.id));
    if (input.categoryId !== undefined || input.contactId !== undefined) {
      await Promise.all(selected.map((row) =>
        {
          const patch: Parameters<typeof this.imports.updateImportedTransactionReviewFields>[1] = {};
          if (input.categoryId !== undefined) {
            patch.suggestedCategoryId = input.categoryId;
          }
          if (input.contactId !== undefined) {
            patch.suggestedContactId = input.contactId;
          }
          return this.imports.updateImportedTransactionReviewFields(row.id, patch);
        },
      ));
    }
    if (input.action === "approve") {
      await Promise.all(selected.map((row) => this.approveImportedTransaction({
        ...row,
        suggestedCategoryId: (input.categoryId ?? row.suggestedCategoryId) as ImportedTransaction["suggestedCategoryId"],
        suggestedContactId: (input.contactId ?? row.suggestedContactId) as ImportedTransaction["suggestedContactId"],
      })));
      return;
    }
    await Promise.all(selected.map((row) => this.markImportedTransaction(row.id, input.action as "ignored" | "duplicate" | "transfer")));
  }

  async getReconciliationWorkspace(input: { accountId: string; startDate: string; endDate: string }) {
    requireFinanceAccess(this.currentUser);
    const [imports, transactions, sessions] = await Promise.all([
      this.imports.listImportedTransactions(),
      this.transactions.list({ filter: { accountId: input.accountId as never } }),
      this.reconciliation.listSessions({
        accountId: input.accountId,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    ]);

    const periodImports = imports.filter((row) =>
      row.sourceAccountId === input.accountId &&
      row.transactionDate >= input.startDate &&
      row.transactionDate <= input.endDate,
    );
    const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const summary = calculateReconciliationSummary(periodImports);
    const session = sessions.find((candidate) =>
      candidate.accountId === input.accountId &&
      candidate.startDate === input.startDate &&
      candidate.endDate === input.endDate,
    ) ?? null;

    return {
      imports: periodImports,
      transactionById,
      session,
      summary,
      unmatched: periodImports.filter((row) => row.status === "new" || row.status === "needs_review"),
      exceptions: periodImports.filter((row) => row.status === "duplicate" || row.status === "transfer" || row.status === "ignored"),
    };
  }

  async saveReconciliationSession(input: {
    accountId: string;
    startDate: string;
    endDate: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
  }) {
    requireFinanceAccess(this.currentUser);
    const workspace = await this.getReconciliationWorkspace(input);
    return this.reconciliation.upsertSession({
      ...input,
      summary: workspace.summary,
      status: "in_progress",
      actorUserId: this.context.actorUserId,
    });
  }

  async completeReconciliationSession(input: { sessionId: string; accountId: string; startDate: string; endDate: string }) {
    requireFinanceAccess(this.currentUser);
    const workspace = await this.getReconciliationWorkspace(input);
    return this.reconciliation.completeSession(input.sessionId, {
      summary: workspace.summary,
      completedBy: this.context.actorUserId,
    });
  }

  async markImportedTransactionReconciled(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.imports.updateImportedTransactionReviewFields(id, {
      status: "matched",
      reviewedBy: this.context.actorUserId,
      reviewedAt: new Date().toISOString(),
    });
  }

  async getMonthlyCloseWorkspace(month: string): Promise<{
    close: FinanceMonthlyClose | null;
    validation: FinanceMonthlyCloseValidation;
    metrics: FinanceMonthlyCloseMetrics;
    isLocked: boolean;
  }> {
    requireFinanceAccess(this.currentUser);
    const normalizedMonth = normalizeMonth(month);
    const [close, imports, transactions, documents, arInvoices, apBills] = await Promise.all([
      this.monthlyClose.getByMonth(normalizedMonth),
      this.imports.listImportedTransactions(),
      this.transactions.list(),
      this.documentIntake.list(),
      this.ar.list({ status: "outstanding" }),
      this.ap.list({ status: "outstanding" }),
    ]);
    const [start, end] = monthBounds(normalizedMonth);
    const monthImports = imports.filter((row) => row.transactionDate >= start && row.transactionDate <= end);
    const monthTransactions = transactions.filter((transaction) => transaction.transactionDate >= start && transaction.transactionDate <= end);
    const monthDocuments = documents.filter((document) => {
      const date = document.extractedDate ?? document.createdAt.slice(0, 10);
      return date >= start && date <= end;
    });
    const duplicateKeys = new Map<string, number>();
    for (const row of monthImports) {
      const key = `${row.transactionDate}:${row.amount}:${normalizeRuleText(row.rawDescription)}`;
      duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
    }

    const validation: FinanceMonthlyCloseValidation = {
      unreconciledImports: monthImports.filter((row) => row.status === "new" || row.status === "needs_review").length,
      missingReceipts: monthImports.filter((row) => row.receiptStatus === "missing").length,
      uncategorizedTransactions: monthTransactions.filter((transaction) => !transaction.categoryId).length,
      draftTransactions: monthTransactions.filter((transaction) => transaction.status === "draft").length,
      outstandingInvoices: 0,
      outstandingBills: 0,
      possibleDuplicates: [...duplicateKeys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
      snoozedReviewItems: monthImports.filter((row) => row.receiptStatus === "snoozed").length +
        monthDocuments.filter((document) => document.status === "needs_review").length,
    };
    const output = await this.getFinancialOutput({ startDate: start, endDate: end });

    return {
      close,
      validation,
      metrics: {
        revenue: output.profitLoss.revenue,
        expenses: output.profitLoss.expenses,
        profit: output.profitLoss.netProfit,
        gst: output.gst.netGst,
        transactionCount: output.profitLoss.transactionCount,
        missingReceiptsCount: validation.missingReceipts,
        outstandingAr: roundMoney(arInvoices.reduce((sum, invoice) => sum + invoice.amountOutstanding, 0)),
        outstandingAp: roundMoney(apBills.reduce((sum, bill) => sum + bill.amountOutstanding, 0)),
      },
      isLocked: close?.status === "closed",
    };
  }

  async updateMonthlyCloseStatus(month: string, status: "open" | "in_progress" | "closed") {
    requireFinanceAccess(this.currentUser);
    const workspace = await this.getMonthlyCloseWorkspace(month);
    return this.monthlyClose.updateStatus(normalizeMonth(month), {
      status,
      validation: workspace.validation,
      actorUserId: this.context.actorUserId,
    });
  }

  async isFinanceMonthLocked(date: string): Promise<boolean> {
    const close = await this.monthlyClose.getByMonth(normalizeMonth(date));
    return close?.status === "closed";
  }

  async getFinancialOutput(input: { startDate: string; endDate: string }): Promise<{
    profitLoss: FinanceProfitLossSummary;
    expenseCategories: FinanceExpenseCategorySummary;
    jobProfitability: FinanceJobProfitabilityRow[];
    gst: FinanceGstSummary;
    arAging: FinanceAgingSummary;
    apAging: FinanceAgingSummary;
  }> {
    requireFinanceAccess(this.currentUser);
    const [transactions, categories, jobs, arInvoices, apBills] = await Promise.all([
      this.transactions.list(),
      this.categories.list({ filter: { includeInactive: true } }),
      this.lookups.listJobs(),
      this.ar.list({ status: "outstanding" }),
      this.ap.list({ status: "outstanding" }),
    ]);
    const periodTransactions = transactions.filter((transaction) =>
      transaction.transactionDate >= input.startDate &&
      transaction.transactionDate <= input.endDate &&
      transaction.status !== "void",
    );
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const revenue = roundMoney(periodTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.total, 0));
    const expenses = roundMoney(periodTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.total, 0));
    const categoryTotals = new Map<string, { name: string; type: "income" | "expense"; total: number; categoryId: string | null }>();

    for (const transaction of periodTransactions) {
      const category = categoryById.get(transaction.categoryId);
      const key = transaction.categoryId ?? "uncategorized";
      const current = categoryTotals.get(key) ?? {
        name: category?.name ?? "Uncategorized",
        type: category?.type ?? transaction.type,
        total: 0,
        categoryId: transaction.categoryId ?? null,
      };
      current.total += transaction.total;
      categoryTotals.set(key, current);
    }

    const categoryBreakdown = [...categoryTotals.values()]
      .map((row) => ({
        categoryId: row.categoryId as FinanceProfitLossSummary["categoryBreakdown"][number]["categoryId"],
        categoryName: row.name,
        type: row.type,
        total: roundMoney(row.total),
        percentage: roundMoney((row.total / Math.max(row.type === "income" ? revenue : expenses, 1)) * 100),
      }))
      .sort((left, right) => right.total - left.total);

    const expenseRows = categoryBreakdown.filter((row) => row.type === "expense");
    const gst: FinanceGstSummary = {
      gstCollected: roundMoney(periodTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + transaction.tax, 0)),
      gstPaid: roundMoney(periodTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.tax, 0)),
      netGst: 0,
    };
    gst.netGst = roundMoney(gst.gstCollected - gst.gstPaid);

    const jobRows = new Map<string, FinanceJobProfitabilityRow>();
    for (const transaction of periodTransactions.filter((candidate) => candidate.jobId)) {
      const job = jobById.get(transaction.jobId!);
      const key = transaction.jobId!;
      const row = jobRows.get(key) ?? {
        jobId: transaction.jobId,
        jobNumber: job?.number ?? "Unassigned",
        jobTitle: job?.title ?? "Unknown job",
        revenue: 0,
        materials: 0,
        labour: 0,
        subcontractors: 0,
        totalCost: 0,
        profit: 0,
        margin: 0,
      };
      const categoryName = categoryById.get(transaction.categoryId)?.name.toLowerCase() ?? "";
      if (transaction.type === "income") {
        row.revenue += transaction.total;
      } else if (categoryName.includes("material")) {
        row.materials += transaction.total;
      } else if (categoryName.includes("subcontract")) {
        row.subcontractors += transaction.total;
      } else if (categoryName.includes("labour") || categoryName.includes("labor")) {
        row.labour += transaction.total;
      } else {
        row.totalCost += transaction.total;
      }
      row.totalCost = roundMoney(row.materials + row.labour + row.subcontractors + row.totalCost);
      row.profit = roundMoney(row.revenue - row.totalCost);
      row.margin = row.revenue > 0 ? roundMoney((row.profit / row.revenue) * 100) : 0;
      jobRows.set(key, row);
    }

    return {
      profitLoss: {
        revenue,
        expenses,
        netProfit: roundMoney(revenue - expenses),
        transactionCount: periodTransactions.length,
        categoryBreakdown,
      },
      expenseCategories: {
        totalExpenses: expenses,
        rows: expenseRows,
      },
      jobProfitability: [...jobRows.values()].sort((left, right) => right.revenue - left.revenue),
      gst,
      arAging: buildAgingSummary(arInvoices.map((invoice) => ({
        dueDate: invoice.dueDate,
        outstanding: invoice.amountOutstanding,
      }))),
      apAging: buildAgingSummary(apBills.map((bill) => ({
        dueDate: bill.dueDate,
        outstanding: bill.amountOutstanding,
      }))),
    };
  }

  async listAccountsReceivable(filter?: { status?: "all" | "outstanding" | "overdue" }) {
    requireFinanceAccess(this.currentUser);
    await this.ar.syncFromInvoices();
    return this.ar.list(filter);
  }

  async matchAccountsReceivablePayment(input: {
    arInvoiceId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
  }) {
    requireFinanceAccess(this.currentUser);
    const invoice = await this.ar.matchPayment({
      ...input,
      amount: normalizeAmount(input.amount, "Payment amount"),
      actorUserId: this.context.actorUserId,
    });
    if (input.importedTransactionId) {
      await this.imports.updateImportedTransactionReviewFields(input.importedTransactionId, {
        status: "matched",
        reviewedBy: this.context.actorUserId,
        reviewedAt: new Date().toISOString(),
      });
    }
    return invoice;
  }

  async listAccountsPayable(filter?: { status?: "all" | "outstanding" | "overdue" }) {
    requireFinanceAccess(this.currentUser);
    return this.ap.list(filter);
  }

  async createAccountsPayableBill(input: CreateFinanceApBillInput) {
    requireFinanceAccess(this.currentUser);
    return this.ap.createBill({
      ...input,
      vendorName: requireName(input.vendorName, "Vendor"),
      subtotal: normalizeOptionalAmount(input.subtotal),
      tax: normalizeOptionalAmount(input.tax),
      total: normalizeAmount(input.total, "Bill total"),
      actorUserId: this.context.actorUserId,
    });
  }

  async matchAccountsPayablePayment(input: {
    apBillId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
  }) {
    requireFinanceAccess(this.currentUser);
    const bill = await this.ap.matchPayment({
      ...input,
      amount: normalizeAmount(input.amount, "Payment amount"),
      actorUserId: this.context.actorUserId,
    });
    if (input.importedTransactionId) {
      await this.imports.updateImportedTransactionReviewFields(input.importedTransactionId, {
        status: "matched",
        reviewedBy: this.context.actorUserId,
        reviewedAt: new Date().toISOString(),
      });
    }
    return bill;
  }

  async listDocumentIntake() {
    requireFinanceAccess(this.currentUser);
    return this.documentIntake.list();
  }

  async createDocumentIntake(input: CreateFinanceDocumentIntakeInput) {
    requireFinanceAccess(this.currentUser);
    const [contacts, categories, jobs] = await Promise.all([
      this.lookups.listContacts(),
      this.categories.list({ filter: { includeInactive: false } }),
      this.lookups.listJobs(),
    ]);
    const suggestion = suggestFinanceLinks({
      text: `${input.extractedVendor ?? ""} ${input.fileName}`,
      contacts,
      categories,
      jobs,
    });

    return this.documentIntake.create({
      ...input,
      uploadedBy: this.context.actorUserId,
      suggestion,
    }).catch((error) => {
      throw normalizePersistenceError(error, {
        entityLabel: "Document intake",
        operation: "save",
        table: "finance_document_intake",
        migrationHint: "0047_finance_intake.sql",
      });
    });
  }

  async linkDocumentIntake(id: string, transactionId: string) {
    requireFinanceAccess(this.currentUser);
    return this.documentIntake.updateStatus(id, {
      status: "matched",
      linkedTransactionId: transactionId,
    });
  }

  async createDraftTransactionFromDocument(document: FinanceDocumentIntake) {
    requireFinanceAccess(this.currentUser);
    const account = (await this.accounts.list({ filter: { includeInactive: false } }))[0];
    const category = document.suggestedCategoryId
      ?? (await this.categories.list({ filter: { type: "expense" } }))[0]?.id;

    if (!account || !category) {
      throw new Error("An active account and expense category are required before creating a draft transaction.");
    }

    const total = document.extractedTotal ?? 0;
    const tax = document.extractedTax ?? 0;
    const transaction = await this.createTransaction({
      type: "expense",
      status: "draft",
      transactionDate: document.extractedDate ?? new Date().toISOString().slice(0, 10),
      contactId: document.suggestedContactId,
      accountId: account.id,
      categoryId: category,
      jobId: document.suggestedJobId,
      memo: document.extractedVendor ?? document.fileName,
      subtotal: document.extractedSubtotal ?? Math.max(total - tax, 0),
      tax,
      total,
    });

    await this.linkDocumentIntake(document.id, transaction.id);
    return transaction;
  }

  async ignoreDocumentIntake(id: string) {
    requireFinanceAccess(this.currentUser);
    return this.documentIntake.updateStatus(id, {
      status: "ignored",
    });
  }

  private normalizeTransactionInput<TInput extends CreateFinanceTransactionInput | UpdateFinanceTransactionInput>(
    input: TInput,
  ): TInput {
    const normalized = { ...input };
    if (input.subtotal !== undefined) {
      normalized.subtotal = normalizeAmount(input.subtotal, "Subtotal");
    }
    if (input.tax !== undefined) {
      normalized.tax = normalizeOptionalAmount(input.tax);
    }
    if (input.total !== undefined) {
      normalized.total = normalizeAmount(input.total, "Total");
    }
    return normalized;
  }
}

function calculateReconciliationSummary(rows: ImportedTransaction[]): FinanceReconciliationSummary {
  const importedTotal = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
  const matchedTotal = roundMoney(rows
    .filter((row) => row.status === "matched")
    .reduce((sum, row) => sum + row.amount, 0));
  const unmatchedTotal = roundMoney(rows
    .filter((row) => row.status === "new" || row.status === "needs_review")
    .reduce((sum, row) => sum + row.amount, 0));
  return {
    importedTotal,
    matchedTotal,
    unmatchedTotal,
    difference: roundMoney(importedTotal - matchedTotal),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function monthBounds(month: string): [string, string] {
  const start = normalizeMonth(month);
  const nextMonth = new Date(`${start}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return [start, nextMonth.toISOString().slice(0, 10)];
}

function buildAgingSummary(rows: Array<{ dueDate: string | null; outstanding: number }>): FinanceAgingSummary {
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const buckets: FinanceAgingSummary["buckets"] = [
    { label: "current", count: 0, total: 0 },
    { label: "30_days", count: 0, total: 0 },
    { label: "60_days", count: 0, total: 0 },
    { label: "90_plus", count: 0, total: 0 },
  ];

  for (const row of rows.filter((candidate) => candidate.outstanding > 0)) {
    const due = row.dueDate ? new Date(row.dueDate).getTime() : today;
    const daysPastDue = Math.max(0, Math.floor((today - due) / 86_400_000));
    const bucketIndex = daysPastDue <= 0 ? 0 : daysPastDue <= 30 ? 1 : daysPastDue <= 60 ? 2 : 3;
    const bucket = buckets[bucketIndex]!;
    bucket.count += 1;
    bucket.total = roundMoney(bucket.total + row.outstanding);
  }

  return {
    totalOutstanding: roundMoney(buckets.reduce((sum, bucket) => sum + bucket.total, 0)),
    buckets,
  };
}

function normalizeSuggestionText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9#-]+/g, " ").replace(/\s+/g, " ").trim();
}

function suggestFinanceLinks(input: {
  text: string;
  contacts: Array<{ id: string; displayName: string; companyName: string | null }>;
  categories: Array<{ id: string; name: string; type: "income" | "expense" }>;
  jobs: Array<{ id: string; number: string; title: string }>;
}) {
  const text = normalizeSuggestionText(input.text);
  const contact = input.contacts.find((candidate) => {
    const names = [candidate.displayName, candidate.companyName ?? ""]
      .map(normalizeSuggestionText)
      .filter(Boolean);
    return names.some((name) => name.length >= 3 && text.includes(name));
  });

  const recurringRule = findRuleForText(input.text);
  const categoryKeywords: Array<{ keywords: string[]; match: string }> = [
    { match: "Materials", keywords: ["home depot", "supplier", "wholesale", "lumen", "gescan", "rexel", "wire", "materials"] },
    { match: "Fuel and Vehicle", keywords: ["shell", "chevron", "petro", "esso", "fuel", "gas", "parking"] },
    { match: "Permits and Fees", keywords: ["permit", "inspection", "city of", "municipal"] },
    { match: "Equipment", keywords: ["rental", "tool", "equipment", "hilti"] },
    { match: "Subcontractors", keywords: ["subcontract", "contractor"] },
    { match: "Sales Income", keywords: ["deposit", "payment", "invoice", "etransfer", "e-transfer"] },
  ];
  const categoryRule = recurringRule?.categoryName
    ? { keywords: recurringRule.keywords, match: recurringRule.categoryName }
    : categoryKeywords.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  const category = categoryRule
    ? input.categories.find((candidate) => candidate.name.toLowerCase() === categoryRule.match.toLowerCase())
    : null;

  const job = input.jobs.find((candidate) => {
    const number = normalizeSuggestionText(candidate.number);
    const title = normalizeSuggestionText(candidate.title);
    return (number && text.includes(number)) || (title.length >= 6 && text.includes(title));
  });

  const confidence = Math.min(1, (contact ? 0.4 : 0) + (category ? 0.35 : 0) + (job ? 0.25 : 0));
  const reasons = [
    contact ? "contact alias" : null,
    category ? `category keyword: ${category.name}` : null,
    job ? "job number/title" : null,
  ].filter(Boolean);

  return {
    contactId: contact?.id ?? null,
    categoryId: category?.id ?? null,
    jobId: job?.id ?? null,
    confidence,
    reason: reasons.join(", ") || null,
  };
}
