import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {AssemblyCounterRow} from '@/features/field/components/AssemblyCounterRow';
import {localDb} from '@/data/dexie/db';
beforeEach(async()=>{for(const t of localDb.tables)await t.clear();});
it('adds, sets and undoes through the compact row',async()=>{
 render(<AssemblyCounterRow assembly={{id:'a',name:'Rough in',items:[{id:'i',catalogItemId:'m',quantity:2}]} as any} catalog={[{id:'m',isActive:true,name:'Box',unit:'each',costPrice:3,unitPrice:4}] as any} jobId="j" part="General" scope="org:worker" onSaved={vi.fn()}/>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Add one Rough in'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Add one Rough in'}));
 await screen.findByText('1 used');
 fireEvent.click(screen.getByRole('button',{name:'Set quantity for Rough in'}));
 fireEvent.change(screen.getByLabelText('Total Rough in'),{target:{value:'4'}});
 fireEvent.click(screen.getByRole('button',{name:'Save total'}));
 await screen.findByText('4 used');
 fireEvent.click(screen.getByRole('button',{name:'Undo Rough in'}));
 await screen.findByText('1 used');
 expect((await localDb.jobMaterials.toArray())[0].quantity).toBe(2);
});
