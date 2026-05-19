import type { JobManualActualCostLine } from "@/domain/jobs/types";

export interface JobManualActualCostLineRow {
  id: string;
  org_id: string;
  job_id: string;
  category: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  note: string | null;
  section_name: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function roundMoney(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

export const jobManualActualCostLinesMapper = {
  toDomain(row: JobManualActualCostLineRow): JobManualActualCostLine {
    return {
      id: row.id as JobManualActualCostLine["id"],
      orgId: row.org_id as JobManualActualCostLine["orgId"],
      jobId: row.job_id as JobManualActualCostLine["jobId"],
      category: row.category as JobManualActualCostLine["category"],
      description: row.description,
      quantity: row.quantity,
      unitCost: row.unit_cost,
      totalCost: row.total_cost,
      note: row.note,
      sectionName: row.section_name,
      createdBy: row.created_by as JobManualActualCostLine["createdBy"],
      updatedBy: row.updated_by as JobManualActualCostLine["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },

  toInsert(input: {
    orgId: string;
    jobId: string;
    category: JobManualActualCostLine["category"];
    description: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    note?: string | null;
    sectionName?: string | null;
    actorUserId: string | null;
  }) {
    return {
      org_id: input.orgId,
      job_id: input.jobId,
      category: input.category,
      description: input.description.trim(),
      quantity: roundQuantity(input.quantity),
      unit_cost: roundMoney(input.unitCost),
      total_cost: roundMoney(input.totalCost),
      note: input.note?.trim() || null,
      section_name: input.sectionName?.trim() || null,
      created_by: input.actorUserId,
      updated_by: input.actorUserId,
    };
  },

  toPatch(input: {
    category?: JobManualActualCostLine["category"];
    description?: string;
    quantity?: number;
    unitCost?: number;
    totalCost?: number;
    note?: string | null;
    sectionName?: string | null;
    actorUserId: string | null;
  }) {
    return {
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.quantity !== undefined ? { quantity: roundQuantity(input.quantity) } : {}),
      ...(input.unitCost !== undefined ? { unit_cost: roundMoney(input.unitCost) } : {}),
      ...(input.totalCost !== undefined ? { total_cost: roundMoney(input.totalCost) } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      ...(input.sectionName !== undefined ? { section_name: input.sectionName?.trim() || null } : {}),
      updated_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    };
  },
};
