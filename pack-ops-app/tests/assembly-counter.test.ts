import {beforeEach, expect, it} from 'vitest';
import {localDb} from '@/data/dexie/db';
import {changeAssemblyCounter, counterKey, readAssemblyCounter} from '@/services/field/assembly-counter';
const input:any={context:{orgId:'org',actorUserId:'worker'},jobId:'job',part:'Rough in',assembly:{id:'assembly',name:'Outlet',items:[{id:'line',catalogItemId:'box',quantity:2}]},catalog:[{id:'box',isActive:true,name:'Box',unit:'each',costPrice:3,unitPrice:4}]};
beforeEach(async()=>{for(const table of localDb.tables)await table.clear();});
const change=(action:'add'|'undo'|number)=>changeAssemblyCounter({...input,action});
it('persists offline counts and queues materials without labour; concurrent taps are retained',async()=>{
 await Promise.all([change('add'),change('add')]);
 localDb.close();await localDb.open();
 expect((await readAssemblyCounter(counterKey('org:worker','job','Rough in','assembly'))).count).toBe(2);
 expect((await localDb.jobMaterials.toArray())[0].quantity).toBe(4);
 expect(await localDb.timeEntries.count()).toBe(0);
 expect(await localDb.syncQueue.count()).toBe(2);
});
it('sets an absolute total and undoes zero with the original recipe and fresh row IDs',async()=>{
 await change('add');await change(6);await change('undo');
 const before=(await localDb.jobMaterials.toArray())[0];
 await change(0);
 const restored=await changeAssemblyCounter({...input,assembly:{...input.assembly,items:[]},catalog:[],action:'undo'});
 expect(restored.count).toBe(1);expect(restored.lines[0].row.quantity).toBe(2);
 expect(restored.lines[0].row.unitCost).toBe(3);expect(restored.lines[0].row.id).not.toBe(before.id);
 expect((await localDb.jobMaterials.get(before.id))?.deletedAt).toBeTruthy();
});
it('rejects invalid recipes atomically and preserves external corrections',async()=>{
 await expect(changeAssemblyCounter({...input,assembly:{...input.assembly,items:[...input.assembly.items,{catalogItemId:'missing',quantity:1}]},action:'add'})).rejects.toThrow('missing');
 expect(await localDb.jobMaterials.count()).toBe(0);expect(await localDb.syncQueue.count()).toBe(0);
 const state=await change('add');await localDb.jobMaterials.update(state.lines[0].row.id,{quantity:99});
 await expect(change('undo')).rejects.toThrow('edited outside');
 expect((await localDb.jobMaterials.toArray())[0].quantity).toBe(99);
});
it('isolates job parts and workers',async()=>{
 await change('add');
 await changeAssemblyCounter({...input,part:'Finish',action:'add'});
 await changeAssemblyCounter({...input,context:{...input.context,actorUserId:'other'},action:'add'});
 await change('undo');
 expect((await localDb.jobMaterials.toArray()).filter(r=>!r.deletedAt)).toHaveLength(2);
});
