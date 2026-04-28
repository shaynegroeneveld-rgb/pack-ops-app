import type { JobId, ScheduleBlockId, OrgId, UserId, WorkerUnavailabilityId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface ScheduleBlock extends AuditedEntity {
  id: ScheduleBlockId;
  orgId: OrgId;
  jobId: JobId;
  userId: UserId | null;
  startAt: string;
  endAt: string;
  timeBucket: "am" | "pm" | "anytime";
  durationHours: number;
  notes: string | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}

export interface UpcomingScheduleBlock {
  block: ScheduleBlock;
  isNextForJob: boolean;
}

export interface WorkerUnavailability extends AuditedEntity {
  id: WorkerUnavailabilityId;
  orgId: OrgId;
  userId: UserId;
  day: string;
  reason: string | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}
