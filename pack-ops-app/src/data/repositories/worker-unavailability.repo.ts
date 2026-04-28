import type { Repository } from "@/data/repositories/base-repository";
import type { WorkerUnavailability } from "@/domain/scheduling/types";

export interface WorkerUnavailabilityFilter {
  userId?: WorkerUnavailability["userId"];
  from?: string;
  to?: string;
}

export interface CreateWorkerUnavailabilityInput {
  orgId: WorkerUnavailability["orgId"];
  userId: WorkerUnavailability["userId"];
  day: string;
  reason?: string | null;
  createdBy?: WorkerUnavailability["createdBy"];
  updatedBy?: WorkerUnavailability["updatedBy"];
}

export interface UpdateWorkerUnavailabilityInput {
  day?: string;
  reason?: string | null;
  updatedBy?: WorkerUnavailability["updatedBy"];
  deletedAt?: string | null;
}

export type WorkerUnavailabilityRepository = Repository<
  WorkerUnavailability,
  CreateWorkerUnavailabilityInput,
  UpdateWorkerUnavailabilityInput,
  WorkerUnavailabilityFilter
>;
