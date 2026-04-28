import { type ChangeEvent, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { FinanceAccount, FinanceTransactionFilter } from "@/domain/finance/types";
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

const emptyFilter: FinanceTransactionFilter = {
  search: "",
  type: "all",
  status: "all",
  accountId: "all",
  categoryId: "all",
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseMoney(value: string | undefined): number {
  const normalized = (value ?? "").replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0] ?? "").map((value) => value.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const value = (names: string[]) => {
      const index = header.findIndex((candidate) => names.some((name) => candidate.includes(name)));
      return index >= 0 ? cells[index] : "";
    };
    const debit = parseMoney(value(["debit", "withdrawal", "outflow"]));
    const credit = parseMoney(value(["credit", "deposit", "inflow"]));
    const amount = value(["amount"])
      ? parseMoney(value(["amount"]))
      : credit > 0
        ? credit
        : -Math.abs(debit);
    return {
      transactionDate: value(["date"]) || new Date().toISOString().slice(0, 10),
      rawDescription: value(["description", "name", "vendor", "payee"]) || "Imported transaction",
      rawMemo: value(["memo", "reference", "ref"]) || null,
      amount,
    };
  });
}

export function FinanceImportsPage() {
  const { currentUser } = useAuthContext();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [sourceType, setSourceType] = useState<"bank" | "credit_card">("bank");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReturnType<typeof parseCsv>>([]);

  if (!currentUser) {
    return null;
  }

  const finance = useFinanceSlice(currentUser, emptyFilter);
  const accounts = useMemo(() => finance.accountsQuery.data ?? [], [finance.accountsQuery.data]);
  const imports = useMemo(() => finance.importedTransactionsQuery.data ?? [], [finance.importedTransactionsQuery.data]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map((finance.categoriesQuery.data ?? []).map((category) => [category.id, category])), [finance.categoriesQuery.data]);
  const contactById = useMemo(() => new Map((finance.contactsQuery.data ?? []).map((contact) => [contact.id, contact])), [finance.contactsQuery.data]);
  const jobById = useMemo(() => new Map((finance.jobsQuery.data ?? []).map((job) => [job.id, job])), [finance.jobsQuery.data]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setRows(parseCsv(text));
  }

  async function handleImport() {
    try {
      if (!selectedAccountId) {
        throw new Error("Choose a source account first.");
      }
      await finance.importCsvBatch.mutateAsync({
        sourceAccountId: selectedAccountId as FinanceAccount["id"],
        sourceType,
        fileName: fileName || "bank-import.csv",
        rows,
      });
      setRows([]);
      setFileName("");
      setFeedback({ tone: "success", text: "CSV rows imported for review." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Import failed." });
    }
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Finance Imports</h1>
          <p style={subtitleStyle()}>Bring bank and card activity in first, then approve only the rows that are ready.</p>
        </div>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "14px", marginBottom: "16px" }}>
        <h2 style={sectionTitleStyle()}>CSV Import</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
            Source account
            <select style={inputStyle} value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
              <option value="">Choose account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
            Source type
            <select style={inputStyle} value={sourceType} onChange={(event) => setSourceType(event.target.value as "bank" | "credit_card")}>
              <option value="bank">Bank</option>
              <option value="credit_card">Credit card</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
            CSV file
            <input style={inputStyle} type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} />
          </label>
        </div>
        {rows.length > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: brand.textSoft }}>{rows.length} rows parsed from {fileName}</span>
            <button type="button" style={primaryButtonStyle()} onClick={() => void handleImport()}>Import for review</button>
          </div>
        ) : null}
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <h2 style={sectionTitleStyle()}>Review Imported Rows</h2>
        {imports.map((row) => (
          <article key={row.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <strong>{row.rawDescription}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                  {row.transactionDate} · {accountById.get(row.sourceAccountId)?.name ?? "Account"} · {row.rawMemo ?? "No memo"}
                </div>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                  Suggested: {row.suggestedContactId ? contactById.get(row.suggestedContactId)?.displayName ?? "no contact" : "no contact"} · {row.suggestedCategoryId ? categoryById.get(row.suggestedCategoryId)?.name ?? "no category" : "no category"} · {row.suggestedJobId ? jobById.get(row.suggestedJobId)?.number ?? "no job" : "no job"}
                </div>
                {row.suggestionReason ? <div style={{ color: brand.textSoft, fontSize: "12px" }}>{row.suggestionReason}</div> : null}
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: "6px" }}>
                <strong>{row.amount < 0 ? "-" : ""}${Math.abs(row.amount).toFixed(2)}</strong>
                <span style={badgeStyle(row.status === "matched" ? "#ecfdf3" : "#eef4ff", row.status === "matched" ? "#166534" : "#163fcb")}>{row.status}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" style={primaryButtonStyle()} disabled={row.status === "matched"} onClick={() => void finance.approveImportedTransaction.mutateAsync(row)}>Approve</button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "transfer" })}>Transfer</button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "duplicate" })}>Duplicate</button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "ignored" })}>Ignore</button>
            </div>
          </article>
        ))}
        {imports.length === 0 ? <p style={{ color: brand.textSoft }}>No imported rows yet.</p> : null}
      </section>
    </section>
  );
}
