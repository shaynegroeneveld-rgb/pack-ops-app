import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { localDb } from "@/data/dexie/db";
import { cachedRead, loadSnapshot, saveSnapshot } from "@/data/offline/cache";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import { JobMaterialsRepositoryImpl } from "@/data/repositories/job-materials.repository.impl";
import { ActiveTimersRepositoryImpl } from "@/data/repositories/active-timers.repository.impl";
import { ActionItemsRepositoryImpl } from "@/data/repositories/action-items.repository.impl";
import { SyncEngine } from "@/data/sync/engine";
import { createSyncQueueEntry } from "@/data/dexie/outbox";
import { WorkbenchService } from "@/services/workbench/workbench-service";
import { loadTimeDraft, saveTimeDraft } from "@/data/offline/time-draft";

const context: any = { orgId: "company", actorUserId: "worker" };
const user: any = { id: "worker", orgId: "company", role: "field", fullName: "Worker" };
const online = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
const client: any = { from: vi.fn(() => { throw new Error("An offline action made a server request"); }) };
beforeEach(async () => {
  online(false);
  for (const table of localDb.tables) await table.clear();
  client.from.mockClear();
});
afterEach(() => vi.restoreAllMocks());

it("reopens a downloaded job snapshot without a connection and isolates other accounts", async () => {
  await saveSnapshot(context, "job", { title: "Garage" });
  localDb.close(); await localDb.open();
  expect(await cachedRead(context, "job", client.from)).toEqual({ title: "Garage" });
  await expect(loadSnapshot({ ...context, actorUserId: "different-worker" }, "job")).rejects.toThrow("not been saved");
  await expect(loadSnapshot({ ...context, orgId: "different-company" }, "job")).rejects.toThrow("not been saved");
  expect(client.from).not.toHaveBeenCalled();
});

it("saves fractional hours offline, survives reopening, and does not duplicate a repeated save", async () => {
  const repo = new TimeEntriesRepositoryImpl(context, client);
  const input: any = { requestId: "time-request", jobId: "garage", userId: "worker", workDate: "2026-10-22", hours: 1.25, description: "Wiring" };
  await repo.create(input);
  localDb.close(); await localDb.open();
  await repo.create(input);
  expect(await localDb.timeEntries.count()).toBe(1);
  expect(await localDb.syncQueue.count()).toBe(1);
  expect((await localDb.timeEntries.get("time-request"))?.hours).toBe(1.25);
  await expect(repo.create({ ...input, hours: 2 })).rejects.toThrow("different details");
});

it("uses cached assignment permissions when saving a field time draft", async () => {
  await localDb.jobs.put({ id: "garage", orgId: "company", deletedAt: null } as any);
  await localDb.jobAssignments.put({ id: "assignment", orgId: "company", jobId: "garage", userId: "worker", deletedAt: null } as any);
  const service = new WorkbenchService(context, user, client);
  const draft: any = { requestId: "draft", jobId: "garage", userId: "worker", source: "manual", activeTimerId: null, startedAt: "2026-10-22T15:00:00Z", endedAt: "2026-10-22T16:30:00Z", description: "Wiring", sectionName: "Garage" };
  expect((await service.saveTimeEntryDraft(draft)).hours).toBe(1.5);
  await localDb.jobAssignments.clear();
  await expect(service.saveTimeEntryDraft({ ...draft, requestId: "another" })).rejects.toThrow("cannot log time");
  expect(client.from).not.toHaveBeenCalled();
});

it("restores an offline running timer and retains its queued stop after reopening", async () => {
  const repo = new ActiveTimersRepositoryImpl(context, client);
  const timer = await repo.create({ jobId: "garage", userId: "worker", startedAt: new Date().toISOString() } as any);
  localDb.close(); await localDb.open();
  expect((await repo.getCurrentForUser("worker" as any))?.id).toBe(timer.id);
  await repo.softDelete(timer.id);
  localDb.close(); await localDb.open();
  expect(await repo.getCurrentForUser("worker" as any)).toBeNull();
  expect((await localDb.syncQueue.orderBy("createdAt").toArray()).map(row => row.operation)).toEqual(["upsert", "delete"]);
});

