import type { ExpenseCategory, ExpenseStatus } from "@/domain/enums";
import type { ExpenseId, JobId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Expense extends AuditedEntity {
  id: ExpenseId;
  orgId: OrgId;
  jobId: JobId | null;
  status: ExpenseStatus;
  category: ExpenseCategory;
  amount: number;
  description: string;
  submittedBy: UserId;
  approvedBy: UserId | null;
  approvedAt: string | null;
}
