import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { documentsMapper } from "@/data/mappers/documents.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  CreateDocumentInput,
  DocumentFilter,
  DocumentsRepository,
} from "@/data/repositories/documents.repo";
import type { Database } from "@/data/supabase/types";
import type { Document } from "@/domain/documents/types";
import { createId } from "@/lib/create-id";

export class DocumentsRepositoryImpl implements DocumentsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(filter?: DocumentFilter): Promise<Document[]> {
    let query = this.client
      .from("documents")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filter?.entityType) {
      query = query.eq("entity_type", filter.entityType);
    }

    if (filter?.entityId) {
      query = query.eq("entity_id", filter.entityId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const documents = (data ?? []).map((row) => documentsMapper.toDomain(row));
    await localDb.documents.bulkPut(documents);
    return documents;
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("documents")
      .insert({
        id: createId(),
        ...documentsMapper.toInsert({
          orgId: this.context.orgId,
          entityType: input.entityType,
          entityId: input.entityId,
          category: input.category,
          fileName: input.fileName,
          storagePath: input.storagePath,
          mimeType: input.mimeType ?? null,
          sizeBytes: input.sizeBytes ?? null,
          uploadedBy: this.context.actorUserId,
        }),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const document = documentsMapper.toDomain(data);
    await localDb.documents.put(document);
    return document;
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_document", {
      p_document_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }

    await localDb.documents.delete(id);
  }
}
