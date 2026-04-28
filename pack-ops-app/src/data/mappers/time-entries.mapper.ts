import type { TimeEntry } from "@/domain/time-entries/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type {
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
} from "@/data/repositories/time-entries.repo";
import type { RepositoryMapper } from "@/data/mappers/shared";

type TimeEntryRow = TableRow<"time_entries">;
type TimeEntryInsertRecord = Pick<
  TimeEntryRow,
  "job_id" | "user_id" | "date" | "start_time" | "end_time" | "hours" | "description" | "section_name" | "is_billable" | "hourly_rate" | "created_by" | "updated_by"
>;
type TimeEntryUpdateRecord = Partial<
  Pick<
    TimeEntryRow,
    "status" | "date" | "start_time" | "end_time" | "hours" | "description" | "section_name" | "hourly_rate" | "rejected_reason" | "approved_by" | "approved_at" | "updated_by" | "deleted_at"
  >
>;

export const timeEntriesMapper: RepositoryMapper<
  TimeEntryRow,
  TimeEntry,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  TimeEntryInsertRecord,
  TimeEntryUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as TimeEntry["id"],
      orgId: row.org_id as TimeEntry["orgId"],
      jobId: row.job_id as TimeEntry["jobId"],
      userId: row.user_id as TimeEntry["userId"],
      status: row.status,
      workDate: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      hours: row.hours,
      description: row.description,
      sectionName: row.section_name,
      isBillable: row.is_billable,
      hourlyRate: row.hourly_rate,
      rejectedReason: row.rejected_reason,
      approvedBy: row.approved_by as TimeEntry["approvedBy"],
      approvedAt: row.approved_at,
      createdBy: row.created_by as TimeEntry["createdBy"],
      updatedBy: row.updated_by as TimeEntry["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      job_id: input.jobId,
      user_id: input.userId,
      date: input.workDate,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      hours: input.hours,
      description: input.description ?? null,
      section_name: input.sectionName?.trim() || null,
      is_billable: input.isBillable ?? true,
      hourly_rate: input.hourlyRate ?? null,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
    } satisfies TimeEntryInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.workDate !== undefined ? { date: input.workDate } : {}),
      ...(input.startTime !== undefined ? { start_time: input.startTime } : {}),
      ...(input.endTime !== undefined ? { end_time: input.endTime } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sectionName !== undefined ? { section_name: input.sectionName?.trim() || null } : {}),
      ...(input.hours !== undefined ? { hours: input.hours } : {}),
      ...(input.hourlyRate !== undefined ? { hourly_rate: input.hourlyRate } : {}),
      ...(input.rejectedReason !== undefined ? { rejected_reason: input.rejectedReason } : {}),
      ...(input.approvedBy !== undefined ? { approved_by: input.approvedBy } : {}),
      ...(input.approvedAt !== undefined ? { approved_at: input.approvedAt } : {}),
      ...(input.updatedBy !== undefined ? { updated_by: input.updatedBy } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies TimeEntryUpdateRecord;
  },
};
