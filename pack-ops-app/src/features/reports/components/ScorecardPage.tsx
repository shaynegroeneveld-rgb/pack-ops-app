import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import {
  brand,
  cardStyle,
  feedbackStyle,
  pageStyle,
  primaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import type { ScorecardData } from "@/services/reports/scorecard-service";
import { ScorecardService } from "@/services/reports/scorecard-service";
import { SettingsService } from "@/services/settings/settings-service";

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function formatHours(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}h`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} days`;
}

function formatDate(value: string): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function inputStyle(): React.CSSProperties {
  return {
    minHeight: "44px",
    borderRadius: "14px",
    border: `1px solid ${brand.border}`,
    padding: "12px 14px",
    fontSize: "16px",
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: brand.text,
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "grid",
    gap: "6px",
    fontSize: "14px",
    color: brand.textMuted,
  };
}

function sectionHeader(title: string, description: string) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <h2 style={{ margin: 0, fontSize: "20px" }}>{title}</h2>
      <p style={{ margin: 0, color: brand.textSoft }}>{description}</p>
    </div>
  );
}

function metricCard(label: string, value: string, target?: string, tone: "default" | "good" | "watch" | "bad" = "default") {
  const background =
    tone === "good" ? "#f6fbf4" : tone === "watch" ? "#fffaf0" : tone === "bad" ? "#fff7f7" : "#fafcff";
  return (
    <div key={label} style={{ ...cardStyle(background), padding: "14px" }}>
      <div style={{ color: brand.textSoft, fontSize: "13px" }}>{label}</div>
      <strong style={{ fontSize: "22px" }}>{value}</strong>
      {target ? <div style={{ color: brand.textSoft, fontSize: "12px", marginTop: "4px" }}>Target: {target}</div> : null}
    </div>
  );
}

function metricGrid(cards: React.ReactNode[]) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
      {cards}
    </div>
  );
}

