import type { Job } from "@/domain/jobs/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface JobFilter {
  status?: Job["status"][];
  assignedToMe?: boolean;
}

export interface CreateJobInput {
  number: string;
  contactId: Job["contactId"];
  quoteId?: Job["quoteId"];
  jobTypeId?: Job["jobTypeId"];
  tags?: Job["tags"];
  title: string;
  fieldName?: Job["fieldName"];
  addressLine1?: Job["addressLine1"];
  description?: string | null;
  internalNotes?: string | null;
  estimatedHours?: Job["estimatedHours"];
  estimateSnapshot?: Job["estimateSnapshot"];
  requiresFullCrewTogether?: Job["requiresFullCrewTogether"];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

export interface UpdateJobInput {
  status?: Job["status"];
  waitingReason?: Job["waitingReason"];
  contactId?: Job["contactId"];
  jobTypeId?: Job["jobTypeId"];
  tags?: Job["tags"];
  title?: string;
  fieldName?: Job["fieldName"];
  addressLine1?: Job["addressLine1"];
  description?: string | null;
  internalNotes?: string | null;
  estimatedHours?: Job["estimatedHours"];
  estimateSnapshot?: Job["estimateSnapshot"];
  requiresFullCrewTogether?: Job["requiresFullCrewTogether"];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

export type JobsRepository = Repository<Job, CreateJobInput, UpdateJobInput, JobFilter>;
