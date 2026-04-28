import { useState } from "react";

import { DocumentInboxPage } from "@/features/finance/components/DocumentInboxPage";
import { FinanceImportsPage } from "@/features/finance/components/FinanceImportsPage";
import { FinanceReviewQueuePage } from "@/features/finance/components/FinanceReviewQueuePage";
import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, chipStyle, pageStyle, primaryButtonStyle, secondaryButtonStyle } from "@/features/shared/ui/mobile-styles";

type ReviewTab = "queue" | "imports" | "documents";
const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };

export function FinanceReviewPage({ initialTab = "queue" }: { initialTab?: ReviewTab }) {
  const { currentUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState<ReviewTab>(initialTab);
  const finance = currentUser ? useFinanceSlice(currentUser, emptyFilter) : null;
  const quickRows = (finance?.importedTransactionsQuery.data ?? [])
    .filter((row) => row.status === "new" || row.status === "needs_review" || row.receiptStatus === "missing")
    .slice(0, 5);

  return (
    <section style={pageStyle()}>
      {quickRows.length > 0 ? (
        <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
          {quickRows.map((row) => (
            <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap", border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "10px", background: "#fff" }}>
              <div>
                <strong>{row.rawDescription}</strong>
                <span style={{ marginLeft: "8px", color: brand.textSoft, fontSize: "13px" }}>{row.transactionDate} · ${Math.abs(row.amount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button type="button" style={primaryButtonStyle()} onClick={() => void finance?.approveImportedTransaction.mutateAsync(row)}>Approve</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance?.markImportedTransaction.mutateAsync({ id: row.id, status: "ignored" })}>Ignore</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance?.updateImportedReceiptStatus.mutateAsync({ id: row.id, receiptStatus: "not_required" })}>Receipt not required</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <GroupedNav
        tabs={[
          ["queue", "Review"],
          ["imports", "Imports"],
          ["documents", "Document Inbox"],
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      <div style={{ margin: "-22px" }}>
        {activeTab === "queue" ? <FinanceReviewQueuePage /> : null}
        {activeTab === "imports" ? <FinanceImportsPage /> : null}
        {activeTab === "documents" ? <DocumentInboxPage /> : null}
      </div>
    </section>
  );
}

function GroupedNav<TTab extends string>(props: {
  tabs: Array<[TTab, string]>;
  activeTab: TTab;
  onChange: (tab: TTab) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", borderBottom: `1px solid ${brand.border}`, paddingBottom: "12px" }}>
      {props.tabs.map(([tab, label]) => (
        <button key={tab} type="button" style={chipStyle(props.activeTab === tab)} onClick={() => props.onChange(tab)}>
          {label}
        </button>
      ))}
    </div>
  );
}
