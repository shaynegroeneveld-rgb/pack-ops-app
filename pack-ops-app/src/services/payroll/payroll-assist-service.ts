import type { SupabaseClient } from "@supabase/supabase-js";

import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type { FinanceAccount, FinanceCategory, FinanceTransaction } from "@/domain/finance/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import type { User } from "@/domain/users/types";
import { FinanceService } from "@/services/finance/finance-service";

const OVERTIME_THRESHOLD_HOURS = 40;
const OVERTIME_MULTIPLIER = 1.5;
const CPP_RATE = 0.0595;
const EI_RATE = 0.0164;
const INCOME_TAX_ESTIMATE_RATE = 0.12;

export interface PayrollAssistEmployeeSource {
  userId: string;
  name: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  suggestedHourlyRate: number;
  entryCount: number;
  unapprovedHours: number;
}

export interface PayrollAssistEmployeePay {
  userId: string;
  name: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  cppEstimate: number;
  eiEstimate: number;
  incomeTaxEstimate: number;
  totalDeductions: number;
  netPay: number;
  entryCount: number;
  unapprovedHours: number;
}

export interface PayrollAssistWorkspace {
  employees: PayrollAssistEmployeeSource[];
  accounts: FinanceAccount[];
  wageCategories: FinanceCategory[];
  deductionRates: {
    cpp: number;
    ei: number;
    incomeTax: number;
  };
}

export interface PayrollApprovalInput {
  startDate: string;
  endDate: string;
  accountId: FinanceAccount["id"];
  categoryId: FinanceCategory["id"];
  rows: PayrollAssistEmployeePay[];
}

