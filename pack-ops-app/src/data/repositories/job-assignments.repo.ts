import type { JobAssignment } from "@/domain/jobs/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface JobAssignmentFilter {
  jobId?: JobAssignment["jobId"];
  userId?: JobAssignment["userId"];
}

export interface CreateJobAssignmentInput {
  jobId: JobAssignment["jobId"];
  userId: JobAssignment["userId"];
  assignmentRole: JobAssignment["assignmentRole"];
  assignedBy?: JobAssignment["assignedBy"];
}

export interface UpdateJobAssignmentInput {
  assignmentRole?: JobAssignment["assignmentRole"];
  deletedAt?: string | null;
}

export type JobAssignmentsRepository = Repository<
  JobAssignment,
  CreateJobAssignmentInput,
  UpdateJobAssignmentInput,
  JobAssignmentFilter
>;
