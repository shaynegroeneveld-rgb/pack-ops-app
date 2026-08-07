import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import {
  brand,
  cardStyle,
  pageStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { BaselineService } from "@/services/reports/baseline-service";

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} days`;
}

function sectionHeader(title: string, description: string) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <h2 style={{ margin: 0, fontSize: "20px" }}>{title}</h2>
      <p style={{ margin: 0, color: brand.textSoft }}>{description}</p>
    </div>
  );
}

function metricCard(label: string, value: string, helper?: string) {
  return (
    <div key={label} style={{ ...cardStyle("#fafcff"), padding: "14px" }}>
      <div style={{ color: brand.textSoft, fontSize: "13px" }}>{label}</div>
      <strong style={{ fontSize: "22px" }}>{value}</strong>
      {helper ? <div style={{ color: brand.textSoft, fontSize: "12px", marginTop: "4px" }}>{helper}</div> : null}
    </div>
  );
}

export function BaselinePage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const [windowMonths, setWindowMonths] = useState(12);

  if (!currentUser) {
    return null;
  }

  const service = useMemo(
    () =>
      new BaselineService(
        { orgId: currentUser.user.orgId, actorUserId: currentUser.user.id },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const baselineQuery = useQuery({
    queryKey: ["financial-baseline", currentUser.user.id, windowMonths],
    queryFn: () => service.getBaseline({ windowMonths }),
  });

  const data = baselineQuery.data;
  const maxMonthRevenue = data ? Math.max(1, ...data.monthlyRevenue.map((month) => month.invoicedRevenue)) : 1;

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Financial Baseline</h1>
        <p style={subtitleStyle()}>
          Revenue by month, by customer, and average job size — the trailing baseline Year 1 asks you to know cold.
        </p>
      </header>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <label style={{ display: "grid", gap: "6px", maxWidth: "220px" }}>
          <span style={{ fontSize: "13px", color: brand.textSoft }}>Window</span>
          <select value={windowMonths} onChange={(event) => setWindowMonths(Number(event.target.value))}>
            <option value={12}>Trailing 12 months</option>
            <option value={24}>Trailing 24 months</option>
          </select>
        </label>
      </section>

      {baselineQuery.isLoading ? (
        <section style={cardStyle()}>Loading baseline…</section>
      ) : baselineQuery.error ? (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>
            {baselineQuery.error instanceof Error ? baselineQuery.error.message : "Could not load the financial baseline."}
          </div>
        </section>
      ) : data ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Overview", `${data.startDate} through ${data.endDate}`)}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {metricCard("Total Invoiced Revenue", formatMoney(data.totalInvoicedRevenue))}
              {metricCard(
                "Average Job Size",
                formatMoney(data.averageJobSize),
                `${data.jobsWithInvoicesCount} invoiced job${data.jobsWithInvoicesCount === 1 ? "" : "s"}`,
              )}
              {metricCard(
                "Average Job Duration",
                formatDays(data.averageJobDurationDays),
                `${data.jobsWithDurationCount} job${data.jobsWithDurationCount === 1 ? "" : "s"} with start/end recorded`,
              )}
              {metricCard(
                "Top 10 Customer Concentration",
                formatPercent(data.top10SharePct),
                `${data.customerCount} customer${data.customerCount === 1 ? "" : "s"} invoiced in window`,
              )}
            </div>
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Revenue By Month", "Invoiced revenue, oldest to newest.")}
            <div style={{ display: "grid", gap: "8px" }}>
              {data.monthlyRevenue.map((month) => (
                <div key={month.month} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: brand.textSoft }}>{month.label}</span>
                  <div style={{ background: "#eef2f6", borderRadius: "8px", height: "18px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.max(2, (month.invoicedRevenue / maxMonthRevenue) * 100)}%`,
                        background: "#163fcb",
                        height: "100%",
                        borderRadius: "8px",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "13px", textAlign: "right" }}>
                    {formatMoney(month.invoicedRevenue)}
                    <span style={{ color: brand.textSoft }}> ({month.invoiceCount})</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Top Customers", "Revenue concentration — how much of your business rides on a few names.")}
            {data.topCustomers.length === 0 ? (
              <div style={{ color: brand.textSoft }}>No invoiced revenue in this window yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: "480px", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ color: brand.textSoft, textAlign: "left" }}>
                      <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Customer</th>
                      <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Invoices</th>
                      <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Revenue</th>
                      <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((customer) => (
                      <tr key={customer.contactId}>
                        <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6", fontWeight: 700 }}>{customer.customerName}</td>
                        <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{customer.invoiceCount}</td>
                        <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{formatMoney(customer.invoicedRevenue)}</td>
                        <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{formatPercent(customer.percentOfTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
