import {render, screen, fireEvent} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({catalog: [{id: 'material', name: 'Assigned material', sku: 'ONE', unit: 'each', costPrice: 10, isActive: true, aliases: [], category: 'Devices'}]}));
vi.mock('@/app/contexts/auth-context', () => ({useAuthContext: () => ({currentUser: {user: {orgId: 'org'}}})}));
vi.mock('@/features/materials/hooks/use-materials-slice', () => ({useMaterialsSlice: () => ({catalogQuery: {data: state.catalog, isLoading: false}})}));
vi.mock('@/features/quotes/hooks/use-quotes-slice', () => ({useQuotesSlice: () => ({builderResourcesQuery: {data: null}, createQuote: {isPending: false}, uploadQuoteAttachment: {isPending: false}})}));
import {useUiStore} from '../src/app/store/ui-store';
beforeEach(() => { localStorage.clear(); useUiStore.setState({takeoffQuote: null, activeRoute: '/electrical-takeoff'}); });
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

it('ignores unused extra recipe rows and opens Quotes while the customer PDF is still rendering', () => {
 localStorage.setItem('packops-takeoff-device-recipes-v1', JSON.stringify({'baseboard-heater': [{id:'saved',catalogItemId:'material',quantity:3},{id:'empty',catalogItemId:'',quantity:1}]}));
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 const frame = screen.getByTitle('Residential Electrical Takeoff') as HTMLIFrameElement;
 Object.defineProperty(frame, 'contentWindow', {value: {packOpsCustomerPlan: () => new Promise(() => {})}});
 fireEvent.click(screen.getByRole('button', {name:'Create Quote',exact:true}));
 expect(useUiStore.getState().activeRoute).toBe('/quotes');
 expect(useUiStore.getState().takeoffQuote!.draft.lineItems[0]).toMatchObject({catalogItemId:'material',quantity:3});
 expect(useUiStore.getState().takeoffQuote!.planPreparation).toBeInstanceOf(Promise);
});
it('names a genuinely broken assignment rather than silently dropping it', () => {
 localStorage.setItem('packops-takeoff-device-recipes-v1', JSON.stringify({'baseboard-heater': [{id:'saved',catalogItemId:'missing-id',quantity:1}]}));
 render(<ElectricalTakeoffPage />); loadDeviceCount();
 fireEvent.click(screen.getByRole('button', {name:'Create Quote',exact:true}));
 expect(useUiStore.getState().activeRoute).toBe('/electrical-takeoff');
 expect(screen.getByRole('status').textContent).toContain('Baseboard heater, row 1');
});

import {buildDeviceRecipeMaterialLines, findExactWireMaterial} from '../src/features/takeoff/components/ElectricalTakeoffPage';
const materialFixture=(id:string,name:string,unit='each')=>({id,name,unit,isActive:true,costPrice:2,sku:null,category:'Materials',aliases:[]}) as any;
it('links exact wire names or NMD conductor labels only to unique metre-priced materials',()=>{
 const wire=materialFixture('wire','2c14','m');
 expect(findExactWireMaterial('2c14 wire (m)',[wire])?.id).toBe('wire');
 expect(findExactWireMaterial('14/2 wire (m)',[materialFixture('nmd','NMD90 2c14','m')])?.id).toBe('nmd');
 expect(findExactWireMaterial('2c14 wire (m)',[materialFixture('spool','2c14','spool')])).toBeNull();
 expect(findExactWireMaterial('2c14 wire (m)',[wire,materialFixture('other','2c14','m')])).toBeNull();
});
it('gang rules replace recipe boxes and plates once, preserving ceiling boxes and device counts',()=>{
 const catalog=[materialFixture('box','1 gang switch box'),materialFixture('plate','1 gang plate'),materialFixture('double','2 gang box'),materialFixture('doubleplate','2 gang plate'),materialFixture('switch','Switch'),materialFixture('ceiling','Ceiling box')];
 const result=buildDeviceRecipeMaterialLines([{deviceId:'switch',name:'1-pole switch',quantity:3},{deviceId:'ceiling-light',name:'Ceiling light',quantity:1}],
 {'switch':[{id:'1',catalogItemId:'box',quantity:1},{id:'2',catalogItemId:'plate',quantity:1},{id:'3',catalogItemId:'switch',quantity:1}], 'ceiling-light':[{id:'4',catalogItemId:'ceiling',quantity:1}]},
 [{gangs:1,quantity:1},{gangs:2,quantity:1}],{'1-box':'box','1-plate':'plate','2-box':'double','2-plate':'doubleplate'},catalog);
 expect(Object.fromEntries(result.map(line=>[line.match!.id,line.quantity]))).toEqual({box:1,plate:1,double:1,doubleplate:1,switch:3,ceiling:1});
});
