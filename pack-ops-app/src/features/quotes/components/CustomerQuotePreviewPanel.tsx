import { useMemo, useState } from "react";

import type { CustomerQuotePreview } from "@/domain/quotes/types";

interface CustomerQuotePreviewPanelProps {
  preview: CustomerQuotePreview | null;
  isPending: boolean;
  onClose: () => void;
}

function groupQuotePreviewSections(quote: CustomerQuotePreview["quote"] | null) {
  const grouped = new Map<
    string,
    {
      materials: CustomerQuotePreview["quote"]["lineItems"];
      labour: CustomerQuotePreview["quote"]["lineItems"];
    }
  >();

  for (const line of quote?.lineItems ?? []) {
    const sectionName = line.sectionName?.trim() || "General";
    const current = grouped.get(sectionName) ?? { materials: [], labour: [] };
    if (line.lineKind === "labor") {
      current.labour.push(line);
    } else {
      current.materials.push(line);
    }
    grouped.set(sectionName, current);
  }

  return Array.from(grouped.entries()).map(([name, lines]) => {
    const materialTotal = lines.materials.reduce((total, line) => total + line.lineTotalSell, 0);
    const labourTotal = lines.labour.reduce((total, line) => total + line.lineTotalSell, 0);
    const labourHours = lines.labour.reduce((total, line) => total + line.quantity, 0);
    return {
      name,
      ...lines,
      materialTotal,
      labourTotal,
      labourHours,
      total: materialTotal + labourTotal,
    };
  });
}

