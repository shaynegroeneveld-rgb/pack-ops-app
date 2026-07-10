import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { CatalogItem } from "@/domain/materials/types";
import type { QuoteLineItemInput, QuoteView } from "@/domain/quotes/types";
import { brand, pageStyle } from "@/features/shared/ui/mobile-styles";
import { useMaterialsSlice } from "@/features/materials/hooks/use-materials-slice";
import { useQuotesSlice } from "@/features/quotes/hooks/use-quotes-slice";

interface TakeoffMaterialLine {
  section: string;
  item: string;
  quantity: number;
}

interface MatchedTakeoffMaterialLine extends TakeoffMaterialLine {
  match: CatalogItem | null;
  matchScore: number;
  lineCost: number | null;
  source: "takeoff" | "manual";
  adjustmentKind?: "device" | "material";
  note?: string;
}

interface ManualAdjustmentDraft {
  adjustmentKind: "device" | "material";
  catalogItemId: string;
  customItem: string;
  quantity: string;
  note: string;
}

interface ManualAdjustment {
  id: string;
  adjustmentKind: "device" | "material";
  item: string;
  quantity: number;
  catalogItemId: string | null;
  note: string | null;
}

interface TakeoffLabourLine {
  phase: string;
  item: string;
  hours: number;
}

interface QuoteDraft {
  customerName: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  siteAddress: string;
  title: string;
  materialMarkup: string;
  laborCostRate: string;
  laborSellRate: string;
  taxRate: string;
}

const frameStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: 0,
  display: "block",
  background: "#eef2f1",
};

const toolbarButtonStyle: CSSProperties = {
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  background: "#ffffff",
  color: brand.text,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "8px 10px",
  background: "#ffffff",
  color: brand.text,
  minWidth: 0,
};

const emptyAdjustmentDraft: ManualAdjustmentDraft = {
  adjustmentKind: "material",
  catalogItemId: "",
  customItem: "",
  quantity: "1",
  note: "",
};

const TAKEOFF_CATALOG_STORAGE_KEY = "packops-takeoff-material-catalog-v1";

const emptyQuoteDraft: QuoteDraft = {
  customerName: "",
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  siteAddress: "",
  title: "",
  materialMarkup: "30",
  laborCostRate: "0",
  laborSellRate: "95",
  taxRate: "5",
};

