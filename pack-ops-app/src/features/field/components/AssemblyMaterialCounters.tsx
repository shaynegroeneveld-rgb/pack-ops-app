import {useState} from 'react';
import type {AssemblyView,CatalogItem} from '@/domain/materials/types';
import {rankCatalogItems,rankAssemblies} from '@/services/materials/material-search';
import {AssemblyCounterRow} from './AssemblyCounterRow';

export function AssemblyMaterialCounters({assemblies,catalog,jobId,part,scope,onSaved,parts=[],onSelectPart}: {
 assemblies:AssemblyView[];catalog:CatalogItem[];jobId:string;part:string;scope:string;onSaved:()=>void;parts?:string[];onSelectPart?:(part:string)=>void;
}) {
 const storageKey=JSON.stringify(['field-material-counter-list-v1',scope,jobId,part]);
 const [ids,setIds]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)??'[]');return Array.isArray(saved)?saved.filter((id:unknown)=>typeof id==='string'):[];}catch{return [];}});
 const [search,setSearch]=useState(''),[error,setError]=useState('');
 const materialsFound=rankCatalogItems(catalog.filter(m=>m.isActive),search);
 const assembliesFound=rankAssemblies(assemblies,search);
 function load(selection:string){
  if(!selection)return;
  const assembly=assemblies.find(a=>'assembly:'+a.id===selection);
  const materials=assembly?assembly.items.map(i=>catalog.find(m=>m.id===i.catalogItemId&&m.isActive)):[catalog.find(m=>'material:'+m.id===selection&&m.isActive)];
  if(!materials.length||materials.some(m=>!m)){setError('This assembly has missing or inactive materials. Update its recipe first.');return;}
  const next=[...new Set([...ids,...materials.map(m=>String(m!.id))])];
  try{localStorage.setItem(storageKey,JSON.stringify(next));setIds(next);setSearch('');setError('');}
  catch{setError('Could not save this list on your phone. Nothing was added.');}
 }
 function copyList(target:string){
  if(!target||target===part)return;
  const key=JSON.stringify(['field-material-counter-list-v1',scope,jobId,target]);
  try {
   const saved=JSON.parse(localStorage.getItem(key)??'[]');
   if(!Array.isArray(saved)||saved.some(id=>typeof id!=='string'))throw new Error('Invalid list');
   localStorage.setItem(key,JSON.stringify([...new Set([...saved,...ids])]));
   onSelectPart?.(target);
  }catch{setError('Could not copy this list. Your current materials and counts have not changed.');}
 }
 return <>
  <label>Find material or assembly<input type="search" placeholder="Name, nickname or supplier code" value={search} onChange={e=>setSearch(e.target.value)} autoCorrect="off" autoCapitalize="none" /></label>
  <label>Choose material or assembly<select value="" onChange={e=>load(e.target.value)}><option value="">Choose to add bubbles…</option>
   <optgroup label="Assemblies — materials only">{assembliesFound.map(a=><option key={a.id} value={'assembly:'+a.id}>{a.name}</option>)}</optgroup>
   <optgroup label="Materials">{materialsFound.map(m=><option key={m.id} value={'material:'+m.id}>{m.name} · {m.unit}{m.sku?' · '+m.sku:''}</option>)}</optgroup>
  </select></label>
  <p className="job-muted">New bubbles start at zero. +1 saves immediately. Your counts on this device · {part}.</p>
  {!materialsFound.length&&!assembliesFound.length&&<p>No matches. Try a name, size or supplier code.</p>}
  {error&&<p role="alert" className="job-error">{error}</p>}
  {!!ids.length&&parts.some(p=>p!==part)&&<details className="field-copy-list"><summary>Use this material list in another part</summary><p className="job-muted">Copies the bubbles only. New materials start at zero; existing counts stay unchanged.</p><label>Copy list to job part<select value="" onChange={e=>copyList(e.target.value)}><option value="">Choose destination…</option>{parts.filter(p=>p!==part).map(p=><option key={p}>{p}</option>)}</select></label></details>}
  <div className="field-material-bubbles">{ids.map(id=>{
   const material=catalog.find(m=>m.id===id);
   if(!material)return <p key={id} className="job-error">A saved material is unavailable. Reload the catalogue to see its counter.</p>;
   const recipe={id:`material-counter:${id}`,name:material.name,items:[{id,catalogItemId:material.id,quantity:1}]} as AssemblyView;
   return <AssemblyCounterRow key={id} materialOnly assembly={recipe} catalog={catalog} jobId={jobId} part={part} scope={scope} onSaved={onSaved}/>;
  })}</div>
  {!ids.length&&<p className="job-muted">Choose a material or assembly to start counting.</p>}
 </>;
}