it("queues material adds, edits, and removals without duplicate add rows", async () => {
  const repo = new JobMaterialsRepositoryImpl(context, client);
  const input: any = { requestId: "material", jobId: "garage", catalogItemId: "switch", kind: "used", quantity: 2.5, sectionName: "Garage" };
  await repo.create(input); await repo.create(input);
  expect(await localDb.syncQueue.count()).toBe(1);
  await repo.update("material", { quantity: 3 });
  localDb.close(); await localDb.open();
  expect((await repo.list({ filter: { jobId: "garage" } }))[0]?.quantity).toBe(3);
  await repo.softDelete("material");
  expect(await repo.list()).toEqual([]);
  expect(await localDb.syncQueue.count()).toBe(3);
  expect(client.from).not.toHaveBeenCalled();
});

it("persists an assigned task completion offline and shows its updated status in the saved job", async () => {
  const repo = new ActionItemsRepositoryImpl(context, client);
  const task = await repo.create({ requestId: "task", entityType: "jobs", entityId: "garage", category: "follow_up", title: "Label panel", assignedTo: "worker", priority: "normal" } as any);
  await saveSnapshot(context, "job-cards", [{ job: { id: "garage" }, timeEntries: [], actionItems: [task] }]);
  const service = new WorkbenchService(context, user, client);
  await service.resolveActionItem(task);
  localDb.close(); await localDb.open();
  expect((await service.listJobCards())[0]?.actionItems[0]?.status).toBe("resolved");
  expect((await localDb.syncQueue.filter(row => row.entityType === "action_items").toArray()).length).toBe(2);
  expect(client.from).not.toHaveBeenCalled();
});

it("only lists the downloaded jobs when reopening a prepared device offline", async () => {
  await saveSnapshot(context, "job-cards", ["downloaded", "office-only"].map(id => ({ job: { id }, timeEntries: [], actionItems: [] })));
  await saveSnapshot(context, "offline-ready", { jobIds: ["downloaded"] });
  const service = new WorkbenchService(context, user, client);
  expect((await service.listJobCards()).map(card => card.job.id)).toEqual(["downloaded"]);
});

it("does not send queued changes offline; reconnect only sends this user's changes and recovers interrupted sync", async () => {
  const own = createSyncQueueEntry({ orgId: "company", actorUserId: "worker", entityType: "job_materials", entityId: "material", operation: "upsert", payload: {}, clientUpdatedAt: new Date().toISOString() } as any);
  await localDb.syncQueue.bulkPut([own, { ...own, id: "other-user", actorUserId: "other" }, { ...own, id: "other-company", orgId: "other-company" } as any]);
  const flush = vi.fn(async () => {});
  const engine = new SyncEngine({ push: { flush } as any, pull: {} as any }, context);
  await engine.flushPendingQueue();
  expect(flush).not.toHaveBeenCalled();
  await localDb.syncQueue.put({ ...own, status: "processing" });
  online(true);
  await engine.flushPendingQueue();
  expect(flush).toHaveBeenCalledTimes(1);
  expect((await localDb.syncQueue.toArray()).map(row => row.id).sort()).toEqual(["other-company", "other-user"]);
});

it("keeps failed changes for retry and does not send a later edit before a delayed add", async () => {
  online(true);
  const base = createSyncQueueEntry({ orgId: "company", actorUserId: "worker", entityType: "job_materials", entityId: "material", operation: "upsert", payload: {}, clientUpdatedAt: new Date().toISOString() } as any);
  await localDb.syncQueue.put(base);
  const flush = vi.fn(async () => { throw new Error("No connection"); });
  const engine = new SyncEngine({ push: { flush } as any, pull: {} as any }, context);
  await expect(engine.flushPendingQueue()).rejects.toThrow("No connection");
  const failure = await localDb.syncQueue.get(base.id);
  expect(failure?.status).toBe("failed");
  await localDb.syncQueue.put({ ...base, id: "later-edit", createdAt: new Date(Date.now() + 100).toISOString() });
  flush.mockClear(); await engine.flushPendingQueue();
  expect(flush).not.toHaveBeenCalled();
  flush.mockImplementation(async () => {});
  await engine.flushPendingQueue({ force: true });
  expect(await localDb.syncQueue.count()).toBe(0);
});

it("persists an unfinished time draft through reload without sharing it with another login", () => {
  const draft: any = { requestId: "draft", jobId: "garage", userId: "worker", description: "Wiring", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), source: "manual", activeTimerId: null };
  saveTimeDraft("company", "worker", draft);
  expect(loadTimeDraft("company", "worker")).toEqual(draft);
  expect(loadTimeDraft("company", "other")).toBeNull();
  saveTimeDraft("company", "worker", null);
  expect(loadTimeDraft("company", "worker")).toBeNull();
});