export function ElectricalTakeoffPage() {
  const { currentUser } = useAuthContext();
  if (!currentUser) {
    return null;
  }

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reviewLines, setReviewLines] = useState<MatchedTakeoffMaterialLine[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [manualAdjustments, setManualAdjustments] = useState<ManualAdjustment[]>([]);
  const [manualAdjustmentDraft, setManualAdjustmentDraft] = useState<ManualAdjustmentDraft>(emptyAdjustmentDraft);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isQuotePanelOpen, setIsQuotePanelOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft>(emptyQuoteDraft);
  const [createdQuote, setCreatedQuote] = useState<QuoteView | null>(null);
  const { catalogQuery } = useMaterialsSlice(currentUser);
  const { builderResourcesQuery, createQuote } = useQuotesSlice(currentUser);
  const catalogItems = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const builderResources = builderResourcesQuery.data ?? null;
  const pricedCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.isActive && item.costPrice !== null),
    [catalogItems],
  );
  const takeoffCatalogItems = useMemo(
    () =>
      catalogItems
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          category: item.category,
          costPrice: item.costPrice,
          aliases: item.aliases,
        })),
    [catalogItems],
  );

  const matchedReviewLines = useMemo(
    () => buildReviewLines(reviewLines ?? [], manualAdjustments, pricedCatalogItems),
    [manualAdjustments, pricedCatalogItems, reviewLines],
  );

  const reviewDisplayTotals = useMemo(() => {
    const lines = matchedReviewLines;
    const labourLines = reviewLines ? readTakeoffLabourLines(iframeRef.current) : [];
    return {
      matched: lines.filter((line) => line.match).length,
      unmatched: lines.filter((line) => !line.match).length,
      totalCost: lines.reduce((total, line) => total + (line.lineCost ?? 0), 0),
      labourHours: labourLines.reduce((total, line) => total + line.hours, 0),
    };
  }, [matchedReviewLines]);

  useEffect(() => {
    if (!builderResources) {
      return;
    }

    setQuoteDraft((current) => ({
      ...current,
      materialMarkup: current.materialMarkup || String(builderResources.defaultMaterialMarkup),
      laborCostRate: current.laborCostRate === emptyQuoteDraft.laborCostRate
        ? String(builderResources.defaultLaborCostRate)
        : current.laborCostRate,
      laborSellRate: current.laborSellRate === emptyQuoteDraft.laborSellRate
        ? String(builderResources.defaultLaborSellRate)
        : current.laborSellRate,
      taxRate: current.taxRate === emptyQuoteDraft.taxRate
        ? String(builderResources.defaultTaxRate)
        : current.taxRate,
    }));
  }, [builderResources]);

  function syncTakeoffCatalog() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TAKEOFF_CATALOG_STORAGE_KEY, JSON.stringify(takeoffCatalogItems));
  }

  useEffect(() => {
    syncTakeoffCatalog();
  }, [takeoffCatalogItems]);

  function handleReviewMaterials() {
    const lines = readTakeoffMaterialLines(iframeRef.current);
    if (lines.length === 0) {
      setReviewLines(null);
      setReviewError("No takeoff material rows found yet. Place devices on the plan first, then review materials.");
      return;
    }

    setReviewLines(lines.map((line) => matchTakeoffLine(line, pricedCatalogItems)));
    setReviewError(null);
    setCreatedQuote(null);
  }

  function handleAddManualAdjustment() {
    const quantity = Number(manualAdjustmentDraft.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      setReviewError("Manual adjustment quantity must be a positive or negative number.");
      return;
    }

    const catalogItem = catalogItems.find((item) => item.id === manualAdjustmentDraft.catalogItemId) ?? null;
    const itemName = catalogItem?.name ?? manualAdjustmentDraft.customItem.trim();
    if (!itemName) {
      setReviewError("Choose a catalog item or type a custom manual adjustment item.");
      return;
    }

    setManualAdjustments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        adjustmentKind: manualAdjustmentDraft.adjustmentKind,
        item: itemName,
        quantity: Math.round(quantity * 100) / 100,
        catalogItemId: catalogItem?.id ?? null,
        note: manualAdjustmentDraft.note.trim() || null,
      },
    ]);
    setManualAdjustmentDraft(emptyAdjustmentDraft);
    setReviewError(null);
  }

  async function handleCopyCsv() {
    if (!matchedReviewLines.length) {
      return;
    }

    const csv = [
      ["Section", "Source", "Kind", "Takeoff item", "Quantity", "Catalog match", "Catalog SKU", "Unit", "Unit cost", "Line cost", "Note"],
      ...matchedReviewLines.map((line) => [
        line.section,
        line.source,
        line.adjustmentKind ?? "",
        line.item,
        String(line.quantity),
        line.match?.name ?? "",
        line.match?.sku ?? "",
        line.match?.unit ?? "",
        line.match?.costPrice?.toFixed(2) ?? "",
        line.lineCost?.toFixed(2) ?? "",
        line.note ?? "",
      ]),
    ]
      .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    await navigator.clipboard.writeText(csv);
    setReviewError("Copied matched material CSV to your clipboard.");
  }

  function openQuotePanel() {
    if (!matchedReviewLines.length) {
      setReviewError("Review the takeoff materials first, then create a quote.");
      return;
    }

    const title = quoteDraft.title.trim() || getTakeoffProjectName(iframeRef.current) || "Electrical takeoff quote";
    setQuoteDraft((current) => ({
      ...current,
      title,
      customerName: current.customerName || current.companyName || "Takeoff customer",
    }));
    setIsQuotePanelOpen(true);
    setReviewError(null);
  }

  async function handleCreateQuote() {
    const materialMarkup = Number(quoteDraft.materialMarkup);
    const laborCostRate = Number(quoteDraft.laborCostRate);
    const laborSellRate = Number(quoteDraft.laborSellRate);
    const taxRate = Number(quoteDraft.taxRate);

    if (!quoteDraft.customerName.trim()) {
      setReviewError("Customer name is required before creating a quote.");
      return;
    }

    if (!quoteDraft.title.trim()) {
      setReviewError("Project / site is required before creating a quote.");
      return;
    }

    if (![materialMarkup, laborCostRate, laborSellRate, taxRate].every(Number.isFinite)) {
      setReviewError("Markup, labour rates, and tax rate must be valid numbers.");
      return;
    }

    const labourLines = readTakeoffLabourLines(iframeRef.current);
    const lineItems = buildQuoteLineItems({
      materialLines: matchedReviewLines,
      labourLines,
      materialMarkup,
      laborCostRate,
      laborSellRate,
    });

    if (lineItems.length === 0) {
      setReviewError("No positive material or labour lines are ready to quote yet.");
      return;
    }

    try {
      const quote = await createQuote.mutateAsync({
        customerName: quoteDraft.customerName,
        companyName: quoteDraft.companyName || null,
        contactName: quoteDraft.contactName || null,
        phone: quoteDraft.phone || null,
        email: quoteDraft.email || null,
        siteAddress: quoteDraft.siteAddress || null,
        title: quoteDraft.title,
        description: "Generated from the electrical takeoff material and labour review.",
        notes: "Created from Electrical Takeoff. Review unmatched/zero-dollar lines before sending.",
        laborCostRate,
        laborSellRate,
        taxRate,
        status: "draft",
        lineItems,
      });
      setCreatedQuote(quote);
      setReviewError(`Created draft quote ${quote.number}. Open Quotes to review pricing and customer PDF.`);
      setIsQuotePanelOpen(false);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Quote creation failed.");
    }
  }

  return (
    <section
      style={{
        ...pageStyle(),
        padding: 0,
        height: "calc(100vh - 73px)",
        minHeight: "720px",
        overflow: "hidden",
        background: brand.surfaceAlt,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px 14px",
          borderBottom: `1px solid ${brand.border}`,
          background: "#ffffff",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", color: brand.text }}>Electrical Takeoff</strong>
          <span style={{ color: brand.textSoft, fontSize: "13px" }}>
            Review the takeoff material summary against your Pack Ops catalog pricing.
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={toolbarButtonStyle} onClick={handleReviewMaterials}>
            Review Takeoff Materials
          </button>
          <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(true)}>
            Add / Modify Devices
          </button>
          {reviewLines?.length ? (
            <button type="button" style={toolbarButtonStyle} onClick={() => void handleCopyCsv()}>
              Copy CSV
            </button>
          ) : null}
        </div>
        {reviewError ? (
          <div
            role="status"
            style={{
              flexBasis: "100%",
              border: "1px solid #f0d59c",
              borderRadius: "10px",
              padding: "8px 10px",
              background: "#fff9ec",
              color: "#7a4d00",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {reviewError}
          </div>
        ) : null}
      </header>

      <div style={{ position: "relative", minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          src="/takeoff/index.html"
          title="Residential Electrical Takeoff"
          style={frameStyle}
          onLoad={syncTakeoffCatalog}
        />

        {reviewLines ? (
          <aside
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              width: "min(520px, calc(100% - 28px))",
              maxHeight: "calc(100% - 28px)",
              overflow: "auto",
              border: `1px solid ${brand.border}`,
              borderRadius: "14px",
              background: "#ffffff",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
              padding: "14px",
              display: "grid",
              gap: "12px",
              zIndex: 4,
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", color: brand.text }}>Catalog Material Review</h2>
                <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                  {reviewDisplayTotals.matched} matched, {reviewDisplayTotals.unmatched} unmatched · Estimated catalog cost ${reviewDisplayTotals.totalCost.toFixed(2)}
                  {" · "}
                  Labour {reviewDisplayTotals.labourHours.toFixed(2)} hr
                </p>
              </div>
              <button type="button" style={toolbarButtonStyle} onClick={() => setReviewLines(null)}>
                Close
              </button>
            </header>

            <section
              style={{
                border: `1px solid ${brand.border}`,
                borderRadius: "12px",
                padding: "10px",
                background: brand.surfaceAlt,
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ display: "block", color: brand.text }}>Manual adjustments</strong>
                <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                  {manualAdjustments.length} device/material change{manualAdjustments.length === 1 ? "" : "s"} included.
                </span>
              </div>
              <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(true)}>
                Open
              </button>
            </section>

            <section
              style={{
                border: `1px solid ${brand.border}`,
                borderRadius: "12px",
                padding: "10px",
                background: "#ffffff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div>
                <strong style={{ display: "block", color: brand.text }}>Quote prep</strong>
                <span style={{ color: brand.textSoft, fontSize: "13px" }}>
                  Builds a new draft quote with grouped material lines and takeoff labour lines.
                </span>
              </div>
              <button type="button" style={{ ...toolbarButtonStyle, justifySelf: "start" }} onClick={openQuotePanel}>
                Create Quote
              </button>
              {createdQuote ? (
                <span style={{ color: brand.primaryDark, fontSize: "13px", fontWeight: 800 }}>
                  Draft quote {createdQuote.number} created.
                </span>
              ) : null}
            </section>

            <div style={{ display: "grid", gap: "8px" }}>
              {matchedReviewLines.map((line) => (
                <article
                  key={`${line.source}-${line.section}-${line.item}-${line.note ?? ""}`}
                  style={{
                    border: `1px solid ${line.match ? brand.border : "#f0c2a7"}`,
                    borderRadius: "10px",
                    padding: "10px",
                    display: "grid",
                    gap: "6px",
                    background: line.match ? "#ffffff" : "#fff8f4",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <strong style={{ color: brand.text }}>{line.item}</strong>
                    <span style={{ color: brand.primaryDark, fontWeight: 800 }}>{line.quantity}</span>
                  </div>
                  <div style={{ color: brand.textSoft, fontSize: "12px" }}>{line.section}</div>
                  {line.source === "manual" ? (
                    <div style={{ color: brand.primaryDark, fontSize: "12px", fontWeight: 800 }}>
                      Manual {line.adjustmentKind} adjustment{line.note ? ` · ${line.note}` : ""}
                    </div>
                  ) : null}
                  {line.match ? (
                    <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                      Matched to <strong style={{ color: brand.text }}>{line.match.name}</strong>
                      {line.match.sku ? ` (${line.match.sku})` : ""} · {line.match.unit} · $
                      {line.match.costPrice?.toFixed(2)} each · Line ${line.lineCost?.toFixed(2)}
                    </div>
                  ) : (
                    <div style={{ color: "#9a3412", fontSize: "13px", fontWeight: 700 }}>
                      No priced catalog match yet. Add a catalog item or alias, then review again.
                    </div>
                  )}
                </article>
              ))}
            </div>
          </aside>
        ) : null}

        {isQuotePanelOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-create-quote-title"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.36)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
              zIndex: 9,
            }}
          >
            <section
              style={{
                width: "min(760px, 100%)",
                maxHeight: "min(760px, 100%)",
                overflow: "auto",
                border: `1px solid ${brand.border}`,
                borderRadius: "14px",
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
                padding: "16px",
                display: "grid",
                gap: "14px",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                <div>
                  <h2 id="takeoff-create-quote-title" style={{ margin: 0, fontSize: "20px", color: brand.text }}>
                    Create Quote From Takeoff
                  </h2>
                  <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                    Creates a brand new draft quote. Review it in Quotes before sending the customer PDF.
                  </p>
                </div>
                <button type="button" style={toolbarButtonStyle} onClick={() => setIsQuotePanelOpen(false)}>
                  Close
                </button>
              </header>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                {([
                  ["Customer name", "customerName"],
                  ["Company", "companyName"],
                  ["Contact name", "contactName"],
                  ["Phone", "phone"],
                  ["Email", "email"],
                  ["Site address", "siteAddress"],
                  ["Project / site", "title"],
                ] satisfies Array<[string, keyof QuoteDraft]>).map(([label, key]) => (
                  <label key={key} style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    {label}
                    <input
                      value={quoteDraft[key as keyof QuoteDraft]}
                      onChange={(event) => setQuoteDraft((draft) => ({ ...draft, [key]: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                {([
                  ["Material markup %", "materialMarkup"],
                  ["Labour cost/hr", "laborCostRate"],
                  ["Labour sell/hr", "laborSellRate"],
                  ["Tax %", "taxRate"],
                ] satisfies Array<[string, keyof QuoteDraft]>).map(([label, key]) => (
                  <label key={key} style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={quoteDraft[key as keyof QuoteDraft]}
                      onChange={(event) => setQuoteDraft((draft) => ({ ...draft, [key]: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>

              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "12px",
                  padding: "10px",
                  background: brand.surfaceAlt,
                  color: brand.textSoft,
                  fontSize: "13px",
                }}
              >
                Quote will include {matchedReviewLines.filter((line) => line.quantity > 0).length} material line(s) and{" "}
                {readTakeoffLabourLines(iframeRef.current).length} labour line(s). Unmatched materials are included at $0 so you can price them in the quote editor.
              </div>

              <button
                type="button"
                className="primary"
                style={{ ...toolbarButtonStyle, background: brand.primary, borderColor: brand.primary, color: "#ffffff", justifySelf: "start" }}
                onClick={() => void handleCreateQuote()}
                disabled={createQuote.isPending}
              >
                {createQuote.isPending ? "Creating..." : "Create Draft Quote"}
              </button>
            </section>
          </div>
        ) : null}

        {isAdjustmentsOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-adjustments-title"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.36)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
              zIndex: 8,
            }}
          >
            <section
              style={{
                width: "min(720px, 100%)",
                maxHeight: "min(760px, 100%)",
                overflow: "auto",
                border: `1px solid ${brand.border}`,
                borderRadius: "14px",
                background: "#ffffff",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
                padding: "16px",
                display: "grid",
                gap: "14px",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                <div>
                  <h2 id="takeoff-adjustments-title" style={{ margin: 0, fontSize: "20px", color: brand.text }}>
                    Device & Material Adjustments
                  </h2>
                  <p style={{ margin: "4px 0 0", color: brand.textSoft, fontSize: "13px" }}>
                    Add or subtract one-off devices and materials. These roll into the review, CSV, and quote prep list.
                  </p>
                </div>
                <button type="button" style={toolbarButtonStyle} onClick={() => setIsAdjustmentsOpen(false)}>
                  Done
                </button>
              </header>

              <div
                style={{
                  border: `1px solid ${brand.border}`,
                  borderRadius: "12px",
                  padding: "12px",
                  background: brand.surfaceAlt,
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Type
                    <select
                      value={manualAdjustmentDraft.adjustmentKind}
                      onChange={(event) =>
                        setManualAdjustmentDraft((draft) => ({
                          ...draft,
                          adjustmentKind: event.target.value as ManualAdjustmentDraft["adjustmentKind"],
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="material">Material</option>
                      <option value="device">Device</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Quantity +/-
                    <input
                      value={manualAdjustmentDraft.quantity}
                      onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, quantity: event.target.value }))}
                      type="number"
                      step="0.25"
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                  Catalog material/device
                  <select
                    value={manualAdjustmentDraft.catalogItemId}
                    onChange={(event) =>
                      setManualAdjustmentDraft((draft) => ({
                        ...draft,
                        catalogItemId: event.target.value,
                        customItem: event.target.value ? "" : draft.customItem,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="">Custom / unmatched</option>
                    {catalogItems
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.sku ? ` (${item.sku})` : ""}
                        </option>
                      ))}
                  </select>
                </label>

                {!manualAdjustmentDraft.catalogItemId ? (
                  <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                    Custom item
                    <input
                      value={manualAdjustmentDraft.customItem}
                      onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, customItem: event.target.value }))}
                      placeholder="Example: 1-gang box"
                      style={inputStyle}
                    />
                  </label>
                ) : null}

                <label style={{ display: "grid", gap: "4px", color: brand.textSoft, fontSize: "12px", fontWeight: 700 }}>
                  Note
                  <input
                    value={manualAdjustmentDraft.note}
                    onChange={(event) => setManualAdjustmentDraft((draft) => ({ ...draft, note: event.target.value }))}
                    placeholder="Optional reason"
                    style={inputStyle}
                  />
                </label>

                <button type="button" style={{ ...toolbarButtonStyle, justifySelf: "start" }} onClick={handleAddManualAdjustment}>
                  Add adjustment
                </button>
              </div>

              <section style={{ display: "grid", gap: "8px" }}>
                <strong style={{ color: brand.text }}>
                  Current adjustments ({manualAdjustments.length})
                </strong>
                {manualAdjustments.length ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {manualAdjustments.map((adjustment) => (
                      <div
                        key={adjustment.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: "10px",
                          alignItems: "center",
                          border: `1px solid ${brand.border}`,
                          borderRadius: "10px",
                          padding: "10px",
                          color: brand.textSoft,
                          fontSize: "13px",
                        }}
                      >
                        <span>
                          <strong style={{ color: brand.text }}>
                            {adjustment.adjustmentKind === "device" ? "Device" : "Material"}
                          </strong>
                          {" · "}
                          {adjustment.item}
                          {adjustment.note ? ` · ${adjustment.note}` : ""}
                        </span>
                        <strong style={{ color: adjustment.quantity < 0 ? "#9a3412" : brand.primaryDark }}>
                          {adjustment.quantity > 0 ? "+" : ""}{adjustment.quantity}
                        </strong>
                        <button
                          type="button"
                          style={{ ...toolbarButtonStyle, padding: "5px 8px" }}
                          onClick={() =>
                            setManualAdjustments((current) => current.filter((item) => item.id !== adjustment.id))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${brand.border}`,
                      borderRadius: "10px",
                      padding: "14px",
                      color: brand.textSoft,
                      fontSize: "13px",
                      background: brand.surfaceAlt,
                    }}
                  >
                    No manual adjustments yet. Use this for quick adds, deletes, or custom materials before building the quote.
                  </div>
                )}
              </section>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function readTakeoffMaterialLines(iframe: HTMLIFrameElement | null): TakeoffMaterialLine[] {
  const document = iframe?.contentDocument;
  if (!document) {
    return [];
  }

  const sections = Array.from(document.querySelectorAll(".material-section"));
  const materialLines = sections.flatMap((section) => {
    const sectionName = section.querySelector("h3")?.textContent?.trim() || "Materials";
    return Array.from(section.querySelectorAll(".takeoff.compact > div")).flatMap((row) => {
      const item = row.querySelector("span")?.textContent?.trim();
      const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";
      const quantity = parseTakeoffQuantity(quantityText);

      if (!item || !Number.isFinite(quantity) || quantity <= 0) {
        return [];
      }

      return [{ section: sectionName, item, quantity }];
    });
  });

  if (materialLines.some(isWireLikeLine)) {
    return materialLines;
  }

  const wireLines = Array.from(document.querySelectorAll(".wire-results .wire-row")).flatMap((row) => {
    const label = row.querySelector("span")?.textContent?.trim() ?? "";
    const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";
    const wireType = label.split(" - ").pop()?.trim();
    const quantity = parseTakeoffQuantity(quantityText);

    if (!wireType || !Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [{ section: "Wire", item: `${wireType} wire (m)`, quantity }];
  });

  return rollUpTakeoffMaterialLines([...materialLines, ...wireLines]);
}

function readTakeoffLabourLines(iframe: HTMLIFrameElement | null): TakeoffLabourLine[] {
  const document = iframe?.contentDocument;
  if (!document) {
    return [];
  }

  return Array.from(document.querySelectorAll(".takeoff.compact > div")).flatMap((row) => {
    const item = row.querySelector("span")?.textContent?.trim();
    const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";

    if (!item || item.toLowerCase().includes("total labour") || !quantityText.toLowerCase().includes("hr")) {
      return [];
    }

    const hours = parseTakeoffQuantity(quantityText);
    if (!Number.isFinite(hours) || hours <= 0) {
      return [];
    }

    const [phase, ...rest] = item.split(":");
    return [{
      phase: phase?.trim() || "Labour",
      item: rest.join(":").trim() || item,
      hours,
    }];
  });
}

function getTakeoffProjectName(iframe: HTMLIFrameElement | null): string | null {
  const document = iframe?.contentDocument;
  if (!document) {
    return null;
  }

  const projectInput = Array.from(document.querySelectorAll("input")).find((input) =>
    input.previousSibling?.textContent?.toLowerCase().includes("project"),
  );
  return projectInput?.value?.trim() || null;
}

function matchTakeoffLine(line: TakeoffMaterialLine, catalogItems: CatalogItem[]): MatchedTakeoffMaterialLine {
  const rankedMatches = catalogItems
    .map((item) => ({ item, score: scoreCatalogMatch(line.item, item) }))
    .sort((left, right) => right.score - left.score);
  const best = rankedMatches[0];
  const match = best && best.score >= 0.52 ? best.item : null;
  const lineCost = match?.costPrice !== null && match?.costPrice !== undefined
    ? Math.round(match.costPrice * line.quantity * 100) / 100
    : null;

  return {
    ...line,
    match,
    matchScore: best?.score ?? 0,
    lineCost,
    source: "takeoff",
  };
}

function buildReviewLines(
  takeoffLines: MatchedTakeoffMaterialLine[],
  manualAdjustments: ManualAdjustment[],
  catalogItems: CatalogItem[],
): MatchedTakeoffMaterialLine[] {
  const manualLines = manualAdjustments.map((adjustment) => {
    const catalogMatch = adjustment.catalogItemId
      ? catalogItems.find((item) => item.id === adjustment.catalogItemId) ?? null
      : null;
    const baseLine: TakeoffMaterialLine = {
      section: adjustment.adjustmentKind === "device" ? "Manual Devices" : "Manual Materials",
      item: adjustment.item,
      quantity: adjustment.quantity,
    };
    const matchedLine = catalogMatch
      ? {
          ...baseLine,
          match: catalogMatch,
          matchScore: 1,
          lineCost: catalogMatch.costPrice !== null
            ? Math.round(catalogMatch.costPrice * adjustment.quantity * 100) / 100
            : null,
          source: "manual" as const,
          adjustmentKind: adjustment.adjustmentKind,
          ...(adjustment.note ? { note: adjustment.note } : {}),
        }
      : {
          ...matchTakeoffLine(baseLine, catalogItems),
          source: "manual" as const,
          adjustmentKind: adjustment.adjustmentKind,
          ...(adjustment.note ? { note: adjustment.note } : {}),
        };

    return matchedLine;
  });

  return rollUpReviewLines([...takeoffLines, ...manualLines]);
}

function rollUpReviewLines(lines: MatchedTakeoffMaterialLine[]): MatchedTakeoffMaterialLine[] {
  const rolledUp = new Map<string, MatchedTakeoffMaterialLine>();

  for (const line of lines) {
    const key = [
      line.source,
      line.section,
      line.item,
      line.match?.id ?? "unmatched",
      line.adjustmentKind ?? "",
      line.note ?? "",
    ].join("::");
    const current = rolledUp.get(key);
    if (!current) {
      rolledUp.set(key, line);
      continue;
    }

    const quantity = Math.round((current.quantity + line.quantity) * 100) / 100;
    rolledUp.set(key, {
      ...current,
      quantity,
      lineCost: current.match?.costPrice !== null && current.match?.costPrice !== undefined
        ? Math.round(current.match.costPrice * quantity * 100) / 100
        : null,
    });
  }

  return [...rolledUp.values()].filter((line) => line.quantity !== 0);
}

function buildQuoteLineItems(input: {
  materialLines: MatchedTakeoffMaterialLine[];
  labourLines: TakeoffLabourLine[];
  materialMarkup: number;
  laborCostRate: number;
  laborSellRate: number;
}): QuoteLineItemInput[] {
  const lineItems: QuoteLineItemInput[] = [];

  input.materialLines
    .filter((line) => line.quantity > 0)
    .forEach((line, index) => {
      const unitCost = line.match?.costPrice ?? 0;
      lineItems.push({
        catalogItemId: line.match?.id ?? null,
        sortOrder: index,
        description: line.match?.name ?? line.item,
        sku: line.match?.sku ?? null,
        note: line.note ?? (line.match ? null : `Unmatched takeoff item: ${line.item}`),
        sectionName: normalizeQuoteSection(line.section, line.item),
        sourceType: line.match ? "material" : "manual",
        lineKind: "item",
        quantity: roundQuantity(line.quantity),
        unit: line.match?.unit ?? inferTakeoffUnit(line),
        unitCost,
        unitSell: roundMoney(unitCost * (1 + input.materialMarkup / 100)),
      });
    });

  rollUpLabourForQuote(input.labourLines)
    .forEach((line, index) => {
      lineItems.push({
        sortOrder: lineItems.length + index,
        description: `${line.phase} labour`,
        note: line.item,
        sectionName: normalizeQuoteSection(line.phase),
        sourceType: "manual",
        lineKind: "labor",
        quantity: roundQuantity(line.hours),
        unit: "hr",
        unitCost: roundMoney(input.laborCostRate),
        unitSell: roundMoney(input.laborSellRate),
      });
    });

  return lineItems;
}

function normalizeQuoteSection(section: string, item = ""): string {
  const lower = `${section} ${item}`.toLowerCase();
  if (lower.includes("panel") || lower.includes("subpanel")) {
    return "Service";
  }
  if (lower.includes("breaker") || lower.includes("plate") || lower.includes("device") || lower.includes("fixture")) {
    return "Finish";
  }
  if (
    lower.includes("box")
    || lower.includes("wire")
    || lower.includes("nmd")
    || lower.includes("cable")
    || lower.includes("awg")
    || lower.includes("vapour")
    || lower.includes("vapor")
    || lower.includes("boot")
  ) {
    return "Rough-in";
  }
  if (lower.includes("finish")) {
    return "Finish";
  }
  return "Rough-in";
}

function rollUpTakeoffMaterialLines(lines: TakeoffMaterialLine[]): TakeoffMaterialLine[] {
  const rolledUp = new Map<string, TakeoffMaterialLine>();
  for (const line of lines) {
    const key = `${line.section.toLowerCase()}::${line.item.toLowerCase()}`;
    const current = rolledUp.get(key);
    rolledUp.set(key, current
      ? { ...current, quantity: roundQuantity(current.quantity + line.quantity) }
      : line);
  }
  return [...rolledUp.values()];
}

function rollUpLabourForQuote(lines: TakeoffLabourLine[]): TakeoffLabourLine[] {
  const grouped = new Map<string, TakeoffLabourLine>();
  for (const line of lines) {
    if (line.hours <= 0) {
      continue;
    }
    const phase = normalizeQuoteSection(line.phase);
    const current = grouped.get(phase);
    grouped.set(phase, current
      ? {
          phase,
          item: [current.item, line.item].filter(Boolean).join("; "),
          hours: roundQuantity(current.hours + line.hours),
        }
      : { phase, item: line.item, hours: roundQuantity(line.hours) });
  }
  return ["Service", "Rough-in", "Finish"]
    .map((phase) => grouped.get(phase))
    .filter((line): line is TakeoffLabourLine => Boolean(line));
}

function inferTakeoffUnit(line: TakeoffMaterialLine): string {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  if (lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg")) {
    return "m";
  }
  return "each";
}

function isWireLikeLine(line: TakeoffMaterialLine): boolean {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  return lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg");
}

function parseTakeoffQuantity(value: string): number {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scoreCatalogMatch(takeoffItem: string, catalogItem: CatalogItem): number {
  const query = normalizeMatchText(takeoffItem);
  const candidates = [
    catalogItem.name,
    catalogItem.sku ?? "",
    catalogItem.category ?? "",
    catalogItem.notes ?? "",
    ...catalogItem.aliases,
  ].map(normalizeMatchText).filter(Boolean);

  if (!query || candidates.length === 0) {
    return 0;
  }

  let bestScore = 0;
  for (const candidate of candidates) {
    if (candidate === query) {
      bestScore = Math.max(bestScore, 1);
    } else if (candidate.includes(query) || query.includes(candidate)) {
      bestScore = Math.max(bestScore, 0.88);
    } else {
      bestScore = Math.max(bestScore, tokenOverlap(query, candidate), bigramSimilarity(query, candidate));
    }
  }

  return bestScore;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b14\/2\b/g, "2c14")
    .replace(/\b14\/3\b/g, "3c14")
    .replace(/\bromex\b/g, "nmd")
    .replace(/\bgfci\b/g, "gfi")
    .replace(/\bafci\b/g, "arc fault")
    .replace(/\bpot\s*light\b/g, "recessed light")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function bigramSimilarity(left: string, right: string): number {
  const leftSet = bigramSet(left.replace(/\s+/g, ""));
  const rightSet = bigramSet(right.replace(/\s+/g, ""));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (leftSet.size + rightSet.size);
}

function bigramSet(value: string): Set<string> {
  if (value.length < 2) {
    return new Set(value ? [value] : []);
  }

  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}