export function CustomerQuotePreviewPanel({
  preview,
  isPending,
  onClose,
}: CustomerQuotePreviewPanelProps) {
  const [showMaterials, setShowMaterials] = useState(true);
  const [showItemPrices, setShowItemPrices] = useState(false);
  const [showLabourSummary, setShowLabourSummary] = useState(false);
  const company = preview?.company ?? {
    name: "",
    email: null,
    phone: null,
    website: null,
    addressLines: [],
    logoDataUrl: null,
  };
  const quote = preview?.quote ?? null;
  const issueDate = preview?.issueDate ?? "";
  const projectSite = preview?.projectSite ?? "";
  const scopeLines = preview?.scopeLines ?? [];
  const termsLines = preview?.termsLines ?? [];
  const previewSections = useMemo(() => groupQuotePreviewSections(quote), [quote]);

  if (!preview || !quote) {
    return null;
  }

  return (
    <div
      className="customer-quote-preview-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        zIndex: 40,
      }}
    >
      <style>
        {`
          @media print {
            @page {
              margin: 12mm;
            }

            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }

            body * {
              visibility: hidden !important;
            }

            .customer-quote-preview-overlay {
              visibility: visible !important;
              position: absolute !important;
              inset: 0 !important;
              display: block !important;
              background: transparent !important;
              padding: 0 !important;
              width: 100% !important;
              margin: 0 !important;
            }

            .customer-quote-preview-shell {
              visibility: visible !important;
              max-width: none !important;
              max-height: none !important;
              overflow: visible !important;
              border: 0 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              margin: 0 !important;
              gap: 0 !important;
              background: transparent !important;
            }

            .customer-quote-preview-controls {
              display: none !important;
            }

            .customer-quote-preview-article {
              visibility: visible !important;
              border: 0 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
              break-inside: avoid !important;
            }

            .customer-quote-preview-article * {
              visibility: visible !important;
            }
          }
        `}
      </style>
      <section
        className="customer-quote-preview-shell"
        style={{
          width: "100%",
          maxWidth: "980px",
          maxHeight: "min(92vh, 980px)",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div
          className="customer-quote-preview-controls"
          style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Customer Quote Preview</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Clean customer-facing output with no internal costs or raw estimating detail.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowMaterials((value) => !value)}
              disabled={isPending}
            >
              {showMaterials ? "Hide Materials" : "Show Materials"}
            </button>
            <button
              type="button"
              onClick={() => setShowItemPrices((value) => !value)}
              disabled={isPending}
            >
              {showItemPrices ? "Hide Item Prices" : "Show Item Prices"}
            </button>
            <button
              type="button"
              onClick={() => setShowLabourSummary((value) => !value)}
              disabled={isPending}
            >
              {showLabourSummary ? "Hide Labour" : "Show Labour"}
            </button>
            <button type="button" onClick={() => window.print()} disabled={isPending}>
              Print / Export
            </button>
            <button type="button" onClick={onClose} disabled={isPending}>
              Close
            </button>
          </div>
        </div>

        <article
          className="customer-quote-preview-article"
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "18px",
            background: "#ffffff",
            padding: "28px",
            display: "grid",
            gap: "24px",
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              {company.logoDataUrl ? (
                <img
                  src={company.logoDataUrl}
                  alt={`${company.name} logo`}
                  style={{ maxHeight: "120px", maxWidth: "320px", objectFit: "contain" }}
                />
              ) : (
                <div
                  style={{
                    borderRadius: "14px",
                    border: "1px solid #d9dfeb",
                    padding: "14px 16px",
                    fontWeight: 700,
                    fontSize: "22px",
                    color: "#172033",
                    background: "#f8fafc",
                    width: "fit-content",
                  }}
                >
                  {company.name}
                </div>
              )}
              <div style={{ color: "#445168", display: "grid", gap: "2px", fontSize: "14px" }}>
                {!company.logoDataUrl ? <strong style={{ color: "#172033" }}>{company.name}</strong> : null}
                {company.addressLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                {company.phone ? <span>{company.phone}</span> : null}
                {company.email ? <span>{company.email}</span> : null}
                {company.website ? <span>{company.website}</span> : null}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #d9dfeb",
                borderRadius: "16px",
                padding: "16px",
                minWidth: "280px",
                background: "#f8fafc",
                display: "grid",
                gap: "8px",
              }}
            >
              <div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>Quote Number</div>
                <strong>{quote.number}</strong>
              </div>
              <div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>Date</div>
                <strong>{issueDate}</strong>
              </div>
              <div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>Project / Site</div>
                <strong>{projectSite}</strong>
              </div>
            </div>
          </header>

          <section style={{ display: "grid", gap: "8px" }}>
            <div style={{ color: "#5b6475", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Prepared For
            </div>
            <strong style={{ fontSize: "20px" }}>{quote.customerName}</strong>
            <div style={{ color: "#445168" }}>
              {quote.contactName}
              {quote.phone ? ` · ${quote.phone}` : ""}
              {quote.email ? ` · ${quote.email}` : ""}
            </div>
          </section>

          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Scope Summary</h4>
            {scopeLines.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#172033", display: "grid", gap: "6px" }}>
                {scopeLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: "#5b6475" }}>No scope summary has been added yet.</p>
            )}
          </section>

          {(showMaterials || showLabourSummary) && previewSections.length > 0 ? (
            <section style={{ display: "grid", gap: "10px" }}>
              <h4 style={{ margin: 0 }}>Job Parts</h4>
              <div style={{ display: "grid", gap: "12px" }}>
                {previewSections.map((section) => (
                  <div
                    key={section.name}
                    style={{
                      border: "1px solid #d9dfeb",
                      borderRadius: "14px",
                      padding: "14px",
                      display: "grid",
                      gap: "10px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <strong>{section.name}</strong>
                      {showItemPrices ? <strong>${section.total.toFixed(2)}</strong> : null}
                    </div>

                    {showMaterials && section.materials.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: "20px", color: "#445168", display: "grid", gap: "6px" }}>
                        {section.materials.map((line) => (
                          <li key={line.id}>
                            {line.description} — {line.quantity} {line.unit}
                            {showItemPrices ? ` — $${line.lineTotalSell.toFixed(2)}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {showLabourSummary && section.labourHours > 0 ? (
                      <div style={{ color: "#445168" }}>
                        Labour: {section.labourHours.toFixed(2)} hours
                        {showItemPrices ? ` — $${section.labourTotal.toFixed(2)}` : ""}
                      </div>
                    ) : null}

                    {showItemPrices ? (
                      <div style={{ borderTop: "1px solid #eef2f6", paddingTop: "8px", display: "grid", gap: "4px" }}>
                        {showMaterials ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#5b6475" }}>Materials</span>
                            <strong>${section.materialTotal.toFixed(2)}</strong>
                          </div>
                        ) : null}
                        {showLabourSummary ? (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ color: "#5b6475" }}>Labour</span>
                            <strong>${section.labourTotal.toFixed(2)}</strong>
                          </div>
                        ) : null}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <span style={{ color: "#5b6475" }}>Part Total</span>
                          <strong>${section.total.toFixed(2)}</strong>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "16px",
              padding: "18px",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "end",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ color: "#5b6475", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Total Price
              </div>
              <strong style={{ fontSize: "34px", color: "#172033" }}>${quote.total.toFixed(2)}</strong>
            </div>
            <div style={{ color: "#5b6475", fontSize: "14px" }}>
              Includes applicable tax of ${quote.taxAmount.toFixed(2)}
            </div>
          </section>

          {termsLines.length > 0 ? (
            <section style={{ display: "grid", gap: "10px" }}>
              <h4 style={{ margin: 0 }}>Notes / Exclusions / Terms</h4>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#445168", display: "grid", gap: "6px" }}>
                {termsLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </section>
    </div>
  );
}
