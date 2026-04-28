import type { SupabaseClient } from "@supabase/supabase-js";

import { jobMaterialsMapper } from "@/data/mappers/job-materials.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateJobMaterialInput,
  JobMaterialFilter,
  JobMaterialsRepository,
  UpdateJobMaterialInput,
} from "@/data/repositories/job-materials.repo";
import type { Database } from "@/data/supabase/types";
import type { JobMaterialEntry } from "@/domain/jobs/types";
import { createId } from "@/lib/create-id";

export class JobMaterialsRepositoryImpl implements JobMaterialsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: JobMaterialFilter }): Promise<JobMaterialEntry[]> {
    let query = this.client
      .from("job_materials")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (options?.filter?.jobId) {
      query = query.eq("job_id", options.filter.jobId);
    }

    if (options?.filter?.kind) {
      query = query.eq("kind", options.filter.kind);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => jobMaterialsMapper.toDomain(row));
  }

  async create(input: CreateJobMaterialInput): Promise<JobMaterialEntry> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("job_materials")
      .insert({
        id: createId(),
        ...jobMaterialsMapper.toInsert({
          orgId: this.context.orgId,
          jobId: input.jobId,
          catalogItemId: input.catalogItemId,
          kind: input.kind,
          quantity: input.quantity,
          note: input.note?.trim() || null,
          displayName: input.displayName ?? null,
          skuSnapshot: input.skuSnapshot ?? null,
          unitSnapshot: input.unitSnapshot ?? null,
          unitCost: input.unitCost ?? null,
          unitSell: input.unitSell ?? null,
          markupPercent: input.markupPercent ?? null,
          sectionName: input.sectionName ?? null,
          sourceAssemblyId: input.sourceAssemblyId ?? null,
          sourceAssemblyName: input.sourceAssemblyName ?? null,
          sourceAssemblyMultiplier: input.sourceAssemblyMultiplier ?? null,
          actorUserId: this.context.actorUserId,
        }),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return jobMaterialsMapper.toDomain(data);
  }

  async update(id: string, input: UpdateJobMaterialInput): Promise<JobMaterialEntry> {
    const patchInput = {
      ...(input.catalogItemId !== undefined ? { catalogItemId: input.catalogItemId } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName?.trim() || null } : {}),
      ...(input.skuSnapshot !== undefined ? { skuSnapshot: input.skuSnapshot?.trim() || null } : {}),
      ...(input.unitSnapshot !== undefined ? { unitSnapshot: input.unitSnapshot?.trim() || null } : {}),
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      ...(input.unitSell !== undefined ? { unitSell: input.unitSell } : {}),
      ...(input.markupPercent !== undefined ? { markupPercent: input.markupPercent } : {}),
      ...(input.sectionName !== undefined ? { sectionName: input.sectionName?.trim() || null } : {}),
      ...(input.sourceAssemblyId !== undefined ? { sourceAssemblyId: input.sourceAssemblyId } : {}),
      ...(input.sourceAssemblyName !== undefined ? { sourceAssemblyName: input.sourceAssemblyName?.trim() || null } : {}),
      ...(input.sourceAssemblyMultiplier !== undefined ? { sourceAssemblyMultiplier: input.sourceAssemblyMultiplier } : {}),
      actorUserId: this.context.actorUserId,
    };

    const { data, error } = await this.client
      .from("job_materials")
      .update(jobMaterialsMapper.toPatch(patchInput))
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return jobMaterialsMapper.toDomain(data);
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_job_material", {
      p_job_material_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
