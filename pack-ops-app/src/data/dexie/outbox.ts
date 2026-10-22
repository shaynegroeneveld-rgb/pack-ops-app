import type { EntityType } from "@/domain/enums";
import type { OrgId } from "@/domain/ids";
import type { SyncEnvelope, SyncQueueStatus } from "@/data/sync/contracts";
import { createId } from "@/lib/create-id";

export type SyncOperation = "upsert" | "soft_delete" | "delete";

export interface SyncQueueEntry extends SyncEnvelope {
  id: string;
  orgId: OrgId;
  idempotencyKey: string;
  createdAt: string;
  status: SyncQueueStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
}

export interface SyncCursor {
  scope: string;
  updatedAt: string;
}

let lastQueuedAt = 0;

export function createSyncQueueEntry(
  entry: Omit<
    SyncQueueEntry,
    "id" | "createdAt" | "status" | "retryCount" | "lastError" | "idempotencyKey" | "nextRetryAt"
  >,
): SyncQueueEntry {
  lastQueuedAt = Math.max(Date.now(), lastQueuedAt + 1);
  const now = new Date(lastQueuedAt).toISOString();
  const id = createId();

  return {
    ...entry,
    id,
    idempotencyKey: id,
    createdAt: now,
    status: "pending",
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
  };
}
