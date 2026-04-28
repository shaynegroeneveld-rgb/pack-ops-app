import type { Job } from "@/domain/jobs/types";

import type { TableRow } from "@/data/mappers/database-row-types";
import type { CreateJobInput, UpdateJobInput } from "@/data/repositories/jobs.repo";
import type { Database } from "@/data/supabase/types";
import type { RepositoryMapper } from "@/data/mappers/shared";

type JobRow = TableRow<"jobs">;
type JobInsertRecord = Pick<
  JobRow,
  "number" | "contact_id" | "quote_id" | "title" | "description" | "internal_notes" | "estimated_hours" | "estimate_snapshot" | "requires_full_crew_together" | "scheduled_start" | "scheduled_end"
>;
type JobUpdateRecord = Partial<
  Pick<JobRow, "status" | "waiting_reason" | "contact_id" | "title" | "description" | "internal_notes" | "estimated_hours" | "estimate_snapshot" | "requires_full_crew_together" | "scheduled_start" | "scheduled_end">
>;
type JobEstimateSnapshotJson = Exclude<
  Database["public"]["Tables"]["jobs"]["Insert"]["estimate_snapshot"],
  undefined
>;

export const jobsMapper: RepositoryMapper<
  JobRow,
  Job,
  CreateJobInput,
  UpdateJobInput,
  JobInsertRecord,
  JobUpdateRecord
> = {
  toDomain(row) {
    return {
      id: row.id as Job["id"],
      orgId: row.org_id as Job["orgId"],
      contactId: row.contact_id as Job["contactId"],
      quoteId: row.quote_id as Job["quoteId"],
      number: row.number,
      status: row.status,
      waitingReason: row.waiting_reason,
      title: row.title,
      description: row.description,
      internalNotes: row.internal_notes,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      region: row.state,
      postalCode: row.postcode,
      tags: row.tags,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      actualStart: row.actual_start,
      actualEnd: row.actual_end,
      estimatedHours: row.estimated_hours,
      estimatedCost: row.estimated_cost,
      estimateSnapshot: row.estimate_snapshot as Job["estimateSnapshot"],
      requiresFullCrewTogether: row.requires_full_crew_together ?? false,
      createdBy: row.created_by as Job["createdBy"],
      updatedBy: row.updated_by as Job["updatedBy"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  },
  toInsert(input) {
    return {
      number: input.number,
      contact_id: input.contactId,
      quote_id: input.quoteId ?? null,
      title: input.title,
      description: input.description ?? null,
      internal_notes: input.internalNotes ?? null,
      estimated_hours: input.estimatedHours ?? null,
      estimate_snapshot: (input.estimateSnapshot ?? null) as JobEstimateSnapshotJson,
      requires_full_crew_together: input.requiresFullCrewTogether ?? false,
      scheduled_start: input.scheduledStart ?? null,
      scheduled_end: input.scheduledEnd ?? null,
    } satisfies JobInsertRecord;
  },
  toPatch(input) {
    return {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.waitingReason !== undefined ? { waiting_reason: input.waitingReason } : {}),
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.internalNotes !== undefined ? { internal_notes: input.internalNotes } : {}),
      ...(input.estimatedHours !== undefined ? { estimated_hours: input.estimatedHours } : {}),
      ...(input.estimateSnapshot !== undefined
        ? { estimate_snapshot: input.estimateSnapshot as JobEstimateSnapshotJson }
        : {}),
      ...(input.requiresFullCrewTogether !== undefined
        ? { requires_full_crew_together: input.requiresFullCrewTogether }
        : {}),
      ...(input.scheduledStart !== undefined ? { scheduled_start: input.scheduledStart } : {}),
      ...(input.scheduledEnd !== undefined ? { scheduled_end: input.scheduledEnd } : {}),
    } satisfies JobUpdateRecord;
  },
};
