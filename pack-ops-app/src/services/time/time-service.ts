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
}

export interface TimeReportData {
  entries: TimeEntryReportRow[];
  summary: TimeEntryReportSummary;
  userOptions: Array<{ id: string; label: string }>;
  jobOptions: Array<{ id: string; label: string }>;
}

function canViewTimeReporting(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
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

  async getTimeReport(filters?: {
    userId?: string | null;
    jobId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }): Promise<TimeReportData> {
    this.assertCanViewTimeReporting();

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
      if (filters?.dateFrom && entry.workDate < filters.dateFrom) {
        return false;
      }
      if (filters?.dateTo && entry.workDate > filters.dateTo) {
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
    }

    return {
      entries: rows,
      summary: {
        totalHours: roundHours(rows.reduce((total, row) => total + row.hours, 0)),
        hoursByUser: Array.from(hoursByUser.values()).sort((left, right) => right.hours - left.hours),
        hoursByJob: Array.from(hoursByJob.values()).sort((left, right) => right.hours - left.hours),
      },
      userOptions: Array.from(usersById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      jobOptions: jobs
        .map((job) => ({ id: String(job.id), label: `${job.number} · ${job.title}` }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    };
  }
}
