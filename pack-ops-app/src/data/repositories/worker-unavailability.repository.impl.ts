import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { workerUnavailabilityMapper } from "@/data/mappers/worker-unavailability.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateWorkerUnavailabilityInput,
  UpdateWorkerUnavailabilityInput,
  WorkerUnavailabilityFilter,
  WorkerUnavailabilityRepository,
} from "@/data/repositories/worker-unavailability.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { WorkerUnavailability } from "@/domain/scheduling/types";
import { createId } from "@/lib/create-id";

export class WorkerUnavailabilityRepositoryImpl
  extends WorkbenchRepositoryBase<WorkerUnavailability>
  implements WorkerUnavailabilityRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: WorkerUnavailabilityFilter }): Promise<WorkerUnavailability[]> {
    let query = this.client
      .from("worker_unavailability")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("day", { ascending: true });

    if (options?.filter?.userId) {
      query = query.eq("user_id", options.filter.userId);
    }
    if (options?.filter?.from) {
      query = query.gte("day", options.filter.from);
    }
    if (options?.filter?.to) {
      query = query.lte("day", options.filter.to);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const entries = (data ?? []).map((row) => workerUnavailabilityMapper.toDomain(row));
    await localDb.workerUnavailability.bulkPut(entries);
    return entries;
  }

  async getById(id: string): Promise<WorkerUnavailability | null> {
    const { data, error } = await this.client
      .from("worker_unavailability")
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

    const entry = workerUnavailabilityMapper.toDomain(data);
    await localDb.workerUnavailability.put(entry);
    return entry;
  }

  async create(input: CreateWorkerUnavailabilityInput): Promise<WorkerUnavailability> {
    const now = this.now();
    const id = createId();
    const entry: WorkerUnavailability = {
      id: id as WorkerUnavailability["id"],
      orgId: this.context.orgId as WorkerUnavailability["orgId"],
      userId: input.userId,
      day: input.day,
      reason: input.reason ?? null,
      createdBy: (input.createdBy ?? this.context.actorUserId) as WorkerUnavailability["createdBy"],
      updatedBy: (input.updatedBy ?? this.context.actorUserId) as WorkerUnavailability["updatedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await localDb.workerUnavailability.put(entry);
    await this.enqueue({
      entityType: "worker_unavailability",
      entityId: id,
      operation: "upsert",
      payload: {
        id,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        ...workerUnavailabilityMapper.toInsert({
          ...input,
          orgId: this.context.orgId as WorkerUnavailability["orgId"],
          createdBy: (input.createdBy ?? this.context.actorUserId) as WorkerUnavailability["createdBy"],
          updatedBy: (input.updatedBy ?? this.context.actorUserId) as WorkerUnavailability["updatedBy"],
        }),
      },
    });

    return entry;
  }

  async update(id: string, input: UpdateWorkerUnavailabilityInput): Promise<WorkerUnavailability> {
    const existing = await localDb.workerUnavailability.get(id);
    if (!existing) {
      throw new Error(`Worker unavailability ${id} not found in local cache.`);
    }

    const entry: WorkerUnavailability = {
      ...existing,
      ...(input.day !== undefined ? { day: input.day } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedBy: (input.updatedBy ?? this.context.actorUserId) as WorkerUnavailability["updatedBy"],
      updatedAt: this.now(),
    };

    await localDb.workerUnavailability.put(entry);
    await this.enqueue({
      entityType: "worker_unavailability",
      entityId: id,
      operation: entry.deletedAt ? "soft_delete" : "upsert",
      payload: {
        id,
        org_id: entry.orgId,
        user_id: entry.userId,
        day: entry.day,
        reason: entry.reason,
        created_by: entry.createdBy,
        updated_by: entry.updatedBy,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
        deleted_at: entry.deletedAt,
      },
    });

    return entry;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await localDb.workerUnavailability.get(id);
    if (!existing) {
      throw new Error(`Worker unavailability ${id} not found in local cache.`);
    }

    await this.update(id, { deletedAt: this.now() });
    await localDb.workerUnavailability.delete(id);
  }
}
