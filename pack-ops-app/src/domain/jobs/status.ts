import type { Job } from "@/domain/jobs/types";
import type { JobWaitingReason } from "@/domain/enums";

export type WorkbenchJobPhase = "new" | "in_progress" | "waiting" | "completed";
export type WorkbenchEditableJobStatus = "scheduled" | "in_progress" | "waiting" | "work_complete";

export interface WorkbenchJobStatusAction {
  targetStatus: WorkbenchEditableJobStatus;
  label: string;
  needsWaitingReason?: boolean;
}

export function getWorkbenchJobPhase(job: Job): WorkbenchJobPhase {
  switch (job.status) {
    case "scheduled":
      return "new";
    case "in_progress":
      return "in_progress";
    case "waiting":
      return "waiting";
    case "work_complete":
    case "ready_to_invoice":
    case "invoiced":
    case "closed":
    case "cancelled":
      return "completed";
  }
}

export function getWorkbenchJobPhaseLabel(job: Job): string {
  switch (getWorkbenchJobPhase(job)) {
    case "new":
      return "New";
    case "in_progress":
      return "In Progress";
    case "waiting":
      return "Waiting";
    case "completed":
      return "Completed";
  }
}

export function getWorkbenchJobStatusActions(job: Job): WorkbenchJobStatusAction[] {
  switch (job.status) {
    case "scheduled":
      return [{ targetStatus: "in_progress", label: "Start Work" }];
    case "in_progress":
      return [
        { targetStatus: "waiting", label: "Mark Waiting", needsWaitingReason: true },
        { targetStatus: "work_complete", label: "Mark Completed" },
      ];
    case "waiting":
      return [{ targetStatus: "in_progress", label: "Resume Work" }];
    case "work_complete":
      return [{ targetStatus: "in_progress", label: "Reopen Job" }];
    default:
      return [];
  }
}

export function getAllowedNextJobStatuses(
  status: Job["status"],
): Job["status"][] {
  switch (status) {
    case "scheduled":
      return ["in_progress", "cancelled"];
    case "in_progress":
      return ["waiting", "work_complete", "cancelled"];
    case "waiting":
      return ["in_progress", "cancelled"];
    case "work_complete":
      return ["ready_to_invoice", "in_progress"];
    case "ready_to_invoice":
      return ["invoiced"];
    case "invoiced":
      return ["closed", "ready_to_invoice"];
    case "closed":
    case "cancelled":
      return [];
    default:
      return [];
  }
}

export function getSelectableJobStatuses(status: Job["status"]): Job["status"][] {
  return [status, ...getAllowedNextJobStatuses(status)].filter(
    (value, index, list) => list.indexOf(value) === index,
  );
}

export function getWorkbenchWaitingReasonLabel(reason: JobWaitingReason | null): string | null {
  switch (reason) {
    case "parts":
      return "Parts";
    case "permit":
      return "Permit";
    case "customer_decision":
      return "Customer";
    case "weather":
      return "Weather";
    case "other":
      return "Other";
    default:
      return null;
  }
}

export const WORKBENCH_WAITING_REASON_OPTIONS: Array<{
  value: JobWaitingReason;
  label: string;
}> = [
  { value: "parts", label: "Parts" },
  { value: "permit", label: "Permit" },
  { value: "customer_decision", label: "Customer" },
  { value: "weather", label: "Weather" },
  { value: "other", label: "Other" },
];
