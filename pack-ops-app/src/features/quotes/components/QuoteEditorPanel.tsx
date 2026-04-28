import { useEffect, useMemo, useRef, useState } from "react";

import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import type { Document } from "@/domain/documents/types";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import { AssemblySearchSelect } from "@/features/quotes/components/AssemblySearchSelect";
import { getQuoteStatusActions } from "@/domain/quotes/status";
import type { QuoteLineItemInput, QuoteView } from "@/domain/quotes/types";
import { createId } from "@/lib/create-id";

export interface QuoteEditorDraftLine extends QuoteLineItemInput {
  localId: string;
}

export interface QuoteEditorDraft {
  quoteId?: QuoteView["id"];
  hasLinkedInvoice?: boolean;
  title: string;
  customerName: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  siteAddress: string;
  linkedLeadId: string;
  linkedLeadLabel: string | null;
  description: string;
  notes: string;
  laborCostRate: string;
  laborSellRate: string;
  markup: string;
  taxRate: string;
  status: QuoteView["status"];
  expiresAt: string;
  lineItems: QuoteEditorDraftLine[];
}

interface QuoteEditorPanelProps {
  initialDraft: QuoteEditorDraft | null;
  catalogItems: CatalogItem[];
  assemblies: AssemblyView[];
  leadOptions: Array<{ id: string; label: string }>;
  isPending: boolean;
  attachments?: Document[];
  isAttachmentPending?: boolean;
  onSubmit: (draft: QuoteEditorDraft) => Promise<void>;
  onUploadAttachment?: (files: FileList | null) => Promise<void>;
  onOpenAttachment?: (attachment: Document) => Promise<void>;
  onDeleteAttachment?: (attachment: Document) => Promise<void>;
  onPreviewCustomerQuote?: () => Promise<void> | void;
  onCreateAssembly?: (draft: QuoteEditorDraft) => Promise<void>;
  onAccept?: (draft: QuoteEditorDraft) => Promise<void>;
  onCreateJob?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onClose: () => void;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createLocalId(): string {
  return createId();
}

const mobileSafeInputStyle = {
  fontSize: "16px",
};

const mobileSafeTextareaStyle = {
  fontSize: "16px",
};

function buildManualLine(): QuoteEditorDraftLine {
  return {
    localId: createLocalId(),
    description: "Manual line",
    sourceType: "manual",
    lineKind: "item",
    quantity: 1,
    unit: "each",
    unitCost: 0,
    unitSell: 0,
    sku: null,
    note: null,
  };
}

function buildLabourLine(defaultCostRate: number, defaultSellRate: number): QuoteEditorDraftLine {
  return {
    localId: createLocalId(),
    description: "Labour",
    sourceType: "manual",
    lineKind: "labor",
    quantity: 1,
    unit: "hr",
    unitCost: defaultCostRate,
    unitSell: defaultSellRate,
    sku: null,
    note: null,
  };
}

function buildOrderList(lines: QuoteEditorDraftLine[]): string {
  const grouped = new Map<string, { description: string; sku: string | null; quantity: number; unit: string }>();

  for (const line of lines) {
    if (line.lineKind === "labor") {
      continue;
    }

    const unit = line.unit?.trim() || "each";
    const key = `${line.sku?.trim().toLowerCase() || line.description.trim().toLowerCase()}::${unit.toLowerCase()}`;
    const current = grouped.get(key) ?? {
      description: line.description.trim(),
      sku: line.sku?.trim() || null,
      quantity: 0,
      unit,
    };
    current.quantity += line.quantity ?? 0;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.description.localeCompare(right.description))
    .map((row) => `${row.sku ? `${row.sku} · ` : ""}${row.description} — ${Math.round(row.quantity * 1000) / 1000} ${row.unit}`)
    .join("\n");
}

function applyMarkup(cost: number, markupPercent: number): number {
  return roundMoney(cost * (1 + markupPercent / 100));
}

export function QuoteEditorPanel({
  initialDraft,
  catalogItems,
  assemblies,
  leadOptions,
  isPending,
  attachments = [],
  isAttachmentPending = false,
  onSubmit,
  onUploadAttachment,
  onOpenAttachment,
  onDeleteAttachment,
  onPreviewCustomerQuote,
  onCreateAssembly,
  onAccept,
  onCreateJob,
  onArchive,
  onClose,
}: QuoteEditorPanelProps) {
  const [draft, setDraft] = useState<QuoteEditorDraft | null>(initialDraft);
  const [sectionNames, setSectionNames] = useState<string[]>([]);
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<Record<string, string>>({});
  const [selectedAssemblyIds, setSelectedAssemblyIds] = useState<Record<string, string>>({});
  const [newSectionName, setNewSectionName] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(new Set());
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 720 : false,
  );
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
    setSectionNames(
      Array.from(
        new Set(
          initialDraft?.lineItems
            .map((line) => line.sectionName?.trim())
            .filter((section): section is string => Boolean(section)) ?? [],
        ),
      ),
    );
    setSelectedCatalogItemIds({});
    setSelectedAssemblyIds({});
    setNewSectionName("");
    setCopyFeedback(null);
    setExpandedLineIds(new Set());
  }, [initialDraft]);

  useEffect(() => {
    function updateLayout() {
      setIsMobileLayout(window.innerWidth <= 720);
    }

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const totals = useMemo(() => {
    if (!draft) {
      return {
        materialCost: 0,
        laborCost: 0,
        totalCost: 0,
        materialSell: 0,
        laborSell: 0,
        subtotal: 0,
        tax: 0,
        finalTotal: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
      };
    }

    const materialLines = draft.lineItems.filter((line) => line.lineKind !== "labor");
    const laborLines = draft.lineItems.filter((line) => line.lineKind === "labor");
    const materialCost = roundMoney(
      materialLines.reduce((total, line) => total + (line.unitCost ?? 0) * (line.quantity ?? 0), 0),
    );
    const laborCost = roundMoney(
      laborLines.reduce((total, line) => total + (line.unitCost ?? 0) * (line.quantity ?? 0), 0),
    );
    const materialSell = roundMoney(
      materialLines.reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0),
    );
    const laborSell = roundMoney(
      laborLines.reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0),
    );
    const subtotal = roundMoney(materialSell + laborSell);
    const tax = roundMoney(subtotal * toNumber(draft.taxRate, 0));
    const finalTotal = roundMoney(subtotal + tax);
    const totalCost = roundMoney(materialCost + laborCost);
    const grossProfit = roundMoney(subtotal - totalCost);
    const grossMarginPercent = subtotal > 0 ? roundMoney((grossProfit / subtotal) * 100) : 0;

    return {
      materialCost,
      laborCost,
      totalCost,
      materialSell,
      laborSell,
      subtotal,
      tax,
      finalTotal,
      grossProfit,
      grossMarginPercent,
    };
  }, [draft]);

  if (!draft) {
    return null;
  }

  const currentDraft = draft;
  const currentMarkup = toNumber(currentDraft.markup, 0);
  const currentLaborCostRate = toNumber(currentDraft.laborCostRate, 0);
  const currentLaborSellRate = toNumber(currentDraft.laborSellRate, 0);
  const isLockedByInvoice = Boolean(currentDraft.hasLinkedInvoice);
  const statusActions = getQuoteStatusActions(currentDraft.status);
  const statusHelpText =
    isLockedByInvoice
      ? "This quote is tied to an invoice. Editing is locked to avoid inconsistencies."
      : currentDraft.status === "draft"
      ? "Draft quotes can be accepted in one step here, and the service will handle the required Sent transition."
      : currentDraft.status === "accepted"
        ? "Accepted quotes stay editable until they are tied to an invoice."
        : null;

  const materialLines = currentDraft.lineItems.filter((line) => line.lineKind !== "labor");
  const laborLines = currentDraft.lineItems.filter((line) => line.lineKind === "labor");
  const lineSectionNames = Array.from(
    new Set(
      currentDraft.lineItems
        .map((line) => line.sectionName?.trim())
        .filter((section): section is string => Boolean(section)),
    ),
  );
  const quoteSections = (() => {
    const ordered = new Set<string>();
    for (const sectionName of sectionNames) {
      if (sectionName.trim()) {
        ordered.add(sectionName.trim());
      }
    }
    for (const sectionName of lineSectionNames) {
      ordered.add(sectionName);
    }
    if (currentDraft.lineItems.some((line) => !line.sectionName?.trim()) || ordered.size === 0) {
      return ["General", ...Array.from(ordered)];
    }
    return Array.from(ordered);
  })();
  const linesBySection = (() => {
    const grouped = new Map<string, QuoteEditorDraftLine[]>();
    for (const sectionName of quoteSections) {
      grouped.set(sectionName, []);
    }
    for (const line of currentDraft.lineItems) {
      const section = line.sectionName?.trim() || "General";
      const current = grouped.get(section) ?? [];
      current.push(line);
      grouped.set(section, current);
    }
    return Array.from(grouped.entries()).map(([name, lines]) => ({
      name,
      lines,
      materialSell: roundMoney(
        lines
          .filter((line) => line.lineKind !== "labor")
          .reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0),
      ),
      laborSell: roundMoney(
        lines
          .filter((line) => line.lineKind === "labor")
          .reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0),
      ),
      totalSell: roundMoney(lines.reduce((total, line) => total + (line.unitSell ?? 0) * (line.quantity ?? 0), 0)),
    }));
  })();

  function toggleExpanded(localId: string) {
    setExpandedLineIds((current) => {
      const next = new Set(current);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  }

  function updateLine(localId: string, patch: Partial<QuoteEditorDraftLine>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lineItems: current.lineItems.map((line) => (line.localId === localId ? { ...line, ...patch } : line)),
          }
        : current,
    );
  }

  function addJobPart() {
    const normalized = newSectionName.trim();
    if (!normalized) {
      return;
    }
    setSectionNames((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setNewSectionName("");
  }

  function toStoredSectionName(sectionName: string): string | null {
    const normalized = sectionName.trim();
    return normalized && normalized !== "General" ? normalized : null;
  }

  function removeLine(localId: string) {
    setDraft((current) =>
      current
        ? { ...current, lineItems: current.lineItems.filter((line) => line.localId !== localId) }
        : current,
    );
    setExpandedLineIds((current) => {
      const next = new Set(current);
      next.delete(localId);
      return next;
    });
  }

  function addManualLine(sectionName: string) {
    const nextLine = {
      ...buildManualLine(),
      sectionName: toStoredSectionName(sectionName),
      sortOrder: currentDraft.lineItems.length,
    };
    setDraft((current) =>
      current ? { ...current, lineItems: [...current.lineItems, nextLine] } : current,
    );
    setExpandedLineIds((current) => new Set(current).add(nextLine.localId));
  }

  function addLabourLine(sectionName: string) {
    const nextLine = {
      ...buildLabourLine(currentLaborCostRate, currentLaborSellRate),
      sectionName: toStoredSectionName(sectionName),
      sortOrder: currentDraft.lineItems.length,
    };
    setDraft((current) =>
      current ? { ...current, lineItems: [...current.lineItems, nextLine] } : current,
    );
    setExpandedLineIds((current) => new Set(current).add(nextLine.localId));
  }

  function addCatalogItem(sectionName: string) {
    const selectedCatalogItemId = selectedCatalogItemIds[sectionName] ?? "";
    const selectedCatalogItem = catalogItems.find((item) => item.id === selectedCatalogItemId) ?? null;
    if (!selectedCatalogItem) {
      return;
    }

    const unitCost = selectedCatalogItem.costPrice ?? 0;
    const nextLine: QuoteEditorDraftLine = {
      localId: createLocalId(),
      catalogItemId: selectedCatalogItem.id,
      sortOrder: currentDraft.lineItems.length,
      description: selectedCatalogItem.name,
      sku: selectedCatalogItem.sku,
      note: null,
      sectionName: toStoredSectionName(sectionName),
      sourceType: "material",
      lineKind: "item",
      quantity: 1,
      unit: selectedCatalogItem.unit || "each",
      unitCost,
      unitSell: applyMarkup(unitCost, currentMarkup),
    };

    setDraft((current) =>
      current ? { ...current, lineItems: [...current.lineItems, nextLine] } : current,
    );
    setSelectedCatalogItemIds((current) => ({ ...current, [sectionName]: "" }));
  }

  function addAssembly(sectionName: string) {
    const selectedAssemblyId = selectedAssemblyIds[sectionName] ?? "";
    const selectedAssembly = assemblies.find((assembly) => assembly.id === selectedAssemblyId) ?? null;
    if (!selectedAssembly) {
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextLines = [...current.lineItems];
      for (const item of selectedAssembly.items) {
        const unitCost = item.materialCostPrice ?? 0;
        nextLines.push({
          localId: createLocalId(),
          catalogItemId: item.catalogItemId,
          sortOrder: nextLines.length,
          description: item.materialName,
          sku: item.materialSku,
          note: selectedAssembly.name,
          sectionName: item.sectionName ?? toStoredSectionName(sectionName),
          sourceType: "assembly",
          lineKind: "item",
          quantity: item.quantity,
          unit: item.materialUnit || "each",
          unitCost,
          unitSell: applyMarkup(unitCost, currentMarkup),
        });
      }

      if (selectedAssembly.defaultLaborHours > 0) {
        nextLines.push({
          localId: createLocalId(),
          sortOrder: nextLines.length,
          description: `${selectedAssembly.name} labor`,
          sku: null,
          note: selectedAssembly.description,
          sectionName: toStoredSectionName(sectionName),
          sourceType: "assembly",
          lineKind: "labor",
          quantity: selectedAssembly.defaultLaborHours,
          unit: "hr",
          unitCost: currentLaborCostRate,
          unitSell: currentLaborSellRate,
        });
      }

      return { ...current, lineItems: nextLines };
    });

    setSelectedAssemblyIds((current) => ({ ...current, [sectionName]: "" }));
  }

  function applyMarkupToMaterialLines() {
    setDraft((current) =>
      current
        ? {
            ...current,
            lineItems: current.lineItems.map((line) =>
              line.lineKind === "labor"
                ? line
                : {
                    ...line,
                    unitSell: applyMarkup(line.unitCost ?? 0, currentMarkup),
                  },
            ),
          }
        : current,
    );
  }

  async function handleCopyOrderList() {
    const text = buildOrderList(currentDraft.lineItems);
    if (!text) {
      setCopyFeedback("Add material lines before copying an order list.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Order list copied.");
    } catch {
      setCopyFeedback("Clipboard copy failed. Try again from a secure browser context.");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        zIndex: 30,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "1120px",
          maxHeight: "min(92vh, 960px)",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{currentDraft.quoteId ? "Edit Quote" : "New Quote"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Build the internal estimate with materials, assemblies, manual lines, and live totals.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <div
          style={{
            border: "1px solid #e4e8f1",
            borderRadius: "12px",
            background: "#f8fafc",
            padding: "12px",
            color: "#5b6475",
            fontSize: "14px",
          }}
        >
          <strong style={{ color: "#172033" }}>
            {currentDraft.companyName || currentDraft.customerName || "New standalone quote"}
          </strong>
          <div style={{ marginTop: "4px" }}>
            {currentDraft.contactName || currentDraft.customerName}
            {currentDraft.phone ? ` · ${currentDraft.phone}` : ""}
            {currentDraft.email ? ` · ${currentDraft.email}` : ""}
          </div>
          <div style={{ marginTop: "4px" }}>
            Linked Lead: {currentDraft.linkedLeadLabel ?? "None"}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e4e8f1",
            borderRadius: "12px",
            padding: "12px",
            display: "grid",
            gap: "10px",
          }}
        >
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={async (event) => {
              await onUploadAttachment?.(event.target.files);
              event.target.value = "";
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>Quote Attachments</strong>
              <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>
                Keep quote photos, supplier notes, and customer files with the quote.
              </div>
            </div>
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={!currentDraft.quoteId || isPending || isAttachmentPending || !onUploadAttachment}
            >
              {isAttachmentPending ? "Uploading..." : "Add Attachment"}
            </button>
          </div>
          {!currentDraft.quoteId ? (
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Save the quote before adding attachments.</div>
          ) : attachments.length === 0 ? (
            <div style={{ color: "#5b6475", fontSize: "13px" }}>No quote attachments yet.</div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    border: "1px solid #eef2f6",
                    borderRadius: "10px",
                    padding: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void onOpenAttachment?.(attachment)}
                    style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }}
                  >
                    <strong style={{ display: "block" }}>{attachment.fileName}</strong>
                    <span style={{ color: "#5b6475", fontSize: "13px" }}>
                      {attachment.sizeBytes > 0 ? `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · ` : ""}
                      {new Date(attachment.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  {onDeleteAttachment ? (
                    <button
                      type="button"
                      onClick={() => void onDeleteAttachment(attachment)}
                      disabled={isPending || isAttachmentPending}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Customer Name</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.customerName}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, customerName: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Company Name</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.companyName}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, companyName: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Primary Contact</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.contactName}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, contactName: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Phone</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.phone}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, phone: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Email</span>
            <input
              type="email"
              style={mobileSafeInputStyle}
              value={currentDraft.email}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, email: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Site / Job Address</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.siteAddress}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, siteAddress: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Linked Lead</span>
            <select
              style={mobileSafeInputStyle}
              value={currentDraft.linkedLeadId}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        linkedLeadId: event.target.value,
                        linkedLeadLabel:
                          leadOptions.find((option) => option.id === event.target.value)?.label ?? null,
                      }
                    : current,
                )
              }
            >
              <option value="">None</option>
              {leadOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Quote Title / Job Name</span>
            <input
              style={mobileSafeInputStyle}
              value={currentDraft.title}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Labor Cost Rate</span>
            <input
              type="number"
              style={mobileSafeInputStyle}
              min="0"
              step="0.01"
              value={currentDraft.laborCostRate}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, laborCostRate: event.target.value } : current))
              }
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Labor Sell Rate</span>
            <input
              type="number"
              style={mobileSafeInputStyle}
              min="0"
              step="0.01"
              value={currentDraft.laborSellRate}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, laborSellRate: event.target.value } : current))
              }
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Markup %</span>
            <input
              type="number"
              style={mobileSafeInputStyle}
              min="0"
              step="0.1"
              value={currentDraft.markup}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, markup: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Tax Rate</span>
            <input
              type="number"
              style={mobileSafeInputStyle}
              min="0"
              step="0.0001"
              value={currentDraft.taxRate}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, taxRate: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Expires On</span>
            <input
              type="date"
              style={mobileSafeInputStyle}
              value={currentDraft.expiresAt}
              disabled={isPending || isLockedByInvoice}
              onChange={(event) => setDraft((current) => (current ? { ...current, expiresAt: event.target.value } : current))}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={applyMarkupToMaterialLines} disabled={isPending || isLockedByInvoice}>
            Apply Markup to Material Lines
          </button>
          <span style={{ color: "#5b6475", fontSize: "13px" }}>
            Markup is a quote-wide helper. You can still override any line sell price after this.
          </span>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Feature / Scope Summary</span>
          <textarea
            style={mobileSafeTextareaStyle}
            rows={3}
            value={currentDraft.description}
            disabled={isPending || isLockedByInvoice}
            onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Internal Notes</span>
          <textarea
            style={mobileSafeTextareaStyle}
            rows={3}
            value={currentDraft.notes}
            disabled={isPending || isLockedByInvoice}
            onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
          />
        </label>

        <div
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "14px",
            padding: "14px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>Job Parts</strong>
              <div style={{ color: "#5b6475", fontSize: "14px", marginTop: "4px" }}>
                Add headers like Service or Rough-in, then add materials, assemblies, and labour under each part.
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e4e8f1",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafcff",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <strong>Part of Job</strong>
                <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "3px" }}>
                  New materials, assemblies, and labour will be added under this header.
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", alignItems: "end" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span>New Part</span>
                <input
                  style={mobileSafeInputStyle}
                  value={newSectionName}
                  disabled={isPending || isLockedByInvoice}
                  placeholder="Service, Rough-in, Finish..."
                  onChange={(event) => setNewSectionName(event.target.value)}
                />
              </label>
              <button type="button" onClick={addJobPart} disabled={isPending || isLockedByInvoice || !newSectionName.trim()}>
                Add Part
              </button>
            </div>
          </div>

            <div style={{ display: "grid", gap: "14px" }}>
              {linesBySection.map((section) => (
                  <div key={section.name} style={{ display: "grid", gap: "10px", border: "1px solid #d9dfeb", borderRadius: "14px", padding: "12px", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <strong>{section.name}</strong>
                        <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "3px" }}>
                          {section.lines.length} lines · Materials ${section.materialSell.toFixed(2)} · Labour ${section.laborSell.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#5b6475", fontSize: "12px" }}>Part Total</div>
                        <strong>${section.totalSell.toFixed(2)}</strong>
                      </div>
                    </div>
                    <div
                      style={{
                        border: "1px solid #e4e8f1",
                        borderRadius: "12px",
                        padding: "12px",
                        background: "#fafcff",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", alignItems: "end" }}>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span>Add Material</span>
                          <MaterialSearchSelect
                            catalogItems={catalogItems}
                            selectedMaterialId={selectedCatalogItemIds[section.name] ?? ""}
                            isPending={isPending || isLockedByInvoice}
                            placeholder={`Search materials for ${section.name}...`}
                            onSelect={(materialId) =>
                              setSelectedCatalogItemIds((current) => ({ ...current, [section.name]: materialId }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => addCatalogItem(section.name)}
                          disabled={isPending || isLockedByInvoice || !(selectedCatalogItemIds[section.name] ?? "")}
                        >
                          Add Material
                        </button>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span>Add Assembly</span>
                          <AssemblySearchSelect
                            assemblies={assemblies}
                            selectedAssemblyId={selectedAssemblyIds[section.name] ?? ""}
                            isPending={isPending || isLockedByInvoice}
                            placeholder={`Search assemblies for ${section.name}...`}
                            onSelect={(assemblyId) =>
                              setSelectedAssemblyIds((current) => ({ ...current, [section.name]: assemblyId }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => addAssembly(section.name)}
                          disabled={isPending || isLockedByInvoice || !(selectedAssemblyIds[section.name] ?? "")}
                        >
                          Add Assembly
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => addLabourLine(section.name)} disabled={isPending || isLockedByInvoice}>
                          Add Labour
                        </button>
                        <button type="button" onClick={() => addManualLine(section.name)} disabled={isPending || isLockedByInvoice}>
                          Add Manual Line
                        </button>
                      </div>
                    </div>
                    {section.lines.length === 0 ? (
                      <div
                        style={{
                          border: "1px dashed #d9dfeb",
                          borderRadius: "12px",
                          padding: "12px",
                          color: "#5b6475",
                          background: "#fff",
                        }}
                      >
                        No lines under this part yet.
                      </div>
                    ) : null}
                    {section.lines.map((line, index) => {
                      const isExpanded = expandedLineIds.has(line.localId);
                      const lineTotalCost = roundMoney((line.unitCost ?? 0) * (line.quantity ?? 0));
                      const lineTotalSell = roundMoney((line.unitSell ?? 0) * (line.quantity ?? 0));

                      return (
                        <div
                          key={line.localId}
                          style={{
                            border: "1px solid #e4e8f1",
                            borderRadius: "12px",
                            padding: "12px",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobileLayout
                                ? "1fr"
                                : "minmax(220px, 1.8fr) repeat(4, minmax(90px, 0.7fr)) auto auto",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>{line.description}</div>
                              <div style={{ color: "#5b6475", fontSize: "12px" }}>
                                {line.sourceType.toUpperCase()}
                                {line.sku ? ` · ${line.sku}` : ""}
                                {line.lineKind === "labor" ? " · LABOR" : ""}
                                {line.sectionName ? ` · ${line.sectionName}` : ""}
                              </div>
                            </div>
                            {isMobileLayout ? (
                              <>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                    gap: "10px 12px",
                                  }}
                                >
                                  <div>
                                    <div style={{ color: "#5b6475", fontSize: "12px" }}>Line Type</div>
                                    <strong style={{ textTransform: "capitalize" }}>
                                      {line.lineKind === "labor" ? "Labour" : line.sourceType}
                                    </strong>
                                  </div>
                                  <div>
                                    <div style={{ color: "#5b6475", fontSize: "12px" }}>Qty</div>
                                    <strong>{line.quantity ?? 1}</strong>
                                  </div>
                                  <div>
                                    <div style={{ color: "#5b6475", fontSize: "12px" }}>Unit Sell</div>
                                    <strong>${(line.unitSell ?? 0).toFixed(2)}</strong>
                                  </div>
                                  <div>
                                    <div style={{ color: "#5b6475", fontSize: "12px" }}>Line Total</div>
                                    <strong>${lineTotalSell.toFixed(2)}</strong>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                  <button type="button" onClick={() => toggleExpanded(line.localId)} disabled={isPending || isLockedByInvoice}>
                                    {isExpanded ? "Collapse" : "Edit"}
                                  </button>
                                  <button type="button" onClick={() => removeLine(line.localId)} disabled={isPending || isLockedByInvoice}>
                                    Delete
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Qty</div>
                                  <strong>{line.quantity ?? 1}</strong>
                                </div>
                                <div>
                                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Cost</div>
                                  <strong>${(line.unitCost ?? 0).toFixed(2)}</strong>
                                </div>
                                <div>
                                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Sell</div>
                                  <strong>${(line.unitSell ?? 0).toFixed(2)}</strong>
                                </div>
                                <div>
                                  <div style={{ color: "#5b6475", fontSize: "12px" }}>Line Sell</div>
                                  <strong>${lineTotalSell.toFixed(2)}</strong>
                                </div>
                                <button type="button" onClick={() => toggleExpanded(line.localId)} disabled={isPending || isLockedByInvoice}>
                                  {isExpanded ? "Collapse" : "Edit"}
                                </button>
                                <button type="button" onClick={() => removeLine(line.localId)} disabled={isPending || isLockedByInvoice}>
                                  Remove
                                </button>
                              </>
                            )}
                          </div>

                          {isExpanded ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                              <label style={{ display: "grid", gap: "6px" }}>
                                <span>Description</span>
                                <input
                                  style={mobileSafeInputStyle}
                                  value={line.description}
                                  disabled={isPending || isLockedByInvoice}
                                  onChange={(event) => updateLine(line.localId, { description: event.target.value })}
                                />
                              </label>

                              <label style={{ display: "grid", gap: "6px" }}>
                                <span>Part of Job</span>
                                <input
                                  style={mobileSafeInputStyle}
                                  value={line.sectionName ?? ""}
                                  disabled={isPending || isLockedByInvoice}
                                  placeholder="General, Service, Rough-in..."
                                  onChange={(event) => updateLine(line.localId, { sectionName: event.target.value || null })}
                                />
                              </label>

                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>Qty</span>
                                  <input
                                    type="number"
                                    style={mobileSafeInputStyle}
                                    min="0.001"
                                    step="0.001"
                                    value={line.quantity ?? 1}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { quantity: Number(event.target.value) })}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>Unit</span>
                                  <input
                                    style={mobileSafeInputStyle}
                                    value={line.unit ?? "each"}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { unit: event.target.value })}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>Unit Cost</span>
                                  <input
                                    type="number"
                                    style={mobileSafeInputStyle}
                                    min="0"
                                    step="0.01"
                                    value={line.unitCost ?? 0}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { unitCost: Number(event.target.value) })}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>Unit Sell</span>
                                  <input
                                    type="number"
                                    style={mobileSafeInputStyle}
                                    min="0"
                                    step="0.01"
                                    value={line.unitSell ?? 0}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { unitSell: Number(event.target.value) })}
                                  />
                                </label>
                                <div style={{ display: "grid", gap: "6px" }}>
                                  <span>Line Cost</span>
                                  <strong>${lineTotalCost.toFixed(2)}</strong>
                                </div>
                                <div style={{ display: "grid", gap: "6px" }}>
                                  <span>Line Sell</span>
                                  <strong>${lineTotalSell.toFixed(2)}</strong>
                                </div>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 180px) 1fr", gap: "10px" }}>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>SKU</span>
                                  <input
                                    style={mobileSafeInputStyle}
                                    value={line.sku ?? ""}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { sku: event.target.value || null })}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: "6px" }}>
                                  <span>Notes</span>
                                  <input
                                    style={mobileSafeInputStyle}
                                    value={line.note ?? ""}
                                    disabled={isPending || isLockedByInvoice}
                                    onChange={(event) => updateLine(line.localId, { note: event.target.value || null })}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}

                          <input type="hidden" value={String(index)} />
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
        </div>

        <div
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "14px",
            padding: "14px",
            background: "#f8fafc",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong>Totals</strong>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(240px, 320px)", gap: "14px", alignItems: "start" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Material Cost</div><strong>${totals.materialCost.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Labor Cost</div><strong>${totals.laborCost.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Total Cost</div><strong>${totals.totalCost.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Material Sell</div><strong>${totals.materialSell.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Labor Sell</div><strong>${totals.laborSell.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Gross Profit</div><strong>${totals.grossProfit.toFixed(2)}</strong></div>
              <div><div style={{ color: "#5b6475", fontSize: "13px" }}>Gross Margin %</div><strong>{totals.grossMarginPercent.toFixed(2)}%</strong></div>
            </div>
            <div
              style={{
                border: "1px solid #c7d2fe",
                borderRadius: "14px",
                padding: "14px",
                background: "#fff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ color: "#5b6475" }}>Subtotal</span>
                <strong>${totals.subtotal.toFixed(2)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ color: "#5b6475" }}>Tax</span>
                <strong>${totals.tax.toFixed(2)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid #e4e8f1", paddingTop: "10px" }}>
                <span style={{ fontWeight: 700 }}>Grand Total</span>
                <strong style={{ fontSize: "22px" }}>${totals.finalTotal.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Status</span>
          <div
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "12px",
              padding: "10px",
              background: "#f8fafc",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong style={{ color: "#172033" }}>{currentDraft.status}</strong>
            {statusActions.length > 0 ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {statusActions.map((action) => (
                  <button
                    key={action.nextStatus}
                    type="button"
                    disabled={isPending || isLockedByInvoice}
                    onClick={() => {
                      if (action.requiresConfirmation) {
                        const confirmed = window.confirm(action.confirmationMessage ?? "Change quote status?");
                        if (!confirmed) {
                          return;
                        }
                      }

                      if (action.nextStatus === "accepted" && onAccept) {
                        void onAccept(currentDraft);
                        return;
                      }

                      setDraft((current) => (current ? { ...current, status: action.nextStatus } : current));
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : (
              <span style={{ color: "#5b6475", fontSize: "14px" }}>No further status changes here.</span>
            )}
            {statusHelpText ? <span style={{ color: "#5b6475", fontSize: "13px" }}>{statusHelpText}</span> : null}
          </div>
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {!isLockedByInvoice ? (
            <button onClick={() => void onSubmit(currentDraft)} disabled={isPending} style={{ fontWeight: 600 }}>
              {isPending ? "Saving..." : "Save Quote"}
            </button>
          ) : null}
          {onCreateAssembly ? (
            <button
              type="button"
              onClick={() => void onCreateAssembly(currentDraft)}
              disabled={isPending || isLockedByInvoice}
            >
              Make Assembly
            </button>
          ) : null}
          <button type="button" onClick={() => void handleCopyOrderList()} disabled={isPending}>
            Copy Order List
          </button>
          {currentDraft.quoteId && onPreviewCustomerQuote ? (
            <button type="button" onClick={() => void onPreviewCustomerQuote()} disabled={isPending}>
              Preview Customer Quote
            </button>
          ) : null}
          {currentDraft.quoteId && currentDraft.status === "accepted" && onCreateJob ? (
            <button onClick={() => void onCreateJob()} disabled={isPending}>
              {isPending ? "Working..." : "Create Job"}
            </button>
          ) : null}
          {currentDraft.quoteId && onArchive ? (
            <button onClick={() => void onArchive()} disabled={isPending} style={{ color: "#b42318" }}>
              {isPending ? "Working..." : "Archive Quote"}
            </button>
          ) : null}
          {copyFeedback ? <span style={{ color: "#445168", fontSize: "13px" }}>{copyFeedback}</span> : null}
        </div>
      </section>
    </div>
  );
}
