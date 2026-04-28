import type { Table } from "dexie";

import { localDb } from "@/data/dexie/db";
import { createSyncQueueEntry } from "@/data/dexie/outbox";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { OrgId } from "@/domain/ids";
import type { SyncEntityType } from "@/data/sync/contracts";

export abstract class WorkbenchRepositoryBase<TEntity extends { id: string; orgId: string; updatedAt: string; deletedAt: string | null }> {
  constructor(protected readonly context: RepositoryContext) {}

  protected async enqueue<TEntityPayload extends Record<string, unknown>>(params: {
    entityType: SyncEntityType;
    entityId: string;
    operation: "upsert" | "soft_delete" | "delete";
    payload: TEntityPayload;
  }): Promise<void> {
    await localDb.syncQueue.put(
      createSyncQueueEntry({
        orgId: this.context.orgId as OrgId,
        entityType: params.entityType,
        entityId: params.entityId,
        operation: params.operation,
        payload: params.payload,
        clientUpdatedAt: new Date().toISOString(),
        actorUserId: this.context.actorUserId,
      }),
    );
  }

  protected now(): string {
    return new Date().toISOString();
  }

  protected byOrg<TRecord extends TEntity>(table: Table<TRecord, string>) {
    return table.filter((record) => record.orgId === this.context.orgId);
  }
}
