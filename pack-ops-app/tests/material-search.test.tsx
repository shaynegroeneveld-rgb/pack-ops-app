import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {rankCatalogItems,matchesCatalogItemSearch} from '@/services/materials/material-search';
import {MaterialSearchSelect} from '@/features/materials/components/MaterialSearchSelect';
const material=(name:string,sku:string,aliases:string[]=[])=>({id:sku,name,sku,aliases,unit:'each',category:'Electrical',notes:null} as any);
const box=material('Steel device box','BOX-100',['switch box']);
const breaker=material('Single pole breaker 20 amp','BR-20');
const wire12=material('NMD90 copper wire 12/2','WIRE12');
const wire14=material('NMD90 copper wire 14/2','WIRE14');
it('requires all words instead of allowing one unrelated match',()=>{expect(matchesCatalogItemSearch(box,'steel breaker')).toBe(false);expect(matchesCatalogItemSearch(breaker,'steel breaker')).toBe(false);});
it('ranks exact supplier codes before name mentions and tolerates separators',()=>{expect(rankCatalogItems([material('Replacement for BOX-100','other'),box],'box100')[0]).toBe(box);});
it('supports nicknames and reordered words',()=>{expect(rankCatalogItems([breaker,box],'box switch')).toEqual([box]);});
it('tolerates one spelling error and swapped letters',()=>{expect(matchesCatalogItemSearch(breaker,'breakr')).toBe(true);expect(matchesCatalogItemSearch(breaker,'braeker')).toBe(true);});
it('keeps numeric specifications exact',()=>{expect(rankCatalogItems([wire14,wire12],'wire 12/2')).toEqual([wire12]);expect(matchesCatalogItemSearch(material('120 volt device','V120'),'12')).toBe(false);});
it('does not mistake fractions for an unrelated all-numeric code',()=>{expect(matchesCatalogItemSearch(material('Unrelated item','122'),'12/2')).toBe(false);});
it('keeps trade-name normalization',()=>{expect(matchesCatalogItemSearch(material('Recessed light','LIGHT'),'pot light')).toBe(true);expect(matchesCatalogItemSearch(wire12,'romex 12/2')).toBe(true);});
it('puts an exact material name above incidental notes',()=>{const extra={...breaker,notes:'steel device box'};expect(rankCatalogItems([extra,box],'Steel device box')[0]).toBe(box);});
it('supports keyboard selection without submitting the surrounding form',()=>{const select=vi.fn(),submit=vi.fn();render(<form onSubmit={submit}><MaterialSearchSelect catalogItems={[breaker,box]} selectedMaterialId="" isPending={false} onSelect={select}/></form>);const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.change(input,{target:{value:'switch box'}});fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'Enter'});expect(select).toHaveBeenCalledWith('BOX-100');expect(submit).not.toHaveBeenCalled();expect(screen.queryByRole('listbox')).toBeNull();});
it('Escape closes the matches without choosing a material',()=>{const select=vi.fn();render(<MaterialSearchSelect catalogItems={[box]} selectedMaterialId="" isPending={false} onSelect={select}/>);const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.keyDown(input,{key:'Escape'});expect(select).not.toHaveBeenCalled();expect(screen.queryByRole('listbox')).toBeNull();});
it('handles older items without alias metadata',()=>{expect(matchesCatalogItemSearch({...box,aliases:undefined},'steel')).toBe(true);});
it('matches equivalent fraction and decimal sizes without mixing sizes',()=>{
 const half=material('EMT connector 1/2 inch','C050'),threeQuarter=material('EMT connector 3/4 inch','C075');
 expect(rankCatalogItems([threeQuarter,half],'0.5 EMT')).toEqual([half]);
 expect(rankCatalogItems([half,threeQuarter],'¾ connector')).toEqual([threeQuarter]);
 expect(rankCatalogItems([half,threeQuarter],'.5in connector')).toEqual([half]);
});
it('matches mixed and unicode fractions',()=>{const fitting=material('EMT coupling 1-1/2 inch','COUPLING150');expect(matchesCatalogItemSearch(fitting,'1.5 coupling')).toBe(true);expect(matchesCatalogItemSearch(fitting,'1½ coupling')).toBe(true);});
it('matches wire trade designations without mixing conductors or gauge',()=>{const a=material('2C14 NMD90','A'),b=material('3C14 NMD90','B'),c=material('2C12 NMD90','C');expect(rankCatalogItems([b,c,a],'romex 14/2')).toEqual([a]);});
it('understands GFI/GFCI and amperage notation',()=>{const a=material('GFI receptacle 20A','A'),b=material('GFCI receptacle 15 amp','B');expect(rankCatalogItems([b,a],'ground fault 20 amp')).toEqual([a]);});
it('does not flatten a physical dimension into a different SKU',()=>{expect(matchesCatalogItemSearch(material('Unrelated part','EMT12'),'EMT 1/2')).toBe(false);expect(matchesCatalogItemSearch(material('Unrelated part','ABC15'),'ABC 1.5')).toBe(false);});
it('matches plural names and word order',()=>{expect(matchesCatalogItemSearch(material('Steel junction box','JBOX'),'boxes junction')).toBe(true);});
it('supports long numeric supplier-code prefixes',()=>{expect(matchesCatalogItemSearch(material('Connector','123456789'),'12345')).toBe(true);});
it('updates indexed search metadata after a catalog edit',()=>{const a=material('Old name','EDIT');expect(matchesCatalogItemSearch(a,'old')).toBe(true);a.name='New name';expect(matchesCatalogItemSearch(a,'new')).toBe(true);expect(matchesCatalogItemSearch(a,'old')).toBe(false);});
it('never displays everything for a punctuation-only query',()=>{expect(rankCatalogItems([box],'---')).toEqual([]);});
it('shows results beyond the first twelve without changing the query',()=>{const items=Array.from({length:25},(_,i)=>material(`Box ${i}`,`BOX${i}`));render(<MaterialSearchSelect catalogItems={items} selectedMaterialId="" isPending={false} onSelect={()=>{}}/>);fireEvent.focus(screen.getByRole('combobox'));expect(screen.getAllByRole('option')).toHaveLength(12);fireEvent.click(screen.getByRole('button',{name:/Show more/}));expect(screen.getAllByRole('option')).toHaveLength(24);});
it('can reach the thirteenth result using the keyboard',()=>{const select=vi.fn();const items=Array.from({length:14},(_,i)=>material(`Box ${i}`,`BOX${i}`));render(<MaterialSearchSelect catalogItems={items} selectedMaterialId="" isPending={false} onSelect={select}/>);const input=screen.getByRole('combobox');fireEvent.focus(input);for(let i=0;i<13;i++)fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'Enter'});expect(select).toHaveBeenCalledWith('BOX12');});
it('Enter only selects an unambiguous result without an explicit highlight',()=>{const select=vi.fn();render(<MaterialSearchSelect catalogItems={[box,breaker]} selectedMaterialId="" isPending={false} onSelect={select}/>);const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.keyDown(input,{key:'Enter'});expect(select).not.toHaveBeenCalled();fireEvent.change(input,{target:{value:'BOX100'}});fireEvent.keyDown(input,{key:'Enter'});expect(select).toHaveBeenCalledWith('BOX-100');});
it('renders older catalog rows without aliases and escapes outside clipping containers',()=>{const {container}=render(<div style={{overflow:'hidden'}}><MaterialSearchSelect catalogItems={[{...box,aliases:undefined}]} selectedMaterialId="" isPending={false} onSelect={()=>{}}/></div>);fireEvent.focus(screen.getByRole('combobox'));expect(screen.getAllByRole('option')).toHaveLength(1);expect(container.contains(screen.getByRole('listbox'))).toBe(false);});
it('closes stale results when a save starts',()=>{const {rerender}=render(<MaterialSearchSelect catalogItems={[box]} selectedMaterialId="" isPending={false} onSelect={()=>{}}/>);fireEvent.focus(screen.getByRole('combobox'));rerender(<MaterialSearchSelect catalogItems={[box]} selectedMaterialId="" isPending={true} onSelect={()=>{}}/>);expect(screen.queryByRole('listbox')).toBeNull();});

