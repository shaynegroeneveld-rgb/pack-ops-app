import { expect, it, vi } from 'vitest';
vi.mock('@/data/mappers/catalog-items.mapper',()=>({catalogItemsMapper:{toDomain:(row:unknown)=>row}}));
import { CatalogItemsRepositoryImpl } from '@/data/repositories/catalog-items.repository.impl';
function setup(pages: any[]) {
 const query:any={}; for(const method of ['select','eq','is','order'])query[method]=vi.fn(()=>query);
 query.range=vi.fn();pages.forEach(page=>query.range.mockResolvedValueOnce(page));
 const repo=new CatalogItemsRepositoryImpl({orgId:'my-org'} as any,{from:vi.fn(()=>query)} as any);
 return {repo,query};
}
it('loads all pages including the material after the first response limit',async()=>{
 const first=Array.from({length:500},(_,i)=>({id:String(i)}));const {repo,query}=setup([{data:first,error:null,count:501},{data:[{id:'last'}],error:null,count:null}]);
 const rows=await repo.list();expect(rows).toHaveLength(501);expect(rows[500]).toEqual({id:'last'});expect(query.range.mock.calls).toEqual([[0,499],[500,999]]);expect(query.eq).toHaveBeenCalledWith('org_id','my-org');expect(query.eq).toHaveBeenCalledWith('is_active',true);
});
it('keeps paginating when the server caps responses below the requested page size',async()=>{const {repo,query}=setup([{data:[{id:'a'}],error:null,count:2},{data:[{id:'b'}],error:null,count:null}]);expect(await repo.list({filter:{includeInactive:true}})).toHaveLength(2);expect(query.range).toHaveBeenLastCalledWith(1,500);expect(query.eq).not.toHaveBeenCalledWith('is_active',true);});
it('does not silently return a partial searchable catalog after a later page fails',async()=>{const failure=new Error('offline');const {repo}=setup([{data:[{id:'a'}],error:null,count:2},{data:null,error:failure,count:null}]);await expect(repo.list()).rejects.toThrow('offline');});
