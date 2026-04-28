import type { Note } from "@/domain/notes/types";

export interface NoteFilter {
  entityType?: string;
  entityId?: string;
}

export interface CreateNoteInput {
  entityType: string;
  entityId: string;
  body: string;
  isInternal?: boolean;
}

export interface NotesRepository {
  list(filter?: NoteFilter): Promise<Note[]>;
  create(input: CreateNoteInput): Promise<Note>;
}
