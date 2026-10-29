import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {AssemblyMaterialCounters} from '@/features/field/components/AssemblyMaterialCounters';
import {localDb} from '@/data/dexie/db';
beforeEach(async()=>{for(const t of localDb.tables)await t.clear();});
it('loads unique materials at zero and records only individually counted quantities',async()=>{
 const props:any={assemblies:[{id:'a',name:'Rough in',items:[{catalogItemId:'m',quantity:12},{catalogItemId:'m',quantity:4}]}],catalog:[{id:'m',isActive:true,name:'Box',unit:'each',costPrice:3,unitPrice:4}],jobId:'j',part:'General',scope:'org:worker',onSaved:vi.fn()};
 const view=render(<AssemblyMaterialCounters {...props}/>);
 const load=()=>{fireEvent.change(screen.getByLabelText('Choose material or assembly'),{target:{value:'assembly:a'}});};
 load();await screen.findByText('0 · Set qty');
 expect(await localDb.jobMaterials.count()).toBe(0);expect(await localDb.syncQueue.count()).toBe(0);
 fireEvent.click(screen.getByRole('button',{name:'Add one Box'}));await screen.findByText('1 · Set qty');
 fireEvent.change(screen.getByLabelText('Choose material or assembly'),{target:{value:'material:m'}});expect(screen.getAllByRole('button',{name:'Add one Box'})).toHaveLength(1);
 const rows=await localDb.jobMaterials.toArray();expect(rows).toHaveLength(1);expect(rows[0].quantity).toBe(1);expect(rows[0].sourceAssemblyId).toBeNull();
 expect(await localDb.timeEntries.count()).toBe(0);
 view.unmount();render(<AssemblyMaterialCounters {...props}/>);await screen.findByText('1 · Set qty');
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'Add one Box'})).toHaveLength(1));
});
