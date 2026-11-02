import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {getSupabaseClient} from '@/data/supabase/client';
type Suggestion={id:string;label:string};
/** Manual entry stays available offline; only a deliberate selection replaces the address. */
export function AddressSearch({value,onChange,disabled,style,placeholder='Start typing a site address'}:{value:string;onChange:(value:string)=>void;disabled?:boolean;style?:CSSProperties;placeholder?:string}){
 const id=useId(),session=useRef(crypto.randomUUID()),revision=useRef(0);
 const [items,setItems]=useState<Suggestion[]>([]),[search,setSearch]=useState(''),[active,setActive]=useState(-1),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const invoke=async(body:Record<string,string>)=>{
  const {data,error}=await getSupabaseClient(import.meta.env).functions.invoke('job-address-search',{body:{...body,sessionToken:session.current}});
  if(error||data?.error)throw new Error(data?.error||'Address suggestions unavailable. Enter the address manually.');
  return data;
 };
 useEffect(()=>{
  const current=++revision.current;
  if(search.trim().length<3||disabled){setItems([]);setStatus('');return;}
  const timer=setTimeout(()=>{
   if(!navigator.onLine){setStatus('Offline — enter the address manually.');return;}
   setStatus('Finding addresses…');
   void invoke({action:'suggest',input:search}).then(data=>{if(current!==revision.current)return;setItems(data.suggestions);setActive(-1);setStatus(data.suggestions.length?'':'No matching addresses. You can enter it manually.');}).catch(error=>{if(current===revision.current){setItems([]);setStatus(error.message);}});
  },350);
  return()=>{clearTimeout(timer);revision.current++;};
 },[search,disabled]);
 async function choose(item:Suggestion){
  const current=++revision.current;setBusy(true);setItems([]);setStatus('Confirming address…');
  try{const data=await invoke({action:'details',placeId:item.id});if(current!==revision.current)return;onChange(data.address);setSearch('');setStatus('Address selected. Add a unit number if needed.');session.current=crypto.randomUUID();}
  catch(error){if(current===revision.current)setStatus(error instanceof Error?error.message:'Enter the address manually.');}
  finally{setBusy(false);}
 }
 return <div style={{position:'relative',minWidth:0}}>
  <input aria-label="Site address" role="combobox" aria-autocomplete="list" aria-expanded={items.length>0} aria-controls={`${id}-options`} aria-activedescendant={active>=0?`${id}-${active}`:undefined} autoComplete="off" value={value} disabled={disabled||busy} placeholder={placeholder} style={{...style,width:'100%',boxSizing:'border-box'}}
   onChange={e=>{revision.current++;setItems([]);setStatus('');setActive(-1);onChange(e.target.value);setSearch(e.target.value);}}
   onBlur={()=>{revision.current++;setItems([]);}}
   onKeyDown={e=>{if(e.key==='Escape'){revision.current++;setItems([]);}if(items.length&&e.key==='ArrowDown'){e.preventDefault();setActive(n=>(n+1)%items.length);}if(items.length&&e.key==='ArrowUp'){e.preventDefault();setActive(n=>(n-1+items.length)%items.length);}if(e.key==='Enter'&&active>=0&&items[active]){e.preventDefault();void choose(items[active]);}}}/>
  {items.length>0&&<div id={`${id}-options`} role="listbox" aria-label="Suggested addresses" style={{position:'absolute',zIndex:30,top:'100%',left:0,right:0,background:'#fff',border:'1px solid #d9dfeb',borderRadius:10,boxShadow:'0 6px 18px #0002',overflow:'hidden'}}>
   {items.map((item,index)=><div key={item.id} id={`${id}-${index}`} role="option" aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onClick={()=>void choose(item)} style={{padding:'12px',cursor:'pointer',background:active===index?'#f5eee6':'white',color:'#232323',borderBottom:'1px solid #eee'}}>{item.label}</div>)}
   <div style={{padding:'6px 12px',fontSize:12,color:'#555'}}>Google Maps</div>
  </div>}
  <small role="status" style={{display:'block',color:'#5b6475',marginTop:4}}>{status}</small>
 </div>;
}
