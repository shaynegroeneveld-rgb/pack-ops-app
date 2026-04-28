import type { QuoteLineItem, QuoteLineItemInput } from "@/domain/quotes/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface QuoteLineItemRow {
  id: string;
  org_id: string;
  quote_id: string;
  catalog_item_id: string | null;
  description: string;
  unit: string;
  unit_price: number;
  quantity: number;
  discount_percent: number;
  subtotal: number;
  sort_order: number;
  source_type: string;
  line_kind: string;
  sku: string | null;
  note: string | null;
  section_name: string | null;
  unit_cost: number;
  unit_sell: number;
  line_total_cost: number;
  line_total_sell: number;
  created_at: string;
  updated_at: string;
}

function roundMoney(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 1;
  }
  return Math.round(value * 1000) / 1000;
}

export const quoteLineItemsMapper: RepositoryMapper<
  QuoteLineItemRow,
  QuoteLineItem,
  QuoteLineItemInput,
  QuoteLineItemInput,
  Partial<QuoteLineItemRow>,
  Partial<QuoteLineItemRow>
> = {
  toDomain(row) {
    return {
      id: row.id as QuoteLineItem["id"],
      orgId: row.org_id as QuoteLineItem["orgId"],
      quoteId: row.quote_id as QuoteLineItem["quoteId"],
      catalogItemId: row.catalog_item_id,
      sortOrder: row.sort_order,
      description: row.description,
      sku: row.sku,
      note: row.note,
      sectionName: row.section_name,
      sourceType: row.source_type as QuoteLineItem["sourceType"],
      lineKind: row.line_kind as QuoteLineItem["lineKind"],
      quantity: row.quantity,
      unit: row.unit,
      unitCost: row.unit_cost,
      unitSell: row.unit_sell,
      lineTotalCost: row.line_total_cost,
      lineTotalSell: row.line_total_sell,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: null,
    };
  },
  toInsert(input) {
    const quantity = roundQuantity(input.quantity);
    const unitCost = roundMoney(input.unitCost);
    const unitSell = roundMoney(input.unitSell);
    return {
      catalog_item_id: input.catalogItemId ?? null,
      description: input.description.trim(),
      unit: input.unit?.trim() || "each",
      quantity,
      sort_order: input.sortOrder ?? 0,
      source_type: input.sourceType,
      line_kind: input.lineKind ?? "item",
      sku: input.sku ?? null,
      note: input.note?.trim() || null,
      section_name: input.sectionName?.trim() || null,
      unit_cost: unitCost,
      unit_sell: unitSell,
      line_total_cost: roundMoney(unitCost * quantity),
      line_total_sell: roundMoney(unitSell * quantity),
      unit_price: unitSell,
      subtotal: roundMoney(unitSell * quantity),
      discount_percent: 0,
    };
  },
  toPatch(input) {
    const quantity = roundQuantity(input.quantity);
    const unitCost = roundMoney(input.unitCost);
    const unitSell = roundMoney(input.unitSell);
    return {
      ...(input.catalogItemId !== undefined ? { catalog_item_id: input.catalogItemId ?? null } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || "each" } : {}),
      ...(input.quantity !== undefined ? { quantity } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.sourceType !== undefined ? { source_type: input.sourceType } : {}),
      ...(input.lineKind !== undefined ? { line_kind: input.lineKind } : {}),
      ...(input.sku !== undefined ? { sku: input.sku ?? null } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      ...(input.sectionName !== undefined ? { section_name: input.sectionName?.trim() || null } : {}),
      ...(input.unitCost !== undefined ? { unit_cost: unitCost } : {}),
      ...(input.unitSell !== undefined ? { unit_sell: unitSell } : {}),
      ...(input.quantity !== undefined || input.unitCost !== undefined
        ? { line_total_cost: roundMoney(unitCost * quantity) }
        : {}),
      ...(input.quantity !== undefined || input.unitSell !== undefined
        ? {
            line_total_sell: roundMoney(unitSell * quantity),
            unit_price: unitSell,
            subtotal: roundMoney(unitSell * quantity),
          }
        : {}),
    };
  },
};
