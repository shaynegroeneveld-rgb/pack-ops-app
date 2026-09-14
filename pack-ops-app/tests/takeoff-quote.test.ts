import { expect, it } from 'vitest';
import { buildQuoteLineItems, readTakeoffLabourLines, parseTakeoffQuantity } from '../src/features/takeoff/quote-calculations';
it('uses full-precision labour instead of adding rounded display amounts', () => {
  const iframe = document.createElement('iframe'); document.body.appendChild(iframe);
  iframe.contentDocument!.body.innerHTML = '<div class="takeoff compact"><div><span>Finish: fixture</span><strong data-quantity="0.333333333333">0.33 hr</strong></div><div><span>Total labour</span><strong>0.33 hr</strong></div></div>';
  const lines = readTakeoffLabourLines(iframe);
  expect(lines).toHaveLength(1); expect(lines[0]!.hours).toBeCloseTo(1/3, 10); iframe.remove();
});
it('builds material cost and markup separately from labour rates with consecutive ordering', () => {
  const lines = buildQuoteLineItems({ materialLines: [{section:'Wire',item:'2c14 wire (m)',quantity:10,match:{ id:'c', name:'Wire', sku:'SKU', costPrice:2, unit:'m' } as any,matchScore:1,lineCost:20,source:'takeoff'}],labourLines:[{phase:'Panel',item:'panel',hours:2},{phase:'Rough-in',item:'boxes',hours:1},{phase:'Finish',item:'devices',hours:0.5}],materialMarkup:30,laborCostRate:40,laborSellRate:95 });
  expect(lines.map((line)=>line.sortOrder)).toEqual([0,1,2,3]);
  expect(lines[0]).toMatchObject({quantity:10,unit:'m',unitCost:2,unitSell:2.6});
  expect(lines[1]).toMatchObject({quantity:2,unit:'hr',unitCost:40,unitSell:95,sectionName:'Service'});
});
it('parses thousands without treating them as decimal prices', () => expect(parseTakeoffQuantity('1,250.5 m')).toBe(1250.5));
