import type { LeadSource, LeadStatus } from "@/domain/enums";
import type { ContactId, LeadId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface LeadRecord extends AuditedEntity {
  id: LeadId;
  orgId: OrgId;
  contactId: ContactId;
  status: LeadStatus;
  source: LeadSource;
  projectSite: string;
  description: string | null;
  followUpAt: string | null;
  notes: string | null;
  estimatedValue: number | null;
  wonAt: string | null;
  lostAt: string | null;
  createdBy: UserId | null;
}

export interface Lead extends LeadRecord {
  customerName: string;
  contactName: string;
  phone: string | null;
  email: string | null;
}

export interface CreateLeadInput {
  customerName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  projectSite: string;
  description?: string | null;
  status?: LeadStatus;
  followUpAt?: string | null;
  notes?: string | null;
}

export interface UpdateLeadInput {
  customerName?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  projectSite?: string;
  description?: string | null;
  status?: LeadStatus;
  followUpAt?: string | null;
  notes?: string | null;
}

export interface CreateLeadRecordInput {
  contactId: ContactId;
  status?: LeadStatus;
  source?: LeadSource;
  projectSite: string;
  description?: string | null;
  followUpAt?: string | null;
  notes?: string | null;
  estimatedValue?: number | null;
}

export interface UpdateLeadRecordInput {
  contactId?: ContactId;
  status?: LeadStatus;
  source?: LeadSource;
  projectSite?: string;
  description?: string | null;
  followUpAt?: string | null;
  notes?: string | null;
  estimatedValue?: number | null;
}
