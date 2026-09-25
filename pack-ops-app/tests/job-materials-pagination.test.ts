import { expect, it, vi } from 'vitest';
import { JobMaterialsRepositoryImpl } from '@/data/repositories/job-materials.repository.impl';
import { computeJobPerformanceSummary } from '@/services/jobs/job-performance';

function setup(pages: any[]) {
  const query: any = {};
  for (const method of ['select', 'eq', 'is', 'order']) query[method] = vi.fn(() => query);
  query.range = vi.fn();
  pages.forEach(page => query.range.mockResolvedValueOnce(page));
  return { query, repo: new JobMaterialsRepositoryImpl({ orgId: 'org' } as any, { from: () => query } as any) };
}

it('includes a newer job after 1000 other entries and only totals used materials', async () => {
  const old = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), job_id: 'old', kind: 'needed', quantity: 1, unit_cost: 10 }));
  const tail = [
    { id: 'used', job_id: 'new', kind: 'used', quantity: 2.5, unit_cost: 10, catalog_item_id: 'wire' },
    { id: 'needed', job_id: 'new', kind: 'needed', quantity: 100, unit_cost: 99 },
    { id: 'free', job_id: 'new', kind: 'used', quantity: 2, unit_cost: 0, catalog_item_id: 'wire' },
    { id: 'fallback', job_id: 'new', kind: 'used', quantity: 3, unit_cost: null, catalog_item_id: 'wire' },
  ];
  const { repo, query } = setup([{ data: old.slice(0, 500), count: 1004 }, { data: old.slice(500) }, { data: tail }]);
  const entries = await repo.list();
  expect(entries).toHaveLength(1004);
  const result = computeJobPerformanceSummary({ job: { status: 'scheduled' }, linkedQuote: null,
    catalogItems: [{ id: 'wire', costPrice: 20 }], jobMaterials: entries.filter(e => e.jobId === 'new'),
    timeEntries: [], manualActualCostLines: [], canViewFinancials: true } as any)!;
  expect(result.actualMaterialCost).toBe(85);
  expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

it('preserves filters on every page even with a smaller server cap', async () => {
  const { repo, query } = setup([{ data: [{ id: '1' }], count: 2 }, { data: [{ id: '2' }] }]);
  expect(await repo.list({ filter: { jobId: 'job', kind: 'used' } } as any)).toHaveLength(2);
  expect(query.eq.mock.calls).toEqual([['org_id', 'org'], ['job_id', 'job'], ['kind', 'used'], ['org_id', 'org'], ['job_id', 'job'], ['kind', 'used']]);
  expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
  expect(query.range).toHaveBeenLastCalledWith(1, 500);
});

it.each([{ error: new Error('offline') }, { data: [] }])('rejects an incomplete result instead of showing understated costs', async (second) => {
  const { repo } = setup([{ data: [{ id: '1' }], count: 2 }, second]);
  await expect(repo.list()).rejects.toThrow();
});
