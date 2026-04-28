import type { JobAssignment } from "@/domain/jobs/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type {
  CreateJobAssignmentInput,
  UpdateJobAssignmentInput,
} from "@/data/repositories/job-assignments.repo";
import type { RepositoryMapper } from "@/data/mappers/shared";

type JobAssignmentRow = TableRow<"job_assignments">;
type JobAssignmentInsertRecord = Pick<JobAssignmentRow, "job_id" | "user_id" | "role" | "assigned_by">;
type JobAssignmentUpdateRecord = Partial<Pick<JobAssignmentRow, "role" | "deleted_at">>;

export const jobAssignmentsMapper: RepositoryMapper<
  JobAssignmentRow,
  JobAssignment,
  CreateJobAssignmentInput,
  UpdateJobAssignmentInput,
  JobAssignmentInsertRecord,
  JobAssignmentUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as JobAssignment["id"],
      orgId: row.org_id as JobAssignment["orgId"],
      jobId: row.job_id as JobAssignment["jobId"],
      userId: row.user_id as JobAssignment["userId"],
      assignmentRole: row.role,
      assignedAt: row.assigned_at,
      assignedBy: row.assigned_by as JobAssignment["assignedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      job_id: input.jobId,
      user_id: input.userId,
      role: input.assignmentRole,
      assigned_by: input.assignedBy ?? null,
    } satisfies JobAssignmentInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.assignmentRole !== undefined ? { role: input.assignmentRole } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies JobAssignmentUpdateRecord;
  },
};
