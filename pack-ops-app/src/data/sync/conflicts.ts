export type ConflictResolutionStrategy = "last_write_wins" | "preserve_both";

export interface SyncConflict {
  entityType: string;
  entityId: string;
  strategy: ConflictResolutionStrategy;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export function chooseConflictStrategy(entityType: string): ConflictResolutionStrategy {
  return entityType === "time_entries" ? "preserve_both" : "last_write_wins";
}
