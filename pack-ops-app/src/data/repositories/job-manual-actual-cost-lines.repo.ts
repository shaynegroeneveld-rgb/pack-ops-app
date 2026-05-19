import type { JobManualActualCategory, JobManualActualCostLine } from "@/domain/jobs/types";

export interface JobManualActualCostLineFilter {
  jobId?: string;
}

export interface CreateJobManualActualCostLineInput {
  jobId: string;
  category: JobManualActualCategory;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  note?: string | null;
  sectionName?: string | null;
}

export interface UpdateJobManualActualCostLineInput {
  category?: JobManualActualCategory;
  description?: string;
  quantity?: number;
  unitCost?: number;
  totalCost?: number;
  note?: string | null;
  sectionName?: string | null;
}

export interface JobManualActualCostLinesRepository {
  list(options?: { filter?: JobManualActualCostLineFilter }): Promise<JobManualActualCostLine[]>;
  create(input: CreateJobManualActualCostLineInput): Promise<JobManualActualCostLine>;
  update(id: string, input: UpdateJobManualActualCostLineInput): Promise<JobManualActualCostLine>;
  softDelete(id: string): Promise<void>;
}
