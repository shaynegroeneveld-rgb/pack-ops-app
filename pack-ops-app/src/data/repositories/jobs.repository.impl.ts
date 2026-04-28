import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { jobsMapper } from "@/data/mappers/jobs.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateJobInput,
  JobFilter,
  JobsRepository,
  UpdateJobInput,
} from "@/data/repositories/jobs.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { Job } from "@/domain/jobs/types";
import { createId } from "@/lib/create-id";

export class JobsRepositoryImpl
  extends WorkbenchRepositoryBase<Job>
  implements JobsRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  private async getQueuedJobIds(): Promise<Set<string>> {
    const queued = await localDb.syncQueue
      .where("entityType")
      .equals("jobs")
      .and((entry) => entry.status === "pending" || entry.status === "processing" || entry.status === "failed")
      .toArray();

    return new Set(queued.map((entry) => entry.entityId));
  }

  async list(options?: { filter?: JobFilter }): Promise<Job[]> {
    console.info("[JobsRepository] list query", {
      orgId: this.context.orgId,
      filter: options?.filter ?? null,
    });

    let query = this.client
      .from("jobs")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    const statuses = options?.filter?.status;
    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[JobsRepository] list error", error);
      throw error;
    }

    console.info("[JobsRepository] list raw result", {
      count: data?.length ?? 0,
      ids: (data ?? []).map((row) => row.id),
    });

    const queuedJobIds = await this.getQueuedJobIds();
    const jobs = await Promise.all(
      (data ?? []).map(async (row) => {
        if (queuedJobIds.has(String(row.id))) {
          const localJob = await localDb.jobs.get(String(row.id));
          if (localJob) {
            return localJob;
          }
        }

        return jobsMapper.toDomain(row);
      }),
    );
    console.info("[JobsRepository] list mapped result", {
      count: jobs.length,
      ids: jobs.map((job) => job.id),
      titles: jobs.map((job) => job.title),
    });
    await localDb.jobs.bulkPut(jobs);
    return jobs;
  }

  async getById(id: string): Promise<Job | null> {
    const queuedJobIds = await this.getQueuedJobIds();
    if (queuedJobIds.has(id)) {
      const localJob = await localDb.jobs.get(id);
      if (localJob) {
        return localJob;
      }
    }

    const { data, error } = await this.client
      .from("jobs")
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

    const job = jobsMapper.toDomain(data);
    await localDb.jobs.put(job);
    return job;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const now = this.now();
    const id = createId();
    const job: Job = {
      id: id as Job["id"],
      orgId: this.context.orgId as Job["orgId"],
      contactId: input.contactId,
      quoteId: input.quoteId ?? null,
      number: input.number,
      status: "scheduled",
      waitingReason: null,
      title: input.title,
      description: input.description ?? null,
      internalNotes: input.internalNotes ?? null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
      postalCode: null,
      tags: [],
      scheduledStart: input.scheduledStart ?? null,
      scheduledEnd: input.scheduledEnd ?? null,
      actualStart: null,
      actualEnd: null,
      estimatedHours: input.estimatedHours ?? null,
      estimatedCost: null,
      estimateSnapshot: input.estimateSnapshot ?? null,
      requiresFullCrewTogether: input.requiresFullCrewTogether ?? false,
      createdBy: this.context.actorUserId as Job["createdBy"],
      updatedBy: this.context.actorUserId as Job["updatedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    console.info("[JobsRepository] create payload", {
      input,
      localJob: job,
    });

    await localDb.jobs.put(job);
    const queuePayload = {
      id,
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      updated_at: now,
      created_at: now,
      ...jobsMapper.toInsert(input),
      status: job.status,
      waiting_reason: null,
      tags: [],
    };
    console.info("[JobsRepository] enqueue job upsert payload", queuePayload);

    await this.enqueue({
      entityType: "jobs",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });

    return job;
  }

  async update(id: string, input: UpdateJobInput): Promise<Job> {
    const existing = await localDb.jobs.get(id);
    if (!existing) {
      throw new Error(`Job ${id} not found in local cache.`);
    }

    const updatedAt = this.now();
    const job: Job = {
      ...existing,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.waitingReason !== undefined ? { waitingReason: input.waitingReason } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      ...(input.estimatedHours !== undefined ? { estimatedHours: input.estimatedHours } : {}),
      ...(input.estimateSnapshot !== undefined ? { estimateSnapshot: input.estimateSnapshot } : {}),
      ...(input.requiresFullCrewTogether !== undefined
        ? { requiresFullCrewTogether: input.requiresFullCrewTogether }
        : {}),
      ...(input.scheduledStart !== undefined ? { scheduledStart: input.scheduledStart } : {}),
      ...(input.scheduledEnd !== undefined ? { scheduledEnd: input.scheduledEnd } : {}),
      updatedAt,
      updatedBy: this.context.actorUserId as Job["updatedBy"],
    };

    await localDb.jobs.put(job);
    await this.enqueue({
      entityType: "jobs",
      entityId: id,
      operation: "upsert",
      payload: {
        id,
        org_id: job.orgId,
        contact_id: job.contactId,
        quote_id: job.quoteId,
        number: job.number,
        status: job.status,
        waiting_reason: job.waitingReason,
        title: job.title,
        description: job.description,
        internal_notes: job.internalNotes,
        address_line1: job.addressLine1,
        address_line2: job.addressLine2,
        city: job.city,
        state: job.region,
        postcode: job.postalCode,
        tags: job.tags,
        scheduled_start: job.scheduledStart,
        scheduled_end: job.scheduledEnd,
        actual_start: job.actualStart,
        actual_end: job.actualEnd,
        estimated_hours: job.estimatedHours,
        estimated_cost: job.estimatedCost,
        estimate_snapshot: job.estimateSnapshot,
        requires_full_crew_together: job.requiresFullCrewTogether,
        created_by: job.createdBy,
        updated_by: this.context.actorUserId,
        created_at: job.createdAt,
        updated_at: updatedAt,
        deleted_at: job.deletedAt,
      },
    });

    return job;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await localDb.jobs.get(id);
    if (!existing) {
      return;
    }

    const deletedAt = this.now();
    await localDb.jobs.put({
      ...existing,
      deletedAt,
      updatedAt: deletedAt,
      updatedBy: this.context.actorUserId as Job["updatedBy"],
    });

    await this.enqueue({
      entityType: "jobs",
      entityId: id,
      operation: "soft_delete",
      payload: { deleted_at: deletedAt, updated_at: deletedAt },
    });
  }
}
