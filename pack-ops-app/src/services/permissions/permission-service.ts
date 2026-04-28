import type { EntityType, UserRole } from "@/domain/enums";
import type { User } from "@/domain/users/types";

export type PermissionResource = EntityType | "automation_rules" | "users" | "catalog_items";

export type PermissionAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve_time"
  | "mute_automation";

export interface PermissionCheckContext {
  entityType: PermissionResource;
  action: PermissionAction;
  assignedUserId?: string | null;
}

export function canUserPerform(user: User, context: PermissionCheckContext): boolean {
  if (user.role === "owner") {
    return true;
  }

  if (context.action === "approve_time") {
    return user.canApproveTime;
  }

  if (user.role === "office") {
    return context.action !== "delete" || context.entityType !== "automation_rules";
  }

  if (user.role === "bookkeeper") {
    return ["invoices", "payments"].includes(context.entityType);
  }

  if (user.role === "field") {
    return context.assignedUserId === user.id;
  }

  return false;
}

export function roleCanSeeFinancials(role: UserRole): boolean {
  return role === "owner" || role === "office" || role === "bookkeeper";
}
