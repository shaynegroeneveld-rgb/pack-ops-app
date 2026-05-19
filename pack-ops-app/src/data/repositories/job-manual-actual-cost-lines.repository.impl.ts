import type { SupabaseClient } from "@supabase/supabase-js";

import { jobManualActualCostLinesMapper, type JobManualActualCostLineRow } from "@/data/mappers/job-manual-actual-cost-lines.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateJobManualActualCostLineInput,
  JobManualActualCostLineFilter,
  JobManualActualCostLinesRepository,
  UpdateJobManualActualCostLineInput,
} from "@/data/repositories/job-manual-actual-cost-lines.repo";
import { createId } from "@/lib/create-id";

export class JobManualActualCostLinesRepositoryImpl implements JobManualActualCostLinesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient,
  ) {}

  async list(options?: { filter?: JobManualActualCostLineFilter }) {
    let query = (this.client as SupabaseClient<any>)
      .from("job_manual_actual_cost_lines")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (options?.filter?.jobId) {
      query = query.eq("job_id", options.filter.jobId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return ((data ?? []) as JobManualActualCostLineRow[]).map(jobManualActualCostLinesMapper.toDomain);
  }

  async create(input: CreateJobManualActualCostLineInput) {
    const now = new Date().toISOString();
    const { data, error } = await (this.client as SupabaseClient<any>)
      .from("job_manual_actual_cost_lines")
      .insert({
        id: createId(),
        ...jobManualActualCostLinesMapper.toInsert({
          orgId: this.context.orgId,
          jobId: input.jobId,
          category: input.category,
          description: input.description,
          quantity: input.quantity,
          unitCost: input.unitCost,
          totalCost: input.totalCost,
          note: input.note ?? null,
          sectionName: input.sectionName ?? null,
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

    return jobManualActualCostLinesMapper.toDomain(data as JobManualActualCostLineRow);
  }

  async update(id: string, input: UpdateJobManualActualCostLineInput) {
    const { data, error } = await (this.client as SupabaseClient<any>)
      .from("job_manual_actual_cost_lines")
      .update(
        jobManualActualCostLinesMapper.toPatch({
          ...input,
          actorUserId: this.context.actorUserId,
        }),
      )
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return jobManualActualCostLinesMapper.toDomain(data as JobManualActualCostLineRow);
  }

  async softDelete(id: string) {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<any>).rpc("fn_soft_delete_job_manual_actual_cost_line", {
      p_job_manual_actual_cost_line_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
