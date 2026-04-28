import type { EntityType } from "@/domain/enums";

export type SyncEntityType =
  | EntityType
  | "job_assignments"
  | "active_timers"
  | "schedule_blocks"
  | "worker_unavailability";

export type SyncOperationType = "upsert" | "soft_delete" | "delete";
export type SyncQueueStatus = "pending" | "processing" | "failed" | "complete";

export interface SyncEnvelope {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
  actorUserId: string | null;
}

export interface SyncMutationReceipt {
  entityType: SyncEntityType;
  entityId: string;
  queuedAt: string;
  outboxId: string;
}

export interface SyncPullRequest {
  table: SyncEntityType;
  since: string | null;
}

export interface SyncPullResponse<TRow> {
  table: SyncEntityType;
  rows: TRow[];
  cursor: string;
}

export interface SyncCheckpoint {
  scope: SyncEntityType | "global";
  cursor: string;
  updatedAt: string;
}
