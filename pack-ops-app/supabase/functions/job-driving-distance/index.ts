import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const origin='4320 Hales Rd, Spallumcheen, BC V4Y 0N6, Canada';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const auth=await client.auth.getUser(token);if(auth.error||!auth.data.user)return json({error:'Sign in again.'},401);
  const actor=await client.from('users').select('org_id,role').eq('id',auth.data.user.id).is('deleted_at',null).single();
  if(actor.error||!['owner','office'].includes(actor.data?.role))return json({error:'Office access required.'},403);
  const {jobId}=await req.json();if(typeof jobId!=='string')return json({error:'Choose a job.'},400);
  const job=await client.from('jobs').select('address_line1,address_line2,city,region,postal_code').eq('id',jobId).eq('org_id',actor.data.org_id).single();
  if(job.error||!job.data)return json({error:'Job not available.'},404);
  if(!job.data.address_line1)return json({error:'Add a street address to the job first.'},400);
  const destination=[job.data.address_line1,job.data.address_line2,job.data.city,job.data.region,job.data.postal_code,'Canada'].filter(Boolean).join(', ');
  const key=Deno.env.get('GOOGLE_MAPS_ROUTES_API_KEY');
  if(!key)return json({error:'Automatic driving distance needs Google Maps Routes setup. You can enter a verified round-trip distance manually.'},503);
  async function distance(from:string,to:string){
   const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key!,'X-Goog-FieldMask':'routes.distanceMeters'},body:JSON.stringify({origin:{address:from},destination:{address:to},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'})});
   if(!response.ok)throw new Error('Driving route lookup failed. Check the address and routing service setup.');
   const result=await response.json();const meters=result.routes?.[0]?.distanceMeters;
   if(typeof meters!=='number'||!Number.isFinite(meters)||meters<0)throw new Error('No driving route was found. Enter a verified distance manually.');return meters;
  }
  const [outbound,returnTrip]=await Promise.all([distance(origin,destination),distance(destination,origin)]);
  return json({roundTripKm:Math.round((outbound+returnTrip)/10)/100,origin,destination});
 }catch(error){return json({error:error instanceof Error?error.message:'Unable to calculate driving distance.'},400);}
});
