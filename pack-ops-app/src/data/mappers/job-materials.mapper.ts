import type { JobMaterialEntry } from "@/domain/jobs/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { Database } from "@/data/supabase/types";

type JobMaterialRow = TableRow<"job_materials">;
type JobMaterialInsert = Database["public"]["Tables"]["job_materials"]["Insert"];
type JobMaterialUpdate = Database["public"]["Tables"]["job_materials"]["Update"];

export const jobMaterialsMapper = {
  toDomain(row: JobMaterialRow): JobMaterialEntry {
    return {
      id: row.id as JobMaterialEntry["id"],
      orgId: row.org_id as JobMaterialEntry["orgId"],
      jobId: row.job_id as JobMaterialEntry["jobId"],
      catalogItemId: row.catalog_item_id as JobMaterialEntry["catalogItemId"],
      kind: row.kind as JobMaterialEntry["kind"],
      quantity: row.quantity,
      note: row.note,
      displayName: row.display_name,
      skuSnapshot: row.sku_snapshot,
      unitSnapshot: row.unit_snapshot,
      unitCost: row.unit_cost,
      unitSell: row.unit_sell,
      markupPercent: row.markup_percent,
      sectionName: row.section_name,
      sourceAssemblyId: row.source_assembly_id,
      sourceAssemblyName: row.source_assembly_name,
      sourceAssemblyMultiplier: row.source_assembly_multiplier,
      createdBy: row.created_by as JobMaterialEntry["createdBy"],
      updatedBy: row.updated_by as JobMaterialEntry["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },

  toInsert(input: {
    orgId: string;
    jobId: string;
    catalogItemId: string;
    kind: JobMaterialEntry["kind"];
    quantity: number;
    note: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
    sourceAssemblyId?: string | null;
    sourceAssemblyName?: string | null;
    sourceAssemblyMultiplier?: number | null;
    actorUserId: string | null;
  }): JobMaterialInsert {
    return {
      org_id: input.orgId,
      job_id: input.jobId,
      catalog_item_id: input.catalogItemId,
      kind: input.kind,
      quantity: input.quantity,
      note: input.note,
      display_name: input.displayName ?? null,
      sku_snapshot: input.skuSnapshot ?? null,
      unit_snapshot: input.unitSnapshot ?? null,
      unit_cost: input.unitCost ?? null,
      unit_sell: input.unitSell ?? null,
      markup_percent: input.markupPercent ?? null,
      section_name: input.sectionName ?? null,
      source_assembly_id: input.sourceAssemblyId ?? null,
      source_assembly_name: input.sourceAssemblyName ?? null,
      source_assembly_multiplier: input.sourceAssemblyMultiplier ?? null,
      created_by: input.actorUserId,
      updated_by: input.actorUserId,
    };
  },

  toPatch(input: {
    catalogItemId?: string;
    quantity?: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
    sourceAssemblyId?: string | null;
    sourceAssemblyName?: string | null;
    sourceAssemblyMultiplier?: number | null;
    deletedAt?: string | null;
    actorUserId: string | null;
  }): JobMaterialUpdate {
    return {
      ...(input.catalogItemId !== undefined ? { catalog_item_id: input.catalogItemId } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
      ...(input.skuSnapshot !== undefined ? { sku_snapshot: input.skuSnapshot } : {}),
      ...(input.unitSnapshot !== undefined ? { unit_snapshot: input.unitSnapshot } : {}),
      ...(input.unitCost !== undefined ? { unit_cost: input.unitCost } : {}),
      ...(input.unitSell !== undefined ? { unit_sell: input.unitSell } : {}),
      ...(input.markupPercent !== undefined ? { markup_percent: input.markupPercent } : {}),
      ...(input.sectionName !== undefined ? { section_name: input.sectionName } : {}),
      ...(input.sourceAssemblyId !== undefined ? { source_assembly_id: input.sourceAssemblyId } : {}),
      ...(input.sourceAssemblyName !== undefined ? { source_assembly_name: input.sourceAssemblyName } : {}),
      ...(input.sourceAssemblyMultiplier !== undefined ? { source_assembly_multiplier: input.sourceAssemblyMultiplier } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
      updated_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    };
  },
};
