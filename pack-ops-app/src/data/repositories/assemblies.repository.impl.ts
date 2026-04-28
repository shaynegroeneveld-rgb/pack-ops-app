import type { SupabaseClient } from "@supabase/supabase-js";

import { assembliesMapper, assemblyItemsMapper } from "@/data/mappers/assemblies.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { AssembliesRepository, AssemblyItemsRepository } from "@/data/repositories/assemblies.repo";
import type { Database } from "@/data/supabase/types";
import type {
  Assembly,
  AssemblyItem,
  AssemblyItemInput,
  CreateAssemblyInput,
  UpdateAssemblyInput,
} from "@/domain/materials/types";

export class AssembliesRepositoryImpl implements AssembliesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(): Promise<Assembly[]> {
    const { data, error } = await this.client
      .from("assemblies")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => assembliesMapper.toDomain(row));
  }

  async getById(id: string): Promise<Assembly | null> {
    const { data, error } = await this.client
      .from("assemblies")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? assembliesMapper.toDomain(data) : null;
  }

  async create(input: CreateAssemblyInput): Promise<Assembly> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["assemblies"]["Insert"] = {
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
      name: input.name,
      description: input.description?.trim() || null,
      default_labor_hours: input.defaultLaborHours ?? 0,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await this.client
      .from("assemblies")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return assembliesMapper.toDomain(data);
  }

  async update(id: string, input: UpdateAssemblyInput): Promise<Assembly> {
    const { data, error } = await this.client
      .from("assemblies")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...assembliesMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return assembliesMapper.toDomain(data);
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_assembly", {
      p_assembly_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}

export class AssemblyItemsRepositoryImpl implements AssemblyItemsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async listByAssemblyIds(assemblyIds: string[]): Promise<AssemblyItem[]> {
    if (assemblyIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("assembly_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .in("assembly_id", assemblyIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => assemblyItemsMapper.toDomain(row));
  }

  async create(assemblyId: string, input: AssemblyItemInput): Promise<AssemblyItem> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("assembly_items")
      .insert({
        org_id: this.context.orgId,
        assembly_id: assemblyId,
        catalog_item_id: input.catalogItemId,
        quantity: input.quantity,
        note: input.note?.trim() || null,
        section_name: input.sectionName?.trim() || null,
        sort_order: input.sortOrder ?? 0,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return assemblyItemsMapper.toDomain(data);
  }

  async update(itemId: string, input: AssemblyItemInput): Promise<AssemblyItem> {
    const { data, error } = await this.client
      .from("assembly_items")
      .update({
        catalog_item_id: input.catalogItemId,
        quantity: input.quantity,
        note: input.note?.trim() || null,
        section_name: input.sectionName?.trim() || null,
        sort_order: input.sortOrder ?? 0,
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", itemId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return assemblyItemsMapper.toDomain(data);
  }

  async hardDelete(itemId: string): Promise<void> {
    const { error } = await this.client
      .from("assembly_items")
      .delete()
      .eq("org_id", this.context.orgId)
      .eq("id", itemId);

    if (error) {
      throw error;
    }
  }
}
