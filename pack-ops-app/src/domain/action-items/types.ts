import type {
  ActionItemCategory,
  ActionItemPriority,
  ActionItemStatus,
} from "@/domain/enums";
import type { ActionItemId, AutomationRuleId, OrgId, UserId } from "@/domain/ids";
import type { EntityRef } from "@/domain/entity-ref";
import type { AuditedEntity } from "@/domain/shared/base";

export interface ActionItem extends AuditedEntity, EntityRef {
  id: ActionItemId;
  orgId: OrgId;
  automationRuleId: AutomationRuleId | null;
  category: ActionItemCategory;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  title: string;
  description: string | null;
  assignedTo: UserId | null;
  createdBy: UserId | null;
  dueAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  resolvedBy: UserId | null;
  dismissedAt: string | null;
  dismissedBy: UserId | null;
}
