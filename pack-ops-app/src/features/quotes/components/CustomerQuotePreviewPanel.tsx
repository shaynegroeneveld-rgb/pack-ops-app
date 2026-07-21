import { useMemo, useState } from "react";

import type { CustomerQuotePreview } from "@/domain/quotes/types";
import { Modal } from "@/ui";

interface CustomerQuotePreviewPanelProps {
  preview: CustomerQuotePreview | null;
  isPending: boolean;
  onClose: () => void;
}

type QuotePreviewSection = ReturnType<typeof groupQuotePreviewSections>[number];

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openQuotePrintWindow(input: {
  company: CustomerQuotePreview["company"];
  quote: CustomerQuotePreview["quote"];
  issueDate: string;
  projectSite: string;
  scopeLines: string[];
  termsLines: string[];
  previewSections: QuotePreviewSection[];
  showMaterials: boolean;
  showLabourSummary: boolean;
  showItemPrices: boolean;
}) {
  const {
    company,
    quote,
    issueDate,
    projectSite,
    scopeLines,
    termsLines,
    previewSections,
    showMaterials,
    showLabourSummary,
    showItemPrices,
  } = input;

  const scopeMarkup = scopeLines.length > 0
    ? `<ul>${scopeLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : `<p class="muted">No scope summary has been added yet.</p>`;

  const sectionsMarkup = previewSections
    .filter((section) => showMaterials || showLabourSummary)
    .map((section) => {
      const materialsMarkup =
        showMaterials && section.materials.length > 0
          ? `<ul>${section.materials
              .map(
                (line) =>
                  `<li>${escapeHtml(line.description)} — ${escapeHtml(String(line.quantity))} ${escapeHtml(line.unit)}${
                    showItemPrices ? ` — ${escapeHtml(formatMoney(line.lineTotalSell))}` : ""
                  }</li>`,
              )
              .join("")}</ul>`
          : "";

      const labourMarkup =
        showLabourSummary && section.labourHours > 0
          ? `<div class="labour-line">Labour: ${section.labourHours.toFixed(2)} hours${
              showItemPrices ? ` — ${escapeHtml(formatMoney(section.labourTotal))}` : ""
            }</div>`
          : "";

      const partTotalsMarkup = showItemPrices
        ? `<div class="part-totals">
            ${showMaterials ? `<div class="row"><span class="muted">Materials</span><strong>${escapeHtml(formatMoney(section.materialTotal))}</strong></div>` : ""}
            ${showLabourSummary ? `<div class="row"><span class="muted">Labour</span><strong>${escapeHtml(formatMoney(section.labourTotal))}</strong></div>` : ""}
            <div class="row"><span class="muted">Part Total</span><strong>${escapeHtml(formatMoney(section.total))}</strong></div>
          </div>`
        : "";

      return `
        <div class="part">
          <div class="part-header">
            <strong>${escapeHtml(section.name)}</strong>
            ${showItemPrices ? `<strong>${escapeHtml(formatMoney(section.total))}</strong>` : ""}
          </div>
          ${materialsMarkup}
          ${labourMarkup}
          ${partTotalsMarkup}
        </div>
      `;
    })
    .join("");

  const companyLines = [...company.addressLines, company.phone, company.email, company.website].filter(
    (line): line is string => Boolean(line),
  );

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(quote.number)}</title>
    <style>
      @page { margin: 12mm; }
      body {
        margin: 0;
        color: #172033;
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .sheet { display: grid; gap: 18px; }
      .header {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 16px;
        align-items: start;
      }
      .brand { display: grid; gap: 6px; }
      .logo { max-width: 200px; max-height: 70px; object-fit: contain; }
      .muted { color: #5b6475; }
      .meta {
        border: 1px solid #d9dfeb;
        border-radius: 12px;
        padding: 10px;
        background: #f8fafc;
        display: grid;
        gap: 6px;
        break-inside: avoid;
      }
      .billto, .scope, .terms { display: grid; gap: 6px; break-inside: avoid; }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #5b6475; }
      ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
      .part {
        border: 1px solid #d9dfeb;
        border-radius: 12px;
        padding: 12px;
        display: grid;
        gap: 8px;
        break-inside: avoid;
      }
      .part-header { display: flex; justify-content: space-between; gap: 12px; }
      .labour-line { color: #445168; }
      .part-totals {
        border-top: 1px solid #eef2f6;
        padding-top: 8px;
        display: grid;
        gap: 4px;
      }
      .row { display: flex; justify-content: space-between; gap: 12px; }
      .total-card {
        border: 1px solid #d9dfeb;
        border-radius: 14px;
        padding: 16px;
        background: #f8fafc;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        break-inside: avoid;
      }
      .total-amount { font-size: 30px; font-weight: 800; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="brand">
          ${company.logoDataUrl ? `<img class="logo" src="${company.logoDataUrl}" alt="${escapeHtml(company.name)} logo" />` : `<div style="font-size:22px;font-weight:700;">${escapeHtml(company.name)}</div>`}
          ${company.logoDataUrl ? `<strong>${escapeHtml(company.name)}</strong>` : ""}
          <div class="muted">${companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
        </div>
        <div class="meta">
          <div><div class="muted">Quote Number</div><strong>${escapeHtml(quote.number)}</strong></div>
          <div><div class="muted">Date</div><strong>${escapeHtml(issueDate)}</strong></div>
          <div><div class="muted">Project / Site</div><strong>${escapeHtml(projectSite)}</strong></div>
        </div>
      </div>

      <div class="billto">
        <div class="eyebrow">Prepared For</div>
        <strong style="font-size:18px;">${escapeHtml(quote.customerName)}</strong>
        <div class="muted">
          ${escapeHtml(quote.contactName)}${quote.phone ? ` · ${escapeHtml(quote.phone)}` : ""}${quote.email ? ` · ${escapeHtml(quote.email)}` : ""}
        </div>
      </div>

      <div class="scope">
        <div class="eyebrow">Scope Summary</div>
        ${scopeMarkup}
      </div>

      ${sectionsMarkup ? `<div class="parts"><div class="eyebrow">Job Parts</div><div style="display:grid; gap:12px; margin-top:8px;">${sectionsMarkup}</div></div>` : ""}

      <div class="total-card">
        <div>
          <div class="eyebrow">Total Price</div>
          <div class="total-amount">${escapeHtml(formatMoney(quote.total))}</div>
        </div>
        <div class="muted">Includes applicable tax of ${escapeHtml(formatMoney(quote.taxAmount))}</div>
      </div>

      ${termsLines.length > 0 ? `<div class="terms"><div class="eyebrow">Notes / Exclusions / Terms</div><ul>${termsLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>` : ""}
    </div>
  </body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    throw new Error("Print window was blocked. Please allow pop-ups and try again.");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  let hasTriggeredPrint = false;
  const triggerPrint = () => {
    if (hasTriggeredPrint) return;
    hasTriggeredPrint = true;
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        hasTriggeredPrint = false;
      }
    }, 350);
  };

  printWindow.onload = triggerPrint;
  printWindow.onafterprint = () => {
    printWindow.close();
  };
  window.setTimeout(triggerPrint, 500);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
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

  return (
    <Modal
      open={Boolean(preview && quote)}
      onClose={onClose}
      title="Customer Quote Preview"
      footer={
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setShowMaterials((value) => !value)} disabled={isPending}>
            {showMaterials ? "Hide Materials" : "Show Materials"}
          </button>
          <button type="button" onClick={() => setShowItemPrices((value) => !value)} disabled={isPending}>
            {showItemPrices ? "Hide Item Prices" : "Show Item Prices"}
          </button>
          <button type="button" onClick={() => setShowLabourSummary((value) => !value)} disabled={isPending}>
            {showLabourSummary ? "Hide Labour" : "Show Labour"}
          </button>
          <button
            type="button"
            onClick={() =>
              quote
                ? openQuotePrintWindow({
                    company,
                    quote,
                    issueDate,
                    projectSite,
                    scopeLines,
                    termsLines,
                    previewSections,
                    showMaterials,
                    showLabourSummary,
                    showItemPrices,
                  })
                : undefined
            }
            disabled={isPending || !quote}
          >
            Print / Export
          </button>
        </div>
      }
    >
      {quote ? (
        <>
        <p style={{ margin: 0, color: "#5b6475" }}>
          Clean customer-facing output with no internal costs or raw estimating detail.
        </p>

        <article
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
        </>
      ) : null}
    </Modal>
  );
}
