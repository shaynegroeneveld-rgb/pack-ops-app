/** E.B. invoice layout adapter. Input must be complete PDF text reconstructed in visual row order.
 * It deliberately rejects unfamiliar documents rather than guessing costs. */
export interface EbhInvoiceLine {
  lineNumber: number;
  sku: string;
  description: string;
  orderedAs: string | null;
  quantity: number;
  unit: "each" | "m" | "ft";
  pricingUnit: string;
  supplierPrice: number;
  priceBasis: number;
  netUnitCost: number;
  internalCost: number;
  extendedAmount: number;
}
export interface EbhInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  accountId: string;
  branchId: string;
  lines: EbhInvoiceLine[];
}
const number = (s: string) => Number(s.replace(/,/g, ""));
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const units: Record<string, EbhInvoiceLine["unit"]> = {
  EA: "each",
  M: "m",
  MTR: "m",
  FT: "ft",
};
export function parseEbhInvoice(
  text: string,
  expectedAccount: string,
  expectedBranch: string,
): EbhInvoice {
  if (/CREDIT\s+MEMO|Original Invoice:/i.test(text))
    throw new Error("credit_memo");
  if (
    !/Payable to:\s*E\.\s*B\.\s*Horsman\s*&\s*Son/i.test(text) ||
    !/^\s*INVOICE\s*$/m.test(text)
  )
    throw new Error("unsupported_document");
  if (!/Canadian Dollars/.test(text)) throw new Error("currency_not_confirmed");
  const accountId = text.match(/Cust ID:\s*(\d+)/)?.[1];
  const branchId = text.match(/Branch:\s*(\d+)\s/)?.[1];
  if (accountId !== expectedAccount || branchId !== expectedBranch)
    throw new Error("wrong_account_or_branch");
  const headers = [
    ...text.matchAll(
      /Invoice Number\s+Invoice Date\s*\n\s*(\d+)\s+(\d{2})\/(\d{2})\/(\d{4})/g,
    ),
  ];
  if (!headers.length) throw new Error("invoice_header_missing");
  const [, invoiceNumber, month, day, year] = headers[0]!;
  if (
    headers.some((h) => h.slice(1).join("|") !== headers[0]!.slice(1).join("|"))
  )
    throw new Error("mixed_documents");
  const invoiceDate = `${year}-${month}-${day}`;
  const date = new Date(`${invoiceDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== invoiceDate
  )
    throw new Error("invalid_invoice_date");
  const pages = [...text.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/g)];
  const totalPages = Number(pages[0]?.[2]);
  if (
    !totalPages ||
    pages.length !== totalPages ||
    pages.some((p, i) => Number(p[1]) !== i + 1 || Number(p[2]) !== totalPages)
  )
    throw new Error("incomplete_pages");
  const footer = text.match(
    /Total Lines:\s*(\d+)\s+SUB-TOTAL:\s+([\d,]+\.\d{2})/,
  );
  if (!footer) throw new Error("invoice_totals_missing");
  const rows = text.split(/\r?\n/);
  const lines: EbhInvoiceLine[] = [];
  let current: EbhInvoiceLine | null = null;
  let readingDescription = false;
  const rowPattern =
    /^\s*([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([A-Z0-9]+)\s+\((\d+)\)\s+(.+?)\s+([A-Z0-9]+)\s+([\d,]+\.\d{2,6})\s+([\d,]+\.\d{2})\s*$/;
  for (const row of rows) {
    const match = row.match(rowPattern);
    if (match) {
      const [, , shipped, , uom, lineNo, sku, pricingUnit, price, extended] =
        match;
      const unit = units[uom!];
      const basis =
        pricingUnit === uom
          ? 1
          : pricingUnit === "C100"
            ? 100
            : pricingUnit === "M1000"
              ? 1000
              : null;
      if (!unit || basis === null) throw new Error("unknown_pricing_unit");
      const quantity = number(shipped!),
        supplierPrice = number(price!),
        extendedAmount = number(extended!);
      if (!(quantity > 0 && supplierPrice > 0 && extendedAmount > 0))
        throw new Error("non_purchase_line");
      const netUnitCost = supplierPrice / basis;
      if (Math.abs(cents(quantity * netUnitCost) - cents(extendedAmount)) > 1)
        throw new Error("line_arithmetic_mismatch");
      current = {
        lineNumber: Number(lineNo),
        sku: sku!.trim().replace(/\s+/g, " "),
        description: "",
        orderedAs: null,
        quantity,
        unit,
        pricingUnit: pricingUnit!,
        supplierPrice,
        priceBasis: basis,
        netUnitCost,
        internalCost: cents(netUnitCost * 1.12) / 100,
        extendedAmount,
      };
      if (current.internalCost <= 0)
        throw new Error("cost_below_catalog_precision");
      lines.push(current);
      readingDescription = true;
      continue;
    }
    if (/\(\d{3,}\)/.test(row) && /^\s*-?[\d,]+\s/.test(row))
      throw new Error("unparsed_item_row");
    const ordered = row.match(/^\s*Ordered As:\s*(\S+)\s*$/);
    if (ordered && current && readingDescription) {
      current.orderedAs = ordered[1]!;
      readingDescription = false;
      continue;
    }
    if (
      /^\s*(?:ORIGINAL|Total Lines:|SUB-TOTAL:|INVOICE|Customer PO Number|Qty Ordered|Carrier:|Lot Number:)|\f/.test(
        row,
      )
    )
      readingDescription = false;
    if (readingDescription && current && row.trim())
      current.description = [
        current.description,
        row.trim().replace(/\s+/g, " "),
      ]
        .filter(Boolean)
        .join(" ");
  }
  if (
    lines.length !== Number(footer[1]) ||
    !lines.length ||
    lines.some((l, i) => l.lineNumber !== i + 1 || !l.description)
  )
    throw new Error("incomplete_lines");
  if (
    lines.some((l) =>
      /\b(?:freight|restocking|rebate|discount|surcharge|deposit)\b/i.test(
        l.description,
      ),
    )
  )
    throw new Error("non_material_charge");
  if (
    lines.reduce((sum, l) => sum + cents(l.extendedAmount), 0) !==
    cents(number(footer[2]!))
  )
    throw new Error("subtotal_mismatch");
  return {
    invoiceNumber: invoiceNumber!,
    invoiceDate,
    accountId,
    branchId,
    lines,
  };
}
