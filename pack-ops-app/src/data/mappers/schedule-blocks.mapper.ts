import type { RepositoryMapper } from "@/data/mappers/shared";
import type { TableRow } from "@/data/mappers/database-row-types";
import type {
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
} from "@/data/repositories/schedule-blocks.repo";
import type { ScheduleBlock } from "@/domain/scheduling/types";

type ScheduleBlockRow = TableRow<"schedule_blocks">;
type ScheduleBlockInsertRecord = Pick<
  ScheduleBlockRow,
  "job_id" | "user_id" | "start_at" | "end_at" | "time_bucket" | "duration_hours" | "notes"
>;
type ScheduleBlockUpdateRecord = Partial<
  Pick<ScheduleBlockRow, "user_id" | "start_at" | "end_at" | "time_bucket" | "duration_hours" | "notes" | "deleted_at">
>;

export const scheduleBlocksMapper: RepositoryMapper<
  ScheduleBlockRow,
  ScheduleBlock,
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
  ScheduleBlockInsertRecord,
  ScheduleBlockUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as ScheduleBlock["id"],
      orgId: row.org_id as ScheduleBlock["orgId"],
      jobId: row.job_id as ScheduleBlock["jobId"],
      userId: row.user_id as ScheduleBlock["userId"],
      startAt: row.start_at,
      endAt: row.end_at,
      timeBucket: row.time_bucket as ScheduleBlock["timeBucket"],
      durationHours: row.duration_hours,
      notes: row.notes,
      createdBy: row.created_by as ScheduleBlock["createdBy"],
      updatedBy: row.updated_by as ScheduleBlock["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      job_id: input.jobId,
      user_id: input.userId ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      time_bucket: input.timeBucket ?? "anytime",
      duration_hours: input.durationHours,
      notes: input.notes ?? null,
    } satisfies ScheduleBlockInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
      ...(input.startAt !== undefined ? { start_at: input.startAt } : {}),
      ...(input.endAt !== undefined ? { end_at: input.endAt } : {}),
      ...(input.timeBucket !== undefined ? { time_bucket: input.timeBucket } : {}),
      ...(input.durationHours !== undefined ? { duration_hours: input.durationHours } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies ScheduleBlockUpdateRecord;
  },
};
