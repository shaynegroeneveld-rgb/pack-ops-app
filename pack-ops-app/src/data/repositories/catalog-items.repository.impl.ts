import type { SupabaseClient } from "@supabase/supabase-js";

import { catalogItemsMapper } from "@/data/mappers/catalog-items.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { CatalogItemFilter, CatalogItemsRepository } from "@/data/repositories/catalog-items.repo";
import type { Database } from "@/data/supabase/types";
import type { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "@/domain/materials/types";

export class CatalogItemsRepositoryImpl implements CatalogItemsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: CatalogItemFilter }): Promise<CatalogItem[]> {
    let query = this.client
      .from("catalog_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("category", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (!options?.filter?.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => catalogItemsMapper.toDomain(row));
  }

  async getById(id: string): Promise<CatalogItem | null> {
    const { data, error } = await this.client
      .from("catalog_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? catalogItemsMapper.toDomain(data) : null;
  }

  async create(input: CreateCatalogItemInput): Promise<CatalogItem> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["catalog_items"]["Insert"] = {
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit?.trim() || "each",
      cost_price: input.costPrice ?? null,
      unit_price: input.unitPrice ?? null,
      category: input.category ?? null,
      notes: input.notes ?? null,
      description: null,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await this.client
      .from("catalog_items")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return catalogItemsMapper.toDomain(data);
  }

  async update(id: string, input: UpdateCatalogItemInput): Promise<CatalogItem> {
    const { data, error } = await this.client
      .from("catalog_items")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...catalogItemsMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return catalogItemsMapper.toDomain(data);
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_catalog_item", {
      p_catalog_item_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
