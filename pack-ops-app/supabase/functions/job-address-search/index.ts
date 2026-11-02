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
  if(actor.error||!actor.data?.org_id)return json({error:'Office access required.'},403);
  const body=await req.json();
  if(typeof body.sessionToken!=='string'||!/^[0-9a-f-]{36}$/i.test(body.sessionToken))return json({error:'Invalid address session.'},400);
  const key=Deno.env.get('GOOGLE_MAPS_PLACES_API_KEY');
  if(!key)return json({error:'Address suggestions are not configured. You can enter the address manually.'},503);
  const headers={'Content-Type':'application/json','X-Goog-Api-Key':key};
  if(body.action==='details'){
   if(typeof body.placeId!=='string'||! /^[A-Za-z0-9_-]{1,255}$/.test(body.placeId))return json({error:'Choose an address again.'},400);
   const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(body.placeId)}?sessionToken=${encodeURIComponent(body.sessionToken)}`,{headers:{...headers,'X-Goog-FieldMask':'formattedAddress,addressComponents'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)return json({error:'Unable to confirm this address. Try again or enter it manually.'},502);
   const place=await response.json();
   if(!place.formattedAddress)return json({error:'No address found.'},404);
   return json({address:place.formattedAddress});
  }
  if(body.action!=='suggest'||typeof body.input!=='string'||body.input.trim().length<3||body.input.length>200)return json({error:'Enter a street address.'},400);
  const response=await fetch('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({input:body.input.trim(),sessionToken:body.sessionToken,includedRegionCodes:['ca'],languageCode:'en',locationBias:{circle:{center:{latitude:50.45,longitude:-119.2},radius:50000}}})});
  if(!response.ok)return json({error:'Address suggestions are unavailable. You can enter the address manually.'},502);
  const result=await response.json();
  return json({suggestions:(result.suggestions??[]).filter((s:any)=>s.placePrediction?.placeId).map((s:any)=>({id:s.placePrediction.placeId,label:s.placePrediction.text.text}))});
 }catch{return json({error:'Address lookup unavailable. You can still enter an address manually.'},502);}
});
