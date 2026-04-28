import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { notesMapper } from "@/data/mappers/notes.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { CreateNoteInput, NoteFilter, NotesRepository } from "@/data/repositories/notes.repo";
import type { Database } from "@/data/supabase/types";
import type { Note } from "@/domain/notes/types";
import { createId } from "@/lib/create-id";

export class NotesRepositoryImpl implements NotesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(filter?: NoteFilter): Promise<Note[]> {
    let query = this.client
      .from("notes")
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

    const notes = (data ?? []).map((row) => notesMapper.toDomain(row));
    await localDb.notes.bulkPut(notes);
    return notes;
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("notes")
      .insert({
        id: createId(),
        ...notesMapper.toInsert({
          orgId: this.context.orgId,
          entityType: input.entityType,
          entityId: input.entityId,
          body: input.body,
          isInternal: input.isInternal ?? true,
          createdBy: this.context.actorUserId,
        }),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const note = notesMapper.toDomain(data);
    await localDb.notes.put(note);
    return note;
  }
}
