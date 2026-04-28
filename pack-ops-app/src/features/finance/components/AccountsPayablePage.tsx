import { useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceApBill, FinanceDocumentIntake, FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { badgeStyle, brand, cardStyle, pageHeaderStyle, pageStyle, primaryButtonStyle, secondaryButtonStyle, sectionTitleStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

export function AccountsPayablePage() {
  const { currentUser } = useAuthContext();
  const [status, setStatus] = useState<"all" | "outstanding" | "overdue">("outstanding");
  const [draft, setDraft] = useState({ vendorName: "", billDate: new Date().toISOString().slice(0, 10), dueDate: "", subtotal: "", tax: "", total: "", documentIntakeId: "" });
  const [selectedImportByBill, setSelectedImportByBill] = useState<Record<string, string>>({});

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { apFilter: { status } });
  const bills = finance.accountsPayableQuery.data ?? [];
  const expenseImports = useMemo(() => (finance.importedTransactionsQuery.data ?? []).filter((row) => row.amount < 0 && row.status !== "matched"), [finance.importedTransactionsQuery.data]);
  const documents = finance.documentIntakeQuery.data ?? [];

  function fillFromDocument(document: FinanceDocumentIntake) {
    setDraft({
      vendorName: document.extractedVendor ?? document.fileName,
      billDate: document.extractedDate ?? new Date().toISOString().slice(0, 10),
      dueDate: "",
      subtotal: document.extractedSubtotal?.toString() ?? "",
      tax: document.extractedTax?.toString() ?? "",
      total: document.extractedTotal?.toString() ?? "",
      documentIntakeId: document.id,
    });
  }

  function amountFor(bill: FinanceApBill): number {
    const row = expenseImports.find((candidate) => candidate.id === selectedImportByBill[bill.id]);
    return row ? Math.min(Math.abs(row.amount), bill.amountOutstanding) : bill.amountOutstanding;
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Accounts Payable</h1>
          <p style={subtitleStyle()}>Track vendor bills, link document inbox items, and match outgoing card or bank payments.</p>
        </div>
        <select style={inputStyle} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All</option>
          <option value="outstanding">Outstanding</option>
          <option value="overdue">Overdue</option>
        </select>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <h2 style={sectionTitleStyle()}>New Bill</h2>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {documents.slice(0, 5).map((document) => <button key={document.id} type="button" style={secondaryButtonStyle()} onClick={() => fillFromDocument(document)}>Use {document.fileName}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          <input style={inputStyle} placeholder="Vendor" value={draft.vendorName} onChange={(event) => setDraft({ ...draft, vendorName: event.target.value })} />
          <input type="date" style={inputStyle} value={draft.billDate} onChange={(event) => setDraft({ ...draft, billDate: event.target.value })} />
          <input type="date" style={inputStyle} value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
          <input style={inputStyle} placeholder="Subtotal" value={draft.subtotal} onChange={(event) => setDraft({ ...draft, subtotal: event.target.value })} />
          <input style={inputStyle} placeholder="Tax" value={draft.tax} onChange={(event) => setDraft({ ...draft, tax: event.target.value })} />
          <input style={inputStyle} placeholder="Total" value={draft.total} onChange={(event) => setDraft({ ...draft, total: event.target.value })} />
        </div>
        <button type="button" style={primaryButtonStyle()} onClick={() => void finance.createAccountsPayableBill.mutateAsync({
          vendorName: draft.vendorName,
          billDate: draft.billDate,
          dueDate: draft.dueDate || null,
          subtotal: Number(draft.subtotal || 0),
          tax: Number(draft.tax || 0),
          total: Number(draft.total || 0),
          documentIntakeId: draft.documentIntakeId ? draft.documentIntakeId as FinanceDocumentIntake["id"] : null,
        })}>Create bill</button>
      </section>
      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <h2 style={sectionTitleStyle()}>Bills</h2>
        {bills.map((bill) => (
          <article key={bill.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <strong>{bill.vendorName}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>Due {bill.dueDate ?? "not set"} · Total ${bill.total.toFixed(2)} · Outstanding ${bill.amountOutstanding.toFixed(2)}</div>
              </div>
              <span style={badgeStyle(bill.status === "paid" ? "#ecfdf3" : "#fff7ed", bill.status === "paid" ? "#166534" : "#9a3412")}>{bill.status}</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select style={{ ...inputStyle, width: "min(420px, 100%)" }} value={selectedImportByBill[bill.id] ?? ""} onChange={(event) => setSelectedImportByBill({ ...selectedImportByBill, [bill.id]: event.target.value })}>
                <option value="">Match imported payment</option>
                {expenseImports.map((row) => <option key={row.id} value={row.id}>{row.transactionDate} · {row.rawDescription} · ${Math.abs(row.amount).toFixed(2)}</option>)}
              </select>
              <button type="button" style={primaryButtonStyle()} onClick={() => void finance.matchAccountsPayablePayment.mutateAsync({
                apBillId: bill.id,
                importedTransactionId: selectedImportByBill[bill.id] || null,
                amount: amountFor(bill),
                paidAt: new Date().toISOString().slice(0, 10),
              })}>Apply payment</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
