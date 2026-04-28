import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { contactsMapper } from "@/data/mappers/contacts.mapper";
import {
  financeAccountMapper,
  financeApBillMapper,
  financeApPaymentMapper,
  financeArInvoiceMapper,
  financeArPaymentMapper,
  financeCategoryMapper,
  financeDocumentIntakeMapper,
  financeImportBatchMapper,
  financeMonthlyCloseMapper,
  financeReconciliationSessionMapper,
  financeTransactionMapper,
  type FinanceAccountRow,
  type FinanceApBillRow,
  type FinanceArInvoiceRow,
  type FinanceCategoryRow,
  type FinanceDocumentIntakeRow,
  type FinanceImportBatchRow,
  type FinanceMonthlyCloseRow,
  type FinanceReconciliationSessionRow,
  type FinanceTransactionRow,
  importedTransactionMapper,
  type ImportedTransactionRow,
} from "@/data/mappers/finance.mapper";
import type {
  FinanceAccountFilter,
  FinanceAccountsRepository,
  FinanceApRepository,
  FinanceArRepository,
  FinanceCategoriesRepository,
  FinanceCategoryFilter,
  FinanceDocumentIntakeRepository,
  FinanceImportsRepository,
  FinanceLookupRepository,
  FinanceMonthlyCloseRepository,
  FinanceReconciliationRepository,
  FinanceTransactionsRepository,
} from "@/data/repositories/finance.repo";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type { Contact } from "@/domain/contacts/types";
import type {
  CreateFinanceAccountInput,
  CreateFinanceApBillInput,
  CreateFinanceCategoryInput,
  CreateFinanceDocumentIntakeInput,
  CreateImportBatchInput,
  CreateFinanceTransactionInput,
  FinanceDocumentOption,
  FinanceJobOption,
  FinanceTransactionFilter,
  UpdateFinanceAccountInput,
  UpdateFinanceCategoryInput,
  UpdateFinanceTransactionInput,
} from "@/domain/finance/types";
import { createId } from "@/lib/create-id";

type FinanceClient = SupabaseClient<Database> & {
  from(table: "finance_accounts"): any;
  from(table: "finance_categories"): any;
  from(table: "finance_transactions"): any;
  from(table: "finance_import_batches"): any;
  from(table: "imported_transactions"): any;
  from(table: "finance_document_intake"): any;
  from(table: "finance_reconciliation_sessions"): any;
  from(table: "finance_monthly_closes"): any;
  from(table: "finance_ar_invoices"): any;
  from(table: "finance_ar_payments"): any;
  from(table: "finance_ap_bills"): any;
  from(table: "finance_ap_payments"): any;
};

function applyCommonListFilters<TQuery>(
  query: TQuery,
  options: { includeInactive?: boolean } | undefined,
): TQuery {
  if (options?.includeInactive) {
    return query;
  }
  return (query as any).eq("is_active", true);
}

export class FinanceAccountsRepositoryImpl implements FinanceAccountsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async list(options?: { filter?: FinanceAccountFilter }) {
    let query = this.client
      .from("finance_accounts")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    query = applyCommonListFilters(query, options?.filter);

