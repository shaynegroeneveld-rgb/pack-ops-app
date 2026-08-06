import type { JobTypeId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface JobType extends AuditedEntity {
  id: JobTypeId;
  orgId: OrgId;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdBy: UserId | null;
}

export interface CreateJobTypeInput {
  name: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateJobTypeInput {
  name?: string;
  notes?: string | null;
  isActive?: boolean;
}
