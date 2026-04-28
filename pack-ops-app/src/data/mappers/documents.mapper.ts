import type { Document } from "@/domain/documents/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { Database } from "@/data/supabase/types";

type DocumentRow = TableRow<"documents">;
type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];

export const documentsMapper = {
  toDomain(row: DocumentRow): Document {
    return {
      id: row.id as Document["id"],
      orgId: row.org_id as Document["orgId"],
      entityType: row.entity_type as Document["entityType"],
      entityId: row.entity_id,
      category: row.category,
      fileName: row.display_name,
      storagePath: row.storage_path,
      mimeType: row.mime_type ?? "application/octet-stream",
      sizeBytes: row.file_size ?? 0,
      uploadedBy: row.uploaded_by as Document["uploadedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },

  toInsert(input: {
    orgId: string;
    entityType: string;
    entityId: string;
    category: Document["category"];
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
    uploadedBy: string | null;
  }): DocumentInsert {
    return {
      org_id: input.orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      category: input.category,
      display_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.sizeBytes,
      uploaded_by: input.uploadedBy,
    };
  },
};
