import type { TableRow } from "@/data/mappers/database-row-types";
import type { RepositoryMapper } from "@/data/mappers/shared";
import type {
  CreateWorkerUnavailabilityInput,
  UpdateWorkerUnavailabilityInput,
} from "@/data/repositories/worker-unavailability.repo";
import type { WorkerUnavailability } from "@/domain/scheduling/types";

type WorkerUnavailabilityRow = TableRow<"worker_unavailability">;
type WorkerUnavailabilityInsertRecord = Pick<
  WorkerUnavailabilityRow,
  "org_id" | "user_id" | "day" | "reason" | "created_by" | "updated_by"
>;
type WorkerUnavailabilityUpdateRecord = Partial<
  Pick<WorkerUnavailabilityRow, "day" | "reason" | "updated_by" | "deleted_at">
>;

export const workerUnavailabilityMapper: RepositoryMapper<
  WorkerUnavailabilityRow,
  WorkerUnavailability,
  CreateWorkerUnavailabilityInput,
  UpdateWorkerUnavailabilityInput,
  WorkerUnavailabilityInsertRecord,
  WorkerUnavailabilityUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as WorkerUnavailability["id"],
      orgId: row.org_id as WorkerUnavailability["orgId"],
      userId: row.user_id as WorkerUnavailability["userId"],
      day: row.day,
      reason: row.reason,
      createdBy: row.created_by as WorkerUnavailability["createdBy"],
      updatedBy: row.updated_by as WorkerUnavailability["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },

  toInsert(input) {
    return {
      org_id: input.orgId,
      user_id: input.userId,
      day: input.day,
      reason: input.reason ?? null,
      created_by: input.createdBy ?? null,
      updated_by: input.updatedBy ?? null,
    };
  },

  toPatch(input) {
    return {
      ...(input.day !== undefined ? { day: input.day } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.updatedBy !== undefined ? { updated_by: input.updatedBy } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies WorkerUnavailabilityUpdateRecord;
  },
};
