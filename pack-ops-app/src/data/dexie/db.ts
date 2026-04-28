import Dexie, { type Table } from "dexie";

import type { ActionItem } from "@/domain/action-items/types";
import type { Contact } from "@/domain/contacts/types";
import type { Document } from "@/domain/documents/types";
import type { Expense } from "@/domain/expenses/types";
import type {
  FinanceAccount,
  FinanceApBill,
  FinanceApPayment,
  FinanceArInvoice,
  FinanceArPayment,
  FinanceCategory,
  FinanceDocumentIntake,
  FinanceImportBatch,
  FinanceMonthlyClose,
  FinanceReconciliationSession,
  FinanceTransaction,
  ImportedTransaction,
} from "@/domain/finance/types";
import type { Invoice } from "@/domain/invoices/types";
import type { Job, JobAssignment } from "@/domain/jobs/types";
import type { LeadRecord } from "@/domain/leads/types";
import type { Note } from "@/domain/notes/types";
import type { Payment } from "@/domain/payments/types";
import type { Quote } from "@/domain/quotes/types";
import type { ScheduleBlock, WorkerUnavailability } from "@/domain/scheduling/types";
import type { ActiveTimer, TimeEntry } from "@/domain/time-entries/types";

import { DEXIE_TABLES } from "@/data/dexie/schema";
import type { SyncCursor, SyncQueueEntry } from "@/data/dexie/outbox";

export class PackOpsDexie extends Dexie {
  contacts!: Table<Contact, string>;
  leads!: Table<LeadRecord, string>;
  quotes!: Table<Quote, string>;
  jobs!: Table<Job, string>;
  jobAssignments!: Table<JobAssignment, string>;
  scheduleBlocks!: Table<ScheduleBlock, string>;
  workerUnavailability!: Table<WorkerUnavailability, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  timeEntries!: Table<TimeEntry, string>;
  expenses!: Table<Expense, string>;
  documents!: Table<Document, string>;
  financeAccounts!: Table<FinanceAccount, string>;
  financeCategories!: Table<FinanceCategory, string>;
  financeTransactions!: Table<FinanceTransaction, string>;
  financeImportBatches!: Table<FinanceImportBatch, string>;
  importedTransactions!: Table<ImportedTransaction, string>;
  financeDocumentIntake!: Table<FinanceDocumentIntake, string>;
  financeReconciliationSessions!: Table<FinanceReconciliationSession, string>;
  financeMonthlyCloses!: Table<FinanceMonthlyClose, string>;
  financeArInvoices!: Table<FinanceArInvoice, string>;
  financeArPayments!: Table<FinanceArPayment, string>;
  financeApBills!: Table<FinanceApBill, string>;
  financeApPayments!: Table<FinanceApPayment, string>;
  notes!: Table<Note, string>;
  actionItems!: Table<ActionItem, string>;
  activeTimers!: Table<ActiveTimer, string>;
  syncQueue!: Table<SyncQueueEntry, string>;
  syncCursor!: Table<SyncCursor, string>;

  constructor() {
    super("pack-ops");

    this.version(1).stores(DEXIE_TABLES);
    this.version(2).stores(DEXIE_TABLES);
    this.version(3).stores(DEXIE_TABLES);
    this.version(4).stores(DEXIE_TABLES);
    this.version(5).stores(DEXIE_TABLES);
    this.version(6).stores(DEXIE_TABLES);
    this.version(7).stores(DEXIE_TABLES);
    this.version(8).stores(DEXIE_TABLES);
  }
}

export const localDb = new PackOpsDexie();
