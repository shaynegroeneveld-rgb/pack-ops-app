import { localDb } from "@/data/dexie/db";
import type { SyncQueueEntry } from "@/data/dexie/outbox";
import { getSyncErrorMessage } from "@/data/sync/errors";
import { PullSyncService } from "@/data/sync/pull";
import { PushSyncService } from "@/data/sync/push";

export interface SyncEngineDependencies {
  push: PushSyncService;
  pull: PullSyncService;
}

export class SyncEngine {
  constructor(private readonly deps: SyncEngineDependencies) {}

  private computeNextRetryAt(retryCount: number): string {
    const backoffMs = Math.min(30_000, 1_000 * 2 ** retryCount);
    return new Date(Date.now() + backoffMs).toISOString();
  }

  async flushPending(entries: SyncQueueEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    console.info("[SyncEngine] flushPending entries", entries.map((entry) => ({
      id: entry.id,
      entityType: entry.entityType,
      entityId: entry.entityId,
      operation: entry.operation,
      orgId: entry.orgId,
      retryCount: entry.retryCount,
      status: entry.status,
    })));

    await localDb.syncQueue.bulkPut(
      entries.map((entry) => ({
        ...entry,
        status: "processing",
        nextRetryAt: null,
      })),
    );

    try {
      await this.deps.push.flush(entries);
      await localDb.syncQueue.bulkDelete(entries.map((entry) => entry.id));
    } catch (error) {
      const errorMessage = getSyncErrorMessage(error, "Unknown sync error");
      console.error("[SyncEngine] flushPending error", {
        error,
        errorMessage,
      });
      await localDb.syncQueue.bulkPut(
        entries.map((entry) => ({
          ...entry,
          status: "failed",
          retryCount: entry.retryCount + 1,
          nextRetryAt: this.computeNextRetryAt(entry.retryCount + 1),
          lastError: errorMessage,
        })),
      );
      throw error;
    }
  }

  async flushPendingQueue(options?: { force?: boolean }): Promise<void> {
    const now = new Date();
    const entries = (await localDb.syncQueue.where("status").anyOf("pending", "failed").toArray())
      .filter((entry) => options?.force || !entry.nextRetryAt || new Date(entry.nextRetryAt) <= now)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await this.flushPending(entries);
  }

  async refreshAll(): Promise<void> {
    await this.deps.pull.refresh([
      { table: "contacts" },
      { table: "leads" },
      { table: "quotes" },
      { table: "jobs" },
      { table: "job_assignments" },
      { table: "schedule_blocks" },
      { table: "worker_unavailability" },
      { table: "active_timers" },
      { table: "invoices" },
      { table: "time_entries" },
      { table: "expenses" },
      { table: "action_items" },
    ]);
  }

  async refreshWorkbench(): Promise<void> {
    await this.deps.pull.refresh([
      { table: "jobs" },
      { table: "job_assignments" },
      { table: "active_timers" },
      { table: "time_entries" },
      { table: "action_items" },
    ]);
  }

  async refreshScheduling(): Promise<void> {
    await this.deps.pull.refresh([
      { table: "jobs" },
      { table: "job_assignments" },
      { table: "schedule_blocks" },
      { table: "worker_unavailability" },
    ]);
  }
}
