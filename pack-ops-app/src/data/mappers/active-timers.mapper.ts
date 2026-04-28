import type { ActiveTimer } from "@/domain/time-entries/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { RepositoryMapper } from "@/data/mappers/shared";
import type {
  CreateActiveTimerInput,
  UpdateActiveTimerInput,
} from "@/data/repositories/active-timers.repo";

type ActiveTimerRow = TableRow<"active_timers">;
type ActiveTimerInsertRecord = Pick<
  ActiveTimerRow,
  "job_id" | "user_id" | "started_at" | "description"
>;
type ActiveTimerUpdateRecord = Partial<
  Pick<ActiveTimerRow, "job_id" | "started_at" | "description" | "deleted_at">
>;

export const activeTimersMapper: RepositoryMapper<
  ActiveTimerRow,
  ActiveTimer,
  CreateActiveTimerInput,
  UpdateActiveTimerInput,
  ActiveTimerInsertRecord,
  ActiveTimerUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as ActiveTimer["id"],
      orgId: row.org_id as ActiveTimer["orgId"],
      jobId: row.job_id as ActiveTimer["jobId"],
      userId: row.user_id as ActiveTimer["userId"],
      startedAt: row.started_at,
      description: row.description,
      createdBy: row.created_by as ActiveTimer["createdBy"],
      updatedBy: row.updated_by as ActiveTimer["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      job_id: input.jobId,
      user_id: input.userId,
      started_at: input.startedAt,
      description: input.description ?? null,
    } satisfies ActiveTimerInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.jobId !== undefined ? { job_id: input.jobId } : {}),
      ...(input.startedAt !== undefined ? { started_at: input.startedAt } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies ActiveTimerUpdateRecord;
  },
};
