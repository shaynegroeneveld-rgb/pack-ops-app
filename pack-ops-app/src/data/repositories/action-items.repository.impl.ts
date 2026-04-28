import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { actionItemsMapper } from "@/data/mappers/action-items.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  ActionItemFilter,
  ActionItemsRepository,
  CreateActionItemInput,
  UpdateActionItemInput,
} from "@/data/repositories/action-items.repo";
import { WorkbenchRepositoryBase } from "@/data/repositories/workbench-repository-base";
import type { Database } from "@/data/supabase/types";
import type { ActionItem } from "@/domain/action-items/types";
import { createId } from "@/lib/create-id";

export class ActionItemsRepositoryImpl
  extends WorkbenchRepositoryBase<ActionItem>
  implements ActionItemsRepository
{
  constructor(
    context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {
    super(context);
  }

  async list(options?: { filter?: ActionItemFilter }): Promise<ActionItem[]> {
    let query = this.client
      .from("action_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (options?.filter?.entityId) {
      query = query.eq("entity_id", options.filter.entityId);
    }
    if (options?.filter?.entityType) {
      query = query.eq("entity_type", options.filter.entityType);
    }
    if (options?.filter?.assignedTo) {
      query = query.eq("assigned_to", options.filter.assignedTo);
    }
    if (options?.filter?.statuses?.length) {
      query = query.in("status", options.filter.statuses);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const items = (data ?? []).map((row) => actionItemsMapper.toDomain(row));
    await localDb.actionItems.bulkPut(items);
    return items;
  }

  async getById(id: string): Promise<ActionItem | null> {
    const { data, error } = await this.client
      .from("action_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const item = actionItemsMapper.toDomain(data);
    await localDb.actionItems.put(item);
    return item;
  }

  async create(input: CreateActionItemInput): Promise<ActionItem> {
    const now = this.now();
    const id = createId();
    const item: ActionItem = {
      id: id as ActionItem["id"],
      orgId: this.context.orgId as ActionItem["orgId"],
      entityType: input.entityType,
      entityId: input.entityId,
      automationRuleId: null,
      category: input.category,
      priority: input.priority ?? "normal",
      status: "open",
      title: input.title,
      description: input.description ?? null,
      assignedTo: (input.assignedTo ?? null) as ActionItem["assignedTo"],
      createdBy: (input.createdBy ?? this.context.actorUserId) as ActionItem["createdBy"],
      dueAt: input.dueAt ?? null,
      snoozedUntil: null,
      resolvedAt: null,
      resolvedBy: null,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    console.info("[ActionItemsRepository] create input", input);
    console.info("[ActionItemsRepository] local action item result", item);

    await localDb.actionItems.put(item);
    const queuePayload = {
      id,
      org_id: this.context.orgId,
      status: "open",
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...actionItemsMapper.toInsert(input),
    };
    console.info("[ActionItemsRepository] queued SyncEnvelope", {
      entityType: "action_items",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });
    await this.enqueue({
      entityType: "action_items",
      entityId: id,
      operation: "upsert",
      payload: queuePayload,
    });

    return item;
  }

  async update(id: string, input: UpdateActionItemInput): Promise<ActionItem> {
    const existing = await localDb.actionItems.get(id);
    if (!existing) {
      throw new Error(`Action item ${id} not found in local cache.`);
    }

    const updatedAt = this.now();
    const item: ActionItem = {
      ...existing,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
      ...(input.snoozedUntil !== undefined ? { snoozedUntil: input.snoozedUntil } : {}),
      ...(input.resolvedAt !== undefined ? { resolvedAt: input.resolvedAt } : {}),
      ...(input.resolvedBy !== undefined ? { resolvedBy: input.resolvedBy } : {}),
      ...(input.dismissedAt !== undefined ? { dismissedAt: input.dismissedAt } : {}),
      ...(input.dismissedBy !== undefined ? { dismissedBy: input.dismissedBy } : {}),
      ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
      updatedAt,
    };

    console.info("[ActionItemsRepository] update input", { id, input });
    console.info("[ActionItemsRepository] local updated action item", item);

    await localDb.actionItems.put(item);
    const queuePayload = {
      id,
      org_id: item.orgId,
      entity_type: item.entityType,
      entity_id: item.entityId,
      automation_rule_id: item.automationRuleId,
      category: item.category,
      priority: item.priority,
      status: item.status,
      title: item.title,
      description: item.description,
      assigned_to: item.assignedTo,
      created_by: item.createdBy,
      due_at: item.dueAt,
      snoozed_until: item.snoozedUntil,
      resolved_at: item.resolvedAt,
      resolved_by: item.resolvedBy,
      dismissed_at: item.dismissedAt,
      dismissed_by: item.dismissedBy,
      created_at: item.createdAt,
      updated_at: updatedAt,
      deleted_at: item.deletedAt,
    };
    console.info("[ActionItemsRepository] queued SyncEnvelope", {
      entityType: "action_items",
      entityId: id,
      operation: item.deletedAt ? "soft_delete" : "upsert",
      payload: queuePayload,
    });
    await this.enqueue({
      entityType: "action_items",
      entityId: id,
      operation: item.deletedAt ? "soft_delete" : "upsert",
      payload: queuePayload,
    });

    return item;
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, { deletedAt: this.now() });
  }
}