    if (options?.filter?.search) {
      query = query.ilike("name", `%${options.filter.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const accounts = ((data ?? []) as FinanceAccountRow[]).map(financeAccountMapper.toDomain);
    await localDb.financeAccounts.bulkPut(accounts);
    return accounts;
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("finance_accounts")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data ? financeAccountMapper.toDomain(data as FinanceAccountRow) : null;
  }

  async create(input: CreateFinanceAccountInput) {
    const { data, error } = await this.client
      .from("finance_accounts")
      .insert({
        org_id: this.context.orgId,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        ...financeAccountMapper.toInsert(input),
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const account = financeAccountMapper.toDomain(data as FinanceAccountRow);
    await localDb.financeAccounts.put(account);
    return account;
  }

  async update(id: string, input: UpdateFinanceAccountInput) {
    const { data, error } = await this.client
      .from("finance_accounts")
      .update({
        updated_by: this.context.actorUserId,
        ...financeAccountMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const account = financeAccountMapper.toDomain(data as FinanceAccountRow);
    await localDb.financeAccounts.put(account);
    return account;
  }

  async softDelete(id: string) {
    const { error } = await this.client
      .from("finance_accounts")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
}

export class FinanceCategoriesRepositoryImpl implements FinanceCategoriesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async list(options?: { filter?: FinanceCategoryFilter }) {
    let query = this.client
      .from("finance_categories")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    query = applyCommonListFilters(query, options?.filter);

    if (options?.filter?.type && options.filter.type !== "all") {
      query = query.eq("type", options.filter.type);
    }
    if (options?.filter?.search) {
      query = query.ilike("name", `%${options.filter.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const categories = ((data ?? []) as FinanceCategoryRow[]).map(financeCategoryMapper.toDomain);
    await localDb.financeCategories.bulkPut(categories);
    return categories;
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("finance_categories")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data ? financeCategoryMapper.toDomain(data as FinanceCategoryRow) : null;
  }

  async create(input: CreateFinanceCategoryInput) {
    const { data, error } = await this.client
      .from("finance_categories")
      .insert({
        org_id: this.context.orgId,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        ...financeCategoryMapper.toInsert(input),
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const category = financeCategoryMapper.toDomain(data as FinanceCategoryRow);
    await localDb.financeCategories.put(category);
    return category;
  }

  async update(id: string, input: UpdateFinanceCategoryInput) {
    const { data, error } = await this.client
      .from("finance_categories")
      .update({
        updated_by: this.context.actorUserId,
        ...financeCategoryMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const category = financeCategoryMapper.toDomain(data as FinanceCategoryRow);
    await localDb.financeCategories.put(category);
    return category;
  }

  async softDelete(id: string) {
    const { error } = await this.client
      .from("finance_categories")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
}

export class FinanceTransactionsRepositoryImpl implements FinanceTransactionsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async list(options?: { filter?: FinanceTransactionFilter }) {
    let query = this.client
      .from("finance_transactions")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    const filter = options?.filter;
    if (filter?.type && filter.type !== "all") {
      query = query.eq("type", filter.type);
    }
    if (filter?.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter?.accountId && filter.accountId !== "all") {
      query = query.eq("account_id", filter.accountId);
    }
    if (filter?.categoryId && filter.categoryId !== "all") {
      query = query.eq("category_id", filter.categoryId);
    }
    if (filter?.search) {
      query = query.or(`memo.ilike.%${filter.search}%,reference_number.ilike.%${filter.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const transactions = ((data ?? []) as FinanceTransactionRow[]).map(financeTransactionMapper.toDomain);
    await localDb.financeTransactions.bulkPut(transactions);
    return transactions;
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("finance_transactions")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data ? financeTransactionMapper.toDomain(data as FinanceTransactionRow) : null;
  }

  async create(input: CreateFinanceTransactionInput) {
    const { data, error } = await this.client
      .from("finance_transactions")
      .insert({
        org_id: this.context.orgId,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        ...financeTransactionMapper.toInsert(input),
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const transaction = financeTransactionMapper.toDomain(data as FinanceTransactionRow);
    await localDb.financeTransactions.put(transaction);
    return transaction;
  }

  async update(id: string, input: UpdateFinanceTransactionInput) {
    const { data, error } = await this.client
      .from("finance_transactions")
      .update({
        updated_by: this.context.actorUserId,
        ...financeTransactionMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const transaction = financeTransactionMapper.toDomain(data as FinanceTransactionRow);
    await localDb.financeTransactions.put(transaction);
    return transaction;
  }

  async softDelete(id: string) {
    const { error } = await this.client
      .from("finance_transactions")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
}

export class FinanceLookupRepositoryImpl implements FinanceLookupRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async listContacts(): Promise<Contact[]> {
    const { data, error } = await this.client
      .from("contacts")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => contactsMapper.toDomain(row));
  }

  async listJobs(): Promise<FinanceJobOption[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("id, number, title")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("number", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id as FinanceJobOption["id"],
      number: row.number,
      title: row.title,
    }));
  }

  async listDocuments(): Promise<FinanceDocumentOption[]> {
    const { data, error } = await this.client
      .from("documents")
      .select("id, display_name")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id as FinanceDocumentOption["id"],
      fileName: row.display_name,
    }));
  }
}

export class FinanceImportsRepositoryImpl implements FinanceImportsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async listBatches() {
    const { data, error } = await this.client
      .from("finance_import_batches")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const batches = ((data ?? []) as FinanceImportBatchRow[]).map(financeImportBatchMapper.toDomain);
    await localDb.financeImportBatches.bulkPut(batches);
    return batches;
  }

  async createBatch(input: CreateImportBatchInput & {
    importedBy: string | null;
    suggestions: Array<{
      contactId: string | null;
      categoryId: string | null;
      jobId: string | null;
      confidence: number;
      reason: string | null;
      receiptStatus?: ImportedTransactionRow["receipt_status"];
    }>;
  }) {
    const batchId = createId();
    const now = new Date().toISOString();
    const { data: batchData, error: batchError } = await this.client
      .from("finance_import_batches")
      .insert({
        id: batchId,
        org_id: this.context.orgId,
        source_account_id: input.sourceAccountId,
        source_type: input.sourceType,
        file_name: input.fileName,
        row_count: input.rows.length,
        imported_by: input.importedBy,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (batchError) {
      throw batchError;
    }

    const rows = input.rows.map((row, index) => {
      const suggestion = input.suggestions[index] ?? {
        contactId: null,
        categoryId: null,
        jobId: null,
        confidence: 0,
        reason: null,
      };

      return {
        id: createId(),
        org_id: this.context.orgId,
        batch_id: batchId,
        source_account_id: input.sourceAccountId,
        status: suggestion.confidence > 0 ? "needs_review" : "new",
        transaction_date: row.transactionDate,
        raw_description: row.rawDescription,
        raw_memo: row.rawMemo ?? null,
        amount: row.amount,
        suggested_contact_id: suggestion.contactId,
        suggested_category_id: suggestion.categoryId,
        suggested_job_id: suggestion.jobId,
        suggestion_confidence: suggestion.confidence,
        suggestion_reason: suggestion.reason,
        receipt_status: suggestion.receiptStatus ?? "unknown",
        created_at: now,
        updated_at: now,
      };
    });

    const { data: rowData, error: rowError } = await this.client
      .from("imported_transactions")
      .insert(rows)
      .select("*");

    if (rowError) {
      throw rowError;
    }

    const batch = financeImportBatchMapper.toDomain(batchData as FinanceImportBatchRow);
    const importedRows = ((rowData ?? []) as ImportedTransactionRow[]).map(importedTransactionMapper.toDomain);
    await localDb.financeImportBatches.put(batch);
    await localDb.importedTransactions.bulkPut(importedRows);
    return batch;
  }

  async listImportedTransactions() {
    const { data, error } = await this.client
      .from("imported_transactions")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = ((data ?? []) as ImportedTransactionRow[]).map(importedTransactionMapper.toDomain);
    await localDb.importedTransactions.bulkPut(rows);
    return rows;
  }

  async updateImportedTransactionStatus(
    id: string,
    input: {
      status: ImportedTransactionRow["status"];
      matchedTransactionId?: string | null;
      reviewedBy: string | null;
      reviewedAt: string;
    },
  ) {
    const { data, error } = await this.client
      .from("imported_transactions")
      .update({
        status: input.status,
        matched_transaction_id: input.matchedTransactionId ?? null,
        receipt_status: input.status === "matched" ? "linked" : undefined,
        reviewed_by: input.reviewedBy,
        reviewed_at: input.reviewedAt,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const row = importedTransactionMapper.toDomain(data as ImportedTransactionRow);
    await localDb.importedTransactions.put(row);
    return row;
  }

  async updateImportedTransactionReviewFields(
    id: string,
    input: {
      status?: ImportedTransactionRow["status"];
      suggestedContactId?: string | null;
      suggestedCategoryId?: string | null;
      linkedDocumentIntakeId?: string | null;
      receiptStatus?: ImportedTransactionRow["receipt_status"];
      receiptSnoozedUntil?: string | null;
      reviewedBy?: string | null;
      reviewedAt?: string | null;
    },
  ) {
    const patch = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.suggestedContactId !== undefined ? { suggested_contact_id: input.suggestedContactId } : {}),
      ...(input.suggestedCategoryId !== undefined ? { suggested_category_id: input.suggestedCategoryId } : {}),
      ...(input.linkedDocumentIntakeId !== undefined ? { linked_document_intake_id: input.linkedDocumentIntakeId } : {}),
      ...(input.receiptStatus !== undefined ? { receipt_status: input.receiptStatus } : {}),
      ...(input.receiptSnoozedUntil !== undefined ? { receipt_snoozed_until: input.receiptSnoozedUntil } : {}),
      ...(input.reviewedBy !== undefined ? { reviewed_by: input.reviewedBy } : {}),
      ...(input.reviewedAt !== undefined ? { reviewed_at: input.reviewedAt } : {}),
    };

    const { data, error } = await this.client
      .from("imported_transactions")
      .update(patch)
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const row = importedTransactionMapper.toDomain(data as ImportedTransactionRow);
    await localDb.importedTransactions.put(row);
    return row;
  }
}

export class FinanceDocumentIntakeRepositoryImpl implements FinanceDocumentIntakeRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async list() {
    const { data, error } = await this.client
      .from("finance_document_intake")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const documents = ((data ?? []) as FinanceDocumentIntakeRow[]).map(financeDocumentIntakeMapper.toDomain);
    await localDb.financeDocumentIntake.bulkPut(documents);
    return documents;
  }

  async create(input: CreateFinanceDocumentIntakeInput & {
    uploadedBy: string | null;
    suggestion: {
      contactId: string | null;
      categoryId: string | null;
      jobId: string | null;
      confidence: number;
      reason: string | null;
    };
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("finance_document_intake")
      .insert({
        id: createId(),
        org_id: this.context.orgId,
        status: input.suggestion.confidence > 0 ? "needs_review" : "new",
        source: "manual",
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType ?? null,
        size_bytes: input.sizeBytes ?? null,
        file_size: input.sizeBytes ?? null,
        uploaded_at: input.uploadedAt ?? now,
        extracted_vendor: input.extractedVendor ?? null,
        extracted_date: input.extractedDate ?? null,
        extracted_subtotal: input.extractedSubtotal ?? null,
        extracted_tax: input.extractedTax ?? null,
        extracted_total: input.extractedTotal ?? null,
        suggested_contact_id: input.suggestion.contactId,
        suggested_category_id: input.suggestion.categoryId,
        suggested_job_id: input.suggestion.jobId,
        suggestion_confidence: input.suggestion.confidence,
        suggestion_reason: input.suggestion.reason,
        uploaded_by: input.uploadedBy,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const document = financeDocumentIntakeMapper.toDomain(data as FinanceDocumentIntakeRow);
    await localDb.financeDocumentIntake.put(document);
    return document;
  }

  async updateStatus(id: string, input: { status: FinanceDocumentIntakeRow["status"]; linkedTransactionId?: string | null }) {
    const { data, error } = await this.client
      .from("finance_document_intake")
      .update({
        status: input.status,
        linked_transaction_id: input.linkedTransactionId ?? null,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const document = financeDocumentIntakeMapper.toDomain(data as FinanceDocumentIntakeRow);
    await localDb.financeDocumentIntake.put(document);
    return document;
  }

  async linkImportedTransaction(id: string, importedTransactionId: string | null) {
    const { data, error } = await this.client
      .from("finance_document_intake")
      .update({
        linked_imported_transaction_id: importedTransactionId,
        status: importedTransactionId ? "matched" : "needs_review",
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const document = financeDocumentIntakeMapper.toDomain(data as FinanceDocumentIntakeRow);
    await localDb.financeDocumentIntake.put(document);
    return document;
  }
}

export class FinanceReconciliationRepositoryImpl implements FinanceReconciliationRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async listSessions(filter?: { accountId?: string; startDate?: string; endDate?: string }) {
    let query = this.client
      .from("finance_reconciliation_sessions")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });

    if (filter?.accountId) {
      query = query.eq("account_id", filter.accountId);
    }
    if (filter?.startDate) {
      query = query.gte("start_date", filter.startDate);
    }
    if (filter?.endDate) {
      query = query.lte("end_date", filter.endDate);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const sessions = ((data ?? []) as FinanceReconciliationSessionRow[]).map(financeReconciliationSessionMapper.toDomain);
    await localDb.financeReconciliationSessions.bulkPut(sessions);
    return sessions;
  }

  async upsertSession(input: {
    accountId: string;
    startDate: string;
    endDate: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
    summary: { importedTotal: number; matchedTotal: number; unmatchedTotal: number; difference: number };
    status: FinanceReconciliationSessionRow["status"];
    actorUserId: string | null;
  }) {
    const { data, error } = await this.client
      .from("finance_reconciliation_sessions")
      .upsert({
        org_id: this.context.orgId,
        account_id: input.accountId,
        start_date: input.startDate,
        end_date: input.endDate,
        opening_balance: input.openingBalance ?? null,
        closing_balance: input.closingBalance ?? null,
        imported_total: input.summary.importedTotal,
        matched_total: input.summary.matchedTotal,
        unreconciled_total: input.summary.unmatchedTotal,
        status: input.status,
        created_by: input.actorUserId,
      }, { onConflict: "org_id,account_id,start_date,end_date" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const session = financeReconciliationSessionMapper.toDomain(data as FinanceReconciliationSessionRow);
    await localDb.financeReconciliationSessions.put(session);
    return session;
  }

  async completeSession(id: string, input: {
    summary: { importedTotal: number; matchedTotal: number; unmatchedTotal: number; difference: number };
    completedBy: string | null;
  }) {
    const { data, error } = await this.client
      .from("finance_reconciliation_sessions")
      .update({
        imported_total: input.summary.importedTotal,
        matched_total: input.summary.matchedTotal,
        unreconciled_total: input.summary.unmatchedTotal,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: input.completedBy,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const session = financeReconciliationSessionMapper.toDomain(data as FinanceReconciliationSessionRow);
    await localDb.financeReconciliationSessions.put(session);
    return session;
  }
}

export class FinanceMonthlyCloseRepositoryImpl implements FinanceMonthlyCloseRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async getByMonth(month: string) {
    const { data, error } = await this.client
      .from("finance_monthly_closes")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("month", month)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data ? financeMonthlyCloseMapper.toDomain(data as FinanceMonthlyCloseRow) : null;
  }

  async upsertMonth(input: {
    month: string;
    status: FinanceMonthlyCloseRow["status"];
    validation: {
      unreconciledImports: number;
      missingReceipts: number;
      uncategorizedTransactions: number;
      draftTransactions: number;
      outstandingInvoices: number;
      outstandingBills: number;
      possibleDuplicates: number;
      snoozedReviewItems: number;
    };
    actorUserId: string | null;
  }) {
    const payload = this.toPayload(input);
    const { data, error } = await this.client
      .from("finance_monthly_closes")
      .upsert(payload, { onConflict: "org_id,month" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const close = financeMonthlyCloseMapper.toDomain(data as FinanceMonthlyCloseRow);
    await localDb.financeMonthlyCloses.put(close);
    return close;
  }

  async updateStatus(month: string, input: {
    status: FinanceMonthlyCloseRow["status"];
    validation: {
      unreconciledImports: number;
      missingReceipts: number;
      uncategorizedTransactions: number;
      draftTransactions: number;
      outstandingInvoices: number;
      outstandingBills: number;
      possibleDuplicates: number;
      snoozedReviewItems: number;
    };
    actorUserId: string | null;
  }) {
    return this.upsertMonth({ month, ...input });
  }

  private toPayload(input: Parameters<FinanceMonthlyCloseRepositoryImpl["upsertMonth"]>[0]) {
    return {
      org_id: this.context.orgId,
      month: input.month,
      status: input.status,
      unreconciled_imports_count: input.validation.unreconciledImports,
      missing_receipts_count: input.validation.missingReceipts,
      uncategorized_transactions_count: input.validation.uncategorizedTransactions,
      draft_transactions_count: input.validation.draftTransactions,
      outstanding_invoices_count: input.validation.outstandingInvoices,
      outstanding_bills_count: input.validation.outstandingBills,
      possible_duplicates_count: input.validation.possibleDuplicates,
      snoozed_review_items_count: input.validation.snoozedReviewItems,
      closed_at: input.status === "closed" ? new Date().toISOString() : null,
      closed_by: input.status === "closed" ? input.actorUserId : null,
      created_by: input.actorUserId,
    };
  }
}

function arStatus(total: number, paid: number, dueDate: string | null): FinanceArInvoiceRow["status"] {
  const outstanding = Math.max(total - paid, 0);
  if (outstanding <= 0) {
    return "paid";
  }
  if (paid > 0) {
    return "partially_paid";
  }
  if (dueDate && dueDate < new Date().toISOString().slice(0, 10)) {
    return "overdue";
  }
  return "sent";
}

function apStatus(total: number, paid: number, dueDate: string | null, fallback: FinanceApBillRow["status"] = "posted"): FinanceApBillRow["status"] {
  const outstanding = Math.max(total - paid, 0);
  if (outstanding <= 0) {
    return "paid";
  }
  if (paid > 0) {
    return "partially_paid";
  }
  if (dueDate && dueDate < new Date().toISOString().slice(0, 10)) {
    return "overdue";
  }
  return fallback === "draft" ? "draft" : "posted";
}

export class FinanceArRepositoryImpl implements FinanceArRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async syncFromInvoices() {
    const { data, error } = await this.client
      .from("invoices" as never)
      .select("id, org_id, contact_id, job_id, number, status, due_date, subtotal, tax_amount, total, amount_paid, balance_due, created_at, deleted_at, contacts(name), jobs(number,title)")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null);

    if (error) {
      throw error;
    }

    const rows = (data ?? []).map((invoice: any) => {
      const paid = Number(invoice.amount_paid ?? 0);
      const total = Number(invoice.total ?? 0);
      const jobNumber = invoice.jobs?.number ?? null;
      const jobTitle = invoice.jobs?.title ?? null;
      return {
        org_id: this.context.orgId,
        invoice_id: invoice.id,
        customer_contact_id: invoice.contact_id,
        customer_name: invoice.contacts?.name ?? "Customer",
        job_id: invoice.job_id,
        job_label: jobNumber ? `${jobNumber} · ${jobTitle ?? ""}`.trim() : null,
        issue_date: invoice.created_at?.slice(0, 10) ?? null,
        due_date: invoice.due_date,
        subtotal: invoice.subtotal ?? 0,
        tax: invoice.tax_amount ?? 0,
        total,
        amount_paid: paid,
        amount_outstanding: Math.max(total - paid, 0),
        status: arStatus(total, paid, invoice.due_date),
      };
    });

    if (rows.length > 0) {
      const { error: upsertError } = await this.client
        .from("finance_ar_invoices")
        .upsert(rows, { onConflict: "org_id,invoice_id" });
      if (upsertError) {
        throw upsertError;
      }
    }

    return this.list();
  }

  async list(filter?: { status?: "all" | "outstanding" | "overdue" }) {
    let query = this.client
      .from("finance_ar_invoices")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (filter?.status === "outstanding") {
      query = query.gt("amount_outstanding", 0);
    } else if (filter?.status === "overdue") {
      query = query.eq("status", "overdue");
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const invoices = ((data ?? []) as FinanceArInvoiceRow[]).map(financeArInvoiceMapper.toDomain);
    await localDb.financeArInvoices.bulkPut(invoices);
    return invoices;
  }

  async matchPayment(input: {
    arInvoiceId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
    actorUserId: string | null;
  }) {
    const current = (await this.list()).find((invoice) => invoice.id === input.arInvoiceId);
    if (!current) {
      throw new Error("A/R invoice was not found.");
    }
    const nowPaid = Math.min(current.amountPaid + input.amount, current.total);
    const nextStatus = arStatus(current.total, nowPaid, current.dueDate);
    const now = new Date().toISOString();

    const { error: paymentError } = await this.client
      .from("finance_ar_payments")
      .insert({
        id: createId(),
        org_id: this.context.orgId,
        ar_invoice_id: input.arInvoiceId,
        imported_transaction_id: input.importedTransactionId ?? null,
        paid_at: input.paidAt,
        amount: input.amount,
        reference: input.reference ?? null,
        created_by: input.actorUserId,
        created_at: now,
        updated_at: now,
      });
    if (paymentError) {
      throw paymentError;
    }

    const { data, error } = await this.client
      .from("finance_ar_invoices")
      .update({
        amount_paid: nowPaid,
        amount_outstanding: Math.max(current.total - nowPaid, 0),
        status: nextStatus,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", input.arInvoiceId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }

    const invoice = financeArInvoiceMapper.toDomain(data as FinanceArInvoiceRow);
    await localDb.financeArInvoices.put(invoice);
    return invoice;
  }
}

export class FinanceApRepositoryImpl implements FinanceApRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: FinanceClient,
  ) {}

  async list(filter?: { status?: "all" | "outstanding" | "overdue" }) {
    let query = this.client
      .from("finance_ap_bills")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    if (filter?.status === "outstanding") {
      query = query.gt("amount_outstanding", 0);
    } else if (filter?.status === "overdue") {
      query = query.eq("status", "overdue");
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const bills = ((data ?? []) as FinanceApBillRow[]).map(financeApBillMapper.toDomain);
    await localDb.financeApBills.bulkPut(bills);
    return bills;
  }

  async createBill(input: CreateFinanceApBillInput & { actorUserId: string | null }) {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("finance_ap_bills")
      .insert({
        id: createId(),
        org_id: this.context.orgId,
        vendor_contact_id: input.vendorContactId ?? null,
        vendor_name: input.vendorName,
        bill_date: input.billDate,
        due_date: input.dueDate ?? null,
        subtotal: input.subtotal,
        tax: input.tax ?? 0,
        total: input.total,
        amount_paid: 0,
        amount_outstanding: input.total,
        status: apStatus(input.total, 0, input.dueDate ?? null),
        document_intake_id: input.documentIntakeId ?? null,
        created_by: input.actorUserId,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    const bill = financeApBillMapper.toDomain(data as FinanceApBillRow);
    await localDb.financeApBills.put(bill);
    return bill;
  }

  async matchPayment(input: {
    apBillId: string;
    importedTransactionId?: string | null;
    amount: number;
    paidAt: string;
    reference?: string | null;
    actorUserId: string | null;
  }) {
    const current = (await this.list()).find((bill) => bill.id === input.apBillId);
    if (!current) {
      throw new Error("A/P bill was not found.");
    }
    const nowPaid = Math.min(current.amountPaid + input.amount, current.total);
    const nextStatus = apStatus(current.total, nowPaid, current.dueDate, current.status);
    const now = new Date().toISOString();

    const { error: paymentError } = await this.client
      .from("finance_ap_payments")
      .insert({
        id: createId(),
        org_id: this.context.orgId,
        ap_bill_id: input.apBillId,
        imported_transaction_id: input.importedTransactionId ?? null,
        paid_at: input.paidAt,
        amount: input.amount,
        reference: input.reference ?? null,
        created_by: input.actorUserId,
        created_at: now,
        updated_at: now,
      });
    if (paymentError) {
      throw paymentError;
    }

    const { data, error } = await this.client
      .from("finance_ap_bills")
      .update({
        amount_paid: nowPaid,
        amount_outstanding: Math.max(current.total - nowPaid, 0),
        status: nextStatus,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", input.apBillId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    const bill = financeApBillMapper.toDomain(data as FinanceApBillRow);
    await localDb.financeApBills.put(bill);
    return bill;
  }
}
