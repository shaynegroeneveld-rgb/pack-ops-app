import type { Repository } from "@/data/repositories/base-repository";
import type { ScheduleBlock } from "@/domain/scheduling/types";

export interface ScheduleBlockFilter {
  jobId?: ScheduleBlock["jobId"];
  userId?: ScheduleBlock["userId"];
  from?: string;
  to?: string;
}

export interface CreateScheduleBlockInput {
  jobId: ScheduleBlock["jobId"];
  userId?: ScheduleBlock["userId"];
  startAt: ScheduleBlock["startAt"];
  endAt: ScheduleBlock["endAt"];
  timeBucket?: ScheduleBlock["timeBucket"];
  durationHours: ScheduleBlock["durationHours"];
  notes?: ScheduleBlock["notes"];
}

export interface UpdateScheduleBlockInput {
  userId?: ScheduleBlock["userId"];
  startAt?: ScheduleBlock["startAt"];
  endAt?: ScheduleBlock["endAt"];
  timeBucket?: ScheduleBlock["timeBucket"];
  durationHours?: ScheduleBlock["durationHours"];
  notes?: ScheduleBlock["notes"];
  deletedAt?: string | null;
}

export type ScheduleBlocksRepository = Repository<
  ScheduleBlock,
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
  ScheduleBlockFilter
>;
