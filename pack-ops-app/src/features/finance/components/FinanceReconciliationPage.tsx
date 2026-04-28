import { useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceTransactionFilter, ImportedTransaction } from "@/domain/finance/types";
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
  width: "100%",
  minHeight: "42px",
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
  color: brand.text,
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

function monthStart(): string {
  return new Date().toISOString().slice(0, 7) + "-01";
}

function monthEnd(start: string): string {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function FinanceReconciliationPage() {
  const { currentUser } = useAuthContext();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(monthEnd(monthStart()));

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter, {
    reconciliation: accountId ? { accountId, startDate, endDate } : null,
  });
  const accounts = finance.accountsQuery.data ?? [];
  const workspace = finance.reconciliationWorkspaceQuery.data;
  const imports = workspace?.imports ?? [];
  const summary = workspace?.summary ?? { importedTotal: 0, matchedTotal: 0, unmatchedTotal: 0, difference: 0 };
  const transactionById = workspace?.transactionById ?? new Map();
  const categories = finance.categoriesQuery.data ?? [];
  const transactions = finance.transactionsQuery.data ?? [];

  const categoryId = useMemo(() => categories.find((category) => category.type === "expense")?.id ?? categories[0]?.id ?? "", [categories]);

  async function createFromRow(row: ImportedTransaction) {
    try {
      await finance.approveImportedTransaction.mutateAsync({
        ...row,
        suggestedCategoryId: row.suggestedCategoryId ?? categoryId as ImportedTransaction["suggestedCategoryId"],
      });
      setFeedback({ tone: "success", text: "Transaction created from import." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Create transaction failed." });
    }
  }

  async function saveSession() {
    try {
      if (!accountId) {
        throw new Error("Choose an account first.");
      }
      await finance.saveReconciliationSession.mutateAsync({ accountId, startDate, endDate });
      setFeedback({ tone: "success", text: "Reconciliation session saved." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Session save failed." });
    }
  }

  async function completeSession() {
    try {
      if (!workspace?.session) {
        throw new Error("Save the reconciliation session before completing it.");
      }
      await finance.completeReconciliationSession.mutateAsync({
        sessionId: workspace.session.id,
        accountId,
        startDate,
        endDate,
      });
      setFeedback({ tone: "success", text: "Reconciliation completed." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Complete failed." });
    }
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Finance Reconciliation</h1>
          <p style={subtitleStyle()}>Verify imported bank and card activity for an account and statement period before month close.</p>
        </div>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <select style={inputStyle} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Choose account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <input type="date" style={inputStyle} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" style={inputStyle} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          <Stat label="Imported" value={summary.importedTotal} />
          <Stat label="Matched" value={summary.matchedTotal} />
          <Stat label="Unmatched" value={summary.unmatchedTotal} />
          <Stat label="Difference" value={summary.difference} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={primaryButtonStyle()} onClick={() => void saveSession()}>Save session</button>
          <button type="button" style={secondaryButtonStyle()} onClick={() => void completeSession()}>Mark completed</button>
          <span style={badgeStyle("#eef4ff", "#163fcb")}>{workspace?.session?.status ?? "not saved"}</span>
        </div>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <h2 style={sectionTitleStyle()}>Statement Rows</h2>
        {imports.map((row) => {
          const matched = row.matchedTransactionId ? transactionById.get(row.matchedTransactionId) : null;
          return (
            <article key={row.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <strong>{row.rawDescription}</strong>
                  <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                    {row.transactionDate} · {row.rawMemo ?? "No memo"} · {matched ? `Matched to ${matched.memo ?? matched.id}` : "Unmatched"}
                  </div>
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: "6px" }}>
                  <strong>{row.amount < 0 ? "-" : ""}${Math.abs(row.amount).toFixed(2)}</strong>
                  <span style={badgeStyle(row.status === "matched" ? "#ecfdf3" : "#fff7ed", row.status === "matched" ? "#166534" : "#9a3412")}>{row.status}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select
                  style={{ ...inputStyle, width: "min(360px, 100%)" }}
                  value={row.matchedTransactionId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      void finance.markImportedTransactionReconciled.mutateAsync(row.id);
                    }
                  }}
                >
                  <option value="">Match existing transaction</option>
                  {transactions.map((transaction) => (
                    <option key={transaction.id} value={transaction.id}>{transaction.transactionDate} · {transaction.memo ?? transaction.id} · ${transaction.total.toFixed(2)}</option>
                  ))}
                </select>
                <button type="button" style={primaryButtonStyle()} onClick={() => void createFromRow(row)}>Create transaction</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "transfer" })}>Transfer</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "duplicate" })}>Duplicate</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "ignored" })}>Ignore</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransactionReconciled.mutateAsync(row.id)}>Reconciled</button>
              </div>
            </article>
          );
        })}
        {imports.length === 0 ? <p style={{ color: brand.textSoft }}>No imported rows for this account and period.</p> : null}
      </section>
    </section>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", background: brand.surfaceAlt }}>
      <div style={{ color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>{props.label}</div>
      <strong>${props.value.toFixed(2)}</strong>
    </div>
  );
}
