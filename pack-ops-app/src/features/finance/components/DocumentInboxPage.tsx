import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import type { Contact } from "@/domain/contacts/types";
import type {
  FinanceDocumentIntake,
  FinanceDocumentLineItem,
  FinanceDocumentType,
  FinanceTransaction,
  FinanceTransactionFilter,
} from "@/domain/finance/types";
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
import { GmailDocumentImportService } from "@/services/finance/gmail-document-import-service";
import { DocumentMaterialService } from "@/services/finance/document-material-service";
import { FinanceDocumentExtractionReviewService } from "@/services/finance/document-extraction-review-service";
import { FinanceDocumentExtractionService } from "@/services/finance/document-extraction-service";

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

export function DocumentInboxPage() {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [gmailWindow, setGmailWindow] = useState<"default" | "today" | "last_3_days" | "custom">("default");
  const [gmailWindowDays, setGmailWindowDays] = useState("7");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draft, setDraft] = useState({
    fileName: "",
    storagePath: "",
    mimeType: "",
    sizeBytes: 0,
    vendor: "",
    date: "",
    subtotal: "",
    tax: "",
    total: "",
  });

  if (!currentUser) {
    return null;
  }

  const user = currentUser.user;
  const finance = useFinanceSlice(currentUser, emptyFilter);
  const gmailImport = useMemo(() => new GmailDocumentImportService(client), [client]);
  const extractionService = useMemo(() => new FinanceDocumentExtractionService(user, client), [client, user]);
  const gmailStatusQuery = useQuery({
    queryKey: ["gmail-finance-import", "status", currentUser.user.id],
    queryFn: () => gmailImport.getStatus(),
  });
  const gmailConnect = useMutation({
    mutationFn: () => gmailImport.getConnectUrl(window.location.href),
    onSuccess: (authUrl) => {
      window.location.assign(authUrl);
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not start Gmail connection." });
    },
  });
  const gmailSync = useMutation({
    mutationFn: () =>
      gmailImport.sync({
        mode: gmailWindow,
        ...(gmailWindow === "custom" ? { windowDays: Number(gmailWindowDays || 1) } : {}),
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance"] }),
        queryClient.invalidateQueries({ queryKey: ["gmail-finance-import"] }),
      ]);
      setFeedback({
        tone: "success",
        text: `Gmail import complete: scanned ${result.emailsScanned} email${result.emailsScanned === 1 ? "" : "s"}, imported ${result.imported} attachment${result.imported === 1 ? "" : "s"}, skipped ${result.skipped}.`,
      });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Gmail import failed." });
    },
  });
  const gmailDisconnect = useMutation({
    mutationFn: () => gmailImport.disconnect(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gmail-finance-import"] });
      setFeedback({ tone: "success", text: "Gmail disconnected." });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not disconnect Gmail." });
    },
  });
  const documents = useMemo(() => finance.documentIntakeQuery.data ?? [], [finance.documentIntakeQuery.data]);
  const contacts = useMemo(() => finance.contactsQuery.data ?? [], [finance.contactsQuery.data]);
  const lowConfidenceDocuments = useMemo(
    () => documents.filter((document) =>
      document.extractionStatus === "needs_review"
      && (
        document.extractionConfidence < 0.45
        || document.documentType === "unknown"
        || document.documentTypeConfidence === 0
        || !document.extractedVendor
      ),
    ),
    [documents],
  );
  const transactions = useMemo(() => finance.transactionsQuery.data ?? [], [finance.transactionsQuery.data]);
  const contactById = useMemo(() => new Map((finance.contactsQuery.data ?? []).map((contact) => [contact.id, contact])), [finance.contactsQuery.data]);
  const categoryById = useMemo(() => new Map((finance.categoriesQuery.data ?? []).map((category) => [category.id, category])), [finance.categoriesQuery.data]);
  const jobById = useMemo(() => new Map((finance.jobsQuery.data ?? []).map((job) => [job.id, job])), [finance.jobsQuery.data]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFile(file);
    setDraft((current) => ({
      ...current,
      fileName: file.name,
      storagePath: `${user.orgId}/finance-inbox/${Date.now()}-${safeFileName(file.name)}`,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }));
  }

  async function uploadDocument() {
    try {
      if (!draft.fileName) {
        throw new Error("Choose a document first.");
      }
      if (!selectedFile) {
        throw new Error("Choose a document file to upload.");
      }
      const { error: uploadError } = await client.storage.from("documents").upload(draft.storagePath, selectedFile, {
        contentType: draft.mimeType || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) {
        throw uploadError;
      }
      await finance.createDocumentIntake.mutateAsync({
        fileName: draft.fileName,
        storagePath: draft.storagePath,
        mimeType: draft.mimeType,
        sizeBytes: draft.sizeBytes,
        uploadedAt: new Date().toISOString(),
        extractedVendor: draft.vendor || null,
        extractedDate: draft.date || null,
        extractedSubtotal: draft.subtotal ? Number(draft.subtotal) : null,
        extractedTax: draft.tax ? Number(draft.tax) : null,
        extractedTotal: draft.total ? Number(draft.total) : null,
      });
      setSelectedFile(null);
      setDraft({ fileName: "", storagePath: "", mimeType: "", sizeBytes: 0, vendor: "", date: "", subtotal: "", tax: "", total: "" });
      setFeedback({ tone: "success", text: "Document added to inbox." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Document upload failed." });
    }
  }

  const bulkReprocess = useMutation({
    mutationFn: () => extractionService.reprocessMany(lowConfidenceDocuments, contacts),
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      setFeedback({ tone: "success", text: `Re-ran extraction for ${count} low-confidence document${count === 1 ? "" : "s"}.` });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Bulk reprocess failed." });
    },
  });

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Document Inbox</h1>
          <p style={subtitleStyle()}>Capture receipts and invoices with placeholder extraction fields, then match or draft transactions from review.</p>
        </div>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: "14px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={sectionTitleStyle()}>Gmail Import</h2>
            <p style={{ margin: "5px 0 0", color: brand.textSoft }}>
              Pull PDF and image invoices, receipts, and statements into this inbox for review.
            </p>
          </div>
          <span style={badgeStyle(gmailStatusQuery.data?.connected ? "#ecfdf3" : "#eef4ff", gmailStatusQuery.data?.connected ? "#166534" : "#163fcb")}>
            {gmailStatusQuery.data?.connected ? "Connected" : "Not connected"}
          </span>
        </div>
        {gmailStatusQuery.data?.connected ? (
          <div style={{ color: brand.textSoft, fontSize: "13px" }}>
            {gmailStatusQuery.data.gmailEmail ?? "Gmail"} · Last success {gmailStatusQuery.data.lastSuccessfulImportAt ?? "never"}
            {gmailStatusQuery.data.lastImportCompletedAt
              ? ` · Last run scanned ${gmailStatusQuery.data.lastImportEmailsScanned}, imported ${gmailStatusQuery.data.lastImportAttachmentsImported}, skipped ${gmailStatusQuery.data.lastImportItemsSkipped}`
              : ""}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
          <label style={fieldLabel()}>
            Import window
            <select style={inputStyle} value={gmailWindow} onChange={(event) => setGmailWindow(event.target.value as typeof gmailWindow)}>
              <option value="default">Since last success</option>
              <option value="today">Today</option>
              <option value="last_3_days">Last 3 days</option>
              <option value="custom">Custom recent days</option>
            </select>
          </label>
          {gmailWindow === "custom" ? (
            <label style={fieldLabel()}>
              Days back
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                style={inputStyle}
                value={gmailWindowDays}
                onChange={(event) => setGmailWindowDays(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryButtonStyle()}
            disabled={gmailConnect.isPending}
            onClick={() => gmailConnect.mutate()}
          >
            {gmailStatusQuery.data?.connected ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle()}
            disabled={!gmailStatusQuery.data?.connected || gmailSync.isPending}
            onClick={() => gmailSync.mutate()}
          >
            {gmailSync.isPending ? "Importing..." : "Import Gmail Documents"}
          </button>
          {gmailStatusQuery.data?.connected ? (
            <button
              type="button"
              style={secondaryButtonStyle()}
              disabled={gmailDisconnect.isPending}
              onClick={() => gmailDisconnect.mutate()}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: "14px", marginBottom: "16px" }}>
        <h2 style={sectionTitleStyle()}>Upload Document</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <label style={fieldLabel()}>File<input style={inputStyle} type="file" accept="image/*,.pdf" onChange={handleFile} /></label>
          <label style={fieldLabel()}>Vendor<input style={inputStyle} value={draft.vendor} onChange={(event) => setDraft({ ...draft, vendor: event.target.value })} /></label>
          <label style={fieldLabel()}>Date<input type="date" style={inputStyle} value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label style={fieldLabel()}>Subtotal<input type="number" step="0.01" style={inputStyle} value={draft.subtotal} onChange={(event) => setDraft({ ...draft, subtotal: event.target.value })} /></label>
          <label style={fieldLabel()}>Tax<input type="number" step="0.01" style={inputStyle} value={draft.tax} onChange={(event) => setDraft({ ...draft, tax: event.target.value })} /></label>
          <label style={fieldLabel()}>Total<input type="number" step="0.01" style={inputStyle} value={draft.total} onChange={(event) => setDraft({ ...draft, total: event.target.value })} /></label>
        </div>
        <button type="button" style={primaryButtonStyle()} onClick={() => void uploadDocument()}>Add to inbox</button>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={sectionTitleStyle()}>Review Documents</h2>
            <p style={{ margin: "5px 0 0", color: brand.textSoft }}>
              {lowConfidenceDocuments.length} document{lowConfidenceDocuments.length === 1 ? "" : "s"} missing classification or useful extraction data can be reprocessed.
            </p>
          </div>
          <button
            type="button"
            style={secondaryButtonStyle()}
            disabled={bulkReprocess.isPending || lowConfidenceDocuments.length === 0}
            onClick={() => bulkReprocess.mutate()}
          >
            Re-run missing extraction
          </button>
        </div>
        {documents.map((document) => (
          <article key={document.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <strong>{document.fileName}</strong>
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                  Vendor: {document.extractedVendor ?? "placeholder"} · Date: {document.extractedDate ?? "placeholder"} · Total: {document.extractedTotal == null ? "placeholder" : `$${document.extractedTotal.toFixed(2)}`}
                </div>
                {document.source === "gmail" ? (
                  <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                    Gmail: {document.senderEmail ?? "unknown sender"} · {document.emailSubject ?? "no subject"}
                  </div>
                ) : null}
                <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                  Suggested: {document.suggestedContactId ? contactById.get(document.suggestedContactId)?.displayName ?? "no contact" : "no contact"} · {document.suggestedCategoryId ? categoryById.get(document.suggestedCategoryId)?.name ?? "no category" : "no category"} · {document.suggestedJobId ? jobById.get(document.suggestedJobId)?.number ?? "no job" : "no job"}
                </div>
              </div>
              <span style={badgeStyle(document.status === "matched" ? "#ecfdf3" : "#eef4ff", document.status === "matched" ? "#166534" : "#163fcb")}>{document.status}</span>
            </div>
            <DocumentExtractionReview document={document} contacts={contacts} />
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select
                style={{ ...inputStyle, width: "min(360px, 100%)" }}
                value={document.linkedTransactionId ?? ""}
                onChange={(event) => {
                  if (event.target.value) {
                    void finance.linkDocumentIntake.mutateAsync({
                      id: document.id,
                      transactionId: event.target.value as FinanceTransaction["id"],
                    });
                  }
                }}
              >
                <option value="">Link existing transaction</option>
                {transactions.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.transactionDate} · {transaction.memo ?? transaction.referenceNumber ?? transaction.id} · ${transaction.total.toFixed(2)}
                  </option>
                ))}
              </select>
              <button type="button" style={primaryButtonStyle()} onClick={() => void finance.createDraftTransactionFromDocument.mutateAsync(document)}>Create draft transaction</button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.ignoreDocumentIntake.mutateAsync(document.id)}>Ignore</button>
            </div>
            <DocumentMaterialLineItems document={document} />
          </article>
        ))}
        {documents.length === 0 ? <p style={{ color: brand.textSoft }}>No documents in the inbox yet.</p> : null}
      </section>
    </section>
  );
}

function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 0.75
    ? { background: "#ecfdf3", color: "#166534" }
    : value >= 0.45
      ? { background: "#fff7ed", color: "#9a3412" }
      : { background: "#fff1f2", color: "#be123c" };
  return <span style={badgeStyle(tone.background, tone.color)}>{Math.round(value * 100)}%</span>;
}

function DocumentExtractionReview({ document, contacts }: { document: FinanceDocumentIntake; contacts: Contact[] }) {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [draft, setDraft] = useState({
    documentType: document.documentType,
    extractedVendor: document.extractedVendor ?? "",
    extractedInvoiceNumber: document.extractedInvoiceNumber ?? "",
    extractedDate: document.extractedDate ?? "",
    extractedSubtotal: document.extractedSubtotal?.toString() ?? "",
    extractedTax: document.extractedTax?.toString() ?? "",
    extractedTotal: document.extractedTotal?.toString() ?? "",
  });
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setDraft({
      documentType: document.documentType,
      extractedVendor: document.extractedVendor ?? "",
      extractedInvoiceNumber: document.extractedInvoiceNumber ?? "",
      extractedDate: document.extractedDate ?? "",
      extractedSubtotal: document.extractedSubtotal?.toString() ?? "",
      extractedTax: document.extractedTax?.toString() ?? "",
      extractedTotal: document.extractedTotal?.toString() ?? "",
    });
  }, [
    document.documentType,
    document.extractedVendor,
    document.extractedInvoiceNumber,
    document.extractedDate,
    document.extractedSubtotal,
    document.extractedTax,
    document.extractedTotal,
    document.updatedAt,
  ]);

  if (!currentUser) {
    return null;
  }

  const service = useMemo(
    () => new FinanceDocumentExtractionReviewService(currentUser.user, client),
    [client, currentUser.user],
  );
  const extractionService = useMemo(
    () => new FinanceDocumentExtractionService(currentUser.user, client),
    [client, currentUser.user],
  );

  const signedUrlQuery = useQuery({
    queryKey: ["finance", "document-signed-url", document.id, extractionService.resolveStoragePath(document).path],
    queryFn: () => extractionService.signedUrl(document),
    enabled: showPreview,
    staleTime: 8 * 60 * 1000,
  });

  const saveExtraction = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      service.saveReview(document.id, status, {
        documentType: draft.documentType as FinanceDocumentType,
        extractedVendor: draft.extractedVendor || null,
        extractedInvoiceNumber: draft.extractedInvoiceNumber || null,
        extractedDate: draft.extractedDate || null,
        extractedSubtotal: draft.extractedSubtotal ? Number(draft.extractedSubtotal) : null,
        extractedTax: draft.extractedTax ? Number(draft.extractedTax) : null,
        extractedTotal: draft.extractedTotal ? Number(draft.extractedTotal) : null,
      }),
    onSuccess: async (_, status) => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      setFeedback({ tone: "success", text: `Extraction ${status}.` });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Extraction review failed." });
    },
  });

  const reprocessExtraction = useMutation({
    mutationFn: () => extractionService.reprocess(document, contacts),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "document-material-lines", document.id] }),
      ]);
      setFeedback({
        tone: "success",
        text: result
          ? `PDF extraction complete: ${result.textCharacters} text characters, ${result.lineItems} parsed line${result.lineItems === 1 ? "" : "s"}.`
          : "Extraction re-run. Review the refreshed values before approving.",
      });
    },
    onError: (error) => {
      console.error("[finance-document-extraction] UI reprocess failed", {
        documentId: document.id,
        storagePath: document.storagePath,
        error,
      });
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Extraction re-run failed." });
    },
  });

  return (
    <section style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "10px", background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong>Extracted invoice header</strong>
          <div style={{ color: brand.textSoft, fontSize: "13px" }}>
            Status: {document.extractionStatus.replaceAll("_", " ")}
            {` · ${document.extractionMethod.replaceAll("_", " ")}`}
            {document.pdfTextCharCount > 0 ? ` · ${document.pdfTextCharCount} PDF text chars` : ""}
            {document.ocrStatus !== "not_needed" ? ` · OCR ${document.ocrStatus.replaceAll("_", " ")}` : ""}
            {document.normalizedVendorContactId ? " · matched known vendor" : ""}
          </div>
          {document.ocrError ? <div style={{ color: "#9a3412", fontSize: "13px" }}>{document.ocrError}</div> : null}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <span style={badgeStyle("#eef4ff", "#163fcb")}>{document.documentType.replaceAll("_", " ")}</span>
          <ConfidenceBadge value={document.extractionConfidence} />
        </div>
      </div>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "12px", alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          <label style={fieldLabel()}>
            Type <ConfidenceBadge value={document.documentTypeConfidence} />
            <select style={inputStyle} value={draft.documentType} onChange={(event) => setDraft({ ...draft, documentType: event.target.value as FinanceDocumentType })}>
              <option value="supplier_invoice">Supplier invoice</option>
              <option value="receipt">Receipt</option>
              <option value="statement">Statement</option>
              <option value="payment_confirmation">Payment confirmation</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label style={fieldLabel()}>
            Vendor <ConfidenceBadge value={Math.max(document.vendorConfidence, document.vendorNormalizationConfidence)} />
            <input style={inputStyle} value={draft.extractedVendor} onChange={(event) => setDraft({ ...draft, extractedVendor: event.target.value })} />
          </label>
          <label style={fieldLabel()}>
            Invoice # <ConfidenceBadge value={document.invoiceNumberConfidence} />
            <input style={inputStyle} value={draft.extractedInvoiceNumber} onChange={(event) => setDraft({ ...draft, extractedInvoiceNumber: event.target.value })} />
          </label>
          <label style={fieldLabel()}>
            Invoice date <ConfidenceBadge value={document.invoiceDateConfidence} />
            <input type="date" style={inputStyle} value={draft.extractedDate} onChange={(event) => setDraft({ ...draft, extractedDate: event.target.value })} />
          </label>
          <label style={fieldLabel()}>
            Subtotal <ConfidenceBadge value={document.subtotalConfidence} />
            <input type="number" step="0.01" style={inputStyle} value={draft.extractedSubtotal} onChange={(event) => setDraft({ ...draft, extractedSubtotal: event.target.value })} />
          </label>
          <label style={fieldLabel()}>
            Tax <ConfidenceBadge value={document.taxConfidence} />
            <input type="number" step="0.01" style={inputStyle} value={draft.extractedTax} onChange={(event) => setDraft({ ...draft, extractedTax: event.target.value })} />
          </label>
          <label style={fieldLabel()}>
            Total <ConfidenceBadge value={document.totalConfidence} />
            <input type="number" step="0.01" style={inputStyle} value={draft.extractedTotal} onChange={(event) => setDraft({ ...draft, extractedTotal: event.target.value })} />
          </label>
        </div>

        <DocumentFilePreview
          document={document}
          showPreview={showPreview}
          signedUrl={signedUrlQuery.data ?? null}
          isLoading={signedUrlQuery.isLoading}
          error={signedUrlQuery.error}
          onToggle={() => setShowPreview((current) => !current)}
        />
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" style={secondaryButtonStyle()} disabled={reprocessExtraction.isPending} onClick={() => reprocessExtraction.mutate()}>
          Re-run extraction
        </button>
        <button type="button" style={primaryButtonStyle()} disabled={saveExtraction.isPending} onClick={() => saveExtraction.mutate("approved")}>
          Approve extracted values
        </button>
        <button type="button" style={secondaryButtonStyle()} disabled={saveExtraction.isPending} onClick={() => saveExtraction.mutate("rejected")}>
          Reject extraction
        </button>
      </div>
    </section>
  );
}

