import { expect, it } from 'vitest';
import { buildInvoicePreviewFromActuals, buildInvoicePreviewFromDraft, createEditableInvoiceDraftLines } from '@/services/invoices/invoice-generation-service';

const base: any = {
  materials: [],
  labor: [
    { id: '1', hours: 1.5, sectionName: 'Garage' },
    { id: '2', hours: 2, sectionName: 'Garage' },
    { id: '3', hours: 4, sectionName: 'Kitchen' },
    { id: '4', hours: 1, sectionName: null },
    { id: '5', hours: 0.5, sectionName: 'General' },
  ],
  manualActuals: [{ id: 'manual', category: 'labor', description: 'Extra labour', quantity: 1, unitCost: 100, totalCost: 100, sectionName: 'Garage' }],
};
const controls = { laborSellRate: 100, materialMarkupPercent: 0, taxRate: 0.05 };

it('keeps labour totals under each job part, including manual labour and unassigned hours', () => {
  const preview = buildInvoicePreviewFromActuals(base, controls);
  expect(preview.lines.map(l => [l.sectionName, l.quantity, l.subtotal])).toEqual([
    ['Garage', 4.5, 450], ['Kitchen', 4, 400], [null, 1.5, 150],
  ]);
  expect(new Set(preview.lines.map(l => l.id)).size).toBe(3);
  expect(preview.subtotal).toBe(1000);
  expect(preview.total).toBe(1050);
  const draft = buildInvoicePreviewFromDraft(preview, createEditableInvoiceDraftLines(preview))!;
  expect(draft.lines.map(l => l.sectionName)).toEqual(['Garage', 'Kitchen', null]);
  expect(draft.total).toBe(1050);
});

it('invoices only the chosen job part', () => {
  const preview = buildInvoicePreviewFromActuals(base, { ...controls, invoicePartName: 'Kitchen' });
  expect(preview.lines).toHaveLength(1);
  expect(preview.lines[0]).toMatchObject({ sectionName: 'Kitchen', quantity: 4, subtotal: 400 });
});

it('keeps unassigned labour together when General is selected', () => {
  const preview = buildInvoicePreviewFromActuals(base, { ...controls, invoicePartName: 'General' });
  expect(preview.lines).toHaveLength(1);
  expect(preview.lines[0]).toMatchObject({ sectionName: null, quantity: 1.5, subtotal: 150 });
});
