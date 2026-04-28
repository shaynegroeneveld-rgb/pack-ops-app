import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { jobAssignmentsMapper } from "@/data/mappers/job-assignments.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateJobAssignmentInput,
  JobAssignmentFilter,
  JobAssignmentsRepository,
  UpdateJobAssignmentInput,
} from "@/data/repositories/job-assignments.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { JobAssignment } from "@/domain/jobs/types";
import { createId } from "@/lib/create-id";

export class JobAssignmentsRepositoryImpl
  extends WorkbenchRepositoryBase<JobAssignment>
  implements JobAssignmentsRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: JobAssignmentFilter }): Promise<JobAssignment[]> {
    let query = this.client
      .from("job_assignments")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("assigned_at", { ascending: false });

    if (options?.filter?.jobId) {
      query = query.eq("job_id", options.filter.jobId);
    }

    if (options?.filter?.userId) {
      query = query.eq("user_id", options.filter.userId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const assignments = (data ?? []).map((row) => jobAssignmentsMapper.toDomain(row));
    await localDb.jobAssignments.bulkPut(assignments);
    return assignments;
  }

  async getById(id: string): Promise<JobAssignment | null> {
    const { data, error } = await this.client
      .from("job_assignments")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const assignment = jobAssignmentsMapper.toDomain(data);
    await localDb.jobAssignments.put(assignment);
    return assignment;
  }

  async create(input: CreateJobAssignmentInput): Promise<JobAssignment> {
    const now = this.now();
    const id = createId();
    const assignment: JobAssignment = {
      id: id as JobAssignment["id"],
      orgId: this.context.orgId as JobAssignment["orgId"],
      jobId: input.jobId,
      userId: input.userId,
      assignmentRole: input.assignmentRole,
      assignedAt: now,
      assignedBy: (input.assignedBy ?? this.context.actorUserId) as JobAssignment["assignedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    console.info("[JobAssignmentsRepository] create input", input);
    console.info("[JobAssignmentsRepository] local assignment result", assignment);

    await localDb.jobAssignments.put(assignment);
    const queuePayload = {
      id,
      org_id: this.context.orgId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      assigned_at: now,
      ...jobAssignmentsMapper.toInsert(input),
    };
    console.info("[JobAssignmentsRepository] queued SyncEnvelope", {
      entityType: "job_assignments",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });
    await this.enqueue({
      entityType: "job_assignments",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });

    return assignment;
  }

  async update(id: string, input: UpdateJobAssignmentInput): Promise<JobAssignment> {
    const existing = await localDb.jobAssignments.get(id);
    if (!existing) {
      throw new Error(`Job assignment ${id} not found in local cache.`);
    }

    const assignment: JobAssignment = {
      ...existing,
      ...(input.assignmentRole !== undefined ? { assignmentRole: input.assignmentRole } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedAt: this.now(),
    };

    await localDb.jobAssignments.put(assignment);
    await this.enqueue({
      entityType: "job_assignments",
      entityId: id,
      operation: assignment.deletedAt ? "soft_delete" : "upsert",
      payload: {
        id,
        org_id: assignment.orgId,
        job_id: assignment.jobId,
        user_id: assignment.userId,
        role: assignment.assignmentRole,
        assigned_at: assignment.assignedAt,
        assigned_by: assignment.assignedBy,
        created_at: assignment.createdAt,
        updated_at: assignment.updatedAt,
        deleted_at: assignment.deletedAt,
      },
    });

    return assignment;
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = this.now();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_job_assignment", {
      p_job_assignment_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }

    await localDb.jobAssignments.delete(id);
  }
}