function DocumentFilePreview({
  document,
  showPreview,
  signedUrl,
  isLoading,
  error,
  onToggle,
}: {
  document: FinanceDocumentIntake;
  showPreview: boolean;
  signedUrl: string | null;
  isLoading: boolean;
  error: unknown;
  onToggle: () => void;
}) {
  const isPdf = document.mimeType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
  const isImage = document.mimeType?.startsWith("image/") ?? false;
  const hasPath = document.storagePath.trim().length > 0;
  return (
    <aside style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", background: "#ffffff", minHeight: "220px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", padding: "10px", borderBottom: `1px solid ${brand.border}` }}>
        <div>
          <strong>Source file</strong>
          <div style={{ color: brand.textSoft, fontSize: "12px" }}>
            {document.mimeType ?? "unknown type"} · {document.sizeBytes ? `${Math.max(1, Math.round(document.sizeBytes / 1024))} KB` : "size unknown"}
          </div>
        </div>
        <button type="button" style={secondaryButtonStyle()} disabled={!hasPath} onClick={onToggle}>
          {showPreview ? "Hide" : "View"}
        </button>
      </div>
      {!hasPath ? (
        <div style={{ padding: "16px", color: "#be123c" }}>
          Source file unavailable: this document is missing a storage path. Re-upload the file or repair the intake record.
        </div>
      ) : !showPreview ? (
        <div style={{ padding: "16px", color: brand.textSoft }}>Open the stored PDF or image while reviewing extracted values.</div>
      ) : isLoading ? (
        <div style={{ padding: "16px", color: brand.textSoft }}>Loading signed file link...</div>
      ) : error ? (
        <div style={{ padding: "16px", color: "#be123c" }}>{error instanceof Error ? error.message : "Could not load file preview."}</div>
      ) : signedUrl ? (
        <div style={{ display: "grid", gap: "8px", padding: "10px" }}>
          {isPdf ? (
            <iframe title={document.fileName} src={signedUrl} style={{ width: "100%", height: "520px", border: `1px solid ${brand.border}`, borderRadius: "8px" }} />
          ) : isImage ? (
            <img src={signedUrl} alt={document.fileName} style={{ width: "100%", maxHeight: "520px", objectFit: "contain", borderRadius: "8px" }} />
          ) : (
            <div style={{ color: brand.textSoft }}>Preview is not available for this file type.</div>
          )}
          <a href={signedUrl} target="_blank" rel="noreferrer" style={{ color: brand.primary, fontWeight: 700 }}>
            Open in new tab
          </a>
        </div>
      ) : null}
    </aside>
  );
}

