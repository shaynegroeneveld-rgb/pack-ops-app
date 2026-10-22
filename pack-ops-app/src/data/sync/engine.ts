import { validateTimeEntryHours } from "@/domain/time-entries/hours";
import { localDb } from "@/data/dexie/db";
import { isOffline } from "@/data/offline/cache";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { SyncQueueEntry } from "@/data/dexie/outbox";
import { getSyncErrorMessage } from "@/data/sync/errors";
import { PullSyncService } from "@/data/sync/pull";
import { PushSyncService } from "@/data/sync/push";

export interface SyncEngineDependencies {
  push: PushSyncService;
  pull: PullSyncService;
}

const activeFlushes = new Map<string, Promise<void>>();

export class SyncEngine {
  constructor(private readonly deps: SyncEngineDependencies, private readonly context?: RepositoryContext) {}

  private computeNextRetryAt(retryCount: number): string {
    const backoffMs = Math.min(30_000, 1_000 * 2 ** retryCount);
    return new Date(Date.now() + backoffMs).toISOString();
  }

  async flushPending(entries: SyncQueueEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    let firstError: unknown;
    const blockedEntities = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.orgId}:${entry.entityType}:${entry.entityId}`;
      if (blockedEntities.has(key)) continue;
      // Keep invalid legacy labour locally for correction without blocking job changes.
      if (entry.entityType === "time_entries" && entry.operation === "upsert") {
        try {
          validateTimeEntryHours(entry.payload.hours as number);
        } catch (error) {
          await localDb.syncQueue.put({ ...entry, status: "failed", nextRetryAt: null,
            lastError: `Labour entry needs correction (${String(entry.payload.hours)} hours). ${getSyncErrorMessage(error)} Other job changes can still sync.` });
          blockedEntities.add(key);
          continue;
        }
      }
      await localDb.syncQueue.put({ ...entry, status: "processing", nextRetryAt: null });
      try {
        await this.deps.push.flush([entry]);
        await localDb.syncQueue.delete(entry.id);
      } catch (error) {
        await localDb.syncQueue.put({ ...entry, status: "failed", retryCount: entry.retryCount + 1,
          nextRetryAt: this.computeNextRetryAt(entry.retryCount + 1), lastError: getSyncErrorMessage(error, "Unknown sync error") });
        blockedEntities.add(key);
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  async flushPendingQueue(options?: { force?: boolean }): Promise<void> {
    if (isOffline()) return;
    const key = `pack-ops-sync:${this.context?.orgId ?? "all"}:${this.context?.actorUserId ?? "all"}`;
    const previous = activeFlushes.get(key);
    if (previous) return previous;
    const flush = async () => this.flushScopedQueue(options);
    const task = (async () => {
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(key, flush);
      else await flush();
    })();
    activeFlushes.set(key, task);
    try { await task; } finally { activeFlushes.delete(key); }
  }

  private async flushScopedQueue(options?: { force?: boolean }): Promise<void> {
    const now = new Date();
    const entries = (await localDb.syncQueue.where("status").anyOf("pending", "failed", "processing").toArray())
      .filter((entry) => (!this.context || (entry.orgId === this.context.orgId && entry.actorUserId === this.context.actorUserId))
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const delayed = new Set<string>();
    await this.flushPending(entries.filter(entry => {
      const key = `${entry.orgId}:${entry.entityType}:${entry.entityId}`;
      if (delayed.has(key)) return false;
      if (!options?.force && entry.nextRetryAt && new Date(entry.nextRetryAt) > now) { delayed.add(key); return false; }
      return true;
    }));
  }

  async refreshAll(): Promise<void> {
    if (isOffline()) return;
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
    if (isOffline()) return;
    await this.deps.pull.refresh([
      { table: "jobs" },
      { table: "job_assignments" },
      { table: "active_timers" },
      { table: "time_entries" },
      { table: "action_items" },
    ]);
  }

  async refreshScheduling(): Promise<void> {
    if (isOffline()) return;
    await this.deps.pull.refresh([
      { table: "jobs" },
      { table: "job_assignments" },
      { table: "schedule_blocks" },
      { table: "worker_unavailability" },
    ]);
  }
}
