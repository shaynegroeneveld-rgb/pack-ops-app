import type { ActiveTimer } from "@/domain/time-entries/types";

export interface ActiveTimerFilter {
  userId?: ActiveTimer["userId"];
}

export interface CreateActiveTimerInput {
  jobId: ActiveTimer["jobId"];
  userId: ActiveTimer["userId"];
  startedAt: ActiveTimer["startedAt"];
  description?: ActiveTimer["description"];
  createdBy?: ActiveTimer["createdBy"];
}

export interface UpdateActiveTimerInput {
  jobId?: ActiveTimer["jobId"];
  startedAt?: ActiveTimer["startedAt"];
  description?: ActiveTimer["description"];
  updatedBy?: ActiveTimer["updatedBy"];
  deletedAt?: string | null;
}

export interface ActiveTimersRepository {
  list(options?: { filter?: ActiveTimerFilter }): Promise<ActiveTimer[]>;
  getById(id: string): Promise<ActiveTimer | null>;
  getCurrentForUser(userId: ActiveTimer["userId"], options?: { preferCache?: boolean }): Promise<ActiveTimer | null>;
  clearLocalForUser(userId: ActiveTimer["userId"]): Promise<void>;
  deleteRemoteForUser(userId: ActiveTimer["userId"]): Promise<void>;
  create(input: CreateActiveTimerInput): Promise<ActiveTimer>;
  update(id: string, input: UpdateActiveTimerInput): Promise<ActiveTimer>;
  softDelete(id: string): Promise<void>;
}
