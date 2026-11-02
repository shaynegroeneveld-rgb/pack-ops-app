import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {AddressSearch} from '@/components/address/AddressSearch';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/data/supabase/client',()=>({getSupabaseClient:()=>({functions:{invoke}})}));
function Form(){const [value,setValue]=useState('');return <AddressSearch value={value} onChange={setValue}/>;}
beforeEach(()=>{vi.useFakeTimers();invoke.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('debounces typing and confirms the selected address with the same session',async()=>{
 invoke.mockResolvedValueOnce({data:{suggestions:[{id:'place1',label:'4320 Hales Road, BC'}]}}).mockResolvedValueOnce({data:{address:'4320 Hales Rd, Spallumcheen, BC, Canada'}});
 render(<Form/>);fireEvent.change(screen.getByRole('combobox'),{target:{value:'4320 Hales'}});
 expect(invoke).not.toHaveBeenCalled();await act(async()=>{await vi.advanceTimersByTimeAsync(350);});
 fireEvent.keyDown(screen.getByRole('combobox'),{key:'ArrowDown'});
 await act(async()=>{fireEvent.keyDown(screen.getByRole('combobox'),{key:'Enter'});fireEvent.blur(screen.getByRole('combobox')); });
 expect((screen.getByRole('combobox') as HTMLInputElement).value).toContain('Spallumcheen');
 expect(invoke.mock.calls[0][1].body.sessionToken).toBe(invoke.mock.calls[1][1].body.sessionToken);
});
it('discards old results after the address changes and permits manual entry on failure',async()=>{
 let resolve!:(v:unknown)=>void;invoke.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValueOnce({error:new Error('offline')});
 render(<Form/>);fireEvent.change(screen.getByRole('combobox'),{target:{value:'Old street'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(350);});
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'New street'}});
 await act(async()=>{resolve({data:{suggestions:[{id:'old',label:'Old address'}]}});await vi.advanceTimersByTimeAsync(350);});
 expect(screen.queryByRole('option')).toBeNull();expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('New street');
 expect(screen.getByRole('status').textContent).toContain('manually');
});
