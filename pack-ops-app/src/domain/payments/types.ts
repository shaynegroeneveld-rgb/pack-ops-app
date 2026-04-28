import type { PaymentMethod } from "@/domain/enums";
import type { InvoiceId, OrgId, PaymentId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface Payment extends AuditedEntity {
  id: PaymentId;
  orgId: OrgId;
  invoiceId: InvoiceId;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdBy: UserId | null;
}
