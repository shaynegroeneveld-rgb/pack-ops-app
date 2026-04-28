import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { activeTimersMapper } from "@/data/mappers/active-timers.mapper";
import type { SyncCursor, SyncQueueEntry } from "@/data/dexie/outbox";
import { actionItemsMapper } from "@/data/mappers/action-items.mapper";
import { jobAssignmentsMapper } from "@/data/mappers/job-assignments.mapper";
import { jobsMapper } from "@/data/mappers/jobs.mapper";
import { scheduleBlocksMapper } from "@/data/mappers/schedule-blocks.mapper";
import { timeEntriesMapper } from "@/data/mappers/time-entries.mapper";
import { workerUnavailabilityMapper } from "@/data/mappers/worker-unavailability.mapper";
import type { Database } from "@/data/supabase/types";
import { SyncPushError, getSyncErrorMessage } from "@/data/sync/errors";
import type { PushSyncPort } from "@/data/sync/push";
import type { PullScope, PullSyncPort } from "@/data/sync/pull";

type WorkbenchTableName =
  | "jobs"
  | "job_assignments"
  | "schedule_blocks"
  | "worker_unavailability"
  | "active_timers"
  | "time_entries"
  | "action_items";

const WORKBENCH_TABLES: WorkbenchTableName[] = [
  "jobs",
  "job_assignments",
  "schedule_blocks",
  "worker_unavailability",
  "active_timers",
  "time_entries",
  "action_items",
];

function isMissingRelationError(error: { code?: string | null; message?: string | null }, tableName: string): boolean {
  return error.code === "42P01" || error.message?.includes(`relation "${tableName}" does not exist`) === true;
}

export class WorkbenchSyncGateway implements PushSyncPort, PullSyncPort {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async getQueuedEntityIds(tableName: WorkbenchTableName): Promise<Set<string>> {
    const queuedEntries = await localDb.syncQueue
      .where("entityType")
      .equals(tableName)
      .and((entry) => entry.status === "pending" || entry.status === "processing" || entry.status === "failed")
      .toArray();

    return new Set(queuedEntries.map((entry) => entry.entityId));
  }

  async push(entries: SyncQueueEntry[]): Promise<void> {
    for (const entry of entries) {
      const tableName = this.toTableName(entry.entityType);
      if (!tableName) {
        continue;
      }

      const query = this.client.from(tableName);
      const basePayload = entry.payload as Record<string, unknown>;
      const payload = {
        ...basePayload,
        updated_at: entry.clientUpdatedAt,
      };

      console.info("[WorkbenchSyncGateway] push entry", {
        entryId: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        operation: entry.operation,
        orgId: entry.orgId,
        tableName,
        payload,
      });

      const { data, error } =
        tableName === "jobs" && entry.operation === "soft_delete"
          ? await (this.client as SupabaseClient<Database> & {
              rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
            }).rpc("fn_archive_job", {
              p_job_id: entry.entityId,
              p_deleted_at:
                typeof basePayload.deleted_at === "string" ? basePayload.deleted_at : new Date().toISOString(),
            })
          : tableName === "time_entries" && entry.operation === "soft_delete"
          ? await (this.client as SupabaseClient<Database> & {
              rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
            }).rpc("fn_soft_delete_time_entry", {
              p_time_entry_id: entry.entityId,
              p_deleted_at:
                typeof basePayload.deleted_at === "string" ? basePayload.deleted_at : new Date().toISOString(),
            })
          : tableName === "schedule_blocks" && entry.operation === "soft_delete"
          ? await (this.client as SupabaseClient<Database> & {
              rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
            }).rpc("fn_soft_delete_schedule_block", {
              p_schedule_block_id: entry.entityId,
              p_deleted_at:
                typeof basePayload.deleted_at === "string" ? basePayload.deleted_at : new Date().toISOString(),
            })
          : 
        (tableName === "active_timers" && entry.operation === "soft_delete") || entry.operation === "delete"
          ? await query.delete().eq("id", entry.entityId).eq("org_id", entry.orgId)
          : entry.operation === "soft_delete"
          ? await query.update(payload).eq("id", entry.entityId).eq("org_id", entry.orgId)
          : await query.upsert(payload as never, {
              onConflict: "id",
              ignoreDuplicates: false,
            }).select("id");

      if (error) {
        const handledDuplicate = await this.handleKnownDuplicate(entry, tableName, payload, error);
        if (handledDuplicate) {
          console.info("[WorkbenchSyncGateway] duplicate treated as success", {
            entryId: entry.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
          });
          continue;
        }

        console.error("[WorkbenchSyncGateway] push error", {
          entryId: entry.id,
          entityType: entry.entityType,
          entityId: entry.entityId,
          payload,
          error,
        });

        throw new SyncPushError(
          `Sync failed for ${entry.entityType} ${entry.entityId} during ${entry.operation} — ${getSyncErrorMessage(error)}`,
          {
            id: entry.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
            operation: entry.operation,
            orgId: entry.orgId,
          },
          payload,
          error,
        );
      }

      console.info("[WorkbenchSyncGateway] push success", {
        entryId: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        response: data,
      });
    }
  }

