import type { Note } from "@/domain/notes/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { Database } from "@/data/supabase/types";

type NoteRow = TableRow<"notes">;
type NoteInsert = Database["public"]["Tables"]["notes"]["Insert"];

export const notesMapper = {
  toDomain(row: NoteRow): Note {
    return {
      id: row.id as Note["id"],
      orgId: row.org_id as Note["orgId"],
      entityType: row.entity_type as Note["entityType"],
      entityId: row.entity_id,
      body: row.body,
      createdBy: row.created_by as Note["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },

  toInsert(input: {
    orgId: string;
    entityType: string;
    entityId: string;
    body: string;
    isInternal?: boolean;
    createdBy: string | null;
  }): NoteInsert {
    return {
      org_id: input.orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      body: input.body,
      is_internal: input.isInternal ?? true,
      created_by: input.createdBy,
    };
  },
};
