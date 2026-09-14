import type { CatalogItem } from "@/domain/materials/types";
import type { QuoteLineItemInput } from "@/domain/quotes/types";

export interface TakeoffMaterialLine {
  section: string;
  item: string;
  quantity: number;
}

export interface MatchedTakeoffMaterialLine extends TakeoffMaterialLine {
  match: CatalogItem | null;
  matchScore: number;
  lineCost: number | null;
  source: "takeoff" | "manual";
  adjustmentKind?: "device" | "material";
  note?: string;
}

export interface TakeoffLabourLine {
  phase: string;
  item: string;
  hours: number;
}

export function readTakeoffLabourLines(iframe: HTMLIFrameElement | null): TakeoffLabourLine[] {
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

    const rawHours = row.querySelector("strong")?.getAttribute("data-quantity");
    const hours = rawHours !== null && rawHours !== undefined ? Number(rawHours) : parseTakeoffQuantity(quantityText);
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

export function buildQuoteLineItems(input: {
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
    .forEach((line) => {
      lineItems.push({
        sortOrder: lineItems.length,
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

export function normalizeQuoteSection(section: string, item = ""): string {
  if (["Service", "Rough-in", "Finish"].includes(section)) return section;
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

export function rollUpTakeoffMaterialLines(lines: TakeoffMaterialLine[]): TakeoffMaterialLine[] {
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

export function rollUpLabourForQuote(lines: TakeoffLabourLine[]): TakeoffLabourLine[] {
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

export function inferTakeoffUnit(line: TakeoffMaterialLine): string {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  if (lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg")) {
    return "m";
  }
  return "each";
}

export function isWireLikeLine(line: TakeoffMaterialLine): boolean {
  const lower = `${line.section} ${line.item}`.toLowerCase();
  return lower.includes("wire") || lower.includes("nmd") || lower.includes("cable") || lower.includes("awg");
}

export function parseTakeoffQuantity(value: string): number {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
