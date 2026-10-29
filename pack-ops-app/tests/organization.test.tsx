import {localDb} from '@/data/dexie/db';
beforeEach(async()=>{for(const t of localDb.tables)await t.clear();});
import { describe,it,expect,vi,beforeEach } from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {FieldMaterialsUsedPanel} from '@/features/field/components/FieldMaterialsUsedPanel';
import {JobTaskBoard} from '@/features/jobs/components/JobTaskBoard';
import {parseMaterialQuantity,readTaskContext,writeTaskContext,jobTasks,collectJobParts} from '@/services/jobs/job-organization';
import {JobMaterialsRepositoryImpl} from '@/data/repositories/job-materials.repository.impl';
const item:any={id:'material',name:'Copper wire',sku:'WIRE',unit:'m',costPrice:2,unitPrice:3,aliases:['wire'],isActive:true};
function panel(overrides:any={}) { const props={jobId:'job',draftScope:'org:user',parts:['General','Service','Shop'],catalogItems:[item],assemblies:[],usedMaterials:[],plannedMaterialIds:['material'],onCreateUsedMaterial:vi.fn().mockResolvedValue({}),onUpdateUsedMaterial:vi.fn().mockResolvedValue({}),onDeleteUsedMaterial:vi.fn().mockResolvedValue({}),...overrides};return {props,...render(<FieldMaterialsUsedPanel {...props}/>)}; }
describe('material quantities and job context',()=>{
 it('rejects ambiguous or invalid quantities without rounding away detail',()=>{for(const value of ['','0','-2','1.234','1,5','abc','1e3','Infinity'])expect(parseMaterialQuantity(value)).toBeNull();expect(parseMaterialQuantity('12.25')).toBe(12.25);});
 it('preserves legacy notes and round trips parts',()=>{expect(readTaskContext('Check panel')).toEqual({part:'General',detail:'Check panel'});expect(readTaskContext(writeTaskContext('Service','East wall'))).toEqual({part:'Service',detail:'East wall'});expect(collectJobParts([{sectionName:'General'},{sectionName:'Service'}],[{sectionName:'Service'}])).toEqual(['General','Service']);});
 it('does not include another job or time-entry followup',()=>{expect(jobTasks([{id:'a',entityType:'jobs',entityId:'job',status:'open'},{id:'b',entityType:'time_entries',entityId:'job',status:'open'}] as any,'job').map(x=>x.id)).toEqual(['a']);});
});
describe('field material entry',()=>{
 it('counts fractional material quantities against the selected job part',async()=>{
 panel();fireEvent.change(screen.getByLabelText('Job part'),{target:{value:'Service'}});
 fireEvent.change(screen.getByLabelText('Choose material or assembly'),{target:{value:'material:material'}});
 await screen.findByText('0 · Set qty');fireEvent.click(screen.getByRole('button',{name:'Set quantity for Copper wire'}));
 fireEvent.change(screen.getByLabelText('Total Copper wire'),{target:{value:'12.25'}});fireEvent.click(screen.getByRole('button',{name:'Save total'}));
 await screen.findByText('12.25 · Set qty');expect((await localDb.jobMaterials.toArray())[0]).toMatchObject({quantity:12.25,sectionName:'Service'});
 });
 it('keeps selection at zero without creating usage',async()=>{panel();fireEvent.change(screen.getByLabelText('Choose material or assembly'),{target:{value:'material:material'}});await screen.findByText('0 · Set qty');expect(await localDb.jobMaterials.count()).toBe(0);});
 it('keeps independent lists for different parts',async()=>{panel();fireEvent.change(screen.getByLabelText('Choose material or assembly'),{target:{value:'material:material'}});await screen.findByText('0 · Set qty');fireEvent.change(screen.getByLabelText('Job part'),{target:{value:'Shop'}});expect(screen.queryByRole('button',{name:'Add one Copper wire'})).toBeNull();fireEvent.change(screen.getByLabelText('Job part'),{target:{value:'General'}});await screen.findByText('0 · Set qty');});
 it('requires confirmation before removing a saved entry',async()=>{const {props}=panel({usedMaterials:[{...item,id:'old',catalogItemId:'material',quantity:10,sectionName:'Shop',createdAt:'2026-01-01'}]});fireEvent.click(screen.getByRole('button',{name:'Remove',exact:true}));expect(props.onDeleteUsedMaterial).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Keep entry'}));expect(props.onDeleteUsedMaterial).not.toHaveBeenCalled();});
});
describe('job tasks',()=>{
 const task:any={id:'t',entityType:'jobs',entityId:'job',title:'Label panel',description:writeTaskContext('Service','Use circuit schedule'),assignedTo:'worker',status:'open',createdAt:'2026-01-01'};
 it('allows assigned field worker to complete but does not offer office-only create',async()=>{const complete=vi.fn().mockResolvedValue({});render(<JobTaskBoard jobId="job" items={[task]} parts={['General','Service']} currentUser={{id:'worker',fullName:'Worker',role:'field'} as any} crew={[]} canCreate={false} onCreate={vi.fn()} onComplete={complete}/>);expect(screen.queryByRole('button',{name:'+ Add task'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Mark Label panel done'}));await waitFor(()=>expect(complete).toHaveBeenCalledWith(task));});
 it('retains task text if save fails',async()=>{render(<JobTaskBoard jobId="job" items={[]} parts={['General']} currentUser={{id:'owner',fullName:'Owner',role:'owner'} as any} crew={[]} canCreate onCreate={vi.fn().mockRejectedValue(new Error('Unable to save'))} onComplete={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'+ Add task'}));fireEvent.change(screen.getByLabelText('What needs doing?'),{target:{value:'Finish rough-in'}});fireEvent.click(screen.getByRole('button',{name:'Save task'}));await screen.findByRole('alert');expect((screen.getByLabelText('What needs doing?') as HTMLInputElement).value).toBe('Finish rough-in');});
});
describe('material request deduplication',()=>{
 function repo(changed=false){let payload:any;const q:any={insert:vi.fn(p=>{payload=p;return q}),select:()=>q,eq:()=>q,single:vi.fn().mockImplementationOnce(()=>Promise.resolve({error:{code:'23505'}})).mockImplementationOnce(()=>Promise.resolve({data:{...payload,...(changed?{quantity:99}:{}),deleted_at:null}}))};return new JobMaterialsRepositoryImpl({orgId:'org',actorUserId:'user'} as any,{from:()=>q} as any);}
 it('returns the original entry for an identical retry',async()=>{const result=await repo().create({requestId:'request',jobId:'job',catalogItemId:'material',kind:'used',quantity:2});expect(result.id).toBe('request');expect(result.quantity).toBe(2);});
 it('rejects a retry with changed data instead of silently replacing it',async()=>{await expect(repo(true).create({requestId:'request',jobId:'job',catalogItemId:'material',kind:'used',quantity:2})).rejects.toThrow('different details');});
});
