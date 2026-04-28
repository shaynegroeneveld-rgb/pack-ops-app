import { Fragment } from "react";

import type {
  ActualInvoiceControls,
  EditableInvoiceDraftLine,
  InvoiceGenerationPreview,
  InvoiceGenerationSource,
} from "@/domain/invoices/types";

interface InvoicePreviewOptions {
  showMaterials: boolean;
  showLabour: boolean;
  showItemPrices: boolean;
  descriptionOfWork: string;
}

interface InvoiceGenerationPanelProps {
  preview: InvoiceGenerationPreview | null;
  draftLines: EditableInvoiceDraftLine[];
  draftValidation: string[];
  selectedSource: InvoiceGenerationSource;
  canUseQuoteSource: boolean;
  isPreviewPending: boolean;
  isSavePending: boolean;
  onSelectSource: (source: InvoiceGenerationSource) => void;
  onGeneratePreview: () => void;
  onSave: () => void;
  onDraftLineChange: (
    lineId: string,
    patch: Partial<
      Pick<
        EditableInvoiceDraftLine,
        "description" | "quantity" | "unit" | "unitPrice" | "unitCost" | "markupPercent" | "sectionName" | "category" | "note"
      >
    >,
  ) => void;
  onDraftLineTotalChange: (lineId: string, lineTotal: number) => void;
  onAddManualLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onMoveLine: (lineId: string, direction: "up" | "down") => void;
  actualInvoiceControls: ActualInvoiceControls;
  actualPartOptions?: string[];
  onActualInvoiceControlsChange: (controls: ActualInvoiceControls) => void;
  previewOptions: InvoicePreviewOptions;
  onPreviewOptionsChange: (options: InvoicePreviewOptions) => void;
  onClose: () => void;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function sumLineSubtotals(lines: InvoiceGenerationPreview["lines"]): number {
  return lines.reduce((total, line) => total + line.subtotal, 0);
}

function lineStatusLabel(line: EditableInvoiceDraftLine): { label: string; tone: string; background: string } {
  if (line.origin === "manual") {
    return { label: "Manual", tone: "#1d4ed8", background: "#dbeafe" };
  }
  if (line.isEdited) {
    return { label: "Edited", tone: "#92400e", background: "#fef3c7" };
  }
  return { label: "Generated", tone: "#166534", background: "#dcfce7" };
}

function groupPreviewSections(lines: InvoiceGenerationPreview["lines"]) {
  const grouped = new Map<string, InvoiceGenerationPreview["lines"]>();
  for (const line of lines) {
    const sectionName = line.sectionName?.trim() || "General";
    const current = grouped.get(sectionName) ?? [];
    current.push(line);
    grouped.set(sectionName, current);
  }

  return Array.from(grouped.entries()).map(([name, sectionLines]) => ({
    name,
    lines: sectionLines,
    subtotal: sumLineSubtotals(sectionLines),
  }));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openInvoicePrintWindow(input: {
  preview: InvoiceGenerationPreview;
  showItemPrices: boolean;
  materialSubtotal: number;
  laborSubtotal: number;
}) {
  const { preview, showItemPrices, materialSubtotal, laborSubtotal } = input;
  const linesMarkup = groupPreviewSections(preview.lines)
    .map((section) => {
      const sectionHeader = `<tr class="section-row"><td colspan="${showItemPrices ? 5 : 3}"><strong>${escapeHtml(section.name)}</strong><span>${escapeHtml(formatMoney(section.subtotal))}</span></td></tr>`;
      const rows = section.lines
        .map((line) => {
          const cells = [
            `<td class="desc">${escapeHtml(line.description)}</td>`,
            `<td>${escapeHtml(String(line.quantity))}</td>`,
            `<td>${escapeHtml(line.unit)}</td>`,
          ];

          if (showItemPrices) {
            cells.push(`<td>${escapeHtml(formatMoney(line.unitPrice))}</td>`);
            cells.push(`<td class="money">${escapeHtml(formatMoney(line.subtotal))}</td>`);
          }

          return `<tr>${cells.join("")}</tr>`;
        })
        .join("");
      return `${sectionHeader}${rows}`;
    })
    .join("");

  const companyLines = [
    ...preview.company.addressLines,
    preview.company.phone,
    preview.company.email,
    preview.company.website,
  ].filter((line): line is string => Boolean(line));

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(preview.invoiceNumberPreview)}</title>
    <style>
      @page { margin: 10mm; }
      body {
        margin: 0;
        color: #172033;
        font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .sheet {
        display: grid;
        gap: 12px;
      }
      .header {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 16px;
        align-items: start;
      }
      .brand {
        display: grid;
        gap: 6px;
      }
      .logo {
        max-width: 180px;
        max-height: 54px;
        object-fit: contain;
      }
      .muted { color: #5b6475; }
      .meta, .summary-card {
        border: 1px solid #d9dfeb;
        border-radius: 12px;
        padding: 10px;
      }
      .meta, .summary-card, .summary {
        break-inside: avoid;
      }
      .meta {
        display: grid;
        gap: 6px;
        background: #f8fafc;
      }
      .billto, .description {
        display: grid;
        gap: 4px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 6px 0;
        border-bottom: 1px solid #eef2f6;
        text-align: left;
        vertical-align: top;
      }
      th { padding-top: 0; }
      .section-row td {
        padding: 8px 0 5px;
        background: #f8fafc;
        border-bottom: 1px solid #d9dfeb;
      }
      .section-row td {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .money { text-align: right; font-weight: 700; }
      .summary {
        width: 260px;
        margin-left: auto;
        display: grid;
        gap: 8px;
      }
      .summary-card {
        display: grid;
        gap: 6px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .total {
        border-top: 1px solid #eef2f6;
        padding-top: 6px;
        font-size: 16px;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="brand">
          ${preview.company.logoDataUrl ? `<img class="logo" src="${preview.company.logoDataUrl}" alt="${escapeHtml(preview.company.name)} logo" />` : `<div style="font-size:24px;font-weight:700;">${escapeHtml(preview.company.name)}</div>`}
          ${preview.company.logoDataUrl ? `<strong>${escapeHtml(preview.company.name)}</strong>` : ""}
          <div class="muted">${companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
        </div>
        <div class="meta">
          <div><div class="muted">Invoice Number</div><strong>${escapeHtml(preview.invoiceNumberPreview)}</strong></div>
          <div><div class="muted">Date</div><strong>${escapeHtml(preview.issueDate)}</strong></div>
          <div><div class="muted">Job Reference</div><strong>${escapeHtml(preview.jobReference)}</strong></div>
          <div><div class="muted">Source</div><strong>${escapeHtml(preview.source === "quote" ? "From Quote" : "From Actuals")}</strong></div>
        </div>
      </div>

      <div class="billto">
        <div class="muted">Invoice To</div>
        <strong style="font-size:18px;">${escapeHtml(preview.customer.customerName)}</strong>
        <div>${escapeHtml(preview.customer.contactName ?? preview.customer.customerName)}${preview.customer.phone ? ` · ${escapeHtml(preview.customer.phone)}` : ""}${preview.customer.email ? ` · ${escapeHtml(preview.customer.email)}` : ""}</div>
      </div>

      ${preview.customerNotes ? `<div class="description"><div class="muted">Description of Work</div><div>${escapeHtml(preview.customerNotes).replaceAll("\n", "<br />")}</div></div>` : ""}

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit</th>
            ${showItemPrices ? "<th>Unit Price</th><th class=\"money\">Line Total</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${linesMarkup}
        </tbody>
      </table>

      <div class="summary">
        <div class="summary-card">
          <div class="row"><span class="muted">Materials</span><strong>${escapeHtml(formatMoney(materialSubtotal))}</strong></div>
          <div class="row"><span class="muted">Labour</span><strong>${escapeHtml(formatMoney(laborSubtotal))}</strong></div>
        </div>
        <div class="summary-card">
          <div class="row"><span class="muted">Subtotal</span><strong>${escapeHtml(formatMoney(preview.subtotal))}</strong></div>
          <div class="row"><span class="muted">Tax</span><strong>${escapeHtml(formatMoney(preview.taxAmount))}</strong></div>
          <div class="row total"><span>Grand Total</span><strong>${escapeHtml(formatMoney(preview.total))}</strong></div>
        </div>
      </div>
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

export function InvoiceGenerationPanel({
  preview,
  draftLines,
  draftValidation,
  selectedSource,
  canUseQuoteSource,
  isPreviewPending,
  isSavePending,
  onSelectSource,
  onGeneratePreview,
  onSave,
  onDraftLineChange,
  onDraftLineTotalChange,
  onAddManualLine,
  onRemoveLine,
  onMoveLine,
  actualInvoiceControls,
  actualPartOptions = [],
  onActualInvoiceControlsChange,
  previewOptions,
  onPreviewOptionsChange,
  onClose,
}: InvoiceGenerationPanelProps) {
  const materialLines = preview?.lines.filter((line) => line.category === "material") ?? [];
  const laborLines = preview?.lines.filter((line) => line.category === "labor") ?? [];
  const hasVisibleLines = Boolean(preview && preview.lines.length > 0);
  const materialSubtotal = sumLineSubtotals(materialLines);
  const laborSubtotal = sumLineSubtotals(laborLines);
  const previewSections = preview ? groupPreviewSections(preview.lines) : [];

  return (
    <div
      className="invoice-preview-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.42)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        zIndex: 60,
      }}
    >
      <style>
        {`
          @media print {
            @page {
              margin: 8mm;
            }
            html, body {
              font-size: 11.5px !important;
              line-height: 1.25 !important;
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              overflow: visible !important;
            }
            main:not(:has(.invoice-preview-overlay)) {
              display: none !important;
            }
            main:has(.invoice-preview-overlay) {
              min-height: 0 !important;
              height: auto !important;
              background: transparent !important;
            }
            main:has(.invoice-preview-overlay) > *:not(.invoice-preview-overlay) {
              display: none !important;
            }
            .invoice-preview-overlay {
              position: static !important;
              inset: auto !important;
              background: transparent !important;
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
              width: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
            }
            .invoice-preview-shell {
              border: 0 !important;
              box-shadow: none !important;
              max-width: none !important;
              width: auto !important;
              padding: 0 !important;
              max-height: none !important;
              overflow: visible !important;
              margin: 0 !important;
              gap: 0 !important;
            }
            .invoice-preview-controls {
              display: none !important;
            }
            .invoice-preview-sheet {
              border: 0 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              gap: 8px !important;
              margin: 0 !important;
            }
            .invoice-preview-table-wrap {
              overflow: visible !important;
              break-inside: auto !important;
            }
            .invoice-preview-table {
              min-width: 0 !important;
              font-size: 11px !important;
            }
            .invoice-preview-breakdown {
              break-inside: avoid;
              max-width: 250px !important;
              min-width: 0 !important;
              gap: 6px !important;
            }
            .invoice-preview-header {
              display: grid !important;
              grid-template-columns: 1fr 210px !important;
              gap: 10px !important;
              align-items: start !important;
              break-inside: avoid !important;
            }
            .invoice-preview-brand {
              gap: 4px !important;
            }
            .invoice-preview-logo {
              max-height: 54px !important;
              max-width: 180px !important;
            }
            .invoice-preview-meta {
              min-width: 0 !important;
              gap: 4px !important;
              padding: 8px !important;
              break-inside: avoid !important;
            }
            .invoice-preview-billto {
              gap: 2px !important;
              break-inside: avoid !important;
            }
            .invoice-preview-description {
              gap: 3px !important;
              break-inside: avoid !important;
            }
            .invoice-preview-table th {
              padding: 4px 0 !important;
            }
            .invoice-preview-table td {
              padding: 5px 0 !important;
              line-height: 1.2 !important;
            }
            .invoice-preview-summary-card {
              padding: 8px !important;
              gap: 4px !important;
              break-inside: avoid !important;
            }
          }
        `}
      </style>

      <section
        className="invoice-preview-shell"
        style={{
          width: "100%",
          maxWidth: "1080px",
          maxHeight: "92vh",
          overflow: "auto",
          background: "#fff",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div
          className="invoice-preview-controls"
          style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Generate Invoice</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Build the customer invoice from the quote or actuals.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onSelectSource("quote")} disabled={!canUseQuoteSource || isPreviewPending || isSavePending}>
              {selectedSource === "quote" ? "From Quote ✓" : "From Quote"}
            </button>
            <button type="button" onClick={() => onSelectSource("actuals")} disabled={isPreviewPending || isSavePending}>
              {selectedSource === "actuals" ? "From Actuals ✓" : "From Actuals"}
            </button>
            <button type="button" onClick={onGeneratePreview} disabled={isPreviewPending || isSavePending}>
              {isPreviewPending ? "Building Preview..." : "Generate Preview"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!preview) {
                  return;
                }
                openInvoicePrintWindow({
                  preview,
                  showItemPrices: previewOptions.showItemPrices,
                  materialSubtotal,
                  laborSubtotal,
                });
              }}
              disabled={!preview || isSavePending}
            >
              Print
            </button>
            <button type="button" onClick={onClose} disabled={isPreviewPending || isSavePending}>
              Close
            </button>
          </div>
        </div>

        <section
          className="invoice-preview-controls"
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "16px",
            padding: "16px",
            display: "grid",
            gap: "12px",
            background: "#fff",
          }}
        >
          <div>
            <h4 style={{ margin: 0 }}>Preview Options</h4>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
              <input
                type="checkbox"
                checked={previewOptions.showMaterials}
                onChange={(event) =>
                  onPreviewOptionsChange({ ...previewOptions, showMaterials: event.target.checked })
                }
              />
              <span>Show Materials</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
              <input
                type="checkbox"
                checked={previewOptions.showLabour}
                onChange={(event) =>
                  onPreviewOptionsChange({ ...previewOptions, showLabour: event.target.checked })
                }
              />
              <span>Show Labour</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
              <input
                type="checkbox"
                checked={previewOptions.showItemPrices}
                onChange={(event) =>
                  onPreviewOptionsChange({ ...previewOptions, showItemPrices: event.target.checked })
                }
              />
              <span>Show Item Prices</span>
            </label>
          </div>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>Description of Work</span>
            <textarea
              rows={4}
              value={previewOptions.descriptionOfWork}
              onChange={(event) =>
                onPreviewOptionsChange({ ...previewOptions, descriptionOfWork: event.target.value })
              }
              placeholder="Describe the work completed or scope being invoiced"
              style={{ width: "100%", resize: "vertical", fontSize: "16px" }}
            />
          </label>
        </section>

        {selectedSource === "actuals" ? (
          <section
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "16px",
              padding: "16px",
              display: "grid",
              gap: "12px",
              background: "#f8fafc",
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>Actuals Billing Controls</h4>
              <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                Set sell-side billing for this invoice.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Invoice Part</span>
                <select
                  value={actualInvoiceControls.invoicePartName ?? ""}
                  onChange={(event) =>
                    onActualInvoiceControlsChange({
                      ...actualInvoiceControls,
                      invoicePartName: event.target.value || null,
                    })
                  }
                  style={{ fontSize: "16px" }}
                >
                  <option value="">All Parts</option>
                  {actualPartOptions.map((partName) => (
                    <option key={partName} value={partName}>
                      {partName}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Material Markup %</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={actualInvoiceControls.materialMarkupPercent}
                  onChange={(event) =>
                    onActualInvoiceControlsChange({
                      ...actualInvoiceControls,
                      materialMarkupPercent: Number(event.target.value || 0),
                    })
                  }
                  style={{ fontSize: "16px" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Labour Sell Rate</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={actualInvoiceControls.laborSellRate}
                  onChange={(event) =>
                    onActualInvoiceControlsChange({
                      ...actualInvoiceControls,
                      laborSellRate: Number(event.target.value || 0),
                    })
                  }
                  style={{ fontSize: "16px" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Tax Rate</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={actualInvoiceControls.taxRate}
                  onChange={(event) =>
                    onActualInvoiceControlsChange({
                      ...actualInvoiceControls,
                      taxRate: Number(event.target.value || 0),
                    })
                  }
                  style={{ fontSize: "16px" }}
                />
              </label>
            </div>

            {preview ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <strong>Materials Being Invoiced</strong>
                  {materialLines.length === 0 ? (
                    <div style={{ color: "#5b6475", fontSize: "14px" }}>No materials used are currently being billed.</div>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {materialLines.map((line) => (
                        <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "start" }}>
                          <div>
                            <strong>{line.description}</strong>
                            {line.note ? <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "2px" }}>{line.note}</div> : null}
                          </div>
                          <span style={{ color: "#5b6475" }}>{line.quantity} {line.unit}</span>
                          <strong>{formatMoney(line.subtotal)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <strong>Labour Being Invoiced</strong>
                  {laborLines.length === 0 ? (
                    <div style={{ color: "#5b6475", fontSize: "14px" }}>No labour hours are currently being billed.</div>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {laborLines.map((line) => (
                        <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "start" }}>
                          <strong>{line.description}</strong>
                          <span style={{ color: "#5b6475" }}>{line.quantity} {line.unit}</span>
                          <strong>{formatMoney(line.subtotal)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "16px",
            padding: "16px",
            display: "grid",
            gap: "12px",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h4 style={{ margin: 0 }}>Invoice Lines</h4>
              <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                Edit this invoice draft without changing actuals, materials, or the original quote.
              </p>
            </div>
            <button type="button" onClick={onAddManualLine} disabled={isSavePending}>
              + Add Manual Line
            </button>
          </div>

          {draftValidation.length > 0 ? (
            <div style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#9f1239", borderRadius: "12px", padding: "12px", display: "grid", gap: "4px" }}>
              {draftValidation.map((issue) => (
                <div key={issue}>{issue}</div>
              ))}
            </div>
          ) : null}

          {draftLines.length === 0 ? (
            <div style={{ color: "#5b6475" }}>Generate a preview to start editing lines.</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {draftLines.map((line, index) => {
                const status = lineStatusLabel(line);
                const showCostControls = selectedSource === "actuals" && line.category === "material";

                return (
                  <div key={line.id} style={{ border: "1px solid #d9dfeb", borderRadius: "14px", padding: "14px", display: "grid", gap: "12px", background: "#fafcff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <strong>Line {index + 1}</strong>
                        <span style={{ padding: "4px 8px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, color: status.tone, background: status.background }}>
                          {status.label}
                        </span>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>
                          {(line.category ?? "other").replace("labor", "labour")}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => onMoveLine(line.id, "up")} disabled={index === 0 || isSavePending}>Up</button>
                        <button type="button" onClick={() => onMoveLine(line.id, "down")} disabled={index === draftLines.length - 1 || isSavePending}>Down</button>
                        <button type="button" onClick={() => onRemoveLine(line.id)} disabled={isSavePending}>Remove</button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(2, minmax(110px, 1fr))", gap: "10px" }}>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Description</span>
                        <input value={line.description} onChange={(event) => onDraftLineChange(line.id, { description: event.target.value })} style={{ fontSize: "16px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Qty</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" value={line.quantity} onChange={(event) => onDraftLineChange(line.id, { quantity: Number(event.target.value || 0) })} style={{ fontSize: "16px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Unit</span>
                        <input value={line.unit} onChange={(event) => onDraftLineChange(line.id, { unit: event.target.value })} style={{ fontSize: "16px" }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: showCostControls ? "repeat(4, minmax(120px, 1fr))" : "repeat(2, minmax(120px, 1fr))", gap: "10px" }}>
                      {showCostControls ? (
                        <>
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span style={{ color: "#5b6475", fontSize: "13px" }}>Unit Cost</span>
                            <input type="number" inputMode="decimal" step="0.01" min="0" value={line.unitCost ?? 0} onChange={(event) => onDraftLineChange(line.id, { unitCost: Number(event.target.value || 0) })} style={{ fontSize: "16px" }} />
                          </label>
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span style={{ color: "#5b6475", fontSize: "13px" }}>Markup %</span>
                            <input type="number" inputMode="decimal" step="0.1" min="0" value={line.markupPercent ?? 0} onChange={(event) => onDraftLineChange(line.id, { markupPercent: Number(event.target.value || 0) })} style={{ fontSize: "16px" }} />
                          </label>
                        </>
                      ) : null}
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Sell Price</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" value={line.unitPrice} onChange={(event) => onDraftLineChange(line.id, { unitPrice: Number(event.target.value || 0), markupPercent: showCostControls ? null : (line.markupPercent ?? null) })} style={{ fontSize: "16px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Line Total</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" value={line.subtotal} onChange={(event) => onDraftLineTotalChange(line.id, Number(event.target.value || 0))} style={{ fontSize: "16px" }} />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(160px, 1fr) minmax(180px, 2fr)", gap: "10px" }}>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Part</span>
                        <input value={line.sectionName ?? ""} onChange={(event) => onDraftLineChange(line.id, { sectionName: event.target.value || null })} style={{ fontSize: "16px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Type</span>
                        <select value={line.category ?? "other"} onChange={(event) => onDraftLineChange(line.id, { category: (event.target.value as NonNullable<EditableInvoiceDraftLine["category"]>) })} style={{ fontSize: "16px" }}>
                          <option value="material">Material</option>
                          <option value="labor">Labour</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#5b6475", fontSize: "13px" }}>Note</span>
                        <input value={line.note ?? ""} onChange={(event) => onDraftLineChange(line.id, { note: event.target.value || null })} style={{ fontSize: "16px" }} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {preview ? (
          <article
            className="invoice-preview-sheet"
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "18px",
              padding: "28px",
              display: "grid",
              gap: "20px",
              background: "#fff",
            }}
          >
            <header className="invoice-preview-header" style={{ display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
              <div className="invoice-preview-brand" style={{ display: "grid", gap: "10px" }}>
                {preview.company.logoDataUrl ? (
                  <img className="invoice-preview-logo" src={preview.company.logoDataUrl} alt={`${preview.company.name} logo`} style={{ maxHeight: "100px", maxWidth: "260px", objectFit: "contain" }} />
                ) : (
                  <strong style={{ fontSize: "28px" }}>{preview.company.name}</strong>
                )}
                <div style={{ display: "grid", gap: "2px", color: "#445168", fontSize: "14px" }}>
                  {!preview.company.logoDataUrl ? null : <strong style={{ color: "#172033" }}>{preview.company.name}</strong>}
                  {preview.company.addressLines.map((line) => <span key={line}>{line}</span>)}
                  {preview.company.phone ? <span>{preview.company.phone}</span> : null}
                  {preview.company.email ? <span>{preview.company.email}</span> : null}
                  {preview.company.website ? <span>{preview.company.website}</span> : null}
                </div>
              </div>

              <div className="invoice-preview-meta" style={{ minWidth: "280px", display: "grid", gap: "8px", border: "1px solid #d9dfeb", borderRadius: "16px", padding: "16px", background: "#f8fafc" }}>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>Invoice Number</div>
                  <strong>{preview.invoiceNumberPreview}</strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>Date</div>
                  <strong>{preview.issueDate}</strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>Job Reference</div>
                  <strong>{preview.jobReference}</strong>
                </div>
                <div>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>Source</div>
                  <strong>{preview.source === "quote" ? "From Quote" : "From Actuals"}</strong>
                </div>
              </div>
            </header>

            <section className="invoice-preview-billto" style={{ display: "grid", gap: "6px" }}>
              <div style={{ color: "#5b6475", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Invoice To</div>
              <strong style={{ fontSize: "20px" }}>{preview.customer.customerName}</strong>
              <div style={{ color: "#445168" }}>
                {preview.customer.contactName ?? preview.customer.customerName}
                {preview.customer.phone ? ` · ${preview.customer.phone}` : ""}
                {preview.customer.email ? ` · ${preview.customer.email}` : ""}
              </div>
            </section>

            {previewOptions.descriptionOfWork.trim() ? (
              <section className="invoice-preview-description" style={{ display: "grid", gap: "6px" }}>
                <div style={{ color: "#5b6475", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Description of Work
                </div>
                <div style={{ color: "#172033", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {previewOptions.descriptionOfWork.trim()}
                </div>
              </section>
            ) : null}

            <section className="invoice-preview-table-wrap" style={{ overflowX: "auto" }}>
              <table className="invoice-preview-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #d9dfeb" }}>
                    <th style={{ padding: "10px 0" }}>Description</th>
                    <th style={{ padding: "10px 0" }}>Qty</th>
                    <th style={{ padding: "10px 0" }}>Unit</th>
                    {previewOptions.showItemPrices ? <th style={{ padding: "10px 0" }}>Unit Price</th> : null}
                    {previewOptions.showItemPrices ? <th style={{ padding: "10px 0", textAlign: "right" }}>Line Total</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {previewSections.map((section) => (
                    <Fragment key={section.name}>
                      <tr key={`${section.name}:header`} style={{ borderBottom: "1px solid #d9dfeb", background: "#f8fafc" }}>
                        <td colSpan={previewOptions.showItemPrices ? 5 : 3} style={{ padding: "10px 8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                            <strong>{section.name}</strong>
                            <strong>{formatMoney(section.subtotal)}</strong>
                          </div>
                        </td>
                      </tr>
                      {section.lines.map((line) => (
                        <tr key={line.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                          <td style={{ padding: "12px 0" }}>{line.description}</td>
                          <td style={{ padding: "12px 0" }}>{line.quantity}</td>
                          <td style={{ padding: "12px 0" }}>{line.unit}</td>
                          {previewOptions.showItemPrices ? <td style={{ padding: "12px 0" }}>{formatMoney(line.unitPrice)}</td> : null}
                          {previewOptions.showItemPrices ? (
                            <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700 }}>{formatMoney(line.subtotal)}</td>
                          ) : null}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section
              className="invoice-preview-breakdown"
              style={{ display: "grid", gap: "10px", justifySelf: "end", minWidth: "320px", width: "100%", maxWidth: "360px" }}
            >
              <div className="invoice-preview-summary-card" style={{ border: "1px solid #d9dfeb", borderRadius: "14px", padding: "14px", display: "grid", gap: "8px", background: "#fafcff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ color: "#5b6475" }}>Materials</span>
                  <strong>{formatMoney(materialSubtotal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ color: "#5b6475" }}>Labour</span>
                  <strong>{formatMoney(laborSubtotal)}</strong>
                </div>
              </div>

              <div className="invoice-preview-summary-card" style={{ border: "1px solid #d9dfeb", borderRadius: "14px", padding: "14px", display: "grid", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ color: "#5b6475" }}>Subtotal</span>
                  <strong>{formatMoney(preview.subtotal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ color: "#5b6475" }}>Tax</span>
                  <strong>{formatMoney(preview.taxAmount)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "18px", paddingTop: "6px", borderTop: "1px solid #eef2f6" }}>
                  <span>Grand Total</span>
                  <strong>{formatMoney(preview.total)}</strong>
                </div>
              </div>
            </section>

            <div className="invoice-preview-controls" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={onSave} disabled={isSavePending || !hasVisibleLines || draftValidation.length > 0}>
                {isSavePending ? "Saving Invoice..." : "Save Invoice"}
              </button>
            </div>
          </article>
        ) : (
          <section style={{ border: "1px dashed #d9dfeb", borderRadius: "16px", padding: "22px", color: "#5b6475" }}>
            Generate a preview to review invoice lines before saving.
          </section>
        )}
      </section>
    </div>
  );
}
