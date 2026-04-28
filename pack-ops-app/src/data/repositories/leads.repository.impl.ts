import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { leadsMapper } from "@/data/mappers/leads.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { LeadFilter, LeadsRepository } from "@/data/repositories/leads.repo";
import type { Database } from "@/data/supabase/types";
import type {
  CreateLeadRecordInput,
  LeadRecord,
  UpdateLeadRecordInput,
} from "@/domain/leads/types";

export class LeadsRepositoryImpl implements LeadsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: LeadFilter }): Promise<LeadRecord[]> {
    let query = this.client
      .from("leads")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("follow_up_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });

    if (options?.filter?.status) {
      query = query.eq("status", options.filter.status);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const leads = (data ?? []).map((row) => leadsMapper.toDomain(row));
    await localDb.leads.bulkPut(leads as LeadRecord[]);
    return leads;
  }

  async getById(id: string): Promise<LeadRecord | null> {
    const { data, error } = await this.client
      .from("leads")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const lead = leadsMapper.toDomain(data);
    await localDb.leads.put(lead as LeadRecord);
    return lead;
  }

  async create(input: CreateLeadRecordInput): Promise<LeadRecord> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["leads"]["Insert"] = {
      org_id: this.context.orgId,
      contact_id: input.contactId,
      title: input.projectSite,
      status: input.status ?? "new",
      source: input.source ?? "other",
      description: input.description ?? null,
      follow_up_at: input.followUpAt ?? null,
      notes: input.notes ?? null,
      estimated_value: input.estimatedValue ?? null,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from("leads")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const lead = leadsMapper.toDomain(data);
    await localDb.leads.put(lead as LeadRecord);
    return lead;
  }

  async update(id: string, input: UpdateLeadRecordInput): Promise<LeadRecord> {
    const { data, error } = await this.client
      .from("leads")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...leadsMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const lead = leadsMapper.toDomain(data);
    await localDb.leads.put(lead as LeadRecord);
    return lead;
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_lead", {
      p_lead_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
