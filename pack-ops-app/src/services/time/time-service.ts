import type { SupabaseClient } from "@supabase/supabase-js";

import { JobsRepositoryImpl } from "@/data/repositories/jobs.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import type { Database } from "@/data/supabase/types";
import type { User } from "@/domain/users/types";

export interface TimeEntryReportRow {
  id: string;
  date: string;
  workedByUserId: string;
  workedByName: string;
  enteredByUserId: string | null;
  enteredByName: string | null;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  hours: number;
  sourceLabel: string | null;
  note: string | null;
  status: string;
}

export interface TimeEntryReportSummary {
  totalHours: number;
  hoursByUser: Array<{ userId: string; userName: string; hours: number }>;
  hoursByJob: Array<{ jobId: string; jobLabel: string; hours: number }>;
  hoursByDay: Array<{ date: string; hours: number }>;
}

export interface TimeReportData {
  entries: TimeEntryReportRow[];
  summary: TimeEntryReportSummary;
  userOptions: Array<{ id: string; label: string }>;
  jobOptions: Array<{ id: string; label: string }>;
  appliedPeriodLabel: string;
}

function canViewTimeReporting(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function canApproveTimeReporting(user: User): boolean {
  return Boolean(user.canApproveTime) || user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveMonthRange(monthValue: string | null | undefined): { start: string; end: string; label: string } | null {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return null;
  }

  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const start = `${yearText}-${monthText}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  const label = endDate.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return { start, end, label };
}

export class TimeService {
  readonly timeEntries;
  readonly jobs;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
    this.jobs = new JobsRepositoryImpl(context, client);
  }

  private assertCanViewTimeReporting() {
    if (!canViewTimeReporting(this.currentUser)) {
      throw new Error("You cannot view time reporting.");
    }
  }

  private assertCanApproveTimeReporting() {
    if (!canApproveTimeReporting(this.currentUser)) {
      throw new Error("You cannot approve time entries.");
    }
  }

  async approveTimeEntry(timeEntryId: string) {
    this.assertCanApproveTimeReporting();

    const { data, error } = await this.client
      .from("time_entries")
      .update({ status: "approved" })
      .eq("org_id", this.context.orgId)
      .eq("id", timeEntryId)
      .select("id, status")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async getTimeReport(filters?: {
    userId?: string | null;
    jobId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    month?: string | null;
  }): Promise<TimeReportData> {
    this.assertCanViewTimeReporting();
    const monthRange = deriveMonthRange(filters?.month);
    const effectiveDateFrom = monthRange?.start ?? filters?.dateFrom ?? null;
    const effectiveDateTo = monthRange?.end ?? filters?.dateTo ?? null;

    const [entries, jobs, usersResponse] = await Promise.all([
      this.timeEntries.list(),
      this.jobs.list(),
      this.client
        .from("users")
        .select("id, full_name")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null),
    ]);

    if (usersResponse.error) {
      throw usersResponse.error;
    }

    const jobsById = new Map(jobs.map((job) => [String(job.id), job]));
    const usersById = new Map((usersResponse.data ?? []).map((user) => [String(user.id), user.full_name]));

    const filteredEntries = entries.filter((entry) => {
      if (filters?.userId && String(entry.userId) !== filters.userId) {
        return false;
      }
      if (filters?.jobId && String(entry.jobId) !== filters.jobId) {
        return false;
      }
      if (effectiveDateFrom && entry.workDate < effectiveDateFrom) {
        return false;
      }
      if (effectiveDateTo && entry.workDate > effectiveDateTo) {
        return false;
      }
      return true;
    });

    const rows: TimeEntryReportRow[] = [];
    for (const entry of filteredEntries) {
      const job = jobsById.get(String(entry.jobId));
      if (!job) {
        continue;
      }

      rows.push({
        id: String(entry.id),
        date: entry.workDate,
        workedByUserId: String(entry.userId),
        workedByName: usersById.get(String(entry.userId)) ?? "Unknown user",
        enteredByUserId: entry.createdBy ? String(entry.createdBy) : null,
        enteredByName: entry.createdBy ? usersById.get(String(entry.createdBy)) ?? "Unknown user" : null,
        jobId: String(entry.jobId),
        jobNumber: job.number,
        jobTitle: job.title,
        hours: entry.hours,
        sourceLabel: null,
        note: entry.description ?? null,
        status: entry.status,
      });
    }

    rows.sort((left, right) => {
        const dateCompare = right.date.localeCompare(left.date);
        return dateCompare !== 0 ? dateCompare : right.jobNumber.localeCompare(left.jobNumber);
      });

    const hoursByUser = new Map<string, { userId: string; userName: string; hours: number }>();
    const hoursByJob = new Map<string, { jobId: string; jobLabel: string; hours: number }>();
    const hoursByDay = new Map<string, { date: string; hours: number }>();

    for (const row of rows) {
      const userCurrent = hoursByUser.get(row.workedByUserId) ?? {
        userId: row.workedByUserId,
        userName: row.workedByName,
        hours: 0,
      };
      userCurrent.hours = roundHours(userCurrent.hours + row.hours);
      hoursByUser.set(row.workedByUserId, userCurrent);

      const jobCurrent = hoursByJob.get(row.jobId) ?? {
        jobId: row.jobId,
        jobLabel: `${row.jobNumber} · ${row.jobTitle}`,
        hours: 0,
      };
      jobCurrent.hours = roundHours(jobCurrent.hours + row.hours);
      hoursByJob.set(row.jobId, jobCurrent);

      const dayCurrent = hoursByDay.get(row.date) ?? {
        date: row.date,
        hours: 0,
      };
      dayCurrent.hours = roundHours(dayCurrent.hours + row.hours);
      hoursByDay.set(row.date, dayCurrent);
    }

    return {
      entries: rows,
      summary: {
        totalHours: roundHours(rows.reduce((total, row) => total + row.hours, 0)),
        hoursByUser: Array.from(hoursByUser.values()).sort((left, right) => right.hours - left.hours),
        hoursByJob: Array.from(hoursByJob.values()).sort((left, right) => right.hours - left.hours),
        hoursByDay: Array.from(hoursByDay.values()).sort((left, right) => right.date.localeCompare(left.date)),
      },
      userOptions: Array.from(usersById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      jobOptions: jobs
        .map((job) => ({ id: String(job.id), label: `${job.number} · ${job.title}` }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      appliedPeriodLabel: monthRange
        ? monthRange.label
        : effectiveDateFrom || effectiveDateTo
          ? `${effectiveDateFrom ?? "Start"} to ${effectiveDateTo ?? "Now"}`
          : "All time",
    };
  }
}