it('recognizes low-voltage conductor counts without interpreting them as fractions',()=>{expect(matchesCatalogItemSearch(material('Thermostat cable 5C18','THERM'),'18/5')).toBe(true);expect(matchesCatalogItemSearch(material('Thermostat cable 2C18','THERM2'),'18/5')).toBe(false);});

it('matches joined, spaced and hyphenated gang descriptions in either direction', () => {
  for (const name of ['1 gang box', '1gang box', '1-gang box']) {
    const one = material(name, 'ONE'), two = material('2 gang box', 'TWO');
    for (const query of ['1gang', '1 gang', '1-gang', '1 gangs']) {
      expect(rankCatalogItems([two, one], query)).toEqual([one]);
    }
  }
});
it('matches joined trade specifications without confusing their numeric values', () => {
  const breaker = material('2pole 20amp breaker', 'B20');
  expect(rankCatalogItems([material('1 pole 20 amp breaker', 'B10'), breaker], '2 pole 20 amps')).toEqual([breaker]);
  expect(matchesCatalogItemSearch(material('120volt device', 'V120'), '120 volts')).toBe(true);
});

it('matches attached inch units on fractional sizes without changing the dimension', () => {
 const half = material('1/2inch EMT connector', 'HALF'), threeQuarter = material('3/4 inch EMT connector', 'THREEQUARTER');
 for (const query of ['1/2in EMT', '1/2 inch EMT', '.5 EMT']) expect(rankCatalogItems([threeQuarter, half], query)).toEqual([half]);
 expect(matchesCatalogItemSearch(material('1-1/2inch coupling', 'MIXED'), '1.5 coupling')).toBe(true);
 expect(matchesCatalogItemSearch(material('12mm fitting', 'METRIC'), '1/2 inch fitting')).toBe(false);
});
