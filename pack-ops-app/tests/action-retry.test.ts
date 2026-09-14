import {it,expect,vi,beforeEach} from 'vitest';
const {rows,queued,db}=vi.hoisted(()=>{const rows=new Map(),queued=new Map();const table=(store:Map<any,any>)=>({get:async(id:string)=>store.get(id),put:async(row:any)=>store.set(row.id,row),bulkPut:async(data:any[])=>data.forEach(row=>store.set(row.id,row)),filter:(fn:any)=>({toArray:async()=>[...store.values()].filter(fn)})});return {rows,queued,db:{actionItems:table(rows),syncQueue:table(queued),transaction:async(...args:any[])=>args.at(-1)()}};});
vi.mock('@/data/dexie/db',()=>({localDb:db}));
import {ActionItemsRepositoryImpl} from '@/data/repositories/action-items.repository.impl';
beforeEach(()=>{rows.clear();queued.clear();});
const input:any={requestId:'request',entityType:'jobs',entityId:'job',category:'follow_up',title:'Label panel',description:'Job part: Service',assignedTo:'user',dueAt:null};
function repo(server:any[]=[]){const q:any={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,in:()=>q,then:(fn:any)=>Promise.resolve({data:server,error:null}).then(fn)};return new ActionItemsRepositoryImpl({orgId:'org',actorUserId:'user'} as any,{from:()=>q} as any);}
it('retries a task using one local task and one queued write',async()=>{const r=repo();await r.create(input);await r.create(input);expect(rows.size).toBe(1);expect(queued.size).toBe(1);});
it('does not replace queued task text when a retry has changed details',async()=>{const r=repo();await r.create(input);await expect(r.create({...input,title:'Something else'})).rejects.toThrow('different details');expect(rows.get('request').title).toBe('Label panel');});
it('preserves an unsynced task when the server list does not contain it yet',async()=>{const r=repo();await r.create(input);const list=await r.list({filter:{entityId:'job'}});expect(list.map(x=>x.id)).toEqual(['request']);});
it('does not overlay another signed-in user’s queued task',async()=>{const r=repo();await r.create(input);for(const entry of queued.values())entry.actorUserId='another-user';expect(await r.list()).toEqual([]);});
