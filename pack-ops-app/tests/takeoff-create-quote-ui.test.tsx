import {render, screen, fireEvent} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({catalog: [{id: 'material', name: 'Assigned material', sku: 'ONE', unit: 'each', costPrice: 10, isActive: true, aliases: [], category: 'Devices'}]}));
vi.mock('@/app/contexts/auth-context', () => ({useAuthContext: () => ({currentUser: {user: {orgId: 'org'}}})}));
vi.mock('@/features/materials/hooks/use-materials-slice', () => ({useMaterialsSlice: () => ({catalogQuery: {data: state.catalog, isLoading: false}})}));
vi.mock('@/features/quotes/hooks/use-quotes-slice', () => ({useQuotesSlice: () => ({builderResourcesQuery: {data: null}, createQuote: {isPending: false}, uploadQuoteAttachment: {isPending: false}})}));
import {useUiStore} from '../src/app/store/ui-store';
beforeEach(() => useUiStore.setState({takeoffQuote: null, activeRoute: '/electrical-takeoff'}));
import {ElectricalTakeoffPage} from '../src/features/takeoff/components/ElectricalTakeoffPage';
function loadDeviceCount() {
 const frame = screen.getByTitle('Residential Electrical Takeoff') as HTMLIFrameElement;
 Object.defineProperty(frame, 'contentDocument', {value: document.implementation.createHTMLDocument('Test plan')});
 frame.contentDocument!.body.innerHTML = '<div class="takeoff"><div><span>Baseboard heater</span><strong>1</strong></div><div><span>1-gang box</span><strong>1</strong></div></div><div class="takeoff compact"><div><span>Rough-in: Wiring</span><strong data-quantity="2.5">2.5 hr</strong></div></div>';
}
it('does not navigate to an empty quote when device assignments are missing', () => {
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 fireEvent.click(screen.getByRole('button', {name: 'Create Quote', exact: true}));
 expect(useUiStore.getState().takeoffQuote).toBeNull();
 expect(useUiStore.getState().activeRoute).toBe('/electrical-takeoff');
 expect(screen.getByRole('status').textContent).toContain('Set exact Pack Ops materials');
});
it('opens Quotes with actual recipe materials and labour on the first click, without gang rules', () => {
 localStorage.setItem('packops-takeoff-device-recipes-v1', JSON.stringify({'baseboard-heater': [{id: 'line', catalogItemId: 'material', quantity: 3}]}));
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 fireEvent.click(screen.getByRole('button', {name: 'Create Quote', exact: true}));
 expect(useUiStore.getState().activeRoute).toBe('/quotes');
 const lines = useUiStore.getState().takeoffQuote!.draft.lineItems;
 expect(lines).toHaveLength(2);
 expect(lines[0]).toMatchObject({catalogItemId: 'material', description: 'Assigned material', quantity: 3, unitCost: 10, lineKind: 'item'});
 expect(lines[1]).toMatchObject({lineKind: 'labor', quantity: 2.5, unit: 'hr', unitSell: 95});
});
