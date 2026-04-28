import type { ActionItem } from "@/domain/action-items/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type {
  CreateActionItemInput,
  UpdateActionItemInput,
} from "@/data/repositories/action-items.repo";
import type { RepositoryMapper } from "@/data/mappers/shared";

type ActionItemRow = TableRow<"action_items">;
type ActionItemInsertRecord = Pick<
  ActionItemRow,
  "entity_type" | "entity_id" | "category" | "title" | "description" | "assigned_to" | "priority" | "due_at" | "created_by"
>;
type ActionItemUpdateRecord = Partial<
  Pick<
    ActionItemRow,
    "status" | "assigned_to" | "snoozed_until" | "resolved_at" | "resolved_by" | "dismissed_at" | "dismissed_by" | "deleted_at"
  >
>;

export const actionItemsMapper: RepositoryMapper<
  ActionItemRow,
  ActionItem,
  CreateActionItemInput,
  UpdateActionItemInput,
  ActionItemInsertRecord,
  ActionItemUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as ActionItem["id"],
      orgId: row.org_id as ActionItem["orgId"],
      entityType: row.entity_type as ActionItem["entityType"],
      entityId: row.entity_id,
      automationRuleId: row.automation_rule_id as ActionItem["automationRuleId"],
      category: row.category,
      priority: row.priority,
      status: row.status,
      title: row.title,
      description: row.description,
      assignedTo: row.assigned_to as ActionItem["assignedTo"],
      createdBy: row.created_by as ActionItem["createdBy"],
      dueAt: row.due_at,
      snoozedUntil: row.snoozed_until,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by as ActionItem["resolvedBy"],
      dismissedAt: row.dismissed_at,
      dismissedBy: row.dismissed_by as ActionItem["dismissedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      entity_type: input.entityType,
      entity_id: input.entityId,
      category: input.category,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assignedTo ?? null,
      priority: input.priority ?? "normal",
      due_at: input.dueAt ?? null,
      created_by: input.createdBy ?? null,
    } satisfies ActionItemInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
      ...(input.snoozedUntil !== undefined ? { snoozed_until: input.snoozedUntil } : {}),
      ...(input.resolvedAt !== undefined ? { resolved_at: input.resolvedAt } : {}),
      ...(input.resolvedBy !== undefined ? { resolved_by: input.resolvedBy } : {}),
      ...(input.dismissedAt !== undefined ? { dismissed_at: input.dismissedAt } : {}),
      ...(input.dismissedBy !== undefined ? { dismissed_by: input.dismissedBy } : {}),
      ...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
    } satisfies ActionItemUpdateRecord;
  },
};
