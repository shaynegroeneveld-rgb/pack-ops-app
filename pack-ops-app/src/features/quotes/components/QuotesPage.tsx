import { useEffect, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import { CustomerQuotePreviewPanel } from "@/features/quotes/components/CustomerQuotePreviewPanel";
import { QuoteEditorPanel, type QuoteEditorDraft } from "@/features/quotes/components/QuoteEditorPanel";
import { useQuotesSlice } from "@/features/quotes/hooks/use-quotes-slice";
import {
  badgeStyle,
  cardStyle,
  chipStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import type { CustomerQuotePreview, QuoteView } from "@/domain/quotes/types";

const STATUS_OPTIONS: Array<{ value: QuoteView["status"] | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

function toDateInputValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getQuoteStatusTone(status: QuoteView["status"]): { background: string; color: string } {
  switch (status) {
    case "draft":
      return { background: "#eef4ff", color: "#163fcb" };
    case "sent":
      return { background: "#fff8e8", color: "#8a5a00" };
    case "viewed":
      return { background: "#f5f8ff", color: "#445168" };
    case "accepted":
      return { background: "#f2fbf4", color: "#1f6b37" };
    case "rejected":
      return { background: "#fff4f4", color: "#b42318" };
    case "expired":
      return { background: "#fff3f0", color: "#b54708" };
  }
}

function deriveDraftMarkup(quote: QuoteView, fallbackMarkup: number): string {
  const materialLines = quote.lineItems.filter(
    (line) => line.lineKind !== "labor" && (line.unitCost ?? 0) > 0,
  );

  if (materialLines.length === 0) {
    return String(fallbackMarkup);
  }

  const totalCost = materialLines.reduce((total, line) => total + (line.unitCost ?? 0) * (line.quantity ?? 0), 0);
  const totalSell = materialLines.reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0);

  if (totalCost <= 0) {
    return String(fallbackMarkup);
  }

  return (((totalSell - totalCost) / totalCost) * 100).toFixed(1);
}

function toDraft(quote: QuoteView, fallbackMarkup: number): QuoteEditorDraft {
  return {
    quoteId: quote.id,
    hasLinkedInvoice: quote.hasLinkedInvoice,
    title: quote.title,
    customerName: quote.customerName,
    companyName: quote.companyName ?? "",
    contactName: quote.contactName,
    phone: quote.phone ?? "",
    email: quote.email ?? "",
    siteAddress: quote.siteAddress ?? "",
    linkedLeadId: quote.leadId ?? "",
    linkedLeadLabel: quote.linkedLeadLabel,
    description: quote.customerNotes ?? "",
    notes: quote.internalNotes ?? "",
    laborCostRate: quote.laborCostRate.toString(),
    laborSellRate: quote.laborSellRate.toString(),
    markup: deriveDraftMarkup(quote, fallbackMarkup),
    taxRate: quote.taxRate.toString(),
    status: quote.status,
    expiresAt: toDateInputValue(quote.expiresAt),
    lineItems: quote.lineItems.map((line) => ({
      localId: line.id,
      id: line.id,
      catalogItemId: line.catalogItemId,
      sortOrder: line.sortOrder,
      description: line.description,
      sku: line.sku,
      note: line.note,
      sectionName: line.sectionName,
      sourceType: line.sourceType,
      lineKind: line.lineKind,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
      unitSell: line.unitSell,
    })),
  };
}

function createEmptyDraft(
  fallbackMarkup: number,
  defaultLaborCostRate: number,
  defaultLaborSellRate: number,
  defaultTaxRate: number,
): QuoteEditorDraft {
  return {
    title: "",
    customerName: "",
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    siteAddress: "",
    linkedLeadId: "",
    linkedLeadLabel: null,
    description: "",
    notes: "",
    laborCostRate: String(defaultLaborCostRate),
    laborSellRate: String(defaultLaborSellRate),
    markup: String(fallbackMarkup),
    taxRate: String(defaultTaxRate),
    status: "draft",
    expiresAt: "",
    lineItems: [],
  };
}

export function QuotesPage() {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const selectedQuoteId = useUiStore((state) => state.selectedQuoteId);
  const setSelectedQuoteId = useUiStore((state) => state.setSelectedQuoteId);
  const setSelectedWorkbenchJobId = useUiStore((state) => state.setSelectedWorkbenchJobId);
  const [activeStatus, setActiveStatus] = useState<QuoteView["status"] | "all">("all");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editorDraft, setEditorDraft] = useState<QuoteEditorDraft | null>(null);
  const [customerPreview, setCustomerPreview] = useState<CustomerQuotePreview | null>(null);

  if (!currentUser) {
    return null;
  }

  const {
    quotesQuery,
    builderResourcesQuery,
    createQuote,
    createAssemblyFromQuote,
    updateQuote,
    acceptQuote,
    previewCustomerQuote,
    createJobFromQuote,
    archiveQuote,
    uploadQuoteAttachment,
    deleteQuoteAttachment,
    openQuoteAttachment,
  } =
    useQuotesSlice(currentUser, { status: activeStatus });
  const quotes = quotesQuery.data ?? [];
  const activeEditorQuote = editorDraft?.quoteId
    ? quotes.find((quote) => quote.id === editorDraft.quoteId) ?? null
    : null;
  const builderResources = builderResourcesQuery.data ?? {
    catalogItems: [],
    assemblies: [],
    defaultMaterialMarkup: 30,
    defaultLaborCostRate: 65,
    defaultLaborSellRate: 95,
    defaultTaxRate: 0,
    leadOptions: [],
  };
  const canManage = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const isPending =
    createQuote.isPending ||
    createAssemblyFromQuote.isPending ||
    updateQuote.isPending ||
    acceptQuote.isPending ||
    previewCustomerQuote.isPending ||
    createJobFromQuote.isPending ||
    archiveQuote.isPending ||
    uploadQuoteAttachment.isPending ||
    deleteQuoteAttachment.isPending;

  useEffect(() => {
    if (selectedQuoteId && quotes.length > 0) {
      const quote = quotes.find((item) => item.id === selectedQuoteId);
      if (quote) {
        setEditorDraft(toDraft(quote, builderResources.defaultMaterialMarkup));
        setSelectedQuoteId(null);
      }
    }
  }, [builderResources.defaultMaterialMarkup, selectedQuoteId, quotes, setSelectedQuoteId]);

  async function handleSubmit(draft: QuoteEditorDraft) {
    try {
      const quoteInput = {
        customerName: draft.customerName,
        companyName: draft.companyName || null,
        contactName: draft.contactName || null,
        phone: draft.phone || null,
        email: draft.email || null,
        siteAddress: draft.siteAddress || null,
        leadId: draft.linkedLeadId ? (draft.linkedLeadId as QuoteView["leadId"]) : null,
        title: draft.title,
        description: draft.description || null,
        notes: draft.notes || null,
        laborCostRate: Number(draft.laborCostRate || 0),
        laborSellRate: Number(draft.laborSellRate || 0),
        taxRate: Number(draft.taxRate || 0),
        status: draft.status,
        expiresAt: draft.expiresAt || null,
        lineItems: draft.lineItems.map((line, index) => ({
          ...(line.id ? { id: line.id as QuoteView["lineItems"][number]["id"] } : {}),
          catalogItemId: line.catalogItemId ?? null,
          sortOrder: index,
          description: line.description,
          sku: line.sku ?? null,
          note: line.note ?? null,
          sectionName: line.sectionName ?? null,
          sourceType: line.sourceType,
          lineKind: line.lineKind ?? "item",
          quantity: line.quantity ?? 1,
          unit: line.unit ?? "each",
          unitCost: line.unitCost ?? 0,
          unitSell: line.unitSell ?? 0,
        })),
      };

      if (draft.quoteId) {
        await updateQuote.mutateAsync({
          quoteId: draft.quoteId,
          ...quoteInput,
        });
        setFeedback({ tone: "success", text: "Quote updated." });
      } else {
        await createQuote.mutateAsync(quoteInput);
        setFeedback({ tone: "success", text: "Standalone quote created." });
      }
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote save failed.",
      });
    }
  }

  async function handleCreateJob(quote: QuoteView) {
    try {
      const result = await createJobFromQuote.mutateAsync(quote.id);
      setSelectedWorkbenchJobId(result.job.id);
      setActiveRoute(APP_ROUTES.workbench);
      setFeedback({
        tone: "success",
        text: result.alreadyExisted ? "Existing job opened from quote." : "Job created from quote.",
      });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Job creation failed.",
      });
    }
  }

  async function handlePreviewCustomerQuote(quoteId: QuoteView["id"]) {
    try {
      const preview = await previewCustomerQuote.mutateAsync(quoteId);
      setCustomerPreview(preview);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Customer quote preview failed.",
      });
    }
  }

  async function handleAcceptQuote(draft: QuoteEditorDraft) {
    if (!draft.quoteId) {
      return;
    }

    try {
      await acceptQuote.mutateAsync({
        quoteId: draft.quoteId,
        title: draft.title,
        description: draft.description || null,
        notes: draft.notes || null,
        laborCostRate: Number(draft.laborCostRate || 0),
        laborSellRate: Number(draft.laborSellRate || 0),
        taxRate: Number(draft.taxRate || 0),
        expiresAt: draft.expiresAt || null,
        lineItems: draft.lineItems.map((line, index) => ({
          ...(line.id ? { id: line.id as QuoteView["lineItems"][number]["id"] } : {}),
          catalogItemId: line.catalogItemId ?? null,
          sortOrder: index,
          description: line.description,
          sku: line.sku ?? null,
          note: line.note ?? null,
          sectionName: line.sectionName ?? null,
          sourceType: line.sourceType,
          lineKind: line.lineKind ?? "item",
          quantity: line.quantity ?? 1,
          unit: line.unit ?? "each",
          unitCost: line.unitCost ?? 0,
          unitSell: line.unitSell ?? 0,
        })),
      });
      setFeedback({ tone: "success", text: "Quote marked as accepted." });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote acceptance failed.",
      });
    }
  }

  async function handleArchiveQuote(quoteId: QuoteView["id"]) {
    try {
      await archiveQuote.mutateAsync(quoteId);
      setFeedback({ tone: "success", text: "Quote archived." });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote archive failed.",
      });
    }
  }

  async function handleCreateAssemblyFromQuote(draft: QuoteEditorDraft) {
    const materialLines = draft.lineItems.filter(
      (line) => (line.lineKind ?? "item") !== "labor" && line.catalogItemId,
    );
    if (materialLines.length === 0) {
      setFeedback({
        tone: "error",
        text: "Add at least one catalog-backed material line before making an assembly.",
      });
      return;
    }

    const name = window.prompt("Assembly name", draft.title ? `${draft.title} assembly` : "New assembly");
    if (name === null) {
      return;
    }

    try {
      await createAssemblyFromQuote.mutateAsync({
        name,
        description: draft.description || null,
        lineItems: draft.lineItems.map((line, index) => ({
          ...(line.id ? { id: line.id as QuoteView["lineItems"][number]["id"] } : {}),
          catalogItemId: line.catalogItemId ?? null,
          sortOrder: index,
          description: line.description,
          sku: line.sku ?? null,
          note: line.note ?? null,
          sectionName: line.sectionName ?? null,
          sourceType: line.sourceType,
          lineKind: line.lineKind ?? "item",
          quantity: line.quantity ?? 1,
          unit: line.unit ?? "each",
          unitCost: line.unitCost ?? 0,
          unitSell: line.unitSell ?? 0,
        })),
      });
      setFeedback({ tone: "success", text: "Assembly created from quote." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Assembly creation failed.",
      });
    }
  }

  async function handleUploadQuoteAttachments(quoteId: QuoteView["id"], files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      for (const file of selectedFiles) {
        await uploadQuoteAttachment.mutateAsync({ quoteId, file });
      }
      setFeedback({
        tone: "success",
        text: selectedFiles.length === 1 ? "Quote attachment added." : "Quote attachments added.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote attachment upload failed.",
      });
    }
  }

  async function handleDeleteQuoteAttachment(attachment: QuoteView["attachments"][number]) {
    if (!window.confirm(`Remove ${attachment.fileName} from this quote?`)) {
      return;
    }

    try {
      await deleteQuoteAttachment.mutateAsync({
        attachmentId: attachment.id,
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
      });
      setFeedback({ tone: "success", text: "Quote attachment removed." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote attachment delete failed.",
      });
    }
  }

  async function handleOpenQuoteAttachment(attachment: QuoteView["attachments"][number]) {
    try {
      await openQuoteAttachment(attachment.storagePath);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not open quote attachment.",
      });
    }
  }

  return (
    <main style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Quotes</h1>
          <p style={subtitleStyle()}>
            Internal estimating with quote lines, assemblies, materials, and totals.
          </p>
        </div>
        {canManage ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() =>
                setEditorDraft(
                  createEmptyDraft(
                    builderResources.defaultMaterialMarkup,
                    builderResources.defaultLaborCostRate,
                    builderResources.defaultLaborSellRate,
                    builderResources.defaultTaxRate,
                  ),
                )
              }
              style={primaryButtonStyle()}
            >
              New Quote
            </button>
            <button onClick={() => setActiveRoute(APP_ROUTES.leads)} style={secondaryButtonStyle()}>
              Create From Lead
            </button>
          </div>
        ) : null}
      </header>

      {feedback ? (
        <section style={feedbackStyle(feedback.tone)}>
          {feedback.text}
        </section>
      ) : null}

      <section style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {STATUS_OPTIONS.map((option) => {
          const isActive = activeStatus === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setActiveStatus(option.value)}
              style={chipStyle(isActive)}
            >
              {option.label}
            </button>
          );
        })}
      </section>

      <section style={{ display: "grid", gap: "12px" }}>
        {quotesQuery.isLoading ? <p>Loading quotes...</p> : null}
        {!quotesQuery.isLoading && quotes.length === 0 ? (
          <div style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5d6978" }}>
            <strong style={{ display: "block", color: "#172033", marginBottom: "6px" }}>
              No quotes are showing for this filter.
            </strong>
            Create a standalone quote here, or start one from a lead when you want it linked.
          </div>
        ) : null}

        {quotes.map((quote) => {
          const tone = getQuoteStatusTone(quote.status);
          return (
            <article
              key={quote.id}
              style={{
                ...cardStyle("#fff"),
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{quote.number}</div>
                  <div style={{ fontWeight: 600, marginTop: "4px" }}>{quote.title}</div>
                  <div style={{ color: "#5b6475", marginTop: "4px" }}>
                    {quote.customerName} · {quote.contactName}
                  </div>
                  <div style={{ color: "#5b6475", marginTop: "4px", fontSize: "13px" }}>
                    Linked Lead: {quote.linkedLeadLabel ?? "None"}
                  </div>
                </div>
                <span
                  style={badgeStyle(tone.background, tone.color)}
                >
                  {quote.status}
                </span>
              </div>

              {quote.customerNotes ? <div style={{ fontSize: "15px", lineHeight: 1.45 }}>{quote.customerNotes}</div> : null}
              {quote.internalNotes ? <div style={{ color: "#445168", lineHeight: 1.45 }}>{quote.internalNotes}</div> : null}
              {quote.hasLinkedInvoice ? (
                <div style={{ color: "#b54708", fontSize: "14px", lineHeight: 1.45 }}>
                  This quote is tied to an invoice. Editing is locked to avoid inconsistencies.
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#5d6978", fontSize: "14px" }}>
                <span>Subtotal: ${quote.subtotal.toFixed(2)}</span>
                <span>Tax: ${(quote.taxAmount ?? 0).toFixed(2)}</span>
                <span>Total: ${quote.total.toFixed(2)}</span>
                <span>Lines: {quote.lineItems.length}</span>
                <span>Attachments: {quote.attachments.length}</span>
                <span>Labor: {quote.laborHoursTotal.toFixed(2)} hrs</span>
                <span>Expires: {toDateInputValue(quote.expiresAt) || "Not set"}</span>
              </div>

              {canManage ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => setEditorDraft(toDraft(quote, builderResources.defaultMaterialMarkup))} style={secondaryButtonStyle()}>Edit</button>
                  <button onClick={() => void handlePreviewCustomerQuote(quote.id)} disabled={previewCustomerQuote.isPending} style={secondaryButtonStyle()}>
                    {previewCustomerQuote.isPending ? "Preparing Preview..." : "Preview Customer Quote"}
                  </button>
                  {quote.status === "draft" || quote.status === "sent" || quote.status === "viewed" ? (
                    <button onClick={() => void handleAcceptQuote(toDraft(quote, builderResources.defaultMaterialMarkup))} disabled={acceptQuote.isPending} style={primaryButtonStyle()}>
                      {acceptQuote.isPending ? "Accepting..." : "Mark as Accepted"}
                    </button>
                  ) : null}
                  {quote.status === "accepted" ? (
                    <button onClick={() => void handleCreateJob(quote)} disabled={createJobFromQuote.isPending} style={primaryButtonStyle()}>
                      {createJobFromQuote.isPending
                        ? "Creating Job..."
                        : quote.linkedJobId
                          ? "Open Job"
                          : "Create Job"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <QuoteEditorPanel
        initialDraft={editorDraft}
        catalogItems={builderResources.catalogItems}
        assemblies={builderResources.assemblies}
        leadOptions={builderResources.leadOptions}
        isPending={isPending}
        attachments={activeEditorQuote?.attachments ?? []}
        isAttachmentPending={uploadQuoteAttachment.isPending || deleteQuoteAttachment.isPending}
        onSubmit={handleSubmit}
        {...(editorDraft?.quoteId
          ? {
              onUploadAttachment: async (files) => {
                await handleUploadQuoteAttachments(editorDraft.quoteId as QuoteView["id"], files);
              },
              onOpenAttachment: handleOpenQuoteAttachment,
              onDeleteAttachment: handleDeleteQuoteAttachment,
            }
          : {})}
        onCreateAssembly={handleCreateAssemblyFromQuote}
        {...(editorDraft?.quoteId ? { onAccept: handleAcceptQuote } : {})}
        {...(editorDraft?.quoteId
          ? {
              onPreviewCustomerQuote: async () => {
                await handlePreviewCustomerQuote(editorDraft.quoteId as QuoteView["id"]);
              },
            }
          : {})}
        {...(editorDraft?.quoteId && editorDraft.status === "accepted"
          ? {
              onCreateJob: async () => {
                const quote = quotes.find((item) => item.id === editorDraft.quoteId);
                if (!quote) {
                  throw new Error("Quote could not be found.");
                }
                await handleCreateJob(quote);
              },
            }
          : {})}
        {...(editorDraft?.quoteId
          ? {
              onArchive: async () => {
                await handleArchiveQuote(editorDraft.quoteId as QuoteView["id"]);
              },
            }
          : {})}
        onClose={() => setEditorDraft(null)}
      />
      <CustomerQuotePreviewPanel
        preview={customerPreview}
        isPending={previewCustomerQuote.isPending}
        onClose={() => setCustomerPreview(null)}
      />
    </main>
  );
}
