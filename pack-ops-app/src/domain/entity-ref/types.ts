import type { EntityType } from "@/domain/enums";
import type { OrgId } from "@/domain/ids";

export interface EntityRef {
  orgId: OrgId;
  entityType: EntityType;
  entityId: string;
}

export interface EntityActivityRef extends EntityRef {
  label?: string;
}
