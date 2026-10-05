import { beforeEach, expect, it, vi } from 'vitest';
const { queued } = vi.hoisted(() => ({ queued: new Map<string, any>() }));
vi.mock('@/data/dexie/db', () => ({ localDb: { syncQueue: {
  put: async (entry: any) => queued.set(entry.id, entry),
  delete: async (id: string) => queued.delete(id),
} } }));
import { SyncEngine } from '@/data/sync/engine';
import { validateTimeEntryHours } from '@/domain/time-entries/hours';
import { WorkbenchService } from '@/services/workbench/workbench-service';
beforeEach(() => queued.clear());
const entry = (id: string, entityType = 'jobs', hours = 1): any => ({ id, entityId: id, orgId: 'org', entityType, operation: 'upsert', payload: { hours }, retryCount: 0, status: 'pending' });
it.each([0, -1, 25, Infinity, NaN, 0.001])('rejects unsavable hours %s', (hours) => expect(() => validateTimeEntryHours(hours)).toThrow());
it.each([0.01, 0.5, 24])('accepts valid fractional hours %s', hours => expect(validateTimeEntryHours(hours)).toBe(hours));
it('keeps invalid labour but sends subsequent job updates', async () => {
  const push = { flush: vi.fn(async () => {}) };
  const engine = new SyncEngine({ push, pull: {} } as any);
  await engine.flushPending([entry('labour', 'time_entries', 40), entry('job')]);
  expect(push.flush.mock.calls[0][0][0].id).toBe('job');
  expect(queued.get('labour').status).toBe('failed');
  expect(queued.get('labour').payload.hours).toBe(40);
  expect(queued.has('job')).toBe(false);
});
it('isolates server failures and retains their changes', async () => {
  const push = { flush: vi.fn(async (entries: any[]) => { if (entries[0].id === 'bad') throw new Error('server failure'); }) };
  const engine = new SyncEngine({ push, pull: {} } as any);
  await expect(engine.flushPending([entry('bad'), entry('good')])).rejects.toThrow('server failure');
  expect(push.flush).toHaveBeenCalledTimes(2);
  expect(queued.has('good')).toBe(false);
  expect(queued.get('bad').lastError).toBe('server failure');
});
it('validates multiplied assembly labour before adding any materials', async () => {
  const service: any = { buildAssemblyViews: async () => [{ id: 'assembly', defaultLaborHours: 2, items: [{}] }], createJobMaterial: vi.fn() };
  await expect(WorkbenchService.prototype.addAssemblyToJobActuals.call(service, { jobId: 'job', assemblyId: 'assembly', multiplier: 20, addLabor: true })).rejects.toThrow('24');
  expect(service.createJobMaterial).not.toHaveBeenCalled();
});
