import type { Document } from "@/domain/documents/types";

export interface DocumentFilter {
  entityType?: string;
  entityId?: string;
}

export interface CreateDocumentInput {
  entityType: string;
  entityId: string;
  category: Document["category"];
  fileName: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface DocumentsRepository {
  list(filter?: DocumentFilter): Promise<Document[]>;
  create(input: CreateDocumentInput): Promise<Document>;
  softDelete(id: string): Promise<void>;
}
