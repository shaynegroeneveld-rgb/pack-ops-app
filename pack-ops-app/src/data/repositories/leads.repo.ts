import type {
  CreateLeadRecordInput,
  LeadRecord,
  UpdateLeadRecordInput,
} from "@/domain/leads/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface LeadFilter {
  status?: LeadRecord["status"];
}

export type LeadsRepository = Repository<
  LeadRecord,
  CreateLeadRecordInput,
  UpdateLeadRecordInput,
  LeadFilter
>;
