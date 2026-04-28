import type { SyncQueueEntry } from "@/data/dexie/outbox";

export interface PushSyncPort {
  push(entries: SyncQueueEntry[]): Promise<void>;
}

export class PushSyncService {
  constructor(private readonly port: PushSyncPort) {}

  async flush(entries: SyncQueueEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.port.push(entries);
  }
}
