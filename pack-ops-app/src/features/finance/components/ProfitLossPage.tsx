import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import {
  brand,
  cardStyle,
  pageHeaderStyle,
  pageStyle,
  sectionTitleStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

function defaultStart() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function defaultEnd(start: string) {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function ProfitLossPage() {
  const { currentUser } = useAuthContext();
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(defaultEnd(defaultStart()));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { output: { startDate, endDate } });
  const summary = finance.financialOutputQuery.data?.profitLoss;

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Profit & Loss</h1>
          <p style={subtitleStyle()}>A clear operating view from posted finance transactions.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
          <Metric label="Revenue" value={summary?.revenue ?? 0} />
          <Metric label="Expenses" value={summary?.expenses ?? 0} />
          <Metric label="Net profit" value={summary?.netProfit ?? 0} />
        </div>
        <h2 style={sectionTitleStyle()}>Category Breakdown</h2>
        <div style={{ display: "grid", gap: "8px" }}>
          {(summary?.categoryBreakdown ?? []).map((row) => (
            <div key={`${row.type}-${row.categoryId ?? row.categoryName}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", borderBottom: `1px solid ${brand.border}`, paddingBottom: "8px" }}>
              <span>{row.categoryName}</span>
              <span>{row.type}</span>
              <strong>${row.total.toFixed(2)}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", background: brand.surfaceAlt }}>
      <div style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{props.label}</div>
      <strong>${props.value.toFixed(2)}</strong>
    </div>
  );
}
