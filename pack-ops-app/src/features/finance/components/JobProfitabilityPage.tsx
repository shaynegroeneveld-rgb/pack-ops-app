import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, cardStyle, pageHeaderStyle, pageStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

export function JobProfitabilityPage() {
  const { currentUser } = useAuthContext();
  const [startDate, setStartDate] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { output: { startDate, endDate } });
  const rows = finance.financialOutputQuery.data?.jobProfitability ?? [];

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Job Profitability</h1>
          <p style={subtitleStyle()}>Simple job-level revenue and cost aggregation from linked finance transactions.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </header>
      <section style={{ ...cardStyle(), overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
          <thead><tr>{["Job", "Revenue", "Materials", "Labour", "Subs", "Cost", "Profit", "Margin"].map((heading) => <th key={heading} style={{ textAlign: "left", borderBottom: `1px solid ${brand.border}`, padding: "8px" }}>{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.jobId ?? row.jobNumber}>
                <td style={{ padding: "8px" }}>{row.jobNumber} · {row.jobTitle}</td>
                <td style={{ padding: "8px" }}>${row.revenue.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>${row.materials.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>${row.labour.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>${row.subcontractors.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>${row.totalCost.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>${row.profit.toFixed(2)}</td>
                <td style={{ padding: "8px" }}>{row.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
