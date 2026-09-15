import {render, screen, fireEvent} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({catalog: [{id: 'material', name: 'Assigned material', sku: 'ONE', unit: 'each', costPrice: 10, isActive: true, aliases: [], category: 'Devices'}]}));
vi.mock('@/app/contexts/auth-context', () => ({useAuthContext: () => ({currentUser: {user: {orgId: 'org'}}})}));
vi.mock('@/features/materials/hooks/use-materials-slice', () => ({useMaterialsSlice: () => ({catalogQuery: {data: state.catalog, isLoading: false}})}));
vi.mock('@/features/quotes/hooks/use-quotes-slice', () => ({useQuotesSlice: () => ({builderResourcesQuery: {data: null}, createQuote: {isPending: false}, uploadQuoteAttachment: {isPending: false}})}));
import {ElectricalTakeoffPage} from '../src/features/takeoff/components/ElectricalTakeoffPage';
function loadDeviceCount() {
 const frame = screen.getByTitle('Residential Electrical Takeoff') as HTMLIFrameElement;
 Object.defineProperty(frame, 'contentDocument', {value: document.implementation.createHTMLDocument('Test plan')});
 frame.contentDocument!.body.innerHTML = '<div class="takeoff"><div><span>Baseboard heater</span><strong>1</strong></div><div><span>1-gang box</span><strong>1</strong></div></div>';
}
it('Create Quote opens the quote builder with a warning instead of forcing device setup', () => {
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 fireEvent.click(screen.getByRole('button', {name: 'Create Quote', exact: true}));
 expect(screen.getByRole('heading', {name: 'Create Quote From Takeoff'})).toBeTruthy();
 expect(screen.getByRole('button', {name: 'Create Draft Quote'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByRole('button', {name: 'Check assigned device materials'})).toBeTruthy();
});
it('assigned device materials can be quoted without extra gang rules', () => {
 localStorage.setItem('packops-takeoff-device-recipes-v1', JSON.stringify({'baseboard-heater': [{id: 'line', catalogItemId: 'material', quantity: 1}]}));
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 fireEvent.click(screen.getByRole('button', {name: 'Create Quote', exact: true}));
 expect(screen.getByRole('heading', {name: 'Create Quote From Takeoff'})).toBeTruthy();
 expect(screen.getByRole('button', {name: 'Create Draft Quote'}).hasAttribute('disabled')).toBe(false);
 expect(screen.queryByRole('button', {name: 'Check assigned device materials'})).toBeNull();
});
