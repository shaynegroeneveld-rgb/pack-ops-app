import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter } from "@/domain/finance/types";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";
import {
  badgeStyle,
  brand,
  cardStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";

const emptyFilter: FinanceTransactionFilter = {
  search: "",
  type: "all",
  status: "all",
  accountId: "all",
  categoryId: "all",
};

const inputStyle = {
  minHeight: "42px",
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
};

export function MonthlyClosePage() {
  const { currentUser } = useAuthContext();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, { month: `${month}-01` });
  const workspace = finance.monthlyCloseWorkspaceQuery.data;
  const validation = workspace?.validation;
  const metrics = workspace?.metrics;
  const close = workspace?.close;
  const blockerRows = [
    ["Unreconciled imports", validation?.unreconciledImports ?? 0],
    ["Missing receipts", validation?.missingReceipts ?? 0],
    ["Draft transactions", validation?.draftTransactions ?? 0],
    ["Possible duplicates", validation?.possibleDuplicates ?? 0],
    ["Snoozed review items", validation?.snoozedReviewItems ?? 0],
  ].filter(([, value]) => Number(value) > 0);
  const isReadyToClose = blockerRows.length === 0;

  async function setStatus(status: "open" | "in_progress" | "closed") {
    try {
      await finance.updateMonthlyCloseStatus.mutateAsync({ month: `${month}-01`, status });
      setFeedback({ tone: "success", text: status === "closed" ? "Month closed and locked." : "Monthly close status updated." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Monthly close update failed." });
    }
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Monthly Close</h1>
          <p style={subtitleStyle()}>Review month-end issues, move the close through status, and lock a completed month.</p>
        </div>
        <input type="month" style={inputStyle} value={month} onChange={(event) => setMonth(event.target.value)} />
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}
      {workspace?.isLocked ? (
        <div style={feedbackStyle("success")}>This month is closed. Finance edits in this period should be treated as locked unless an authorized reopen flow is added.</div>
      ) : null}
      {!workspace?.isLocked ? (
        <div style={feedbackStyle(isReadyToClose ? "success" : "error")}>
          <strong>{isReadyToClose ? "Ready to close" : "Issues remaining"}</strong>
          {!isReadyToClose ? (
            <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {blockerRows.map(([label, value]) => <span key={label}>{label}: {value}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={sectionTitleStyle()}>Close Checklist</h2>
          <span style={badgeStyle(close?.status === "closed" ? "#ecfdf3" : "#eef4ff", close?.status === "closed" ? "#166534" : "#163fcb")}>{close?.status ?? "open"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
          <Count label="Revenue" value={metrics?.revenue ?? 0} money />
          <Count label="Expenses" value={metrics?.expenses ?? 0} money />
          <Count label="Profit" value={metrics?.profit ?? 0} money />
          <Count label="GST" value={metrics?.gst ?? 0} money />
          <Count label="Outstanding A/R" value={metrics?.outstandingAr ?? 0} money />
          <Count label="Outstanding A/P" value={metrics?.outstandingAp ?? 0} money />
          <Count label="Transactions" value={metrics?.transactionCount ?? 0} />
          <Count label="Missing receipts metric" value={metrics?.missingReceiptsCount ?? 0} />
          <Count label="Unreconciled imports" value={validation?.unreconciledImports ?? 0} />
          <Count label="Missing receipts" value={validation?.missingReceipts ?? 0} />
          <Count label="Uncategorized transactions" value={validation?.uncategorizedTransactions ?? 0} />
          <Count label="Draft transactions" value={validation?.draftTransactions ?? 0} />
          <Count label="Outstanding invoices" value={validation?.outstandingInvoices ?? 0} />
          <Count label="Outstanding bills" value={validation?.outstandingBills ?? 0} />
          <Count label="Possible duplicates" value={validation?.possibleDuplicates ?? 0} />
          <Count label="Snoozed review items" value={validation?.snoozedReviewItems ?? 0} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={secondaryButtonStyle()} onClick={() => void setStatus("open")}>Open</button>
          <button type="button" style={secondaryButtonStyle()} onClick={() => void setStatus("in_progress")}>In progress</button>
          <button type="button" style={primaryButtonStyle()} onClick={() => void setStatus("closed")}>Close and lock month</button>
        </div>
      </section>
    </section>
  );
}

function Count(props: { label: string; value: number; money?: boolean }) {
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", background: props.value > 0 ? "#fff7ed" : brand.surfaceAlt }}>
      <div style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{props.label}</div>
      <strong>{props.money ? `$${props.value.toFixed(2)}` : props.value}</strong>
    </div>
  );
}
