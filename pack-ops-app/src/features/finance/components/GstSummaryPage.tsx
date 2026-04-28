import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, cardStyle, pageHeaderStyle, pageStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

export function GstSummaryPage() {
  const { currentUser } = useAuthContext();
  const [startDate, setStartDate] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { output: { startDate, endDate } });
  const gst = finance.financialOutputQuery.data?.gst;

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>GST Summary</h1>
          <p style={subtitleStyle()}>Basic GST collected and paid from transaction tax fields. This is not a filing workflow.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <Metric label="GST collected" value={gst?.gstCollected ?? 0} />
        <Metric label="GST paid" value={gst?.gstPaid ?? 0} />
        <Metric label="Net GST" value={gst?.netGst ?? 0} />
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