  private async handleKnownDuplicate(
    entry: SyncQueueEntry,
    tableName: WorkbenchTableName,
    payload: Record<string, unknown>,
    error: { code?: string | null; message?: string | null; details?: string | null },
  ): Promise<boolean> {
    if (entry.operation !== "upsert" || error.code !== "23505") {
      return false;
    }

    const isJobAssignmentDuplicate =
      tableName === "job_assignments" &&
      (
        // old full constraint (pre-migration)
        error.message?.includes("job_assignments_job_id_user_id_key") === true ||
        error.details?.includes("job_assignments_job_id_user_id_key") === true ||
        // new partial index (post-migration)
        error.message?.includes("uq_job_assignments_active_job_user") === true ||
        error.details?.includes("uq_job_assignments_active_job_user") === true
      );

    if (isJobAssignmentDuplicate) {
      const jobId = typeof payload.job_id === "string" ? payload.job_id : null;
      const userId = typeof payload.user_id === "string" ? payload.user_id : null;

      if (!jobId || !userId) {
        return false;
      }

      // Fetch the existing active assignment
      const { data: activeRow, error: fetchError } = await this.client
        .from("job_assignments")
        .select("*")
        .eq("org_id", entry.orgId)
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();

      if (fetchError) {
        console.error("[WorkbenchSyncGateway] duplicate recovery fetch failed", {
          entryId: entry.id,
          tableName,
          jobId,
          userId,
          fetchError,
        });
        return false;
      }

      if (activeRow) {
        // An active assignment already exists — treat the queued create as a no-op
        if (activeRow.id !== entry.entityId) {
          await localDb.jobAssignments.delete(entry.entityId);
        }
        await localDb.jobAssignments.put(jobAssignmentsMapper.toDomain(activeRow));
        return true;
      }

      // No active row — try to reactivate a soft-deleted one (old full constraint case)
      const { data: deletedRow, error: deletedFetchError } = await this.client
        .from("job_assignments")
        .select("*")
        .eq("org_id", entry.orgId)
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .not("deleted_at", "is", null)
        .maybeSingle();

      if (deletedFetchError || !deletedRow) {
        console.error("[WorkbenchSyncGateway] duplicate recovery — no row to recover", {
          entryId: entry.id,
          tableName,
          jobId,
          userId,
          deletedFetchError,
        });
        return false;
      }

      const recoveredAssignment = await this.reactivateJobAssignment(entry, deletedRow, payload);
      if (!recoveredAssignment) {
        return false;
      }

      if (recoveredAssignment.id !== entry.entityId) {
        await localDb.jobAssignments.delete(entry.entityId);
      }
      await localDb.jobAssignments.put(jobAssignmentsMapper.toDomain(recoveredAssignment));
      return true;
    }

    if (tableName === "active_timers" && error.message?.includes("idx_active_timers_one_running_per_user")) {
      const userId = typeof payload.user_id === "string" ? payload.user_id : null;

      if (!userId) {
        return false;
      }

      const { error: clearError } = await this.client
        .from("active_timers")
        .delete()
        .eq("org_id", entry.orgId)
        .eq("user_id", userId)
        .is("deleted_at", null);

      if (clearError) {
        console.error("[WorkbenchSyncGateway] active timer duplicate recovery clear failed", {
          entryId: entry.id,
          tableName,
          userId,
          clearError,
        });
        return false;
      }

      const retryResult = await this.client
        .from("active_timers")
        .upsert(payload as never, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

      if (retryResult.error) {
        console.error("[WorkbenchSyncGateway] active timer duplicate recovery retry failed", {
          entryId: entry.id,
          retryError: retryResult.error,
        });
        return false;
      }

      return true;
    }

    return false;
  }

  private async reactivateJobAssignment(
    entry: SyncQueueEntry,
    existingRow: Database["public"]["Tables"]["job_assignments"]["Row"],
    payload: Record<string, unknown>,
  ): Promise<Database["public"]["Tables"]["job_assignments"]["Row"] | null> {
    const role = typeof payload.role === "string" ? payload.role : existingRow.role;
    const assignedBy = typeof payload.assigned_by === "string" ? payload.assigned_by : existingRow.assigned_by;

    const { data: reactivatedId, error: rpcError } = await (this.client as SupabaseClient<Database> & {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_reactivate_job_assignment", {
      p_job_id: existingRow.job_id,
      p_user_id: existingRow.user_id,
      p_role: role,
      p_assigned_by: assignedBy,
      p_updated_at: entry.clientUpdatedAt,
    });

    if (rpcError) {
      console.error("[WorkbenchSyncGateway] job assignment reactivation RPC failed", {
        entryId: entry.id,
        existingAssignmentId: existingRow.id,
        rpcError,
      });
      return null;
    }

    // RPC returns null when no soft-deleted row was found (already active — treat as success)
    // Fetch the current row to return to the caller
    const { data, error: fetchError } = await this.client
      .from("job_assignments")
      .select("*")
      .eq("org_id", entry.orgId)
      .eq("job_id", existingRow.job_id)
      .eq("user_id", existingRow.user_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !data) {
      console.error("[WorkbenchSyncGateway] job assignment post-reactivation fetch failed", {
        entryId: entry.id,
        reactivatedId,
        fetchError,
      });
      return null;
    }

    return data;
  }

  async pull(scopes: PullScope[]): Promise<void> {
    for (const scope of scopes) {
      const tableName = this.toTableName(scope.table);
      if (!tableName) {
        continue;
      }

      const cursor = await localDb.syncCursor.get(scope.table);
      const since = scope.since ?? cursor?.updatedAt ?? null;
      let query = this.client
        .from(tableName)
        .select("*")
        .order("updated_at", { ascending: true });

      if (since) {
        query = query.gt("updated_at", since);
      }

      const { data, error } = await query;
      if (error) {
        if (tableName === "active_timers" && isMissingRelationError(error, tableName)) {
          console.warn("[WorkbenchSyncGateway] skipping missing active_timers table during pull");
          continue;
        }
        throw error;
      }

      if (!data || data.length === 0) {
        continue;
      }

      const latestUpdatedAt = String(data[data.length - 1]?.updated_at ?? new Date().toISOString());
      const queuedEntityIds = await this.getQueuedEntityIds(tableName);
      const rowsToWrite =
        queuedEntityIds.size === 0
          ? (data as never[])
          : (data as Record<string, unknown>[]).filter((row) => !queuedEntityIds.has(String(row.id)));

      if (rowsToWrite.length > 0) {
        await this.writeRowsToDexie(tableName, rowsToWrite as never[]);
      }

      await localDb.syncCursor.put({
        scope: scope.table,
        updatedAt: latestUpdatedAt,
      } satisfies SyncCursor);
    }
  }

  private async writeRowsToDexie(tableName: WorkbenchTableName, rows: unknown[]) {
    switch (tableName) {
      case "jobs":
        await localDb.jobs.bulkPut(
          (rows as Database["public"]["Tables"]["jobs"]["Row"][]).map((row) => jobsMapper.toDomain(row)),
        );
        return;
      case "job_assignments":
        await localDb.jobAssignments.bulkPut(
          (rows as Database["public"]["Tables"]["job_assignments"]["Row"][]).map((row) =>
            jobAssignmentsMapper.toDomain(row),
          ),
        );
        return;
      case "schedule_blocks":
        await localDb.scheduleBlocks.bulkPut(
          (rows as Database["public"]["Tables"]["schedule_blocks"]["Row"][]).map((row) =>
            scheduleBlocksMapper.toDomain(row),
          ),
        );
        return;
      case "worker_unavailability":
        await localDb.workerUnavailability.bulkPut(
          (rows as Database["public"]["Tables"]["worker_unavailability"]["Row"][]).map((row) =>
            workerUnavailabilityMapper.toDomain(row),
          ),
        );
        return;
      case "time_entries":
        await localDb.timeEntries.bulkPut(
          (rows as Database["public"]["Tables"]["time_entries"]["Row"][]).map((row) =>
            timeEntriesMapper.toDomain(row),
          ),
        );
        return;
      case "active_timers":
        await localDb.activeTimers.bulkPut(
          (rows as Database["public"]["Tables"]["active_timers"]["Row"][]).map((row) =>
            activeTimersMapper.toDomain(row),
          ),
        );
        return;
      case "action_items":
        await localDb.actionItems.bulkPut(
          (rows as Database["public"]["Tables"]["action_items"]["Row"][]).map((row) =>
            actionItemsMapper.toDomain(row),
          ),
        );
        return;
      default:
        return;
    }
  }

  private toTableName(entityType: string): WorkbenchTableName | null {
    return WORKBENCH_TABLES.find((tableName) => tableName === entityType) ?? null;
  }
}
