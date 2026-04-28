import type { Contact, CreateContactInput, UpdateContactInput } from "@/domain/contacts/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface ContactRow {
  id: string;
  org_id: string;
  type: "person" | "company";
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const contactsMapper: RepositoryMapper<
  ContactRow,
  Contact,
  CreateContactInput,
  UpdateContactInput,
  Partial<ContactRow>,
  Partial<ContactRow>
> = {
  toDomain(row) {
    return {
      id: row.id as Contact["id"],
      orgId: row.org_id as Contact["orgId"],
      type: row.type,
      displayName: row.name,
      legalName: null,
      email: row.email,
      phone: row.phone,
      companyName: row.company_name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      region: row.state,
      postalCode: row.postcode,
      country: row.country,
      notes: row.notes,
      createdBy: row.created_by as Contact["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      type: input.type,
      name: input.displayName,
      company_name: input.companyName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address_line1: input.addressLine1 ?? null,
      address_line2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.region ?? null,
      postcode: input.postalCode ?? null,
      country: input.country ?? "CA",
      notes: input.notes ?? null,
    };
  },
  toPatch(input) {
    return {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.displayName !== undefined ? { name: input.displayName } : {}),
      ...(input.companyName !== undefined ? { company_name: input.companyName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.addressLine1 !== undefined ? { address_line1: input.addressLine1 } : {}),
      ...(input.addressLine2 !== undefined ? { address_line2: input.addressLine2 } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.region !== undefined ? { state: input.region } : {}),
      ...(input.postalCode !== undefined ? { postcode: input.postalCode } : {}),
      ...(input.country !== undefined ? { country: input.country?.trim() || "CA" } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
  },
};
