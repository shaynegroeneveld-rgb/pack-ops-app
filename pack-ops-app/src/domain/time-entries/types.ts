import type { TimeEntryStatus } from "@/domain/enums";
import type { ActiveTimerId, JobId, OrgId, TimeEntryId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface ActiveTimer extends AuditedEntity {
  id: ActiveTimerId;
  orgId: OrgId;
  jobId: JobId;
  userId: UserId;
  startedAt: string;
  description: string | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}

export interface TimeEntry extends AuditedEntity {
  id: TimeEntryId;
  orgId: OrgId;
  jobId: JobId;
  userId: UserId;
  status: TimeEntryStatus;
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  description: string | null;
  sectionName: string | null;
  isBillable: boolean;
  hourlyRate: number | null;
  rejectedReason: string | null;
  approvedBy: UserId | null;
  approvedAt: string | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}
