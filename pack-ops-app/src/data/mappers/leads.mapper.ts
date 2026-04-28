import type {
  CreateLeadRecordInput,
  LeadRecord,
  UpdateLeadRecordInput,
} from "@/domain/leads/types";

import type { RepositoryMapper } from "@/data/mappers/shared";

export interface LeadRow {
  id: string;
  org_id: string;
  contact_id: string;
  status: LeadRecord["status"];
  source: LeadRecord["source"];
  title: string;
  description: string | null;
  follow_up_at: string | null;
  notes: string | null;
  estimated_value: number | null;
  won_at: string | null;
  lost_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const leadsMapper: RepositoryMapper<
  LeadRow,
  LeadRecord,
  CreateLeadRecordInput,
  UpdateLeadRecordInput,
  Partial<LeadRow>,
  Partial<LeadRow>
> = {
  toDomain(row) {
    return {
      id: row.id as LeadRecord["id"],
      orgId: row.org_id as LeadRecord["orgId"],
      contactId: row.contact_id as LeadRecord["contactId"],
      status: row.status,
      source: row.source,
      projectSite: row.title,
      description: row.description,
      followUpAt: row.follow_up_at,
      notes: row.notes,
      estimatedValue: row.estimated_value,
      wonAt: row.won_at,
      lostAt: row.lost_at,
      createdBy: row.created_by as LeadRecord["createdBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      contact_id: input.contactId,
      status: input.status ?? "new",
      source: input.source ?? "other",
      title: input.projectSite,
      description: input.description ?? null,
      follow_up_at: input.followUpAt ?? null,
      notes: input.notes ?? null,
      estimated_value: input.estimatedValue ?? null,
    };
  },
  toPatch(input) {
    return {
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.projectSite !== undefined ? { title: input.projectSite } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.followUpAt !== undefined ? { follow_up_at: input.followUpAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.estimatedValue !== undefined ? { estimated_value: input.estimatedValue } : {}),
    };
  },
};
