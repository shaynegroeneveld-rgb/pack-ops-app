import { localDb } from '@/data/dexie/db';
import { createSyncQueueEntry } from '@/data/dexie/outbox';
import { jobMaterialsMapper } from '@/data/mappers/job-materials.mapper';
import type { RepositoryContext } from '@/data/repositories/contracts';
import type { AssemblyView, CatalogItem } from '@/domain/materials/types';
import type { JobMaterialEntry } from '@/domain/jobs/types';
import { createId } from '@/lib/create-id';

export interface AssemblyCounterState {
  count: number;
  history: number[];
  recipe?: AssemblyCounterState["lines"];
  lines: Array<{row: JobMaterialEntry; each: number}>;
}
export const counterKey = (scope: string, job: string, part: string, assembly: string) =>
  JSON.stringify(['assembly-counter-v1', scope, job, part, assembly]);
export async function readAssemblyCounter(key: string): Promise<AssemblyCounterState> {
  return (await localDb.offlineSnapshots.get(key))?.value as AssemblyCounterState ?? {count:0,history:[],lines:[]};
}
export async function changeAssemblyCounter(input: {
  context: RepositoryContext; jobId: string; part: string; assembly: AssemblyView;
  catalog: CatalogItem[]; materialOnly?: boolean; action: 'add' | 'undo' | number;
}): Promise<AssemblyCounterState> {
  const {context, jobId, part, assembly, catalog, action} = input;
  const key = counterKey(`${context.orgId}:${context.actorUserId}`,jobId,part,assembly.id);
  return localDb.transaction('rw',localDb.jobMaterials,localDb.syncQueue,localDb.offlineSnapshots,async()=>{
    const current = await readAssemblyCounter(key);
    const count = action === 'add' ? current.count+1 : action === 'undo' ? current.history.at(-1) ?? current.count : action;
    if (!Number.isFinite(count) || count < 0 || count >= 1000000 || Math.abs(count*100-Math.round(count*100))>0.000001) throw new Error('Enter zero or a positive amount with up to two decimals.');
    if (count === current.count) return current;
    // Never overwrite individual corrections made outside this counter.
    for (const {row} of current.lines) {
      const saved = await localDb.jobMaterials.get(row.id);
      if (!saved || saved.deletedAt || saved.quantity !== row.quantity || saved.sectionName !== row.sectionName || saved.unitCost !== row.unitCost || saved.catalogItemId !== row.catalogItemId)
        throw new Error('These materials were edited outside the counter. Review Saved entries before changing this count.');
    }
    const now = new Date().toISOString();
    let lines = current.lines;
    if (!lines.length && current.recipe?.length && count > 0) {
      lines = current.recipe.map(line => ({...line, row: {...line.row, id: createId(), createdAt: now, deletedAt: null}}));
    }
    if (!lines.length && count > 0) {
      if (!assembly.items.length) throw new Error('This assembly has no materials. Add its materials in the office first.');
      lines = assembly.items.map(item=>{
        const material = catalog.find(m=>m.id===item.catalogItemId && m.isActive);
        if (!material || !Number.isFinite(item.quantity) || item.quantity<=0) throw new Error('This assembly has missing, inactive or invalid materials. Update its recipe first.');
        const payload = {...jobMaterialsMapper.toInsert({orgId:context.orgId,jobId,catalogItemId:material.id,kind:'used',quantity:item.quantity,
          note:input.materialOnly?'Field material counter':'Field assembly counter',displayName:material.name,skuSnapshot:material.sku,unitSnapshot:material.unit,
          unitCost:material.costPrice,unitSell:material.unitPrice,sectionName:part==='General'?null:part,
          sourceAssemblyId:input.materialOnly?null:assembly.id,sourceAssemblyName:input.materialOnly?null:assembly.name,sourceAssemblyMultiplier:input.materialOnly?null:count,actorUserId:context.actorUserId}),
          id:createId(),created_at:now,updated_at:now,deleted_at:null};
        return {each:item.quantity,row:jobMaterialsMapper.toDomain(payload as Parameters<typeof jobMaterialsMapper.toDomain>[0])};
      });
    }
    const nextLines: AssemblyCounterState['lines'] = [];
    for (const line of lines) {
      const quantity = Math.round(line.each*count*1000)/1000;
      if (count>0 && (quantity<=0 || !Number.isFinite(quantity))) throw new Error('That amount is too small for this assembly.');
      const row = {...line.row,quantity:count===0?line.row.quantity:quantity,sourceAssemblyMultiplier:input.materialOnly?null:count,updatedAt:now,deletedAt:count===0?now:null};
      const payload = {...jobMaterialsMapper.toInsert({orgId:context.orgId,jobId,catalogItemId:row.catalogItemId,kind:'used',quantity:row.quantity,
        note:row.note,displayName:row.displayName,skuSnapshot:row.skuSnapshot,unitSnapshot:row.unitSnapshot,unitCost:row.unitCost,unitSell:row.unitSell,
        sectionName:row.sectionName,sourceAssemblyId:row.sourceAssemblyId,sourceAssemblyName:row.sourceAssemblyName,sourceAssemblyMultiplier:row.sourceAssemblyMultiplier,actorUserId:context.actorUserId}),
        id:row.id,created_at:row.createdAt,updated_at:now,deleted_at:row.deletedAt};
      await localDb.jobMaterials.put(row);
      await localDb.syncQueue.put(createSyncQueueEntry({orgId:context.orgId as JobMaterialEntry['orgId'],actorUserId:context.actorUserId,
        entityType:'job_materials',entityId:row.id,operation:count===0?'soft_delete':'upsert',clientUpdatedAt:now,payload}));
      if(count>0) nextLines.push({...line,row});
    }
    const next = {count,history:action==='undo'?current.history.slice(0,-1):[...current.history,current.count].slice(-50),lines:nextLines,recipe:lines};
    await localDb.offlineSnapshots.put({key,value:next,savedAt:now});
    return next;
  });
}
