import {render, screen} from '@testing-library/react';
import {expect, it} from 'vitest';
import {JobQuotePlan} from '@/features/workbench/components/JobQuotePlan';
it('shows quoted materials and fractional labour grouped by part, without treating them as actuals', () => {
 render(<JobQuotePlan hours={2.5} materials={[{catalogItemId:null,sku:null,description:'Custom supplied material',unit:'each',quantity:3,sectionName:'Garage',note:null,unitCost:10,unitSell:12,markupPercent:20}]} labour={[{description:'Installation',quantity:2.5,unit:'hr',sectionName:'Garage'}]} />);
 expect(screen.getByRole('region', {name:'Planned materials and labour'})).toBeTruthy();
 expect(screen.getByText('3 each — Custom supplied material')).toBeTruthy();
 expect(screen.getByText('2.5 hr — Installation')).toBeTruthy();
 expect(screen.getByText('Garage')).toBeTruthy();
 expect(screen.getByText(/Record materials used and hours worked separately/)).toBeTruthy();
});
it('does not show an empty plan on jobs without an estimate',()=>{
 const {container}=render(<JobQuotePlan hours={0} materials={[]} labour={[]} />);
 expect(container.textContent).toBe('');
});
