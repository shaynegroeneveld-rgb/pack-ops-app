import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import { brand, cardStyle, pageHeaderStyle, pageStyle, subtitleStyle, titleStyle } from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = { search: "", type: "all", status: "all", accountId: "all", categoryId: "all" };
const inputStyle = { minHeight: "42px", border: `1px solid ${brand.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px" };

export function ExpenseByCategoryPage() {
  const { currentUser } = useAuthContext();
  const [startDate, setStartDate] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { output: { startDate, endDate } });
  const summary = finance.financialOutputQuery.data?.expenseCategories;

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Expense by Category</h1>
          <p style={subtitleStyle()}>Where the money went, grouped from expense transactions.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </header>
      <section style={{ ...cardStyle(), display: "grid", gap: "10px" }}>
        <strong>Total expenses: ${(summary?.totalExpenses ?? 0).toFixed(2)}</strong>
        {(summary?.rows ?? []).map((row) => (
          <div key={row.categoryId ?? row.categoryName} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", borderBottom: `1px solid ${brand.border}`, padding: "8px 0" }}>
            <span>{row.categoryName}</span>
            <span>{row.percentage.toFixed(1)}%</span>
            <strong>${row.total.toFixed(2)}</strong>
          </div>
        ))}
      </section>
    </section>
  );
}
