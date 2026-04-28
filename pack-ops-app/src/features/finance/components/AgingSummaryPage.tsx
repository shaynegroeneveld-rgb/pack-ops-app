import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceAgingSummary, FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, cardStyle, pageHeaderStyle, pageStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

function defaultStart() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export function AgingSummaryPage({ type }: { type: "ar" | "ap" }) {
  const { currentUser } = useAuthContext();
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { output: { startDate, endDate } });
  const aging: FinanceAgingSummary | undefined = type === "ar"
    ? finance.financialOutputQuery.data?.arAging
    : finance.financialOutputQuery.data?.apAging;

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>{type === "ar" ? "A/R Aging" : "A/P Aging"}</h1>
          <p style={subtitleStyle()}>
            {type === "ar" ? "Outstanding customer invoices by age." : "Outstanding vendor bills by age."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <strong>Total outstanding: ${(aging?.totalOutstanding ?? 0).toFixed(2)}</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          {(aging?.buckets ?? []).map((bucket) => (
            <div key={bucket.label} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", background: brand.surfaceAlt }}>
              <div style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{bucket.label.replace("_", " ")}</div>
              <strong>${bucket.total.toFixed(2)}</strong>
              <div style={{ color: brand.textSoft, fontSize: "13px" }}>{bucket.count} item{bucket.count === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
