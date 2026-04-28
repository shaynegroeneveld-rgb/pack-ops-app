import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { timeEntriesMapper } from "@/data/mappers/time-entries.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateTimeEntryInput,
  TimeEntriesRepository,
  TimeEntryFilter,
  UpdateTimeEntryInput,
} from "@/data/repositories/time-entries.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import { createId } from "@/lib/create-id";

export class TimeEntriesRepositoryImpl
  extends WorkbenchRepositoryBase<TimeEntry>
  implements TimeEntriesRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: TimeEntryFilter }): Promise<TimeEntry[]> {
    let query = this.client
      .from("time_entries")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("date", { ascending: false });

    if (options?.filter?.jobId) {
      query = query.eq("job_id", options.filter.jobId);
    }
    if (options?.filter?.userId) {
      query = query.eq("user_id", options.filter.userId);
    }
    if (options?.filter?.statuses?.length) {
      query = query.in("status", options.filter.statuses);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const entries = (data ?? []).map((row) => timeEntriesMapper.toDomain(row));
    await localDb.timeEntries.bulkPut(entries);
    return entries;
  }

  async getById(id: string): Promise<TimeEntry | null> {
    const { data, error } = await this.client
      .from("time_entries")
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

    const entry = timeEntriesMapper.toDomain(data);
    await localDb.timeEntries.put(entry);
    return entry;
  }

  async create(input: CreateTimeEntryInput): Promise<TimeEntry> {
    const now = this.now();
    const id = createId();
    const entry: TimeEntry = {
      id: id as TimeEntry["id"],
      orgId: this.context.orgId as TimeEntry["orgId"],
      jobId: input.jobId,
      userId: input.userId,
      status: "pending",
      workDate: input.workDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      hours: input.hours,
      description: input.description ?? null,
      sectionName: input.sectionName?.trim() || null,
      isBillable: input.isBillable ?? true,
      hourlyRate: input.hourlyRate ?? null,
      rejectedReason: null,
      approvedBy: null,
      approvedAt: null,
      createdBy: (input.createdBy ?? this.context.actorUserId) as TimeEntry["createdBy"],
      updatedBy: (input.createdBy ?? this.context.actorUserId) as TimeEntry["updatedBy"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    console.info("[TimeEntriesRepository] create input", input);
    console.info("[TimeEntriesRepository] local time entry result", entry);

    await localDb.timeEntries.put(entry);
    const queuePayload = {
      id,
      org_id: this.context.orgId,
      status: "pending",
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...timeEntriesMapper.toInsert(input),
    };
    console.info("[TimeEntriesRepository] queued SyncEnvelope", {
      entityType: "time_entries",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });
    await this.enqueue({
      entityType: "time_entries",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });

    return entry;
  }

  async update(id: string, input: UpdateTimeEntryInput): Promise<TimeEntry> {
    const existing = await localDb.timeEntries.get(id);
    if (!existing) {
      throw new Error(`Time entry ${id} not found in local cache.`);
    }

    const updatedAt = this.now();
    const entry: TimeEntry = {
      ...existing,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.workDate !== undefined ? { workDate: input.workDate } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.hours !== undefined ? { hours: input.hours } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sectionName !== undefined ? { sectionName: input.sectionName?.trim() || null } : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
      ...(input.rejectedReason !== undefined ? { rejectedReason: input.rejectedReason } : {}),
      ...(input.approvedBy !== undefined ? { approvedBy: input.approvedBy } : {}),
      ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedAt,
      updatedBy: (input.updatedBy ?? this.context.actorUserId) as TimeEntry["updatedBy"],
    };

    console.info("[TimeEntriesRepository] update input", { id, input });
    console.info("[TimeEntriesRepository] local updated time entry", entry);

    await localDb.timeEntries.put(entry);
    const queuePayload = {
      id,
      org_id: entry.orgId,
      job_id: entry.jobId,
      user_id: entry.userId,
      date: entry.workDate,
      start_time: entry.startTime,
      end_time: entry.endTime,
      hours: entry.hours,
      description: entry.description,
      section_name: entry.sectionName,
      status: entry.status,
      is_billable: entry.isBillable,
      hourly_rate: entry.hourlyRate,
      rejected_reason: entry.rejectedReason,
      approved_by: entry.approvedBy,
      approved_at: entry.approvedAt,
      created_by: entry.createdBy,
      updated_by: entry.updatedBy,
      created_at: entry.createdAt,
      updated_at: updatedAt,
      deleted_at: entry.deletedAt,
    };
    console.info("[TimeEntriesRepository] queued SyncEnvelope", {
      entityType: "time_entries",
      entityId: id,
      operation: entry.deletedAt ? "soft_delete" : "upsert",
      payload: queuePayload,
    });
    await this.enqueue({
      entityType: "time_entries",
      entityId: id,
      operation: entry.deletedAt ? "soft_delete" : "upsert",
      payload: queuePayload,
    });

    return entry;
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, { deletedAt: this.now() });
  }
}
