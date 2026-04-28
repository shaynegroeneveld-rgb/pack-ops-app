import { useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceArInvoice, FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { badgeStyle, brand, cardStyle, pageHeaderStyle, pageStyle, primaryButtonStyle, sectionTitleStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

export function AccountsReceivablePage() {
  const { currentUser } = useAuthContext();
  const [status, setStatus] = useState<"all" | "outstanding" | "overdue">("outstanding");
  const [selectedImportByInvoice, setSelectedImportByInvoice] = useState<Record<string, string>>({});
  const [amountByInvoice, setAmountByInvoice] = useState<Record<string, string>>({});

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { arFilter: { status } });
  const invoices = finance.accountsReceivableQuery.data ?? [];
  const deposits = useMemo(() => (finance.importedTransactionsQuery.data ?? []).filter((row) => row.amount > 0 && row.status !== "matched"), [finance.importedTransactionsQuery.data]);

  function amountFor(invoice: FinanceArInvoice): number {
    const typed = Number(amountByInvoice[invoice.id] ?? "");
    if (Number.isFinite(typed) && typed > 0) {
      return typed;
    }
    const row = deposits.find((candidate) => candidate.id === selectedImportByInvoice[invoice.id]);
    return row ? Math.min(row.amount, invoice.amountOutstanding) : invoice.amountOutstanding;
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Accounts Receivable</h1>
          <p style={subtitleStyle()}>Track invoices owed to you and match incoming bank deposits to invoice balances.</p>
        </div>
        <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All</option>
          <option value="outstanding">Outstanding</option>
          <option value="overdue">Overdue</option>
        </select>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <h2 style={sectionTitleStyle()}>Invoices</h2>
        {invoices.map((invoice) => (
          <article key={invoice.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <strong>{invoice.customerName}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>{invoice.jobLabel ?? "No job"} · Due {invoice.dueDate ?? "not set"}</div>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>Total ${invoice.total.toFixed(2)} · Paid ${invoice.amountPaid.toFixed(2)} · Outstanding ${invoice.amountOutstanding.toFixed(2)}</div>
              </div>
              <span style={badgeStyle(invoice.status === "paid" ? "#ecfdf3" : "#fff7ed", invoice.status === "paid" ? "#166534" : "#9a3412")}>{invoice.status}</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select style={{ ...inputStyle, width: "min(420px, 100%)" }} value={selectedImportByInvoice[invoice.id] ?? ""} onChange={(event) => setSelectedImportByInvoice({ ...selectedImportByInvoice, [invoice.id]: event.target.value })}>
                <option value="">Match imported payment</option>
                {deposits.map((row) => <option key={row.id} value={row.id}>{row.transactionDate} · {row.rawDescription} · ${row.amount.toFixed(2)}</option>)}
              </select>
              <input style={{ ...inputStyle, width: "120px" }} placeholder="Amount" value={amountByInvoice[invoice.id] ?? ""} onChange={(event) => setAmountByInvoice({ ...amountByInvoice, [invoice.id]: event.target.value })} />
              <button type="button" style={primaryButtonStyle()} onClick={() => void finance.matchAccountsReceivablePayment.mutateAsync({
                arInvoiceId: invoice.id,
                importedTransactionId: selectedImportByInvoice[invoice.id] || null,
                amount: amountFor(invoice),
                paidAt: new Date().toISOString().slice(0, 10),
              })}>Apply payment</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
