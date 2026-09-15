import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {it, expect, vi, beforeEach} from 'vitest';
const mocks = vi.hoisted(() => ({rpc: vi.fn(), row: {} as Record<string, unknown>, refresh: vi.fn(), invalidate: vi.fn()}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({invalidateQueries: mocks.invalidate}),
  useQuery: ({queryKey}: {queryKey: string[]}) => ({isLoading: false, error: null, refetch: mocks.refresh, data: queryKey[0] === 'ebh-price-status' ? {cfg: {enabled: true, last_completed_at: new Date().toISOString()}, review: 1, waiting: 0, documents: []} : [mocks.row]}),
}));
vi.mock('@/data/supabase/client', () => ({getSupabaseClient: () => ({rpc: mocks.rpc, from: () => ({select: () => ({eq: () => ({eq: () => ({single: async () => ({data: {cost_price: null}, error: null})})})})})})}));
import {AutomaticPricesPanel} from '../src/features/materials/components/AutomaticPricesPanel';
beforeEach(() => {vi.clearAllMocks(); mocks.rpc.mockResolvedValue({error: null}); mocks.row = {id: 'review', catalog_item_id: null, old_cost: null, new_cost: 11.2, supplier_sku: 'BOX1', description: 'Box', unit: 'each', status: 'review', reason: 'possible_existing_material', invoice_number: '123', invoice_date: '2026-09-15'};});
function openReview() {render(<AutomaticPricesPanel orgId="org" onFind={() => {}} />); fireEvent.click(screen.getByRole('button', {name: /Price activity/}));}
it('creates an unmatched material through the guarded review action', async () => {
 openReview(); fireEvent.click(screen.getByRole('button', {name: /Create material/}));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('ebh_review_create_material', {p_id: 'review'}));
 await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
});
it('sets a missing cost with a null expected price', async () => {
 mocks.row.catalog_item_id = 'material'; openReview(); fireEvent.click(screen.getByRole('button', {name: /Set missing cost/}));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('ebh_review_price', {p_id: 'review', p_use_price: true, p_expected_cost: null}));
});
it('explains duplicate prevention instead of silently failing', async () => {
 mocks.rpc.mockResolvedValue({error: {message: 'material_already_exists'}}); openReview(); fireEvent.click(screen.getByRole('button', {name: /Create material/}));
 await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no duplicate was created'));
});
