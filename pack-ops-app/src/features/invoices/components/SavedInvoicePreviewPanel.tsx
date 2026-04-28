import type { SavedInvoiceSummary } from "@/domain/invoices/types";

interface SavedInvoicePreviewPanelProps {
  invoice: SavedInvoiceSummary | null;
  customerName: string | null;
  jobReference: string;
  canDelete?: boolean;
  isDeleting?: boolean;
  onDelete?: (invoice: SavedInvoiceSummary) => void;
  onClose: () => void;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function groupLines(lines: SavedInvoiceSummary["lines"]) {
  const grouped = new Map<string, SavedInvoiceSummary["lines"]>();
  for (const line of lines) {
    const sectionName = line.sectionName?.trim() || "General";
    const current = grouped.get(sectionName) ?? [];
    current.push(line);
    grouped.set(sectionName, current);
  }

  return Array.from(grouped.entries()).map(([name, sectionLines]) => ({
    name,
    lines: sectionLines.sort((left, right) => left.sortOrder - right.sortOrder),
    subtotal: sectionLines.reduce((total, line) => total + line.subtotal, 0),
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

function isLabourLine(line: SavedInvoiceSummary["lines"][number]): boolean {
  const unit = line.unit.toLowerCase();
  const description = line.description.toLowerCase();
  return unit.includes("hour") || unit === "hr" || unit === "hrs" || description.includes("labour") || description.includes("labor");
}

function openSavedInvoicePdfWindow(input: {
  invoice: SavedInvoiceSummary;
  customerName: string | null;
  jobReference: string;
  materialSubtotal: number;
  labourSubtotal: number;
}) {
  const { invoice, customerName, jobReference, materialSubtotal, labourSubtotal } = input;
  const sectionsMarkup = groupLines(invoice.lines)
    .map((section) => {
      const rows = section.lines
        .map(
          (line) => `
            <tr>
              <td class="desc">${escapeHtml(line.description)}</td>
              <td>${escapeHtml(String(line.quantity))}</td>
              <td>${escapeHtml(line.unit)}</td>
              <td>${escapeHtml(formatMoney(line.unitPrice))}</td>
              <td class="money">${escapeHtml(formatMoney(line.subtotal))}</td>
            </tr>
          `,
        )
        .join("");

      return `
        <tr class="section-row">
          <td colspan="5">
            <strong>${escapeHtml(section.name)}</strong>
            <span>${escapeHtml(formatMoney(section.subtotal))}</span>
          </td>
        </tr>
        ${rows}
      `;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(invoice.number)}</title>
    <style>
      @page { margin: 10mm; }
      body {
        margin: 0;
        color: #172033;
        font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .sheet { display: grid; gap: 12px; }
      .header {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 16px;
        align-items: start;
      }
      .brand-name { font-size: 24px; font-weight: 800; }
      .muted { color: #5b6475; }
      .meta, .summary-card {
        border: 1px solid #d9dfeb;
        border-radius: 12px;
        padding: 10px;
      }
      .meta {
        display: grid;
        gap: 6px;
        background: #f8fafc;
      }
      .billto, .description { display: grid; gap: 4px; }
      table { width: 100%; border-collapse: collapse; }
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
        break-inside: avoid;
      }
      .summary-card { display: grid; gap: 6px; break-inside: avoid; }
      .row { display: flex; justify-content: space-between; gap: 12px; }
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
        <div>
          <div class="brand-name">Pack Electric</div>
          <div class="muted">Customer invoice</div>
        </div>
        <div class="meta">
          <div><div class="muted">Invoice Number</div><strong>${escapeHtml(invoice.number)}</strong></div>
          <div><div class="muted">Date</div><strong>${escapeHtml(formatDate(invoice.createdAt))}</strong></div>
          <div><div class="muted">Job Reference</div><strong>${escapeHtml(jobReference)}</strong></div>
        </div>
      </div>

      <div class="billto">
        <div class="muted">Invoice To</div>
        <strong style="font-size:18px;">${escapeHtml(customerName ?? "Customer")}</strong>
      </div>

      ${invoice.customerNotes ? `<div class="description"><div class="muted">Description of Work</div><div>${escapeHtml(invoice.customerNotes).replaceAll("\n", "<br />")}</div></div>` : ""}

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Unit Price</th>
            <th class="money">Line Total</th>
          </tr>
        </thead>
        <tbody>${sectionsMarkup}</tbody>
      </table>

      <div class="summary">
        <div class="summary-card">
          <div class="row"><span class="muted">Materials</span><strong>${escapeHtml(formatMoney(materialSubtotal))}</strong></div>
          <div class="row"><span class="muted">Labour</span><strong>${escapeHtml(formatMoney(labourSubtotal))}</strong></div>
        </div>
        <div class="summary-card">
          <div class="row"><span class="muted">Subtotal</span><strong>${escapeHtml(formatMoney(invoice.subtotal))}</strong></div>
          <div class="row"><span class="muted">Tax</span><strong>${escapeHtml(formatMoney(invoice.taxAmount))}</strong></div>
          <div class="row total"><span>Grand Total</span><strong>${escapeHtml(formatMoney(invoice.total))}</strong></div>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    throw new Error("PDF window was blocked. Please allow pop-ups and try again.");
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
  window.setTimeout(triggerPrint, 500);
}

export function SavedInvoicePreviewPanel({
  invoice,
  customerName,
  jobReference,
  canDelete = false,
  isDeleting = false,
  onDelete,
  onClose,
}: SavedInvoicePreviewPanelProps) {
  if (!invoice) {
    return null;
  }

  const materialSubtotal = invoice.lines
    .filter((line) => !isLabourLine(line))
    .reduce((total, line) => total + line.subtotal, 0);
  const labourSubtotal = invoice.lines.reduce((total, line) => total + line.subtotal, 0) - materialSubtotal;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "18px",
        zIndex: 35,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "920px",
          maxHeight: "92vh",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          background: "#fff",
          padding: "18px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Saved Invoice</div>
            <h2 style={{ margin: "4px 0 0" }}>{invoice.number}</h2>
            <div style={{ color: "#5b6475", marginTop: "4px" }}>
              {formatDate(invoice.createdAt)} · {invoice.status.replaceAll("_", " ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() =>
                openSavedInvoicePdfWindow({
                  invoice,
                  customerName,
                  jobReference,
                  materialSubtotal,
                  labourSubtotal,
                })
              }
            >
              Download PDF
            </button>
            {canDelete && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(invoice)}
                disabled={isDeleting}
                style={{ color: "#9b2525" }}
              >
                {isDeleting ? "Deleting..." : "Delete Invoice"}
              </button>
            ) : null}
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <div style={{ border: "1px solid #e4e8f1", borderRadius: "12px", padding: "12px", background: "#f8fafc" }}>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Customer</div>
            <strong>{customerName ?? "Customer"}</strong>
          </div>
          <div style={{ border: "1px solid #e4e8f1", borderRadius: "12px", padding: "12px", background: "#f8fafc" }}>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Job</div>
            <strong>{jobReference}</strong>
          </div>
        </div>

        {invoice.customerNotes ? (
          <div style={{ display: "grid", gap: "4px" }}>
            <strong>Description of Work</strong>
            <div style={{ color: "#445168", whiteSpace: "pre-wrap" }}>{invoice.customerNotes}</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "12px" }}>
          {groupLines(invoice.lines).map((section) => (
            <div key={section.name} style={{ border: "1px solid #e4e8f1", borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "10px 12px", background: "#f8fafc", fontWeight: 700 }}>
                <span>{section.name}</span>
                <span>{formatMoney(section.subtotal)}</span>
              </div>
              <div style={{ display: "grid" }}>
                {section.lines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1fr) repeat(3, minmax(76px, auto))",
                      gap: "10px",
                      padding: "10px 12px",
                      borderTop: "1px solid #eef2f6",
                      alignItems: "center",
                    }}
                  >
                    <strong>{line.description}</strong>
                    <span style={{ color: "#5b6475" }}>{line.quantity} {line.unit}</span>
                    <span style={{ color: "#5b6475" }}>{formatMoney(line.unitPrice)}</span>
                    <strong style={{ textAlign: "right" }}>{formatMoney(line.subtotal)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: "8px", marginLeft: "auto", minWidth: "260px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "#5b6475" }}>Materials</span>
            <strong>{formatMoney(materialSubtotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "#5b6475" }}>Labour</span>
            <strong>{formatMoney(labourSubtotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid #e4e8f1", paddingTop: "8px" }}>
            <span>Subtotal</span>
            <strong>{formatMoney(invoice.subtotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span>Tax</span>
            <strong>{formatMoney(invoice.taxAmount)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "18px" }}>
            <span>Total</span>
            <strong>{formatMoney(invoice.total)}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
