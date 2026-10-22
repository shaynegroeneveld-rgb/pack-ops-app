import { localDb } from "@/data/dexie/db";
import type { RepositoryContext } from "@/data/repositories/contracts";

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function snapshotKey(context: RepositoryContext, name: string): string {
  return JSON.stringify(["v1", context.orgId, context.actorUserId, name]);
}

export async function saveSnapshot<T>(context: RepositoryContext, name: string, value: T): Promise<T> {
  await localDb.offlineSnapshots.put({ key: snapshotKey(context, name), value, savedAt: new Date().toISOString() });
  return value;
}

export async function loadSnapshot<T>(context: RepositoryContext, name: string): Promise<T> {
  const record = await localDb.offlineSnapshots.get(snapshotKey(context, name));
  if (!record) throw new Error("This job has not been saved for offline use. Open Field and choose Save jobs offline while connected.");
  return record.value as T;
}

export async function cachedRead<T>(context: RepositoryContext, name: string, read: () => Promise<T>): Promise<T> {
  if (isOffline()) return loadSnapshot<T>(context, name);
  const value = await read();
  try { await saveSnapshot(context, name, value); } catch (error) { console.warn("Could not update the offline copy", error); }
  return value;
}
