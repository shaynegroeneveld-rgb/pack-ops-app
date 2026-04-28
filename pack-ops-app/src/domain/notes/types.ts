import type { NoteId, OrgId, UserId } from "@/domain/ids";
import type { EntityRef } from "@/domain/entity-ref";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Note extends AuditedEntity, EntityRef {
  id: NoteId;
  orgId: OrgId;
  body: string;
  createdBy: UserId | null;
}
