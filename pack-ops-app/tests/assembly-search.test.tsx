import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssemblySearchSelect } from '@/features/quotes/components/AssemblySearchSelect';
import { rankAssemblies } from '@/services/materials/material-search';
const assemblies:any[]=[{id:'rough',name:'Kitchen rough-in',description:'Counter wiring',defaultLaborHours:3,items:[{materialName:'NMD90 2C12',materialSku:'CABLE-212'}]},{id:'finish',name:'Kitchen finish',description:'Counter devices',defaultLaborHours:2,items:[{materialName:'GFCI receptacle 20A',materialSku:'GFI-20'}]}];
it('finds assemblies using the materials and SKUs inside them',()=>{expect(rankAssemblies(assemblies,'GFI 20 amp').map(a=>a.id)).toEqual(['finish']);expect(rankAssemblies(assemblies,'CABLE212').map(a=>a.id)).toEqual(['rough']);expect(rankAssemblies(assemblies,'CABLE-212').map(a=>a.id)).toEqual(['rough']);});
it('uses the same search and keyboard selection in assembly pickers',()=>{const select=vi.fn();render(<AssemblySearchSelect assemblies={assemblies} selectedAssemblyId="" isPending={false} onSelect={select}/>);const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.change(input,{target:{value:'GFI'}});expect(screen.getAllByRole('option')).toHaveLength(1);fireEvent.keyDown(input,{key:'Enter'});expect(select).toHaveBeenCalledWith('finish');});
