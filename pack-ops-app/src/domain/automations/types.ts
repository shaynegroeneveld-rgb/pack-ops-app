import type {
  ActionItemCategory,
  ActionItemPriority,
  AutomationActionType,
  AutomationTriggerType,
  EntityType,
} from "@/domain/enums";
import type { AutomationRuleId, OrgId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export type BuiltinAutomationRuleKey =
  | "job_no_time_logged_48h"
  | "job_ready_to_invoice_24h"
  | "job_over_budget"
  | "job_stale_7d"
  | "invoice_overdue_email"
  | "invoice_overdue_7d_task"
  | "quote_follow_up_5d"
  | "lead_unresponsive_3d";

export interface AutomationRule extends AuditedEntity {
  id: AutomationRuleId;
  orgId: OrgId;
  key: BuiltinAutomationRuleKey | null;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  isEnabled: boolean;
  isMuted: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  conditionConfig: Record<string, unknown> | null;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
}

export interface CreateActionItemActionConfig {
  category: ActionItemCategory;
  priority: ActionItemPriority;
  title: string;
  assignToRole: "owner" | "office" | "field" | "bookkeeper";
}

export interface NoActivityTriggerConfig {
  entityType: EntityType;
  requiredStatus?: string;
  activityType: "time_entry" | "invoice" | "status_change" | "any";
  thresholdHours: number;
}
