import type { CreateJobTypeInput, JobType, UpdateJobTypeInput } from "@/domain/job-types/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface JobTypeRow {
  id: string;
  org_id: string;
  name: string;
  notes: string | null;
  default_assembly_id: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const jobTypesMapper: RepositoryMapper<
  JobTypeRow,
  JobType,
  CreateJobTypeInput,
  UpdateJobTypeInput,
  Partial<JobTypeRow>,
  Partial<JobTypeRow>
> = {
  toDomain(row) {
    return {
      id: row.id as JobType["id"],
      orgId: row.org_id as JobType["orgId"],
      name: row.name,
      notes: row.notes,
      defaultAssemblyId: row.default_assembly_id as JobType["defaultAssemblyId"],
      isActive: row.is_active,
      createdBy: row.created_by as JobType["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      name: input.name,
      notes: input.notes?.trim() || null,
      default_assembly_id: input.defaultAssemblyId ?? null,
      is_active: input.isActive ?? true,
    };
  },
  toPatch(input) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.defaultAssemblyId !== undefined ? { default_assembly_id: input.defaultAssemblyId } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  },
};
