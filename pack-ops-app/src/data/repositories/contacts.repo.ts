import type { Contact, CreateContactInput, UpdateContactInput } from "@/domain/contacts/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface ContactFilter {
  search?: string;
}

export type ContactsRepository = Repository<
  Contact,
  CreateContactInput,
  UpdateContactInput,
  ContactFilter
>;
