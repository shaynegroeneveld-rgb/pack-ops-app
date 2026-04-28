import type { JobEstimateMaterialSnapshot } from "@/domain/jobs/types";
import type { QuoteLineItem } from "@/domain/quotes/types";

function roundMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

export function normalizeMaterialSectionName(sectionName: string | null | undefined): string | null {
  const normalized = sectionName?.trim() ?? "";
  return normalized ? normalized : null;
}

export function buildPartAwareMaterialLineKey(input: {
  catalogItemId: string | null;
  sku: string | null;
  description: string;
  unit: string;
  sectionName?: string | null;
  unitCost?: number | null;
  unitSell?: number | null;
}): string {
  return [
    normalizeMaterialSectionName(input.sectionName) ?? "",
    input.catalogItemId ?? "",
    input.sku?.trim().toLowerCase() ?? "",
    input.description.trim().toLowerCase(),
    input.unit.trim().toLowerCase(),
    roundMoney(input.unitCost) ?? "",
    roundMoney(input.unitSell) ?? "",
  ].join("::");
}

export function normalizeEstimateMaterialSnapshotLines(
  lines: Array<Partial<JobEstimateMaterialSnapshot> | null | undefined>,
): JobEstimateMaterialSnapshot[] {
  const grouped = new Map<
    string,
    JobEstimateMaterialSnapshot & {
      notes: Set<string>;
    }
  >();

  for (const rawLine of lines) {
    if (!rawLine) {
      continue;
    }

    const description = rawLine.description?.trim() ?? "";
    if (!description) {
      continue;
    }

    const quantity = roundQuantity(rawLine.quantity);
    if (quantity <= 0) {
      continue;
    }

    const normalizedLine = {
      catalogItemId: rawLine.catalogItemId ?? null,
      sku: rawLine.sku?.trim() || null,
      description,
      unit: rawLine.unit?.trim() || "each",
      quantity,
      note: rawLine.note?.trim() || null,
      sectionName: normalizeMaterialSectionName(rawLine.sectionName),
      unitCost: roundMoney(rawLine.unitCost),
      unitSell: roundMoney(rawLine.unitSell),
      markupPercent: roundMoney(rawLine.markupPercent),
    };
    const key = buildPartAwareMaterialLineKey(normalizedLine);
    const current = grouped.get(key) ?? {
      ...normalizedLine,
      quantity: 0,
      notes: new Set<string>(),
    };

    current.quantity = roundQuantity(current.quantity + normalizedLine.quantity);
    if (normalizedLine.note) {
      current.notes.add(normalizedLine.note);
    }
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      const leftKey = `${left.sectionName ?? ""}::${left.sku ?? ""}::${left.description}`.toLowerCase();
      const rightKey = `${right.sectionName ?? ""}::${right.sku ?? ""}::${right.description}`.toLowerCase();
      return leftKey.localeCompare(rightKey);
    })
    .map(({ notes, ...line }) => ({
      ...line,
      note: Array.from(notes).join(" · ") || null,
    }));
}

export function quoteLineItemsToEstimateMaterialSnapshot(
  lineItems: Array<
    Pick<
      QuoteLineItem,
      "catalogItemId" | "sku" | "description" | "unit" | "quantity" | "note" | "sectionName" | "unitCost" | "unitSell" | "lineKind"
    >
  >,
): JobEstimateMaterialSnapshot[] {
  return normalizeEstimateMaterialSnapshotLines(
    lineItems
      .filter((line) => line.lineKind !== "labor")
      .map((line) => {
        const unitCost = roundMoney(line.unitCost);
        const unitSell = roundMoney(line.unitSell);
        const markupPercent =
          unitCost !== null && unitCost > 0 && unitSell !== null
            ? roundMoney(((unitSell - unitCost) / unitCost) * 100)
            : null;

        return {
          catalogItemId: line.catalogItemId ?? null,
          sku: line.sku?.trim() || null,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          note: line.note,
          sectionName: line.sectionName,
          unitCost,
          unitSell,
          markupPercent,
        } satisfies Partial<JobEstimateMaterialSnapshot>;
      }),
  );
}
