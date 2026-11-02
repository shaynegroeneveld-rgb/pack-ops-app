import "./job-overheads.css";
import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getSupabaseClient} from '@/data/supabase/client';
import {calculateOverheads,WORK_ORIGIN,type AdminEntry,type OverheadSettings} from '@/services/jobs/job-overheads';
import type {JobPerformanceReportRow} from '@/services/reports/job-performance-service';
import {createId} from '@/lib/create-id';

export function JobOverheadsPanel({row,orgId}:{row:JobPerformanceReportRow;orgId:string}){
 const [open,setOpen]=useState(false);
 return <details className="job-overheads" onToggle={e=>setOpen(e.currentTarget.open)}><summary style={{cursor:'pointer',padding:'12px 0',fontWeight:700}}>Admin & travel costs</summary>{open&&<OverheadEditor row={row} orgId={orgId}/>}</details>;
}
function OverheadEditor({row,orgId}:{row:JobPerformanceReportRow;orgId:string}){
 const client=getSupabaseClient(import.meta.env) as any;
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[hours,setHours]=useState(''),[note,setNote]=useState('');
 const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Vancouver'}));
 const [draft,setDraft]=useState<OverheadSettings|null>(null);
 const requestId=useRef(createId()),lock=useRef(false);
 const query=useQuery({queryKey:['job-overheads',orgId,row.jobId],queryFn:async()=>{
  const [settings,entries]=await Promise.all([client.from('job_overhead_settings').select('*').eq('org_id',orgId).eq('job_id',row.jobId).maybeSingle(),client.from('job_admin_entries').select('*').eq('org_id',orgId).eq('job_id',row.jobId).is('deleted_at',null).order('work_date',{ascending:false})]);
  if(settings.error||entries.error)throw settings.error||entries.error;
  return {settings:settings.data as OverheadSettings|null,admin:entries.data as AdminEntry[]};
 }});
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();await query.refetch();}catch(e){setError(e instanceof Error?e.message:(e as any)?.message||'Could not save. Try again.');}finally{setBusy(false);lock.current=false;}}
 if(query.isLoading)return <p>Loading admin and travel…</p>;
 if(query.isError||!query.data)return <p role="alert">Admin and travel are unavailable. <button onClick={()=>void query.refetch()}>Retry</button></p>;
 const settings=draft??query.data.settings??{origin_address:WORK_ORIGIN,destination_address:row.address??'',round_trip_km:null,rate_per_km:0.75,trip_adjustment:0};
 const cost=calculateOverheads({days:row.workedDays??[],address:row.address??'',settings:query.data.settings,admin:query.data.admin,recordedMileage:row.recordedMileage??0,hasRecordedMileage:!!row.hasRecordedMileage});
 const base=row.performance?.coreMoney.actualTotalCost;
 const total=base==null||cost.additionalMileage===null?null:Math.round((base+cost.adminCost+cost.additionalMileage)*100)/100;
 const revenue=row.performance?.coreMoney.invoicedRevenue;
 const profit=total==null||revenue==null?null:revenue-total;
 const money=(n:number|null|undefined)=>n==null?'Not calculated':`$${n.toFixed(2)}`;
 async function saveSettings(value:OverheadSettings){
  if(value.round_trip_km!==null&&(!Number.isFinite(value.round_trip_km)||value.round_trip_km<0)||!Number.isFinite(value.rate_per_km)||value.rate_per_km<0||!Number.isInteger(value.trip_adjustment))throw new Error('Enter valid distance, rate and whole-number trip adjustment.');
  const {error}=await client.from('job_overhead_settings').upsert({...value,org_id:orgId,job_id:row.jobId,destination_address:row.address??'',origin_address:WORK_ORIGIN,updated_at:new Date().toISOString()});if(error)throw error;setDraft(null);
 }
 return <div style={{display:'grid',gap:12}}>
  <table><tbody><tr><td>Recorded job costs (existing materials, labour and expenses)</td><td>{money(base)}</td></tr><tr><td>Admin time</td><td>{money(cost.adminCost)}</td></tr><tr><td>Recorded mileage (already included above)</td><td>{money(row.recordedMileage??0)}</td></tr><tr><td>Additional estimated travel</td><td>{money(cost.additionalMileage)}</td></tr><tr><th>Total including admin and estimated travel</th><th>{money(total)}</th></tr><tr><td>Profit after admin and estimated travel (invoiced revenue)</td><td>{money(profit)}</td></tr></tbody></table>
  <p>Existing job totals exclude these additional admin and estimated travel amounts. Use this panel’s combined total for the fuller job-cost view.</p>
  <p>Internal costing only. These entries do not add customer invoice lines. Enter only admin time not already recorded as job labour.</p>
  <form onSubmit={e=>{e.preventDefault();void run(async()=>{const n=Number(hours);if(!Number.isFinite(n)||n<=0||n>24||Math.abs(n*100-Math.round(n*100))>0.000001||!date)throw new Error('Enter a date and more than 0, up to 24 hours, with at most two decimals.');const {error}=await client.from('job_admin_entries').upsert({id:requestId.current,org_id:orgId,job_id:row.jobId,work_date:date,hours:n,hourly_cost:65,note});if(error)throw error;requestId.current=createId();setHours('');setNote('');});}} style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <label>Date<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Admin hours · $65/hour<input inputMode="decimal" required value={hours} onChange={e=>setHours(e.target.value)} placeholder="0.5"/></label><label>What was done?<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ordering, planning, invoicing…"/></label><button className="job-overheads-primary" disabled={busy}>Save admin time</button>
  </form>
  {query.data.admin.map(e=><div key={e.id}>{e.work_date} · {e.hours}h · {money(e.hours*e.hourly_cost)} · {e.note} <button disabled={busy} onClick={()=>void run(async()=>{const result=await client.from('job_admin_entries').update({deleted_at:new Date().toISOString()}).eq('org_id',orgId).eq('job_id',row.jobId).eq('id',e.id);if(result.error)throw result.error;})}>Remove</button></div>)}
  <h4 style={{margin:0}}>Travel estimate</h4><p>{WORK_ORIGIN} → {row.address||'Add a job address first'}</p>
  <p>{cost.days.length} distinct worked days · {cost.trips} estimated round trips. Multiple workers on the same date count once. Adjust for extra trips or days without travel.</p>
  {row.hasRecordedMileage&&<p>Recorded mileage is used instead of the automatic estimate to avoid counting it twice.</p>}
  {!cost.distanceCurrent&&query.data.settings&&<p>Job address changed. Recalculate or confirm the distance below.</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><label>Round-trip km<input type="number" min="0" step="0.01" value={settings.round_trip_km??''} onChange={e=>setDraft({...settings,round_trip_km:e.target.value===''?null:Number(e.target.value)})}/></label><label>Cost per km<input type="number" min="0" step="0.01" value={settings.rate_per_km} onChange={e=>setDraft({...settings,rate_per_km:Number(e.target.value)})}/></label><label>Extra / fewer trips<input type="number" step="1" value={settings.trip_adjustment} onChange={e=>setDraft({...settings,trip_adjustment:Number(e.target.value)})}/></label></div>
  <div><button disabled={busy||!row.address} onClick={()=>void run(async()=>{const {data,error}=await client.functions.invoke('job-driving-distance',{body:{jobId:row.jobId}});if(error||data?.error)throw new Error(data?.error||'Automatic routing is not configured or could not find this address. Enter a verified distance manually.');await saveSettings({...settings,round_trip_km:data.roundTripKm});})}>Calculate driving distance</button> <button disabled={busy||!row.address} onClick={()=>void run(()=>saveSettings(settings))}>Save travel settings</button></div>
  <p>Travel is an estimate, not a vehicle log. Current job totals are not an October 31 WIP valuation.</p>
  {error&&<p role="alert">{error}</p>}
 </div>;
}
