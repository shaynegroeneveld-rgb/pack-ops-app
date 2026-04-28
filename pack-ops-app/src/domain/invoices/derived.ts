import type { Invoice } from "@/domain/invoices/types";

export interface InvoiceDisplayState {
  status: Invoice["status"];
  displayBadge: "neutral" | "info" | "warning" | "success" | "danger";
  daysPastDue: number;
  canRecordPayment: boolean;
  canSendReminder: boolean;
}

export function deriveInvoiceDisplayState(invoice: Invoice, now: Date): InvoiceDisplayState {
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  const dueMs = dueDate ? now.getTime() - dueDate.getTime() : 0;
  const daysPastDue = dueDate ? Math.max(0, Math.floor(dueMs / 86400000)) : 0;

  return {
    status: invoice.status,
    displayBadge:
      invoice.status === "paid"
        ? "success"
        : invoice.status === "overdue"
          ? "danger"
          : invoice.status === "partially_paid"
            ? "warning"
            : invoice.status === "void"
              ? "neutral"
              : "info",
    daysPastDue,
    canRecordPayment: !["paid", "void"].includes(invoice.status),
    canSendReminder: ["sent", "viewed", "partially_paid", "overdue"].includes(invoice.status),
  };
}
