import type { SupabaseClient } from "@supabase/supabase-js";

import { jobTypesMapper } from "@/data/mappers/job-types.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { JobTypeFilter, JobTypesRepository } from "@/data/repositories/job-types.repo";
import type { Database } from "@/data/supabase/types";
import type { CreateJobTypeInput, JobType, UpdateJobTypeInput } from "@/domain/job-types/types";

export class JobTypesRepositoryImpl implements JobTypesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: JobTypeFilter }): Promise<JobType[]> {
    let query = this.client
      .from("job_types")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (!options?.filter?.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => jobTypesMapper.toDomain(row));
  }

  async getById(id: string): Promise<JobType | null> {
    const { data, error } = await this.client
      .from("job_types")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? jobTypesMapper.toDomain(data) : null;
  }

  async create(input: CreateJobTypeInput): Promise<JobType> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["job_types"]["Insert"] = {
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
      name: input.name,
      notes: input.notes?.trim() || null,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await this.client
      .from("job_types")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return jobTypesMapper.toDomain(data);
  }

  async update(id: string, input: UpdateJobTypeInput): Promise<JobType> {
    const { data, error } = await this.client
      .from("job_types")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...jobTypesMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return jobTypesMapper.toDomain(data);
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_job_type", {
      p_job_type_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
