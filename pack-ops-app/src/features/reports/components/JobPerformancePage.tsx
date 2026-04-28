import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import type { Job, JobPerformanceStatDisplay, JobPerformanceSummary } from "@/domain/jobs/types";
import {
  badgeStyle,
  brand,
  cardStyle,
  pageStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { JobPerformanceService } from "@/services/reports/job-performance-service";

function sectionHeadingRow() {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  } satisfies React.CSSProperties;
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function formatHours(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}h`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function statusLabel(status: Job["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadge(status: Job["status"]) {
  switch (status) {
    case "scheduled":
      return badgeStyle("#e8f3ff", "#0b5cad");
    case "in_progress":
      return badgeStyle("#e7f5f2", "#0a4f45");
    case "work_complete":
    case "ready_to_invoice":
    case "invoiced":
    case "closed":
      return badgeStyle("#eef7e8", "#2f6c1f");
    case "waiting":
      return badgeStyle("#fff4e5", "#9a5c00");
    case "cancelled":
      return badgeStyle("#fff0f0", "#9b2525");
    default:
      return badgeStyle("#f0f4f7", "#445168");
  }
}

function varianceText(value: number | null, unit: "hours" | "money"): string {
  if (value === null) {
    return "—";
  }
  if (Math.abs(value) < 0.005) {
    return unit === "hours" ? "On target" : "On budget";
  }

  const direction = value > 0 ? "over" : "under";
  if (unit === "hours") {
    return `${Math.abs(value).toFixed(2)}h ${direction}`;
  }

  return `${formatMoney(Math.abs(value))} ${direction}`;
}

function statToneStyle(tone: JobPerformanceStatDisplay["tone"]) {
  switch (tone) {
    case "good":
      return badgeStyle("#eef7e8", "#2f6c1f");
    case "watch":
      return badgeStyle("#fff4e5", "#9a5c00");
    case "bad":
      return badgeStyle("#fff0f0", "#9b2525");
    case "neutral":
    default:
      return badgeStyle("#f0f4f7", "#445168");
  }
}

function metricCard(label: string, value: string, helper?: string, tone: "default" | "good" | "watch" | "bad" = "default") {
  const background =
    tone === "good" ? "#f6fbf4" : tone === "watch" ? "#fffaf0" : tone === "bad" ? "#fff7f7" : "#fafcff";
  return (
    <div style={{ ...cardStyle(background), padding: "14px" }}>
      <div style={{ color: brand.textSoft, fontSize: "13px" }}>{label}</div>
      <strong style={{ fontSize: "20px" }}>{value}</strong>
      {helper ? <div style={{ color: brand.textSoft, fontSize: "12px", marginTop: "4px" }}>{helper}</div> : null}
    </div>
  );
}

function varianceTone(value: number | null): "default" | "good" | "watch" | "bad" {
  if (value === null || Math.abs(value) < 0.005) {
    return "default";
  }
  return value > 0 ? "bad" : "good";
}

function renderPerformance(performance: JobPerformanceSummary | null) {
  if (!performance) {
    return (
      <section style={cardStyle("#fff7f7")}>
        Financial performance is not available for this user.
      </section>
    );
  }

  const { coreMoney, estimateAccuracy, billingHealth, diagnostics } = performance;

  return (
    <>
      <div style={{ color: brand.textSoft, lineHeight: 1.45 }}>
        {diagnostics.summarySentence}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
        {metricCard("Quoted Value", formatMoney(coreMoney.quotedValue), "Expected charge from quote")}
        {metricCard(
          "Invoiced Revenue",
          formatMoney(coreMoney.invoicedRevenue),
          billingHealth.hasInvoice ? `${billingHealth.invoiceCount} saved invoice${billingHealth.invoiceCount === 1 ? "" : "s"}` : "No actual revenue yet",
          billingHealth.hasInvoice ? "default" : "watch",
        )}
        {metricCard("Collected Revenue", formatMoney(coreMoney.collectedRevenue), `${formatPercent(billingHealth.percentCollectedVsInvoiced)} of invoiced collected`)}
        {metricCard("Outstanding", formatMoney(coreMoney.outstandingRevenue), billingHealth.paymentStatus.replaceAll("-", " "), coreMoney.outstandingRevenue && coreMoney.outstandingRevenue > 0 ? "watch" : "default")}
        {metricCard("Actual Total Cost", formatMoney(coreMoney.actualTotalCost))}
        {metricCard("Actual Gross Profit", formatMoney(coreMoney.actualGrossProfit), `Actual margin ${formatPercent(coreMoney.actualMarginPct)}`, coreMoney.actualGrossProfit !== null && coreMoney.actualGrossProfit < 0 ? "bad" : "default")}
        {metricCard("Projected Gross Profit", formatMoney(coreMoney.projectedGrossProfit), `Projected margin ${formatPercent(coreMoney.projectedMarginPct)}`, coreMoney.projectedGrossProfit !== null && coreMoney.projectedGrossProfit < 0 ? "bad" : "default")}
        {metricCard("Revenue / Hour", formatMoney(coreMoney.revenuePerHour), "Based on invoiced revenue")}
        {metricCard("Gross Profit / Hour", formatMoney(coreMoney.grossProfitPerHour), "Based on actual gross profit")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        {metricCard("Cost Variance", varianceText(estimateAccuracy.costVariance, "money"), `${formatPercent(estimateAccuracy.costVariancePct)} vs estimate`, varianceTone(estimateAccuracy.costVariance))}
        {metricCard("Projected Profit Delta", formatMoney(estimateAccuracy.grossProfitDelta), "Projected profit vs original estimate", varianceTone(estimateAccuracy.grossProfitDelta === null ? null : -estimateAccuracy.grossProfitDelta))}
        {metricCard("Hour Variance", varianceText(estimateAccuracy.hourVariance, "hours"), `${formatHours(estimateAccuracy.actualHours)} actual`, varianceTone(estimateAccuracy.hourVariance))}
        {metricCard("Labour Variance", varianceText(estimateAccuracy.labourVariance, "money"), `${formatPercent(diagnostics.labourCostSharePct)} of actual cost`, varianceTone(estimateAccuracy.labourVariance))}
        {metricCard("Material Variance", varianceText(estimateAccuracy.materialVariance, "money"), `${formatPercent(diagnostics.materialCostSharePct)} of actual cost`, varianceTone(estimateAccuracy.materialVariance))}
        {metricCard("Billing Gap", formatMoney(billingHealth.billingGap), `${formatPercent(billingHealth.percentBilledVsQuote)} billed vs quote`, billingHealth.billingGap !== null && billingHealth.billingGap > 0 ? "watch" : "default")}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {diagnostics.healthBadges.map((badge) => (
          <span key={`${badge.label}-${badge.tone}`} style={statToneStyle(badge.tone)}>
            {badge.label}
          </span>
        ))}
        <span style={badgeStyle("#f8fafc", "#445168")}>last invoice: {formatDate(billingHealth.lastInvoiceDate)}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ color: brand.textSoft, textAlign: "left" }}>
              <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Metric</th>
              <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Quote / Estimate</th>
              <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Actual</th>
              <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Billing</th>
              <th style={{ padding: "8px 0", borderBottom: "1px solid #e4e8f1" }}>Variance / Health</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                metric: "Value / profit",
                quote: formatMoney(coreMoney.quotedValue),
                actual: `Actual profit ${formatMoney(coreMoney.actualGrossProfit)}`,
                billing: formatMoney(coreMoney.invoicedRevenue),
                variance: `Projected profit ${formatMoney(coreMoney.projectedGrossProfit)}`,
              },
              {
                metric: "Total cost",
                quote: formatMoney(estimateAccuracy.estimatedTotalCost),
                actual: formatMoney(coreMoney.actualTotalCost),
                billing: "—",
                variance: varianceText(estimateAccuracy.costVariance, "money"),
              },
              {
                metric: "Labour",
                quote: `${formatHours(estimateAccuracy.estimatedHours)} / ${formatMoney(estimateAccuracy.estimatedLabourCost)}`,
                actual: `${formatHours(estimateAccuracy.actualHours)} / ${formatMoney(estimateAccuracy.actualLabourCost)}`,
                billing: formatMoney(performance.actualLaborRevenue),
                variance: varianceText(estimateAccuracy.labourVariance, "money"),
              },
              {
                metric: "Materials",
                quote: formatMoney(estimateAccuracy.estimatedMaterialCost),
                actual: formatMoney(estimateAccuracy.actualMaterialCost),
                billing: formatMoney(performance.actualMaterialRevenue),
                variance: varianceText(estimateAccuracy.materialVariance, "money"),
              },
              {
                metric: "Collection",
                quote: "—",
                actual: "—",
                billing: `${formatMoney(coreMoney.collectedRevenue)} collected`,
                variance: `${formatPercent(billingHealth.percentCollectedVsInvoiced)} of invoiced`,
              },
            ].map((row) => (
              <tr key={row.metric}>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6", fontWeight: 700 }}>{row.metric}</td>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{row.quote}</td>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{row.actual}</td>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{row.billing}</td>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>{row.variance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function JobPerformancePage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const [filters, setFilters] = useState<{
    archiveScope: "active" | "archived" | "all";
    status: Job["status"] | "";
  }>({
    archiveScope: "active",
    status: "",
  });

  if (!currentUser) {
    return null;
  }

  const service = useMemo(
    () =>
      new JobPerformanceService(
        {
          orgId: currentUser.user.orgId,
          actorUserId: currentUser.user.id,
        },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const reportQuery = useQuery({
    queryKey: ["job-performance-report", currentUser.user.id, filters],
    queryFn: () =>
      service.getJobPerformanceReport({
        archiveScope: filters.archiveScope,
        status: filters.status || null,
      }),
  });

  const report = reportQuery.data;

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Job Performance</h1>
        <p style={subtitleStyle()}>
          Owner-facing job performance reporting with hours, costs, sell, and current margin estimates.
        </p>
      </header>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div style={sectionHeadingRow()}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Filters</h2>
            <p style={{ margin: "4px 0 0", color: brand.textSoft }}>
              Keep the list practical by narrowing to active or archived jobs and a single status when needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters({ archiveScope: "active", status: "" })}
            style={secondaryButtonStyle()}
          >
            Clear Filters
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: brand.textSoft }}>Jobs</span>
            <select
              value={filters.archiveScope}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  archiveScope: event.target.value as typeof current.archiveScope,
                }))
              }
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: brand.textSoft }}>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as Job["status"] | "",
                }))
              }
            >
              <option value="">All statuses</option>
              {(report?.statusOptions ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {report ? (
        <section style={{ display: "grid", gap: "12px" }}>
          <div style={{ color: brand.textSoft, fontSize: "14px" }}>
            {report.rows.length} job{report.rows.length === 1 ? "" : "s"} shown
          </div>

          {report.rows.length === 0 ? (
            <section style={cardStyle()}>
              No jobs match the current filters.
            </section>
          ) : (
            report.rows.map((row) => (
              <article key={row.jobId} style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <strong style={{ fontSize: "18px", lineHeight: 1.2 }}>{row.jobNumber} · {row.title}</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                      {row.isArchived ? <span style={badgeStyle("#f3f5f7", "#445168")}>Archived</span> : null}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: "160px" }}>
                    <div style={{ color: brand.textSoft, fontSize: "13px" }}>Actual Gross Profit</div>
                    <strong style={{ fontSize: "24px", lineHeight: 1.1 }}>{formatMoney(row.performance?.coreMoney.actualGrossProfit ?? null)}</strong>
                    <div style={{ color: brand.textSoft, fontSize: "13px", marginTop: "4px" }}>
                      Actual margin {formatPercent(row.performance?.coreMoney.actualMarginPct ?? null)}
                    </div>
                  </div>
                </div>

                {renderPerformance(row.performance)}
              </article>
            ))
          )}
        </section>
      ) : reportQuery.isLoading ? (
        <section style={cardStyle()}>
          Loading job performance…
        </section>
      ) : (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>Could not load job performance.</div>
        </section>
      )}
    </section>
  );
}
