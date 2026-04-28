import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { activeTimersMapper } from "@/data/mappers/active-timers.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  ActiveTimerFilter,
  ActiveTimersRepository,
  CreateActiveTimerInput,
  UpdateActiveTimerInput,
} from "@/data/repositories/active-timers.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { ActiveTimer } from "@/domain/time-entries/types";
import { createId } from "@/lib/create-id";

function isMissingRelationError(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === "42P01" || error.message?.includes('relation "active_timers" does not exist') === true;
}

export class ActiveTimersRepositoryImpl
  extends WorkbenchRepositoryBase<ActiveTimer>
  implements ActiveTimersRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: ActiveTimerFilter }): Promise<ActiveTimer[]> {
    let query = this.client
      .from("active_timers")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (options?.filter?.userId) {
      query = query.eq("user_id", options.filter.userId);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error)) {
        return [];
      }
      throw error;
    }

    const timers = (data ?? []).map((row) => activeTimersMapper.toDomain(row));
    await localDb.activeTimers.bulkPut(timers);
    return timers;
  }

  async getById(id: string): Promise<ActiveTimer | null> {
    const { data, error } = await this.client
      .from("active_timers")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) {
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    const timer = activeTimersMapper.toDomain(data);
    await localDb.activeTimers.put(timer);
    return timer;
  }

  async getCurrentForUser(
    userId: ActiveTimer["userId"],
    options?: { preferCache?: boolean },
  ): Promise<ActiveTimer | null> {
    if (options?.preferCache) {
      const cachedTimers = await localDb.activeTimers
        .where("userId")
        .equals(userId)
        .filter((timer) => timer.orgId === this.context.orgId)
        .toArray();

      if (cachedTimers.length > 0) {
        const activeCachedTimer = cachedTimers
          .filter((timer) => timer.deletedAt === null)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;

        return activeCachedTimer;
      }
    }

    const { data, error } = await this.client
      .from("active_timers")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) {
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    const timer = activeTimersMapper.toDomain(data);
    await localDb.activeTimers.put(timer);
    return timer;
  }

  async clearLocalForUser(userId: ActiveTimer["userId"]): Promise<void> {
    const cachedTimers = await localDb.activeTimers
      .where("userId")
      .equals(userId)
      .filter((timer) => timer.orgId === this.context.orgId)
      .toArray();

    await localDb.activeTimers.bulkDelete(cachedTimers.map((timer) => timer.id));
  }

  async deleteRemoteForUser(userId: ActiveTimer["userId"]): Promise<void> {
    const { error } = await this.client
      .from("active_timers")
      .delete()
      .eq("org_id", this.context.orgId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error && !isMissingRelationError(error)) {
      throw error;
    }
  }

  async create(input: CreateActiveTimerInput): Promise<ActiveTimer> {
    const now = this.now();
    const id = createId();
    const timer: ActiveTimer = {
      id: id as ActiveTimer["id"],
      orgId: this.context.orgId as ActiveTimer["orgId"],
      jobId: input.jobId,
      userId: input.userId,
      startedAt: input.startedAt,
      description: input.description ?? null,
      createdBy: (input.createdBy ?? this.context.actorUserId) as ActiveTimer["createdBy"],
      updatedBy: (input.createdBy ?? this.context.actorUserId) as ActiveTimer["updatedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await localDb.activeTimers.put(timer);
    await this.enqueue({
      entityType: "active_timers",
      entityId: id,
      operation: "upsert",
      payload: {
        id,
        org_id: this.context.orgId,
        created_by: timer.createdBy,
        updated_by: timer.updatedBy,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        ...activeTimersMapper.toInsert(input),
      },
    });

    return timer;
  }

  async update(id: string, input: UpdateActiveTimerInput): Promise<ActiveTimer> {
    const existing = await localDb.activeTimers.get(id);
    if (!existing) {
      throw new Error(`Active timer ${id} not found in local cache.`);
    }

    const updatedAt = this.now();
    const timer: ActiveTimer = {
      ...existing,
      ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedAt,
      updatedBy: (input.updatedBy ?? this.context.actorUserId) as ActiveTimer["updatedBy"],
    };

    await localDb.activeTimers.put(timer);
    await this.enqueue({
      entityType: "active_timers",
      entityId: id,
      operation: timer.deletedAt ? "soft_delete" : "upsert",
      payload: {
        id,
        org_id: timer.orgId,
        job_id: timer.jobId,
        user_id: timer.userId,
        started_at: timer.startedAt,
        description: timer.description,
        created_by: timer.createdBy,
        updated_by: timer.updatedBy,
        created_at: timer.createdAt,
        updated_at: updatedAt,
        deleted_at: timer.deletedAt,
      },
    });

    return timer;
  }

  async softDelete(id: string): Promise<void> {
    await localDb.activeTimers.delete(id);
    await this.enqueue({
      entityType: "active_timers",
      entityId: id,
      operation: "delete",
      payload: {},
    });
  }
}
