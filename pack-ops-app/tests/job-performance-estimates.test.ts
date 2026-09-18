import {expect,it,vi} from 'vitest';
import {computeJobPerformanceSummary} from '@/services/jobs/job-performance';
const base:any={job:{estimatedHours:null,estimateSnapshot:null,status:'scheduled'},linkedQuote:{subtotal:1000,total:1050,laborCostRate:65,estimatedHours:2.5,estimatedLaborCost:175},estimatedMaterialLines:[],catalogItems:[],jobMaterials:[],manualActualCostLines:[],timeEntries:[],canViewFinancials:true};
it('shows labour-only quote cost even without a job hour snapshot or materials',()=>{
 const result=computeJobPerformanceSummary(base)!;
 expect(result.estimateAccuracy.estimatedTotalCost).toBe(175);
 expect(result.estimateAccuracy.estimatedHours).toBe(2.5);
});
it('shows material-only quote cost and honours quoted costs rather than selling prices',()=>{
 const result=computeJobPerformanceSummary({...base,linkedQuote:{...base.linkedQuote,estimatedHours:0,estimatedLaborCost:0},estimatedMaterialLines:[{description:'Box',quantity:4,unit:'each',unitCost:3,unitSell:5}]})!;
 expect(result.estimateAccuracy.estimatedTotalCost).toBe(12);
});
it('leaves an unquoted job without estimates unknown',()=>{
 expect(computeJobPerformanceSummary({...base,linkedQuote:null})!.estimateAccuracy.estimatedTotalCost).toBeNull();
});
vi.mock('@/data/mappers/quote-line-items.mapper',()=>({quoteLineItemsMapper:{toDomain:(row:unknown)=>row}}));
import {QuoteLineItemsRepositoryImpl} from '@/data/repositories/quote-line-items.repository.impl';
it('loads all quote lines when the response is capped, keeping late material and labour lines',async()=>{
 const query:any={};for(const method of ['select','eq','in','order'])query[method]=vi.fn(()=>query);
 query.range=vi.fn().mockResolvedValueOnce({data:[{id:'first'}],count:2,error:null}).mockResolvedValueOnce({data:[{id:'last'}],error:null});
 const repo=new QuoteLineItemsRepositoryImpl({orgId:'org'} as any,{from:()=>query} as any);
 expect(await repo.listByQuoteIds(['quote'])).toEqual([{id:'first'},{id:'last'}]);
 expect(query.range.mock.calls).toEqual([[0,499],[1,500]]);
});
