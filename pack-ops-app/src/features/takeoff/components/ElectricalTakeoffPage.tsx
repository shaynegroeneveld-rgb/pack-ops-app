import { useMemo, useRef, useState, type CSSProperties } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { CatalogItem } from "@/domain/materials/types";
import { brand, pageStyle } from "@/features/shared/ui/mobile-styles";
import { useMaterialsSlice } from "@/features/materials/hooks/use-materials-slice";

interface TakeoffMaterialLine {
  section: string;
  item: string;
  quantity: number;
}

interface MatchedTakeoffMaterialLine extends TakeoffMaterialLine {
  match: CatalogItem | null;
  matchScore: number;
  lineCost: number | null;
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

export function ElectricalTakeoffPage() {
  const { currentUser } = useAuthContext();
  if (!currentUser) {
    return null;
  }

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reviewLines, setReviewLines] = useState<MatchedTakeoffMaterialLine[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const { catalogQuery } = useMaterialsSlice(currentUser);
  const catalogItems = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const pricedCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.isActive && item.costPrice !== null),
    [catalogItems],
  );

  const reviewTotals = useMemo(() => {
    const lines = reviewLines ?? [];
    return {
      matched: lines.filter((line) => line.match).length,
      unmatched: lines.filter((line) => !line.match).length,
      totalCost: lines.reduce((total, line) => total + (line.lineCost ?? 0), 0),
    };
  }, [reviewLines]);

  function handleReviewMaterials() {
    const lines = readTakeoffMaterialLines(iframeRef.current);
    if (lines.length === 0) {
      setReviewLines(null);
      setReviewError("No takeoff material rows found yet. Place devices on the plan first, then review materials.");
      return;
    }

    setReviewLines(lines.map((line) => matchTakeoffLine(line, pricedCatalogItems)));
    setReviewError(null);
  }

  async function handleCopyCsv() {
    if (!reviewLines?.length) {
      return;
    }

    const csv = [
      ["Section", "Takeoff item", "Quantity", "Catalog match", "Catalog SKU", "Unit", "Unit cost", "Line cost"],
      ...reviewLines.map((line) => [
        line.section,
        line.item,
        String(line.quantity),
        line.match?.name ?? "",
        line.match?.sku ?? "",
        line.match?.unit ?? "",
        line.match?.costPrice?.toFixed(2) ?? "",
        line.lineCost?.toFixed(2) ?? "",
      ]),
    ]
      .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    await navigator.clipboard.writeText(csv);
    setReviewError("Copied matched material CSV to your clipboard.");
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
                  {reviewTotals.matched} matched, {reviewTotals.unmatched} unmatched · Estimated catalog cost ${reviewTotals.totalCost.toFixed(2)}
                </p>
              </div>
              <button type="button" style={toolbarButtonStyle} onClick={() => setReviewLines(null)}>
                Close
              </button>
            </header>

            <div style={{ display: "grid", gap: "8px" }}>
              {reviewLines.map((line) => (
                <article
                  key={`${line.section}-${line.item}`}
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
  return sections.flatMap((section) => {
    const sectionName = section.querySelector("h3")?.textContent?.trim() || "Materials";
    return Array.from(section.querySelectorAll(".takeoff.compact > div")).flatMap((row) => {
      const item = row.querySelector("span")?.textContent?.trim();
      const quantityText = row.querySelector("strong")?.textContent?.trim() ?? "";
      const quantity = Number(quantityText.replace(/,/g, ""));

      if (!item || !Number.isFinite(quantity) || quantity <= 0) {
        return [];
      }

      return [{ section: sectionName, item, quantity }];
    });
  });
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
  };
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
