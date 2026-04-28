import type { EntityRef } from "@/domain/entity-ref";

export type WorkbenchEntityType = "jobs" | "time_entries" | "action_items";

export function isWorkbenchEntityRef(ref: EntityRef): ref is EntityRef & { entityType: WorkbenchEntityType } {
  return ref.entityType === "jobs" || ref.entityType === "time_entries" || ref.entityType === "action_items";
}
