import type { ContactType } from "@/domain/enums";
import type { ContactId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Contact extends AuditedEntity {
  id: ContactId;
  orgId: OrgId;
  type: ContactType;
  displayName: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  notes: string | null;
  createdBy: UserId | null;
}

export interface CreateContactInput {
  type: ContactType;
  displayName: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
}

export type UpdateContactInput = Partial<CreateContactInput>;
