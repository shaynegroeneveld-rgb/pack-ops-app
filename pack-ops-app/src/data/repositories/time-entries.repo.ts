import type { TimeEntry } from "@/domain/time-entries/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface TimeEntryFilter {
  jobId?: TimeEntry["jobId"];
  userId?: TimeEntry["userId"];
  statuses?: TimeEntry["status"][];
}

export interface CreateTimeEntryInput {
  jobId: TimeEntry["jobId"];
  userId: TimeEntry["userId"];
  workDate: TimeEntry["workDate"];
  startTime?: TimeEntry["startTime"];
  endTime?: TimeEntry["endTime"];
  hours: TimeEntry["hours"];
  description?: TimeEntry["description"];
  sectionName?: TimeEntry["sectionName"];
  isBillable?: TimeEntry["isBillable"];
  hourlyRate?: TimeEntry["hourlyRate"];
  createdBy?: TimeEntry["createdBy"];
}

export interface UpdateTimeEntryInput {
  status?: TimeEntry["status"];
  workDate?: TimeEntry["workDate"];
  startTime?: TimeEntry["startTime"];
  endTime?: TimeEntry["endTime"];
  hours?: TimeEntry["hours"];
  description?: TimeEntry["description"];
  sectionName?: TimeEntry["sectionName"];
  hourlyRate?: TimeEntry["hourlyRate"];
  rejectedReason?: TimeEntry["rejectedReason"];
  approvedBy?: TimeEntry["approvedBy"];
  approvedAt?: TimeEntry["approvedAt"];
  updatedBy?: TimeEntry["updatedBy"];
  deletedAt?: string | null;
}

export type TimeEntriesRepository = Repository<
  TimeEntry,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  TimeEntryFilter
>;
