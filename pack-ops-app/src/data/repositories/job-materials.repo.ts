import type { JobMaterialEntry } from "@/domain/jobs/types";

export interface JobMaterialFilter {
  jobId?: string;
  kind?: JobMaterialEntry["kind"];
}

export interface CreateJobMaterialInput {
  jobId: string;
  catalogItemId: string;
  kind: JobMaterialEntry["kind"];
  quantity: number;
  note?: string | null;
  displayName?: string | null;
  skuSnapshot?: string | null;
  unitSnapshot?: string | null;
  unitCost?: number | null;
  unitSell?: number | null;
  markupPercent?: number | null;
  sectionName?: string | null;
  sourceAssemblyId?: string | null;
  sourceAssemblyName?: string | null;
  sourceAssemblyMultiplier?: number | null;
}

export interface UpdateJobMaterialInput {
  catalogItemId?: string;
  quantity?: number;
  note?: string | null;
  displayName?: string | null;
  skuSnapshot?: string | null;
  unitSnapshot?: string | null;
  unitCost?: number | null;
  unitSell?: number | null;
  markupPercent?: number | null;
  sectionName?: string | null;
  sourceAssemblyId?: string | null;
  sourceAssemblyName?: string | null;
  sourceAssemblyMultiplier?: number | null;
}

export interface JobMaterialsRepository {
  list(options?: { filter?: JobMaterialFilter }): Promise<JobMaterialEntry[]>;
  create(input: CreateJobMaterialInput): Promise<JobMaterialEntry>;
  update(id: string, input: UpdateJobMaterialInput): Promise<JobMaterialEntry>;
  softDelete(id: string): Promise<void>;
}