function canManagePayroll(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function requirePayrollAccess(user: User): void {
  if (!canManagePayroll(user)) {
    throw new Error("You cannot manage payroll assist records.");
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function weekKey(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function estimateOvertimeHours(entries: TimeEntry[]): number {
  const hoursByWeek = new Map<string, number>();
  for (const entry of entries) {
    const key = weekKey(entry.workDate);
    hoursByWeek.set(key, (hoursByWeek.get(key) ?? 0) + entry.hours);
  }

  return roundHours(
    Array.from(hoursByWeek.values()).reduce(
      (sum, hours) => sum + Math.max(0, hours - OVERTIME_THRESHOLD_HOURS),
      0,
    ),
  );
}

function suggestedRate(entries: TimeEntry[]): number {
  const ratedEntries = entries.filter((entry) => entry.hourlyRate !== null && entry.hourlyRate > 0);
  const ratedHours = ratedEntries.reduce((sum, entry) => sum + entry.hours, 0);
  if (ratedHours <= 0) {
    return 0;
  }

  return roundMoney(
    ratedEntries.reduce((sum, entry) => sum + entry.hours * Number(entry.hourlyRate), 0) / ratedHours,
  );
}

export function calculatePayrollEmployeePay(
  employee: PayrollAssistEmployeeSource,
  hourlyRate: number,
): PayrollAssistEmployeePay {
  const safeRate = Math.max(0, hourlyRate);
  const overtimeHours = Math.min(employee.totalHours, employee.overtimeHours);
  const regularHours = roundHours(Math.max(0, employee.totalHours - overtimeHours));
  const regularPay = roundMoney(regularHours * safeRate);
  const overtimePay = roundMoney(overtimeHours * safeRate * OVERTIME_MULTIPLIER);
  const grossPay = roundMoney(regularPay + overtimePay);
  const cppEstimate = roundMoney(grossPay * CPP_RATE);
  const eiEstimate = roundMoney(grossPay * EI_RATE);
  const incomeTaxEstimate = roundMoney(grossPay * INCOME_TAX_ESTIMATE_RATE);
  const totalDeductions = roundMoney(cppEstimate + eiEstimate + incomeTaxEstimate);

  return {
    ...employee,
    regularHours,
    overtimeHours,
    hourlyRate: safeRate,
    regularPay,
    overtimePay,
    grossPay,
    cppEstimate,
    eiEstimate,
    incomeTaxEstimate,
    totalDeductions,
    netPay: roundMoney(Math.max(0, grossPay - totalDeductions)),
  };
}

export class PayrollAssistService {
  private readonly timeEntries;
  private readonly finance;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
    this.finance = new FinanceService(context, currentUser, client);
  }

  async getWorkspace(input: { startDate: string; endDate: string }): Promise<PayrollAssistWorkspace> {
    requirePayrollAccess(this.currentUser);

    const [timeEntries, usersResponse, accounts, categories] = await Promise.all([
      this.timeEntries.list(),
      this.client
        .from("users")
        .select("id, full_name")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null),
      this.finance.listAccounts(),
      this.finance.listCategories(),
    ]);

    if (usersResponse.error) {
      throw usersResponse.error;
    }

    const usersById = new Map((usersResponse.data ?? []).map((user) => [String(user.id), user.full_name]));
    const periodEntries = timeEntries.filter((entry) =>
      entry.deletedAt === null &&
      entry.workDate >= input.startDate &&
      entry.workDate <= input.endDate,
    );
    const approvedEntries = periodEntries.filter((entry) => entry.status === "approved");
    const entriesByEmployee = new Map<string, TimeEntry[]>();
    const unapprovedHoursByEmployee = new Map<string, number>();

    for (const entry of approvedEntries) {
      const key = String(entry.userId);
      entriesByEmployee.set(key, [...(entriesByEmployee.get(key) ?? []), entry]);
    }

    for (const entry of periodEntries) {
      if (entry.status === "approved") {
        continue;
      }
      const key = String(entry.userId);
      unapprovedHoursByEmployee.set(key, roundHours((unapprovedHoursByEmployee.get(key) ?? 0) + entry.hours));
    }

    const employees = Array.from(entriesByEmployee.entries())
      .map(([userId, entries]) => {
        const totalHours = roundHours(entries.reduce((sum, entry) => sum + entry.hours, 0));
        const overtimeHours = estimateOvertimeHours(entries);
        return {
          userId,
          name: usersById.get(userId) ?? "Unknown employee",
          totalHours,
          regularHours: roundHours(Math.max(0, totalHours - overtimeHours)),
          overtimeHours,
          suggestedHourlyRate: suggestedRate(entries),
          entryCount: entries.length,
          unapprovedHours: unapprovedHoursByEmployee.get(userId) ?? 0,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const wageCategories = categories
      .filter((category) => category.deletedAt === null && category.isActive && category.type === "expense")
      .sort((left, right) => {
        const leftLooksLikeWages = /wage|payroll|labou?r/i.test(left.name);
        const rightLooksLikeWages = /wage|payroll|labou?r/i.test(right.name);
        if (leftLooksLikeWages !== rightLooksLikeWages) {
          return leftLooksLikeWages ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

    return {
      employees,
      accounts: accounts
        .filter((account) => account.deletedAt === null && account.isActive)
        .sort((left, right) => left.name.localeCompare(right.name)),
      wageCategories,
      deductionRates: {
        cpp: CPP_RATE,
        ei: EI_RATE,
        incomeTax: INCOME_TAX_ESTIMATE_RATE,
      },
    };
  }

  async approvePayroll(input: PayrollApprovalInput): Promise<FinanceTransaction[]> {
    requirePayrollAccess(this.currentUser);

    const payableRows = input.rows.filter((row) => row.netPay > 0);
    const transactions: FinanceTransaction[] = [];

    for (const row of payableRows) {
      const transaction = await this.finance.createTransaction({
        type: "expense",
        status: "posted",
        transactionDate: input.endDate,
        accountId: input.accountId,
        categoryId: input.categoryId,
        memo: `Payroll Assist: ${row.name} net pay for ${input.startDate} to ${input.endDate}. Gross ${row.grossPay.toFixed(2)}, estimated deductions ${row.totalDeductions.toFixed(2)}.`,
        referenceNumber: `PAYROLL-${input.endDate}`,
        subtotal: row.netPay,
        tax: 0,
        total: row.netPay,
      });
      transactions.push(transaction);
    }

    return transactions;
  }
}
