import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { contactsMapper } from "@/data/mappers/contacts.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type {
  ContactFilter,
  ContactsRepository,
} from "@/data/repositories/contacts.repo";
import type { Database } from "@/data/supabase/types";
import type { Contact, CreateContactInput, UpdateContactInput } from "@/domain/contacts/types";
import type { PostgrestError } from "@supabase/supabase-js";

function formatSupabaseContactInsertError(error: PostgrestError): Error {
  const pieces = [
    error.message,
    error.details,
    error.hint,
    error.code ? `(code: ${error.code})` : null,
  ].filter(Boolean);

  return new Error(pieces.join(" — ") || "Contact insert failed.");
}

export class ContactsRepositoryImpl implements ContactsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: ContactFilter }): Promise<Contact[]> {
    let query = this.client
      .from("contacts")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (options?.filter?.search) {
      query = query.ilike("name", `%${options.filter.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const contacts = (data ?? []).map((row) => contactsMapper.toDomain(row));
    await localDb.contacts.bulkPut(contacts);
    return contacts;
  }

  async getById(id: string): Promise<Contact | null> {
    const { data, error } = await this.client
      .from("contacts")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const contact = contactsMapper.toDomain(data);
    await localDb.contacts.put(contact);
    return contact;
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["contacts"]["Insert"] = {
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
      type: input.type,
      name: input.displayName,
      company_name: input.companyName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    };

    console.info("[ContactsRepository] create input", input);
    console.info("[ContactsRepository] create context", this.context);
    console.info("[ContactsRepository] contacts insert payload", insertPayload);

    const { data, error } = await this.client
      .from("contacts")
      .insert(insertPayload)
      .select("*")
      .single();

    console.info("[ContactsRepository] contacts insert result", { data, error });

    if (error) {
      console.error("[ContactsRepository] contacts insert full error", error);
      throw formatSupabaseContactInsertError(error);
    }

    const contact = contactsMapper.toDomain(data);
    await localDb.contacts.put(contact);
    return contact;
  }

  async update(id: string, input: UpdateContactInput): Promise<Contact> {
    const { data, error } = await this.client
      .from("contacts")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...contactsMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const contact = contactsMapper.toDomain(data);
    await localDb.contacts.put(contact);
    return contact;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.client
      .from("contacts")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
}
