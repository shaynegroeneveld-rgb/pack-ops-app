import type { Job } from "@/domain/jobs/types";

export interface JobWorkflowFlags {
  isBlocked: boolean;
  isUnassigned: boolean;
  isOverdueSchedule: boolean;
  isMissingTime: boolean;
  isStale: boolean;
  isReadyToClose: boolean;
}

export interface DeriveJobWorkflowFlagsInput {
  job: Job;
  assignmentCount: number;
  unapprovedTimeEntryCount: number;
  hasInvoiceDraft: boolean;
  lastActivityAt: string | null;
  now: Date;
}

const STALE_JOB_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveJobWorkflowFlags(
  input: DeriveJobWorkflowFlagsInput,
): JobWorkflowFlags {
  const { job, assignmentCount, unapprovedTimeEntryCount, hasInvoiceDraft, lastActivityAt, now } =
    input;

  const scheduledEnd = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
  const lastActivity = lastActivityAt ? new Date(lastActivityAt) : null;

  return {
    isBlocked: job.status === "waiting",
    isUnassigned: assignmentCount === 0,
    isOverdueSchedule:
      job.status !== "closed" &&
      job.status !== "cancelled" &&
      scheduledEnd !== null &&
      scheduledEnd.getTime() < now.getTime(),
    isMissingTime: job.status === "in_progress" && unapprovedTimeEntryCount === 0,
    isStale:
      lastActivity !== null &&
      now.getTime() - lastActivity.getTime() >= STALE_JOB_MS &&
      !["closed", "cancelled"].includes(job.status),
    isReadyToClose: job.status === "invoiced" && hasInvoiceDraft,
  };
}
