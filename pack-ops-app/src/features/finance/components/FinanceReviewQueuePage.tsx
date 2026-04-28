import { type ChangeEvent, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import type { FinanceDocumentIntake, FinanceTransactionFilter, ImportedTransaction } from "@/domain/finance/types";
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

export function FinanceReviewQueuePage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkContactId, setBulkContactId] = useState("");

  if (!currentUser) {
    return null;
  }

  const user = currentUser.user;
  const finance = useFinanceSlice(currentUser, emptyFilter);
  const queue = finance.reviewQueueQuery.data?.items ?? [];
  const matches = finance.reviewQueueQuery.data?.matches ?? [];
  const imports = finance.importedTransactionsQuery.data ?? [];
  const documents = finance.documentIntakeQuery.data ?? [];
  const contacts = finance.contactsQuery.data ?? [];
  const categories = finance.categoriesQuery.data ?? [];
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents]);
  const importsById = useMemo(() => new Map(imports.map((row) => [row.id, row])), [imports]);
  const matchByImportId = useMemo(() => new Map(matches.map((match) => [match.importedTransactionId, match])), [matches]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function runBulk(action: "approve" | "ignored" | "duplicate" | "transfer") {
    try {
      const payload: Parameters<typeof finance.bulkReviewImportedTransactions.mutateAsync>[0] = {
        ids: [...selectedIds],
        action,
      };
      if (bulkCategoryId) {
        payload.categoryId = bulkCategoryId;
      }
      if (bulkContactId) {
        payload.contactId = bulkContactId;
      }
      await finance.bulkReviewImportedTransactions.mutateAsync({
        ...payload,
      });
      setSelectedIds(new Set());
      setFeedback({ tone: "success", text: "Bulk action applied." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Bulk action failed." });
    }
  }

  async function uploadReceiptForImport(row: ImportedTransaction, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const storagePath = `${user.orgId}/finance-receipts/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await client.storage.from("documents").upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) {
        throw uploadError;
      }
      const document = await finance.createDocumentIntake.mutateAsync({
        fileName: file.name,
        storagePath,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        extractedVendor: row.rawDescription,
        extractedDate: row.transactionDate,
        extractedTotal: Math.abs(row.amount),
      });
      await finance.linkImportToDocument.mutateAsync({
        importedTransactionId: row.id,
        documentIntakeId: document.id,
      });
      setFeedback({ tone: "success", text: "Receipt uploaded and linked." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Receipt upload failed." });
    }
  }

  function bestDocumentFor(row: ImportedTransaction): FinanceDocumentIntake | null {
    const match = matchByImportId.get(row.id);
    return match ? documentsById.get(match.documentIntakeId) ?? null : null;
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Finance Review Queue</h1>
          <p style={subtitleStyle()}>Work the exceptions: unmatched imports, missing receipts, likely duplicates, possible transfers, and receipt-document matches.</p>
        </div>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "12px", marginBottom: "16px" }}>
        <h2 style={sectionTitleStyle()}>Bulk Review</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <select style={inputStyle} value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)}>
            <option value="">Set category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select style={inputStyle} value={bulkContactId} onChange={(event) => setBulkContactId(event.target.value)}>
            <option value="">Set contact</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: brand.textSoft, fontSize: "13px" }}>{selectedIds.size} imports selected</span>
          <button type="button" style={primaryButtonStyle()} disabled={selectedIds.size === 0} onClick={() => void runBulk("approve")}>Approve selected</button>
          <button type="button" style={secondaryButtonStyle()} disabled={selectedIds.size === 0} onClick={() => void runBulk("ignored")}>Ignore</button>
          <button type="button" style={secondaryButtonStyle()} disabled={selectedIds.size === 0} onClick={() => void runBulk("duplicate")}>Duplicate</button>
          <button type="button" style={secondaryButtonStyle()} disabled={selectedIds.size === 0} onClick={() => void runBulk("transfer")}>Transfer</button>
        </div>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <h2 style={sectionTitleStyle()}>Queue</h2>
        {queue.map((item) => {
          const row = item.importedTransactionId ? importsById.get(item.importedTransactionId) ?? null : null;
          const bestDocument = row ? bestDocumentFor(row) : null;
          const isImportSelectable = Boolean(row);

          return (
            <article key={item.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isImportSelectable ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row!.id)}
                        onChange={() => toggleSelected(row!.id)}
                      />
                    ) : null}
                    <strong>{item.title}</strong>
                  </label>
                  <span style={{ color: brand.textSoft, fontSize: "13px" }}>{item.detail}</span>
                  <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                    {item.date ?? "No date"} · {item.amount == null ? "No amount" : `$${Math.abs(item.amount).toFixed(2)}`} · confidence {item.confidence == null ? "n/a" : `${Math.round(item.confidence * 100)}%`}
                  </span>
                </div>
                <span style={badgeStyle("#eef4ff", "#163fcb")}>{item.kind.replaceAll("_", " ")}</span>
              </div>

              {row && item.kind === "missing_receipt" ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <label style={secondaryButtonStyle()}>
                    Upload receipt
                    <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={(event) => void uploadReceiptForImport(row, event)} />
                  </label>
                  {bestDocument ? (
                    <button type="button" style={primaryButtonStyle()} onClick={() => void finance.linkImportToDocument.mutateAsync({ importedTransactionId: row.id, documentIntakeId: bestDocument.id })}>
                      Link {bestDocument.fileName}
                    </button>
                  ) : null}
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.updateImportedReceiptStatus.mutateAsync({ id: row.id, receiptStatus: "not_required" })}>Receipt not required</button>
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.updateImportedReceiptStatus.mutateAsync({ id: row.id, receiptStatus: "snoozed", snoozedUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) })}>Review later</button>
                </div>
              ) : null}

              {row && item.kind === "import_document_match" && item.documentIntakeId ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" style={primaryButtonStyle()} onClick={() => void finance.linkImportToDocument.mutateAsync({ importedTransactionId: row.id, documentIntakeId: item.documentIntakeId! })}>Link import to document</button>
                  <button type="button" style={primaryButtonStyle()} onClick={() => void finance.finalizeMatchedImport.mutateAsync({ importedTransactionId: row.id, documentIntakeId: item.documentIntakeId! })}>Finalize transaction</button>
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.rejectImportDocumentSuggestion.mutateAsync(row.id)}>Reject suggestion</button>
                </div>
              ) : null}

              {row && item.kind !== "missing_receipt" && item.kind !== "import_document_match" ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" style={primaryButtonStyle()} onClick={() => void finance.approveImportedTransaction.mutateAsync(row)}>Approve</button>
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "transfer" })}>Transfer</button>
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "duplicate" })}>Duplicate</button>
                  <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.markImportedTransaction.mutateAsync({ id: row.id, status: "ignored" })}>Ignore</button>
                </div>
              ) : null}
            </article>
          );
        })}
        {queue.length === 0 ? <p style={{ color: brand.textSoft }}>Nothing needs review right now.</p> : null}
      </section>
    </section>
  );
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}
