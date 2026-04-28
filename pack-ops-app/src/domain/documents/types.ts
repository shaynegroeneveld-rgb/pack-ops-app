import type { DocumentCategory } from "@/domain/enums";
import type { DocumentId, OrgId, UserId } from "@/domain/ids";
import type { EntityRef } from "@/domain/entity-ref";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Document extends AuditedEntity, EntityRef {
  id: DocumentId;
  orgId: OrgId;
  category: DocumentCategory;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: UserId | null;
}
