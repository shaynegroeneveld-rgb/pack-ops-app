import type { ActionItem } from "@/domain/action-items/types";
import type { Job, JobAssignment } from "@/domain/jobs/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import type { User } from "@/domain/users/types";

export function canViewWorkbenchJob(user: User, job: Job, assignments: JobAssignment[]): boolean {
  if (user.role === "owner" || user.role === "office") {
    return true;
  }

  if (user.role === "field") {
    return assignments.some((assignment) => assignment.jobId === job.id && assignment.userId === user.id);
  }

  return false;
}

export function canCreateWorkbenchJob(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

export function canAssignCurrentUserToWorkbenchJob(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

export function canCreateWorkbenchTimeEntry(
  user: User,
  job: Job,
  assignments: JobAssignment[],
): boolean {
  if (user.role === "owner" || user.role === "office") {
    return true;
  }

  if (user.role === "field") {
    return assignments.some((assignment) => assignment.jobId === job.id && assignment.userId === user.id);
  }

  return false;
}

export function canApproveWorkbenchTimeEntry(
  user: User,
  entry: TimeEntry,
  assignments: JobAssignment[],
): boolean {
  if (user.role === "owner" || user.role === "office") {
    return true;
  }

  if (!user.canApproveTime) {
    return false;
  }

  return assignments.some((assignment) => assignment.jobId === entry.jobId && assignment.userId === user.id);
}

export function canEditWorkbenchTimeEntry(
  user: User,
  entry: TimeEntry,
  assignments: JobAssignment[],
): boolean {
  if (user.role === "owner" || user.role === "office") {
    return true;
  }

  if (user.canApproveTime) {
    return assignments.some((assignment) => assignment.jobId === entry.jobId && assignment.userId === user.id);
  }

  return entry.userId === user.id && entry.status === "pending";
}

export function canDeleteWorkbenchTimeEntry(
  user: User,
  entry: TimeEntry,
  assignments: JobAssignment[],
): boolean {
  return canEditWorkbenchTimeEntry(user, entry, assignments);
}

export function canResolveWorkbenchActionItem(user: User, actionItem: ActionItem): boolean {
  if (user.role === "owner" || user.role === "office") {
    return true;
  }

  return actionItem.assignedTo === user.id;
}

export function canCreateWorkbenchActionItem(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

export function canManageWorkbenchAssignments(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}
