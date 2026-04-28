import type {
  Assembly,
  AssemblyItem,
  CreateAssemblyInput,
  UpdateAssemblyInput,
} from "@/domain/materials/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface AssemblyRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  default_labor_hours: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssemblyItemRow {
  id: string;
  org_id: string;
  assembly_id: string;
  catalog_item_id: string;
  quantity: number;
  note: string | null;
  section_name: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export const assembliesMapper: RepositoryMapper<
  AssemblyRow,
  Assembly,
  CreateAssemblyInput,
  UpdateAssemblyInput,
  Partial<AssemblyRow>,
  Partial<AssemblyRow>
> = {
  toDomain(row) {
    return {
      id: row.id as Assembly["id"],
      orgId: row.org_id as Assembly["orgId"],
      name: row.name,
      description: row.description,
      defaultLaborHours: row.default_labor_hours,
      isActive: row.is_active,
      createdBy: row.created_by as Assembly["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      name: input.name,
      description: input.description?.trim() || null,
      default_labor_hours: normalizeNumber(input.defaultLaborHours),
      is_active: input.isActive ?? true,
    };
  },
  toPatch(input) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.defaultLaborHours !== undefined
        ? { default_labor_hours: normalizeNumber(input.defaultLaborHours) }
        : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  },
};

export const assemblyItemsMapper: RepositoryMapper<
  AssemblyItemRow,
  AssemblyItem,
  never,
  never,
  Partial<AssemblyItemRow>,
  Partial<AssemblyItemRow>
> = {
  toDomain(row) {
    return {
      id: row.id as AssemblyItem["id"],
      orgId: row.org_id as AssemblyItem["orgId"],
      assemblyId: row.assembly_id as AssemblyItem["assemblyId"],
      catalogItemId: row.catalog_item_id as AssemblyItem["catalogItemId"],
      quantity: row.quantity,
      note: row.note,
      sectionName: row.section_name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: null,
    };
  },
  toInsert() {
    return {};
  },
  toPatch() {
    return {};
  },
};
