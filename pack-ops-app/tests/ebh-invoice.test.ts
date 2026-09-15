import { describe, it, expect } from "vitest";
import { parseEbhInvoice } from "../src/services/materials/ebh-invoice";
const invoice = `INVOICE
Invoice Number    Invoice Date
12345             09/11/2026
Payable to: E. B. Horsman & Son
Branch: 23 Vernon
Cust ID: 999
Qty Ordered Qty Shipped Qty BO UOM (Line #) Item ID Pricing UOM Unit Price Extended Price
1 1 0 EA (001) BOX-100 C100 505.3845 5.05
STEEL DEVICE BOX
Ordered As: BOX100
Total Lines: 1                     SUB-TOTAL: 5.05
Canadian Dollars
ORIGINAL Page 1 of 1`;
const parse = (s = invoice) => parseEbhInvoice(s, "999", "23");
describe("E.B. invoice ingestion", () => {
  it("preserves supplier precision and normalizes per hundred before adding 12%", () => {
    const result = parse();
    expect(result.invoiceDate).toBe("2026-09-11");
    expect(result.lines[0]).toMatchObject({
      sku: "BOX-100",
      orderedAs: "BOX100",
      netUnitCost: 5.053845,
      internalCost: 5.66,
      unit: "each",
    });
  });
  it.each([
    ["credit", "CREDIT MEMO\n" + invoice],
    ["account", invoice.replace("Cust ID: 999", "Cust ID: 123")],
    ["unit", invoice.replace("C100", "PACK")],
    ["arithmetic", invoice.replace("505.3845", "605.3845")],
    ["incomplete pages", invoice.replace("Page 1 of 1", "Page 1 of 2")],
    ["missing lines", invoice.replace("Total Lines: 1", "Total Lines: 2")],
    ["subtotal", invoice.replace("SUB-TOTAL: 5.05", "SUB-TOTAL: 7.05")],
    ["date", invoice.replace("09/11/2026", "02/31/2026")],
  ])("holds %s", (_name, text) => expect(() => parse(text)).toThrow());
  it("normalizes metre cable priced per thousand, preserving a spaced supplier SKU", () => {
    const text = invoice
      .replace(
        "1 1 0 EA (001) BOX-100 C100 505.3845 5.05",
        "42 42 0 MTR (001) TECK 4C8 1000V CU M1000 20,402.4358 856.90",
      )
      .replace("SUB-TOTAL: 5.05", "SUB-TOTAL: 856.90");
    expect(parse(text).lines[0]).toMatchObject({
      sku: "TECK 4C8 1000V CU",
      unit: "m",
      priceBasis: 1000,
      internalCost: 22.85,
    });
  });
  it("accepts the separate total line used by the PDF layout engine", () =>
    expect(
      parse(invoice.replace("                     SUB-TOTAL:", "\nSUB-TOTAL:"))
        .lines,
    ).toHaveLength(1));
  it("never includes the totals footer in a material description", () =>
    expect(
      parse(invoice.replace("Ordered As: BOX100\n", "")).lines[0]?.description,
    ).toBe("STEEL DEVICE BOX"));
});
