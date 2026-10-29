import {useState} from 'react';
import type {AssemblyView,CatalogItem} from '@/domain/materials/types';
import {AssemblyCounterRow} from './AssemblyCounterRow';

export function AssemblyMaterialCounters({assemblies,catalog,jobId,part,scope,onSaved}: {
 assemblies:AssemblyView[];catalog:CatalogItem[];jobId:string;part:string;scope:string;onSaved:()=>void;
}) {
 const storageKey=JSON.stringify(['field-material-counter-list-v1',scope,jobId,part]);
 const [ids,setIds]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)??'[]');return Array.isArray(saved)?saved.filter((id:unknown)=>typeof id==='string'):[];}catch{return [];}});
 const [selected,setSelected]=useState(''),[error,setError]=useState('');
 function load(){
  const assembly=assemblies.find(a=>a.id===selected);if(!assembly)return;
  const materials=assembly.items.map(i=>catalog.find(m=>m.id===i.catalogItemId&&m.isActive));
  if(!materials.length||materials.some(m=>!m)){setError('This assembly has missing or inactive materials. Update its recipe first.');return;}
  const next=[...new Set([...ids,...materials.map(m=>String(m!.id))])];
  try{localStorage.setItem(storageKey,JSON.stringify(next));setIds(next);setSelected('');setError('');}
  catch{setError('Could not save this list on your phone. Nothing was added.');}
 }
 return <>
  <label>Load materials from an assembly<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose an assembly…</option>{assemblies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <button type="button" disabled={!selected} onClick={load}>Add materials to counter list</button>
  <p className="job-muted">New materials start at zero. Loading an assembly does not record any usage. Existing counters keep their counts. Counts are yours on this device for {part}.</p>
  {error&&<p role="alert" className="job-error">{error}</p>}
  {ids.map(id=>{
   const material=catalog.find(m=>m.id===id);
   if(!material)return <p key={id} className="job-error">A saved material is unavailable. Reload the catalogue to see its counter.</p>;
   const recipe={id:`material-counter:${id}`,name:material.name,items:[{id,catalogItemId:material.id,quantity:1}]} as AssemblyView;
   return <AssemblyCounterRow key={id} materialOnly assembly={recipe} catalog={catalog} jobId={jobId} part={part} scope={scope} onSaved={onSaved}/>;
  })}
  {!ids.length&&<p className="job-muted">Choose an assembly to start your material list.</p>}
 </>;
}
