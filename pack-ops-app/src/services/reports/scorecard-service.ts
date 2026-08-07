import type { SupabaseClient } from "@supabase/supabase-js";

import type { RepositoryContext } from "@/data/repositories/contracts";
import { LeadsRepositoryImpl } from "@/data/repositories/leads.repository.impl";
import { QuotesRepositoryImpl } from "@/data/repositories/quotes.repository.impl";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import type { Database } from "@/data/supabase/types";
import type { User } from "@/domain/users/types";
import { FinanceService } from "@/services/finance/finance-service";
import { JobPerformanceService } from "@/services/reports/job-performance-service";
import { readOrgBusinessSettings } from "@/services/settings/org-settings";

function canViewScorecard(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfWeek(now: Date): Date {
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);
  return start;
}

export interface ScorecardData {
  weekStart: string;
  generatedAt: string;
  leading: {
    newLeadsThisWeek: number;
    quotesSentThisWeek: number;
    activeBacklogHours: number;
  };
  conversion: {
    quoteTurnaroundDays: number | null;
    quoteCloseRate: number | null;
    averageSoldJobValue: number | null;
    windowDays: number;
  };
  delivery: {
    jobsAwaitingInvoice: number;
    hoursLoggedThisWeek: number;
    jobsAtLoss: number;
    jobsWithPerformanceData: number;
  };
  cash: {
    arOver30Days: number;
    apDue: number;
    bankBalance: number;
    taxReserve: number;
    operatingReserveMonths: number;
    cashAsOfDate: string;
  };
}

export class ScorecardService {
  readonly leads;
  readonly quotes;
  readonly timeEntries;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.leads = new LeadsRepositoryImpl(context, client);
    this.quotes = new QuotesRepositoryImpl(context, client);
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
  }

  private assertCanView() {
    if (!canViewScorecard(this.currentUser)) {
      throw new Error("You cannot view the scorecard.");
    }
  }

  async getScorecard(): Promise<ScorecardData> {
    this.assertCanView();

    const now = new Date();
    const weekStart = startOfWeek(now);
    const windowDays = 90;
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [leads, quotes, timeEntries, jobsResponse, orgResponse, jobPerformanceReport, financeOutput] = await Promise.all([
      this.leads.list(),
      this.quotes.list(),
      this.timeEntries.list(),
      this.client
        .from("jobs")
        .select("id, status, estimated_hours")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null),
      this.client.from("orgs").select("settings").eq("id", this.context.orgId).single(),
      new JobPerformanceService(this.context, this.currentUser, this.client).getJobPerformanceReport({
        archiveScope: "active",
      }),
      new FinanceService(this.context, this.currentUser, this.client).getFinancialOutput({
        startDate: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      }),
    ]);

    if (jobsResponse.error) {
      throw jobsResponse.error;
    }
    if (orgResponse.error) {
      throw orgResponse.error;
    }

    const settings = readOrgBusinessSettings(orgResponse.data.settings);
    const jobRows = jobsResponse.data ?? [];

    const newLeadsThisWeek = leads.filter((lead) => new Date(lead.createdAt) >= weekStart).length;
    const quotesSentThisWeek = quotes.filter((quote) => quote.sentAt && new Date(quote.sentAt) >= weekStart).length;
    const backlogStatuses = new Set(["scheduled", "in_progress", "waiting"]);
    const activeBacklogHours = roundMoney(
      jobRows
        .filter((row) => backlogStatuses.has(row.status))
        .reduce((sum, row) => sum + (row.estimated_hours ?? 0), 0),
    );

    const sentInWindow = quotes.filter((quote) => quote.sentAt && new Date(quote.sentAt) >= windowStart);
    const turnaroundDurations = sentInWindow
      .map((quote) => {
        const created = new Date(quote.createdAt).getTime();
        const sent = new Date(quote.sentAt as string).getTime();
        return (sent - created) / (24 * 60 * 60 * 1000);
      })
      .filter((days) => Number.isFinite(days) && days >= 0);
    const quoteTurnaroundDays =
      turnaroundDurations.length > 0
        ? roundMoney(turnaroundDurations.reduce((sum, days) => sum + days, 0) / turnaroundDurations.length)
        : null;

    const decidedInWindow = quotes.filter(
      (quote) =>
        (quote.acceptedAt && new Date(quote.acceptedAt) >= windowStart) ||
        (quote.rejectedAt && new Date(quote.rejectedAt) >= windowStart),
    );
    const acceptedInWindow = decidedInWindow.filter((quote) => quote.status === "accepted");
    const quoteCloseRate =
      decidedInWindow.length > 0 ? roundMoney((acceptedInWindow.length / decidedInWindow.length) * 100) : null;
    const averageSoldJobValue =
      acceptedInWindow.length > 0
        ? roundMoney(acceptedInWindow.reduce((sum, quote) => sum + quote.total, 0) / acceptedInWindow.length)
        : null;

    const awaitingInvoiceStatuses = new Set(["work_complete", "ready_to_invoice"]);
    const jobsAwaitingInvoice = jobRows.filter((row) => awaitingInvoiceStatuses.has(row.status)).length;
    const hoursLoggedThisWeek = roundMoney(
      timeEntries
        .filter((entry) => entry.status !== "rejected" && new Date(entry.workDate) >= weekStart)
        .reduce((sum, entry) => sum + entry.hours, 0),
    );
    const jobsWithPerformanceData = jobPerformanceReport.rows.filter(
      (row) => row.performance?.coreMoney.actualGrossProfit != null,
    ).length;
    const jobsAtLoss = jobPerformanceReport.rows.filter(
      (row) => row.performance?.coreMoney.actualGrossProfit != null && row.performance.coreMoney.actualGrossProfit < 0,
    ).length;

    const arOver30Days = roundMoney(
      financeOutput.arAging.buckets
        .filter((bucket) => bucket.label === "60_days" || bucket.label === "90_plus")
        .reduce((sum, bucket) => sum + bucket.total, 0),
    );
    const apDue = roundMoney(financeOutput.apAging.totalOutstanding);

    return {
      weekStart: weekStart.toISOString(),
      generatedAt: now.toISOString(),
      leading: {
        newLeadsThisWeek,
        quotesSentThisWeek,
        activeBacklogHours,
      },
      conversion: {
        quoteTurnaroundDays,
        quoteCloseRate,
        averageSoldJobValue,
        windowDays,
      },
      delivery: {
        jobsAwaitingInvoice,
        hoursLoggedThisWeek,
        jobsAtLoss,
        jobsWithPerformanceData,
      },
      cash: {
        arOver30Days,
        apDue,
        bankBalance: settings.cashBankBalance,
        taxReserve: settings.cashTaxReserve,
        operatingReserveMonths: settings.cashOperatingReserveMonths,
        cashAsOfDate: settings.cashAsOfDate,
      },
    };
  }
}
