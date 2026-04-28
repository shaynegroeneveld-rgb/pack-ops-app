import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { scheduleBlocksMapper } from "@/data/mappers/schedule-blocks.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateScheduleBlockInput,
  ScheduleBlockFilter,
  ScheduleBlocksRepository,
  UpdateScheduleBlockInput,
} from "@/data/repositories/schedule-blocks.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import { createId } from "@/lib/create-id";

export class ScheduleBlocksRepositoryImpl
  extends WorkbenchRepositoryBase<ScheduleBlock>
  implements ScheduleBlocksRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: ScheduleBlockFilter }): Promise<ScheduleBlock[]> {
    let query = this.client
      .from("schedule_blocks")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });

    if (options?.filter?.jobId) {
      query = query.eq("job_id", options.filter.jobId);
    }
    if (options?.filter?.userId) {
      query = query.eq("user_id", options.filter.userId);
    }
    if (options?.filter?.from) {
      query = query.gte("end_at", options.filter.from);
    }
    if (options?.filter?.to) {
      query = query.lte("start_at", options.filter.to);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const blocks = (data ?? []).map((row) => scheduleBlocksMapper.toDomain(row));
    await localDb.scheduleBlocks.bulkPut(blocks);
    return blocks;
  }

  async getById(id: string): Promise<ScheduleBlock | null> {
    const { data, error } = await this.client
      .from("schedule_blocks")
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

    const block = scheduleBlocksMapper.toDomain(data);
    await localDb.scheduleBlocks.put(block);
    return block;
  }

  async create(input: CreateScheduleBlockInput): Promise<ScheduleBlock> {
    const now = this.now();
    const id = createId();
    const block: ScheduleBlock = {
      id: id as ScheduleBlock["id"],
      orgId: this.context.orgId as ScheduleBlock["orgId"],
      jobId: input.jobId,
      userId: input.userId ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      timeBucket: input.timeBucket ?? "anytime",
      durationHours: input.durationHours,
      notes: input.notes ?? null,
      createdBy: this.context.actorUserId as ScheduleBlock["createdBy"],
      updatedBy: this.context.actorUserId as ScheduleBlock["updatedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await localDb.scheduleBlocks.put(block);
    await this.enqueue({
      entityType: "schedule_blocks",
      entityId: id,
      operation: "upsert",
      payload: {
        id,
        org_id: this.context.orgId,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        ...scheduleBlocksMapper.toInsert(input),
      },
    });

    return block;
  }

  async update(id: string, input: UpdateScheduleBlockInput): Promise<ScheduleBlock> {
    const existing = await localDb.scheduleBlocks.get(id);
    if (!existing) {
      throw new Error(`Schedule block ${id} not found in local cache.`);
    }

    const updatedAt = this.now();
    const block: ScheduleBlock = {
      ...existing,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.timeBucket !== undefined ? { timeBucket: input.timeBucket } : {}),
      ...(input.durationHours !== undefined ? { durationHours: input.durationHours } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedAt,
      updatedBy: this.context.actorUserId as ScheduleBlock["updatedBy"],
    };

    await localDb.scheduleBlocks.put(block);
    await this.enqueue({
      entityType: "schedule_blocks",
      entityId: id,
      operation: block.deletedAt ? "soft_delete" : "upsert",
      payload: {
        id,
        org_id: block.orgId,
        job_id: block.jobId,
        user_id: block.userId,
        start_at: block.startAt,
        end_at: block.endAt,
        time_bucket: block.timeBucket,
        duration_hours: block.durationHours,
        notes: block.notes,
        created_by: block.createdBy,
        updated_by: this.context.actorUserId,
        created_at: block.createdAt,
        updated_at: updatedAt,
        deleted_at: block.deletedAt,
      },
    });

    return block;
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, { deletedAt: this.now() });
  }
}