export function ScorecardPage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [cashDraft, setCashDraft] = useState<{
    cashBankBalance: string;
    cashTaxReserve: string;
    cashOperatingReserveMonths: string;
    cashAsOfDate: string;
  } | null>(null);

  if (!currentUser) {
    return null;
  }

  const isOwner = currentUser.user.role === "owner";

  const service = useMemo(
    () =>
      new ScorecardService(
        { orgId: currentUser.user.orgId, actorUserId: currentUser.user.id },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const settingsService = useMemo(
    () =>
      new SettingsService(
        { orgId: currentUser.user.orgId, actorUserId: currentUser.user.id },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const scorecardQuery = useQuery({
    queryKey: ["scorecard", currentUser.user.id],
    queryFn: () => service.getScorecard(),
  });

  const saveCashSnapshot = useMutation({
    mutationFn: (input: {
      cashBankBalance: number;
      cashTaxReserve: number;
      cashOperatingReserveMonths: number;
      cashAsOfDate: string;
    }) => settingsService.saveCashSnapshot(input),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Cash snapshot saved." });
      setCashDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["scorecard", currentUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not save cash snapshot." });
    },
  });

  function beginEditCash(data: ScorecardData) {
    setCashDraft({
      cashBankBalance: String(data.cash.bankBalance),
      cashTaxReserve: String(data.cash.taxReserve),
      cashOperatingReserveMonths: String(data.cash.operatingReserveMonths),
      cashAsOfDate: data.cash.cashAsOfDate || new Date().toISOString().slice(0, 10),
    });
  }

  const data = scorecardQuery.data;

  return (
    <section style={pageStyle()}>
      <header style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
        <h1 style={titleStyle()}>Weekly Scorecard</h1>
        <p style={subtitleStyle()}>
          Review this at the weekly leadership meeting. One number off target is worth one action item.
        </p>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      {scorecardQuery.isLoading ? (
        <section style={cardStyle()}>Loading scorecard…</section>
      ) : scorecardQuery.error ? (
        <section style={cardStyle()}>
          <div style={{ color: "#8f1d1d" }}>
            {scorecardQuery.error instanceof Error ? scorecardQuery.error.message : "Could not load the scorecard."}
          </div>
        </section>
      ) : data ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Leading", "What's coming into the pipeline this week (since Monday).")}
            {metricGrid([
              metricCard("New Leads", String(data.leading.newLeadsThisWeek), "5–10/week initially"),
              metricCard("Quotes Sent", String(data.leading.quotesSentThisWeek)),
              metricCard("Active Backlog Hours", formatHours(data.leading.activeBacklogHours), "4–8 crew-weeks"),
            ])}
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Conversion", `Trailing ${data.conversion.windowDays} days — how well quotes turn into work.`)}
            {metricGrid([
              metricCard(
                "Quote Turnaround",
                formatDays(data.conversion.quoteTurnaroundDays),
                "<5 business days",
                data.conversion.quoteTurnaroundDays !== null && data.conversion.quoteTurnaroundDays > 5 ? "watch" : "good",
              ),
              metricCard("Quote Close Rate", formatPercent(data.conversion.quoteCloseRate)),
              metricCard("Average Sold Job Value", formatMoney(data.conversion.averageSoldJobValue)),
            ])}
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Delivery", "Whether work in progress is moving cleanly to invoice.")}
            {metricGrid([
              metricCard("Jobs Awaiting Invoice", String(data.delivery.jobsAwaitingInvoice)),
              metricCard("Hours Logged This Week", formatHours(data.delivery.hoursLoggedThisWeek)),
              metricCard(
                "Jobs At A Loss",
                `${data.delivery.jobsAtLoss} of ${data.delivery.jobsWithPerformanceData}`,
                undefined,
                data.delivery.jobsAtLoss > 0 ? "bad" : "good",
              ),
            ])}
          </section>

          <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
            {sectionHeader("Cash", "Bank balance and reserves are manual — update them weekly.")}
            {metricGrid([
              metricCard(
                "A/R Over 30 Days",
                formatMoney(data.cash.arOver30Days),
                "Declining",
                data.cash.arOver30Days > 0 ? "watch" : "good",
              ),
              metricCard("A/P Due", formatMoney(data.cash.apDue)),
              metricCard("Bank Balance", formatMoney(data.cash.bankBalance)),
              metricCard("Tax Reserve", formatMoney(data.cash.taxReserve)),
              metricCard("Operating Reserve", `${data.cash.operatingReserveMonths.toFixed(1)} months`),
            ])}
            <div style={{ color: brand.textSoft, fontSize: "13px" }}>
              Cash snapshot as of {formatDate(data.cash.cashAsOfDate)}
            </div>

            {isOwner ? (
              cashDraft ? (
                <div style={{ ...cardStyle(brand.surfaceAlt), padding: "16px", display: "grid", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
                    <label style={labelStyle()}>
                      <span>Bank Balance</span>
                      <input
                        style={inputStyle()}
                        type="number"
                        step="0.01"
                        value={cashDraft.cashBankBalance}
                        onChange={(event) => setCashDraft((current) => (current ? { ...current, cashBankBalance: event.target.value } : current))}
                      />
                    </label>
                    <label style={labelStyle()}>
                      <span>Tax Reserve</span>
                      <input
                        style={inputStyle()}
                        type="number"
                        step="0.01"
                        value={cashDraft.cashTaxReserve}
                        onChange={(event) => setCashDraft((current) => (current ? { ...current, cashTaxReserve: event.target.value } : current))}
                      />
                    </label>
                    <label style={labelStyle()}>
                      <span>Operating Reserve (months)</span>
                      <input
                        style={inputStyle()}
                        type="number"
                        step="0.1"
                        value={cashDraft.cashOperatingReserveMonths}
                        onChange={(event) =>
                          setCashDraft((current) => (current ? { ...current, cashOperatingReserveMonths: event.target.value } : current))
                        }
                      />
                    </label>
                    <label style={labelStyle()}>
                      <span>As Of</span>
                      <input
                        style={inputStyle()}
                        type="date"
                        value={cashDraft.cashAsOfDate}
                        onChange={(event) => setCashDraft((current) => (current ? { ...current, cashAsOfDate: event.target.value } : current))}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      style={primaryButtonStyle()}
                      disabled={saveCashSnapshot.isPending}
                      onClick={() =>
                        saveCashSnapshot.mutate({
                          cashBankBalance: Number(cashDraft.cashBankBalance) || 0,
                          cashTaxReserve: Number(cashDraft.cashTaxReserve) || 0,
                          cashOperatingReserveMonths: Number(cashDraft.cashOperatingReserveMonths) || 0,
                          cashAsOfDate: cashDraft.cashAsOfDate,
                        })
                      }
                    >
                      {saveCashSnapshot.isPending ? "Saving..." : "Save Cash Snapshot"}
                    </button>
                    <button type="button" onClick={() => setCashDraft(null)} disabled={saveCashSnapshot.isPending}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button type="button" onClick={() => beginEditCash(data)}>
                    Update Cash Snapshot
                  </button>
                </div>
              )
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
