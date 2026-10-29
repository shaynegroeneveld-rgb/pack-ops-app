import {useEffect,useRef,useState} from 'react';
import {liveQuery} from 'dexie';
import {changeAssemblyCounter,counterKey,readAssemblyCounter,type AssemblyCounterState} from '@/services/field/assembly-counter';
import type {AssemblyView,CatalogItem} from '@/domain/materials/types';

export function AssemblyCounterRow({assembly,catalog,jobId,part,scope,onSaved,materialOnly=false}: {
 assembly:AssemblyView;catalog:CatalogItem[];jobId:string;part:string;scope:string;onSaved:()=>void;materialOnly?:boolean;
}) {
 const key=counterKey(scope,jobId,part,assembly.id);
 const [state,setState]=useState<AssemblyCounterState|null>(null);
 const [editing,setEditing]=useState(false),[value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const locked=useRef(false);
 useEffect(()=>{setState(null);setEditing(false);setError('');const sub=liveQuery(()=>readAssemblyCounter(key)).subscribe({next:setState,error:()=>setError('Phone storage is unavailable. Nothing was added.')});return()=>sub.unsubscribe();},[key]);
 async function change(action:'add'|'undo'|number){
  if(locked.current || !state)return;
  locked.current=true;setBusy(true);setError('');
  try{const [orgId,actorUserId]=scope.split(':');if(!orgId||!actorUserId)throw new Error('Sign in again to save materials.');
   const next=await changeAssemblyCounter({context:{orgId,actorUserId},jobId,part,assembly,catalog,action,materialOnly});setState(next);setEditing(false);onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{locked.current=false;setBusy(false);}
 }
 return <article className="field-assembly-counter" aria-label={`${assembly.name} counter`}>
  <div className="field-assembly-counter__line"><div className="field-assembly-counter__name"><strong>{assembly.name}</strong><span aria-live="polite">{state?.count ?? '…'} {materialOnly ? catalog.find(m=>m.id===assembly.items[0]?.catalogItemId)?.unit : ''} used</span></div>
   <button type="button" className="job-primary" aria-label={`Add one ${assembly.name}`} disabled={busy||!state} onClick={()=>void change('add')}>+1</button>
   <button type="button" aria-label={`Undo ${assembly.name}`} disabled={busy||!state?.history.length} onClick={()=>void change('undo')}>Undo</button>
   <button type="button" aria-label={`Set quantity for ${assembly.name}`} disabled={busy||!state} onClick={()=>{setValue(String(state?.count??0));setEditing(true);}}>Set qty</button>
  </div>
  {editing&&<form className="field-assembly-counter__edit" onSubmit={e=>{e.preventDefault();if(!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value.trim())){setError('Enter a quantity, such as 6 or 0.5.');return;}void change(Number(value));}}>
   <label>Total for this counter<input autoFocus inputMode="decimal" aria-label={`Total ${assembly.name}`} value={value} onChange={e=>setValue(e.target.value)} disabled={busy}/></label>
   <button type="submit" disabled={busy}>Save total</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button>
  </form>}
  {error&&<p role="alert" className="job-error">{error}</p>}
  {!materialOnly&&<details><summary>Recipe · {assembly.items.length} materials</summary>{assembly.items.map(item=><p key={item.id}>{item.quantity} × {catalog.find(m=>m.id===item.catalogItemId)?.name??'Missing material'}</p>)}<p>Materials only. No labour added.</p></details>}
 </article>;
}
