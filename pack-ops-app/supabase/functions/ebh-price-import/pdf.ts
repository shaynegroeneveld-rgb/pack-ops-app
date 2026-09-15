import { getDocumentProxy } from "npm:unpdf@1.8.1";
/** Reconstruct visual rows from PDF coordinates; never infer missing numbers. */
export async function invoiceLayout(bytes: Uint8Array): Promise<string> {
  if (bytes.length > 12_000_000) throw new Error("pdf_too_large");
  const doc = await getDocumentProxy(bytes, {
    isEvalSupported: false,
    useSystemFonts: false,
  });
  try {
    if (doc.numPages > 30) throw new Error("too_many_pages");
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (x: any) => typeof x.str === "string" && x.str.trim(),
      ) as any[];
      if (items.length > 15000) throw new Error("too_many_text_items");
      const rows: { y: number; items: any[] }[] = [];
      for (const item of items.sort(
        (a, b) =>
          b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
      )) {
        let row = rows.find((r) => Math.abs(r.y - item.transform[5]) < 1.5);
        if (!row) {
          row = { y: item.transform[5], items: [] };
          rows.push(row);
        }
        row.items.push(item);
      }
      pages.push(
        rows
          .map((r) =>
            r.items
              .sort((a, b) => a.transform[4] - b.transform[4])
              .map((i) => i.str.trim())
              .join("   "),
          )
          .join("\n"),
      );
    }
    return pages.join("\n\f\n");
  } finally {
    await doc.loadingTask.destroy();
  }
}
