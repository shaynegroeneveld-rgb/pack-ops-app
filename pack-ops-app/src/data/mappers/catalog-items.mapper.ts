import type { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "@/domain/materials/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface CatalogItemRow {
  id: string;
  org_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  unit_price: number | null;
  cost_price: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function normalizeMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export const catalogItemsMapper: RepositoryMapper<
  CatalogItemRow,
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  Partial<CatalogItemRow>,
  Partial<CatalogItemRow>
> = {
  toDomain(row) {
    return {
      id: row.id as CatalogItem["id"],
      orgId: row.org_id as CatalogItem["orgId"],
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      costPrice: row.cost_price,
      unitPrice: row.unit_price,
      category: row.category,
      notes: row.notes ?? row.description,
      isActive: row.is_active,
      createdBy: row.created_by as CatalogItem["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit?.trim() || "each",
      cost_price: normalizeMoney(input.costPrice),
      unit_price: normalizeMoney(input.unitPrice),
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      description: null,
      is_active: input.isActive ?? true,
    };
  },
  toPatch(input) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || "each" } : {}),
      ...(input.costPrice !== undefined ? { cost_price: normalizeMoney(input.costPrice) } : {}),
      ...(input.unitPrice !== undefined ? { unit_price: normalizeMoney(input.unitPrice) } : {}),
      ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
      ...(input.notes !== undefined
        ? {
            notes: input.notes?.trim() || null,
            description: null,
          }
        : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  },
};
