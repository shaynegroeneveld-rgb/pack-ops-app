import type { CreateJobTypeInput, JobType, UpdateJobTypeInput } from "@/domain/job-types/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface JobTypeFilter {
  includeInactive?: boolean;
}

export type JobTypesRepository = Repository<JobType, CreateJobTypeInput, UpdateJobTypeInput, JobTypeFilter>;
