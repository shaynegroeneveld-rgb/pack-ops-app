import type { SupabaseClient } from "@supabase/supabase-js";

import { ContactsRepositoryImpl } from "@/data/repositories/contacts.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { LeadsRepositoryImpl } from "@/data/repositories/leads.repository.impl";
import type { Database } from "@/data/supabase/types";
import type { Contact } from "@/domain/contacts/types";
import type {
  CreateLeadInput,
  Lead,
  LeadRecord,
  UpdateLeadInput,
} from "@/domain/leads/types";
import type { User } from "@/domain/users/types";
import { normalizePersistenceError } from "@/services/shared/persistence-errors";

function canManageLeads(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function normalizeDateInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Choose a valid follow-up date.");
  }

  return date.toISOString();
}

function toLeadView(record: LeadRecord, contact: Contact | null): Lead {
  const customerName = contact?.companyName?.trim() || contact?.displayName?.trim() || "Unnamed customer";
  const contactName = contact?.companyName?.trim()
    ? contact.displayName?.trim() || customerName
    : contact?.displayName?.trim() || customerName;

  return {
    ...record,
    customerName,
    contactName,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
  };
}

export class LeadsService {
  readonly contacts;
  readonly leads;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.contacts = new ContactsRepositoryImpl(context, client);
    this.leads = new LeadsRepositoryImpl(context, client);
  }

  private assertCanManageLeads() {
    if (!canManageLeads(this.currentUser)) {
      throw new Error("You cannot manage leads.");
    }
  }

  private validateText(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error(`${label} is required.`);
    }
    return normalized;
  }

  async listLeads(options?: { status?: Lead["status"] }): Promise<Lead[]> {
    this.assertCanManageLeads();

    const [records, contacts] = await Promise.all([
      this.leads.list(options?.status ? { filter: { status: options.status } } : undefined),
      this.contacts.list(),
    ]);

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    return records.map((record) => toLeadView(record, contactsById.get(record.contactId) ?? null));
  }

  async createLead(input: CreateLeadInput): Promise<Lead> {
    this.assertCanManageLeads();

    const customerName = this.validateText(input.customerName, "Customer / company name");
    const projectSite = this.validateText(input.projectSite, "Project / site");
    const contactName = input.contactName?.trim() || customerName;

    const contact = await this.contacts.create({
      type: "company",
      displayName: contactName,
      companyName: customerName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    });

    let record: LeadRecord;
    try {
      record = await this.leads.create({
        contactId: contact.id,
        projectSite,
        description: input.description?.trim() || null,
        followUpAt: normalizeDateInput(input.followUpAt),
        notes: input.notes?.trim() || null,
        status: input.status ?? "new",
        source: "other",
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Lead",
        operation: "save",
        table: "leads",
        migrationHint: "0025_leads_simple_pipeline.sql",
      });
    }

    return toLeadView(record, contact);
  }

  async updateLead(leadId: Lead["id"], input: UpdateLeadInput): Promise<Lead> {
    this.assertCanManageLeads();

    const existingRecord = await this.leads.getById(leadId);
    if (!existingRecord) {
      throw new Error("Lead not found.");
    }

    const existingContact = await this.contacts.getById(existingRecord.contactId);
    if (!existingContact) {
      throw new Error("Lead contact could not be found.");
    }

    const nextCustomerName = input.customerName !== undefined
      ? this.validateText(input.customerName, "Customer / company name")
      : existingContact.companyName?.trim() || existingContact.displayName;
    const nextContactName = input.contactName !== undefined
      ? input.contactName?.trim() || nextCustomerName
      : existingContact.displayName;

    const contact = await this.contacts.update(existingContact.id, {
      type: "company",
      displayName: nextContactName,
      companyName: nextCustomerName,
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    });

    let record: LeadRecord;
    try {
      record = await this.leads.update(leadId, {
        ...(input.projectSite !== undefined
          ? { projectSite: this.validateText(input.projectSite, "Project / site") }
          : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.followUpAt !== undefined ? { followUpAt: normalizeDateInput(input.followUpAt) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Lead",
        operation: "save",
        table: "leads",
        migrationHint: "0025_leads_simple_pipeline.sql",
      });
    }

    return toLeadView(record, contact);
  }

  async archiveLead(leadId: Lead["id"]): Promise<void> {
    this.assertCanManageLeads();
    try {
      await this.leads.softDelete(leadId);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Lead",
        operation: "archive",
        table: "leads",
        migrationHint: "0028_business_entity_soft_delete_rpcs.sql",
      });
    }
  }
}