function DocumentMaterialLineItems({ document }: { document: FinanceDocumentIntake }) {
  const { currentUser } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    description: "",
    quantity: "1",
    unitPrice: "",
    total: "",
  });
  const [createNames, setCreateNames] = useState<Record<string, string>>({});
  const [lineDrafts, setLineDrafts] = useState<Record<string, { description: string; quantity: string; unitPrice: string; total: string }>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!currentUser) {
    return null;
  }

  const service = useMemo(
    () =>
      new DocumentMaterialService(
        {
          orgId: currentUser.user.orgId,
          actorUserId: currentUser.user.id,
        },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );

  const queryKey = ["finance", "document-material-lines", document.id];
  const suggestionsQuery = useQuery({
    queryKey,
    queryFn: () => service.suggestions(document.id),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["materials"] }),
    ]);
  };

  const addLineItem = useMutation({
    mutationFn: () =>
      service.createLineItem(
        {
          documentIntakeId: document.id,
          description: draft.description,
          quantity: Number(draft.quantity || 1),
          unitPrice: Number(draft.unitPrice || 0),
          total: draft.total ? Number(draft.total) : null,
        },
        document.extractedVendor ?? document.senderName ?? document.senderEmail,
      ),
    onSuccess: async () => {
      setDraft({ description: "", quantity: "1", unitPrice: "", total: "" });
      setFeedback({ tone: "success", text: "Line item added and matched." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Line item could not be added." });
    },
  });

  const updateMaterial = useMutation({
    mutationFn: (input: { lineItem: FinanceDocumentLineItem }) => {
      if (!input.lineItem.matchedCatalogItemId) {
        throw new Error("Choose or create a material before updating.");
      }
      return service.updateMaterialPrice(input.lineItem.id, input.lineItem.matchedCatalogItemId);
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Material price updated." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Material update failed." });
    },
  });

  const createMaterial = useMutation({
    mutationFn: (input: { lineItem: FinanceDocumentLineItem }) =>
      service.createMaterialFromLine(input.lineItem.id, {
        name: createNames[input.lineItem.id] || input.lineItem.description,
      }),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Material created." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Material create failed." });
    },
  });

  const ignoreLine = useMutation({
    mutationFn: (lineItem: FinanceDocumentLineItem) => service.ignoreLineItem(lineItem.id),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Line item ignored." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Line item could not be ignored." });
    },
  });

  const saveLine = useMutation({
    mutationFn: (lineItem: FinanceDocumentLineItem) => {
      const lineDraft = lineDrafts[lineItem.id] ?? {
        description: lineItem.description,
        quantity: lineItem.quantity.toString(),
        unitPrice: lineItem.unitPrice.toString(),
        total: lineItem.total.toString(),
      };
      return service.updateLineItem(
        lineItem.id,
        {
          description: lineDraft.description,
          quantity: Number(lineDraft.quantity || 1),
          unitPrice: Number(lineDraft.unitPrice || 0),
          total: lineDraft.total ? Number(lineDraft.total) : null,
        },
        document.extractedVendor ?? document.senderName ?? document.senderEmail,
      );
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Line item saved." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Line item could not be saved." });
    },
  });

  const approveLine = useMutation({
    mutationFn: (lineItem: FinanceDocumentLineItem) => service.approveLineItem(lineItem.id),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Line item approved." });
      await invalidate();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Line item could not be approved." });
    },
  });

  const suggestions = suggestionsQuery.data ?? [];

  return (
    <section style={{ borderTop: `1px solid ${brand.border}`, paddingTop: "12px", display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong>Invoice line items</strong>
          <div style={{ color: brand.textSoft, fontSize: "13px" }}>
            Supplier price becomes internal material cost using × 1.12.
          </div>
        </div>
        <span style={badgeStyle("#eef4ff", "#163fcb")}>{suggestions.length} line{suggestions.length === 1 ? "" : "s"}</span>
      </div>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", alignItems: "end" }}>
        <label style={fieldLabel()}>Description<input style={inputStyle} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label style={fieldLabel()}>Qty<input type="number" step="0.001" style={inputStyle} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
        <label style={fieldLabel()}>Unit price<input type="number" step="0.01" style={inputStyle} value={draft.unitPrice} onChange={(event) => setDraft({ ...draft, unitPrice: event.target.value })} /></label>
        <label style={fieldLabel()}>Total<input type="number" step="0.01" style={inputStyle} value={draft.total} onChange={(event) => setDraft({ ...draft, total: event.target.value })} /></label>
        <button
          type="button"
          style={secondaryButtonStyle()}
          disabled={addLineItem.isPending || !draft.description.trim()}
          onClick={() => addLineItem.mutate()}
        >
          Add
        </button>
      </div>

      {suggestionsQuery.isLoading ? (
        <div style={{ color: brand.textSoft }}>Loading line items...</div>
      ) : suggestions.length === 0 ? (
        <div style={{ color: brand.textSoft }}>No line items yet. Add invoice rows manually until OCR parsing is available.</div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {suggestions.map((suggestion) => {
            const line = suggestion.lineItem;
            const reviewed = line.reviewStatus !== "new";
            const lineDraft = lineDrafts[line.id] ?? {
              description: line.description,
              quantity: line.quantity.toString(),
              unitPrice: line.unitPrice.toString(),
              total: line.total.toString(),
            };
            return (
              <article key={line.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "10px", background: "#fafcff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <strong>{line.description}</strong>
                    <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                      Qty {line.quantity} · Supplier {formatMoney(line.supplierPrice)} · Internal cost {formatMoney(line.internalCost)}
                    </div>
                  </div>
                  <span style={badgeStyle(reviewed ? "#ecfdf3" : "#fff7ed", reviewed ? "#166534" : "#9a3412")}>
                    {line.reviewStatus.replaceAll("_", " ")}
                  </span>
                </div>

                {!reviewed ? (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) repeat(3, minmax(92px, 1fr))", gap: "8px" }}>
                    <label style={fieldLabel()}>
                      Description
                      <input
                        style={inputStyle}
                        value={lineDraft.description}
                        onChange={(event) => setLineDrafts((current) => ({ ...current, [line.id]: { ...lineDraft, description: event.target.value } }))}
                      />
                    </label>
                    <label style={fieldLabel()}>
                      Qty
                      <input
                        type="number"
                        step="0.001"
                        style={inputStyle}
                        value={lineDraft.quantity}
                        onChange={(event) => setLineDrafts((current) => ({ ...current, [line.id]: { ...lineDraft, quantity: event.target.value } }))}
                      />
                    </label>
                    <label style={fieldLabel()}>
                      Unit
                      <input
                        type="number"
                        step="0.01"
                        style={inputStyle}
                        value={lineDraft.unitPrice}
                        onChange={(event) => setLineDrafts((current) => ({ ...current, [line.id]: { ...lineDraft, unitPrice: event.target.value } }))}
                      />
                    </label>
                    <label style={fieldLabel()}>
                      Total
                      <input
                        type="number"
                        step="0.01"
                        style={inputStyle}
                        value={lineDraft.total}
                        onChange={(event) => setLineDrafts((current) => ({ ...current, [line.id]: { ...lineDraft, total: event.target.value } }))}
                      />
                    </label>
                  </div>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ color: brand.textSoft, fontSize: "12px" }}>Matched material</div>
                    <strong>{suggestion.matchedMaterial?.name ?? "No match"}</strong>
                    <div style={{ color: brand.textSoft, fontSize: "12px" }}>
                      Confidence {suggestion.confidence.toFixed(2)}{suggestion.reason ? ` · ${suggestion.reason}` : ""}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: brand.textSoft, fontSize: "12px" }}>Current price</div>
                    <strong>{formatMoney(suggestion.currentPrice)}</strong>
                  </div>
                  <div>
                    <div style={{ color: brand.textSoft, fontSize: "12px" }}>New price</div>
                    <strong>{formatMoney(suggestion.newPrice)}</strong>
                  </div>
                  <div>
                    <div style={{ color: brand.textSoft, fontSize: "12px" }}>Change</div>
                    <strong>{formatPercent(suggestion.percentChange)}</strong>
                  </div>
                </div>

                {!reviewed ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      style={secondaryButtonStyle()}
                      disabled={saveLine.isPending}
                      onClick={() => saveLine.mutate(line)}
                    >
                      Save line
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle()}
                      disabled={approveLine.isPending}
                      onClick={() => approveLine.mutate(line)}
                    >
                      Approve line
                    </button>
                    <button
                      type="button"
                      style={primaryButtonStyle()}
                      disabled={!line.matchedCatalogItemId || updateMaterial.isPending}
                      onClick={() => updateMaterial.mutate({ lineItem: line })}
                    >
                      Update material price
                    </button>
                    <input
                      style={{ ...inputStyle, width: "min(260px, 100%)" }}
                      value={createNames[line.id] ?? line.description}
                      onChange={(event) => setCreateNames((current) => ({ ...current, [line.id]: event.target.value }))}
                      aria-label="New material name"
                    />
                    <button
                      type="button"
                      style={secondaryButtonStyle()}
                      disabled={createMaterial.isPending}
                      onClick={() => createMaterial.mutate({ lineItem: line })}
                    >
                      Create new material
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle()}
                      disabled={ignoreLine.isPending}
                      onClick={() => ignoreLine.mutate(line)}
                    >
                      Ignore
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function fieldLabel() {
  return {
    display: "grid",
    gap: "6px",
    color: brand.textSoft,
    fontSize: "12px",
    fontWeight: 700,
  };
}
