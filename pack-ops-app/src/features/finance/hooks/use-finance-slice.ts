import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type { Contact } from "@/domain/contacts/types";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceDocumentIntake,
  FinanceTransaction,
  FinanceTransactionFilter,
  ImportedTransaction,
} from "@/domain/finance/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import { FinanceService } from "@/services/finance/finance-service";

const FINANCE_QUERY_KEY = ["finance"];

export function useFinanceSlice(
  authenticatedUser: AuthenticatedUser,
  transactionFilter: FinanceTransactionFilter,
  options?: {
    reconciliation?: { accountId: string; startDate: string; endDate: string } | null;
    month?: string | null;
    output?: { startDate: string; endDate: string } | null;
    arFilter?: { status?: "all" | "outstanding" | "overdue" } | null;
    apFilter?: { status?: "all" | "outstanding" | "overdue" } | null;
  },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);

  const service = useMemo(
    () =>
      new FinanceService(
        {
          orgId: authenticatedUser.user.orgId,
          actorUserId: authenticatedUser.user.id,
        },
        authenticatedUser.user,
        client,
      ),
    [
      authenticatedUser.user.id,
      authenticatedUser.user.orgId,
      authenticatedUser.user.role,
      authenticatedUser.user.isForeman,
      authenticatedUser.user.canApproveTime,
      client,
    ],
  );

  const canManageFinance =
    authenticatedUser.user.role === "owner" ||
    authenticatedUser.user.role === "office" ||
    authenticatedUser.user.role === "bookkeeper";

  const accountsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "accounts", authenticatedUser.user.id],
    queryFn: () => service.listAccounts(),
    enabled: canManageFinance,
  });

  const categoriesQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "categories", authenticatedUser.user.id],
    queryFn: () => service.listCategories(),
    enabled: canManageFinance,
  });

  const contactsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "contacts", authenticatedUser.user.id],
    queryFn: () => service.listContacts(),
    enabled: canManageFinance,
  });

  const jobsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "jobs", authenticatedUser.user.id],
    queryFn: () => service.listJobs(),
    enabled: canManageFinance,
  });

  const documentsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "documents", authenticatedUser.user.id],
    queryFn: () => service.listDocuments(),
    enabled: canManageFinance,
  });

  const transactionsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "transactions", authenticatedUser.user.id, transactionFilter],
    queryFn: () => service.listTransactions(transactionFilter),
    enabled: canManageFinance,
  });

  const importBatchesQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "import-batches", authenticatedUser.user.id],
    queryFn: () => service.listImportBatches(),
    enabled: canManageFinance,
  });

  const importedTransactionsQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "imported-transactions", authenticatedUser.user.id],
    queryFn: () => service.listImportedTransactions(),
    enabled: canManageFinance,
  });

  const documentIntakeQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "document-intake", authenticatedUser.user.id],
    queryFn: () => service.listDocumentIntake(),
    enabled: canManageFinance,
  });

  const reviewQueueQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "review-queue", authenticatedUser.user.id],
    queryFn: () => service.listReviewQueue(),
    enabled: canManageFinance,
  });

  const reconciliationWorkspaceQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "reconciliation", authenticatedUser.user.id, options?.reconciliation],
    queryFn: () => service.getReconciliationWorkspace(options!.reconciliation!),
    enabled: canManageFinance && Boolean(options?.reconciliation?.accountId),
  });

  const monthlyCloseWorkspaceQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "monthly-close", authenticatedUser.user.id, options?.month],
    queryFn: () => service.getMonthlyCloseWorkspace(options!.month!),
    enabled: canManageFinance && Boolean(options?.month),
  });

  const financialOutputQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "financial-output", authenticatedUser.user.id, options?.output],
    queryFn: () => service.getFinancialOutput(options!.output!),
    enabled: canManageFinance && Boolean(options?.output?.startDate),
  });

  const accountsReceivableQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "accounts-receivable", authenticatedUser.user.id, options?.arFilter],
    queryFn: () => service.listAccountsReceivable(options?.arFilter ?? undefined),
    enabled: canManageFinance,
  });

  const accountsPayableQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, "accounts-payable", authenticatedUser.user.id, options?.apFilter],
    queryFn: () => service.listAccountsPayable(options?.apFilter ?? undefined),
    enabled: canManageFinance,
  });

  const invalidateFinance = async () => {
    await queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY });
  };

  const createAccount = useMutation({
    mutationFn: (input: Parameters<FinanceService["createAccount"]>[0]) => service.createAccount(input),
    onSuccess: invalidateFinance,
  });

  const updateAccount = useMutation({
    mutationFn: (input: { id: FinanceAccount["id"] } & Parameters<FinanceService["updateAccount"]>[1]) =>
      service.updateAccount(input.id, input),
    onSuccess: invalidateFinance,
  });

  const archiveAccount = useMutation({
    mutationFn: (id: FinanceAccount["id"]) => service.archiveAccount(id),
    onSuccess: invalidateFinance,
  });

  const createCategory = useMutation({
    mutationFn: (input: Parameters<FinanceService["createCategory"]>[0]) => service.createCategory(input),
    onSuccess: invalidateFinance,
  });

  const updateCategory = useMutation({
    mutationFn: (input: { id: FinanceCategory["id"] } & Parameters<FinanceService["updateCategory"]>[1]) =>
      service.updateCategory(input.id, input),
    onSuccess: invalidateFinance,
  });

  const archiveCategory = useMutation({
    mutationFn: (id: FinanceCategory["id"]) => service.archiveCategory(id),
    onSuccess: invalidateFinance,
  });

  const createTransaction = useMutation({
    mutationFn: (input: Parameters<FinanceService["createTransaction"]>[0]) => service.createTransaction(input),
    onSuccess: invalidateFinance,
  });

  const updateTransaction = useMutation({
    mutationFn: (input: { id: FinanceTransaction["id"] } & Parameters<FinanceService["updateTransaction"]>[1]) =>
      service.updateTransaction(input.id, input),
    onSuccess: invalidateFinance,
  });

  const archiveTransaction = useMutation({
    mutationFn: (id: FinanceTransaction["id"]) => service.archiveTransaction(id),
    onSuccess: invalidateFinance,
  });

  const createContact = useMutation({
    mutationFn: (input: Parameters<FinanceService["createContact"]>[0]) => service.createContact(input),
    onSuccess: invalidateFinance,
  });

  const updateContact = useMutation({
    mutationFn: (input: { id: Contact["id"] } & Parameters<FinanceService["updateContact"]>[1]) =>
      service.updateContact(input.id, input),
    onSuccess: invalidateFinance,
  });

  const archiveContact = useMutation({
    mutationFn: (id: Contact["id"]) => service.archiveContact(id),
    onSuccess: invalidateFinance,
  });

  const importCsvBatch = useMutation({
    mutationFn: (input: Parameters<FinanceService["importCsvBatch"]>[0]) => service.importCsvBatch(input),
    onSuccess: invalidateFinance,
  });

  const approveImportedTransaction = useMutation({
    mutationFn: (row: ImportedTransaction) => service.approveImportedTransaction(row),
    onSuccess: invalidateFinance,
  });

  const markImportedTransaction = useMutation({
    mutationFn: (input: { id: ImportedTransaction["id"]; status: "transfer" | "duplicate" | "ignored" }) =>
      service.markImportedTransaction(input.id, input.status),
    onSuccess: invalidateFinance,
  });

  const linkImportToDocument = useMutation({
    mutationFn: (input: { importedTransactionId: ImportedTransaction["id"]; documentIntakeId: FinanceDocumentIntake["id"] }) =>
      service.linkImportToDocument(input.importedTransactionId, input.documentIntakeId),
    onSuccess: invalidateFinance,
  });

  const finalizeMatchedImport = useMutation({
    mutationFn: (input: { importedTransactionId: ImportedTransaction["id"]; documentIntakeId: FinanceDocumentIntake["id"] }) =>
      service.finalizeMatchedImport(input.importedTransactionId, input.documentIntakeId),
    onSuccess: invalidateFinance,
  });

  const rejectImportDocumentSuggestion = useMutation({
    mutationFn: (importedTransactionId: ImportedTransaction["id"]) => service.rejectImportDocumentSuggestion(importedTransactionId),
    onSuccess: invalidateFinance,
  });

  const updateImportedReceiptStatus = useMutation({
    mutationFn: (input: {
      id: ImportedTransaction["id"];
      receiptStatus: ImportedTransaction["receiptStatus"];
      snoozedUntil?: string | null;
    }) => service.updateImportedReceiptStatus(input.id, input),
    onSuccess: invalidateFinance,
  });

  const bulkReviewImportedTransactions = useMutation({
    mutationFn: (input: Parameters<FinanceService["bulkReviewImportedTransactions"]>[0]) =>
      service.bulkReviewImportedTransactions(input),
    onSuccess: invalidateFinance,
  });

  const createDocumentIntake = useMutation({
    mutationFn: (input: Parameters<FinanceService["createDocumentIntake"]>[0]) => service.createDocumentIntake(input),
    onSuccess: invalidateFinance,
  });

  const linkDocumentIntake = useMutation({
    mutationFn: (input: { id: FinanceDocumentIntake["id"]; transactionId: FinanceTransaction["id"] }) =>
      service.linkDocumentIntake(input.id, input.transactionId),
    onSuccess: invalidateFinance,
  });

  const createDraftTransactionFromDocument = useMutation({
    mutationFn: (document: FinanceDocumentIntake) => service.createDraftTransactionFromDocument(document),
    onSuccess: invalidateFinance,
  });

  const ignoreDocumentIntake = useMutation({
    mutationFn: (id: FinanceDocumentIntake["id"]) => service.ignoreDocumentIntake(id),
    onSuccess: invalidateFinance,
  });

  const saveReconciliationSession = useMutation({
    mutationFn: (input: Parameters<FinanceService["saveReconciliationSession"]>[0]) =>
      service.saveReconciliationSession(input),
    onSuccess: invalidateFinance,
  });

  const completeReconciliationSession = useMutation({
    mutationFn: (input: Parameters<FinanceService["completeReconciliationSession"]>[0]) =>
      service.completeReconciliationSession(input),
    onSuccess: invalidateFinance,
  });

  const markImportedTransactionReconciled = useMutation({
    mutationFn: (id: ImportedTransaction["id"]) => service.markImportedTransactionReconciled(id),
    onSuccess: invalidateFinance,
  });

  const updateMonthlyCloseStatus = useMutation({
    mutationFn: (input: { month: string; status: "open" | "in_progress" | "closed" }) =>
      service.updateMonthlyCloseStatus(input.month, input.status),
    onSuccess: invalidateFinance,
  });

  const matchAccountsReceivablePayment = useMutation({
    mutationFn: (input: Parameters<FinanceService["matchAccountsReceivablePayment"]>[0]) =>
      service.matchAccountsReceivablePayment(input),
    onSuccess: invalidateFinance,
  });

  const createAccountsPayableBill = useMutation({
    mutationFn: (input: Parameters<FinanceService["createAccountsPayableBill"]>[0]) =>
      service.createAccountsPayableBill(input),
    onSuccess: invalidateFinance,
  });

  const matchAccountsPayablePayment = useMutation({
    mutationFn: (input: Parameters<FinanceService["matchAccountsPayablePayment"]>[0]) =>
      service.matchAccountsPayablePayment(input),
    onSuccess: invalidateFinance,
  });

  return {
    canManageFinance,
    accountsQuery,
    categoriesQuery,
    contactsQuery,
    jobsQuery,
    documentsQuery,
    transactionsQuery,
    importBatchesQuery,
    importedTransactionsQuery,
    documentIntakeQuery,
    reviewQueueQuery,
    reconciliationWorkspaceQuery,
    monthlyCloseWorkspaceQuery,
    financialOutputQuery,
    accountsReceivableQuery,
    accountsPayableQuery,
    createAccount,
    updateAccount,
    archiveAccount,
    createCategory,
    updateCategory,
    archiveCategory,
    createTransaction,
    updateTransaction,
    archiveTransaction,
    createContact,
    updateContact,
    archiveContact,
    importCsvBatch,
    approveImportedTransaction,
    markImportedTransaction,
    linkImportToDocument,
    finalizeMatchedImport,
    rejectImportDocumentSuggestion,
    updateImportedReceiptStatus,
    bulkReviewImportedTransactions,
    createDocumentIntake,
    linkDocumentIntake,
    createDraftTransactionFromDocument,
    ignoreDocumentIntake,
    saveReconciliationSession,
    completeReconciliationSession,
    markImportedTransactionReconciled,
    updateMonthlyCloseStatus,
    matchAccountsReceivablePayment,
    createAccountsPayableBill,
    matchAccountsPayablePayment,
  };
}
