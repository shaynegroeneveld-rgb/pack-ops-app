import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {RenamePart} from '@/components/parts/RenamePart';
it('trims the new name and saves without submitting its parent form',async()=>{
 const rename=vi.fn().mockResolvedValue(undefined),submit=vi.fn();
 render(<form onSubmit={submit}><RenamePart name="Rough" names={['Rough','Finish']} onRename={rename}/></form>);
 fireEvent.click(screen.getByRole('button',{name:'Rename Rough'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'  Rough-in  '}});
 fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
 await waitFor(()=>expect(rename).toHaveBeenCalledWith('Rough-in'));expect(submit).not.toHaveBeenCalled();
});
it('rejects blank or duplicate names and keeps failed saves editable',async()=>{
 const rename=vi.fn().mockRejectedValue(new Error('Offline. Try again.'));
 render(<RenamePart name="Rough" names={['Rough','Finish']} onRename={rename}/>);
 fireEvent.click(screen.getByText('Rename'));
 for(const value of [' ','finish']){fireEvent.change(screen.getByRole('textbox'),{target:{value}});fireEvent.click(screen.getByText('Save name'));expect(screen.getByRole('alert')).toBeTruthy();}
 expect(rename).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Kitchen'}});fireEvent.click(screen.getByText('Save name'));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Offline. Try again.'));expect(screen.getByRole('textbox')).toBeTruthy();
});
