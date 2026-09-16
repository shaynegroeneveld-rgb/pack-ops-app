import {it,expect,vi} from 'vitest';
import {WorkbenchService} from '@/services/workbench/workbench-service';
import {toScheduleRangeIso} from '@/features/field/components/field-mode-shared';
it('a quantity-only correction preserves existing optional material metadata',async()=>{const update=vi.fn().mockResolvedValue({});await WorkbenchService.prototype.updateJobMaterial.call({jobMaterials:{update}} as any,{jobMaterialId:'entry',catalogItemId:'material',quantity:3});expect(update).toHaveBeenCalledWith('entry',{catalogItemId:'material',quantity:3});});
it('allows explicit clearing of a part without clearing costs or note',async()=>{const update=vi.fn().mockResolvedValue({});await WorkbenchService.prototype.updateJobMaterial.call({jobMaterials:{update}} as any,{jobMaterialId:'entry',catalogItemId:'material',quantity:3,sectionName:null});expect(update).toHaveBeenCalledWith('entry',{catalogItemId:'material',quantity:3,sectionName:null});});
it('schedule ranges cover the local calendar day',()=>{const start=new Date(toScheduleRangeIso('2026-09-14'));const end=new Date(toScheduleRangeIso('2026-09-14',true));expect(start.getDate()).toBe(14);expect(start.getHours()).toBe(0);expect(end.getDate()).toBe(14);expect(end.getHours()).toBe(23);expect(end.getMilliseconds()).toBe(999);});

import {QuotesService} from '@/services/quotes/quotes-service';
it('quote conversion preserves planned materials and fractional labour with their job parts', async () => {
 const create=vi.fn().mockResolvedValue({id:'job'});
 const seed=vi.fn().mockResolvedValue(undefined);
 const lines=[{catalogItemId:'material',sku:'ABC',description:'Box',unit:'each',quantity:4,note:null,sectionName:'Garage',unitCost:2,unitSell:3,lineKind:'item'}, {description:'Install',unit:'hr',quantity:2.5,sectionName:'Garage',lineKind:'labor'}];
 await QuotesService.prototype.createJobFromQuote.call({
  assertCanManageQuotes:()=>{},quotes:{getById:async()=>({id:'quote',number:'Q-1',status:'accepted',contactId:'contact',title:'Garage'})},
  findJobByQuoteId:async()=>null,quoteLineItems:{listByQuoteIds:async()=>lines},nextJobNumber:async()=>'J-1',
  jobs:{create},sync:{flushPendingQueue:async()=>{}},seedNeededMaterialsFromEstimate:seed,
 } as any,'quote' as any);
 const input=create.mock.calls[0][0];
 expect(input.estimatedHours).toBe(2.5);
 expect(input.estimateSnapshot.materials[0]).toMatchObject({catalogItemId:'material',quantity:4,sectionName:'Garage'});
 expect(input.estimateSnapshot.laborLines).toEqual([{description:'Install',unit:'hr',quantity:2.5,sectionName:'Garage'}]);
 expect(seed).toHaveBeenCalledWith('job',input.estimateSnapshot.materials);
});
