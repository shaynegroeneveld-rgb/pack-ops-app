import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { AccountsPayablePage } from "@/features/finance/components/AccountsPayablePage";
import { AccountsReceivablePage } from "@/features/finance/components/AccountsReceivablePage";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, cardStyle, chipStyle, pageStyle } from "@/features/shared/ui/mobile-styles";

type RpTab = "receivables" | "payables";
const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };

export function ReceivablesPayablesPage({ initialTab = "receivables" }: { initialTab?: RpTab }) {
  const { currentUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState<RpTab>(initialTab);
  const finance = currentUser ? useFinanceSlice(currentUser, emptyFilter, {
    arFilter: { status: "outstanding" },
    apFilter: { status: "outstanding" },
  }) : null;
  const ar = finance?.accountsReceivableQuery.data ?? [];
  const ap = finance?.accountsPayableQuery.data ?? [];
  const totalAr = ar.reduce((sum, invoice) => sum + invoice.amountOutstanding, 0);
  const overdueAr = ar.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + invoice.amountOutstanding, 0);
  const totalAp = ap.reduce((sum, bill) => sum + bill.amountOutstanding, 0);

  return (
    <section style={pageStyle()}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <Summary label="Outstanding A/R" value={totalAr} />
        <Summary label="Overdue A/R" value={overdueAr} />
        <Summary label="A/P due" value={totalAp} />
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", borderBottom: `1px solid ${brand.border}`, paddingBottom: "12px" }}>
        <button type="button" style={chipStyle(activeTab === "receivables")} onClick={() => setActiveTab("receivables")}>Accounts Receivable</button>
        <button type="button" style={chipStyle(activeTab === "payables")} onClick={() => setActiveTab("payables")}>Accounts Payable</button>
      </div>
      <div style={{ margin: "-22px" }}>
        {activeTab === "receivables" ? <AccountsReceivablePage /> : <AccountsPayablePage />}
      </div>
    </section>
  );
}

function Summary(props: { label: string; value: number }) {
  return (
    <div style={{ ...cardStyle(), boxShadow: "none", padding: "12px" }}>
      <div style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{props.label}</div>
      <strong>${props.value.toFixed(2)}</strong>
    </div>
  );
}
