import { useEffect, useMemo, useState } from "react";

import type {
  SupplierInvoiceReviewEntry,
  SupplierInvoiceReviewPreview,
  SupplierInvoiceReviewResolution,
} from "@/domain/materials/types";

interface SupplierInvoiceReviewPanelProps {
  preview: SupplierInvoiceReviewPreview | null;
  isPending: boolean;
  onApply: (resolutions: SupplierInvoiceReviewResolution[]) => Promise<void>;
  onClose: () => void;
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function defaultResolutionForEntry(entry: SupplierInvoiceReviewEntry): SupplierInvoiceReviewResolution {
  if (entry.status === "matched") {
    const suggested = entry.suggestedMatch;
    return {
      entryId: entry.id,
      action: "merge",
      ...(suggested?.catalogItemId ? { targetCatalogItemId: suggested.catalogItemId } : {}),
      updateCost:
        suggested?.currentCatalogCost !== entry.invoiceDerivedCatalogCost &&
        entry.invoiceDerivedCatalogCost !== null,
      updateSku: false,
    };
  }

  if (entry.status === "new_item") {
    return {
      entryId: entry.id,
      action: "create",
      updateCost: true,
      updateSku: false,
    };
  }

  return {
    entryId: entry.id,
    action: "skip",
    updateCost: true,
    updateSku: false,
  };
}

function MatchCard({
  entry,
  resolution,
  onChange,
}: {
  entry: SupplierInvoiceReviewEntry;
  resolution: SupplierInvoiceReviewResolution;
  onChange: (resolution: SupplierInvoiceReviewResolution) => void;
}) {
  const suggested = entry.suggestedMatch;
  if (!suggested) {
    return null;
  }

  return (
    <article
      style={{
        border: "1px solid #d9dfeb",
        borderRadius: "14px",
        padding: "14px",
        background: "#f8fafc",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {entry.invoiceName} {entry.invoiceSku ? `· ${entry.invoiceSku}` : ""}
      </div>
      <div style={{ color: "#5b6475", fontSize: "13px" }}>
        Qty {formatQuantity(entry.quantity)} · Unit price {formatMoney(entry.unitPricePreTax)} · Extended{" "}
        {formatMoney(entry.lineTotalPreTax)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Catalog match</div>
          <strong>
            {suggested.name}
            {suggested.sku ? ` (${suggested.sku})` : ""}
          </strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Current catalog cost</div>
          <strong>{formatMoney(suggested.currentCatalogCost)}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Invoice-derived cost</div>
          <strong>{formatMoney(entry.invoiceDerivedCatalogCost)}</strong>
        </div>
      </div>
      <label style={{ display: "grid", gap: "6px" }}>
        <span style={{ fontSize: "13px", color: "#5b6475" }}>Cost decision</span>
        <select
          value={resolution.updateCost ? "update" : "keep"}
          onChange={(event) =>
            onChange({
              ...resolution,
              action: "merge",
              targetCatalogItemId: suggested.catalogItemId,
              updateCost: event.target.value === "update",
            })
          }
        >
          <option value="keep">Keep current catalog cost</option>
          <option value="update">Update to invoice-derived cost</option>
        </select>
      </label>
      <div style={{ color: "#5b6475", fontSize: "13px" }}>{suggested.reasons.join(" · ")}</div>
    </article>
  );
}

function LikelyMatchCard({
  entry,
  resolution,
  onChange,
}: {
  entry: SupplierInvoiceReviewEntry;
  resolution: SupplierInvoiceReviewResolution;
  onChange: (resolution: SupplierInvoiceReviewResolution) => void;
}) {
  return (
    <article
      style={{
        border: "1px solid #f0c36d",
        borderRadius: "14px",
        padding: "14px",
        background: "#fffaf0",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {entry.invoiceName} {entry.invoiceSku ? `· ${entry.invoiceSku}` : ""}
      </div>
      <div style={{ color: "#5b6475", fontSize: "13px" }}>
        Qty {formatQuantity(entry.quantity)} · Unit price {formatMoney(entry.unitPricePreTax)} · Extended{" "}
        {formatMoney(entry.lineTotalPreTax)} · Invoice-derived cost {formatMoney(entry.invoiceDerivedCatalogCost)}
      </div>

      <label style={{ display: "grid", gap: "6px" }}>
        <span style={{ fontSize: "13px", color: "#5b6475" }}>Review action</span>
        <select
          value={resolution.action}
          onChange={(event) =>
            onChange({
              ...resolution,
              action: event.target.value as SupplierInvoiceReviewResolution["action"],
            })
          }
        >
          <option value="skip">Skip for now</option>
          <option value="create">Create new material</option>
          <option value="merge">Merge into an existing material</option>
        </select>
      </label>

      {entry.candidateMatches.map((candidate) => {
        const isSelected =
          resolution.action === "merge" && resolution.targetCatalogItemId === candidate.catalogItemId;

        return (
          <label
            key={candidate.catalogItemId}
            style={{
              border: `1px solid ${isSelected ? "#1b4dff" : "#ead7a4"}`,
              borderRadius: "10px",
              padding: "10px",
              background: "#fff",
              display: "grid",
              gap: "6px",
              opacity: resolution.action === "merge" || !isSelected ? 1 : 0.72,
            }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="radio"
                name={`invoice-candidate-${entry.id}`}
                checked={isSelected}
                disabled={resolution.action !== "merge"}
                onChange={() =>
                  onChange({
                    ...resolution,
                    action: "merge",
                    targetCatalogItemId: candidate.catalogItemId,
                  })
                }
              />
              <strong>
                {candidate.name}
                {candidate.sku ? ` (${candidate.sku})` : ""}
              </strong>
            </div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>
              Score {candidate.similarityScore.toFixed(2)} · Current cost {formatMoney(candidate.currentCatalogCost)}
            </div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>{candidate.reasons.join(" · ")}</div>
            {isSelected ? (
              <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(resolution.updateCost)}
                    onChange={(event) =>
                      onChange({
                        ...resolution,
                        action: "merge",
                        targetCatalogItemId: candidate.catalogItemId,
                        updateCost: event.target.checked,
                      })
                    }
                  />
                  <span>Update catalog cost to {formatMoney(entry.invoiceDerivedCatalogCost)}</span>
                </label>
                {candidate.canSuggestSkuUpdate ? (
                  <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(resolution.updateSku)}
                      onChange={(event) =>
                        onChange({
                          ...resolution,
                          action: "merge",
                          targetCatalogItemId: candidate.catalogItemId,
                          updateSku: event.target.checked,
                        })
                      }
                    />
                    <span>Update SKU to {entry.invoiceSku}</span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </label>
        );
      })}
    </article>
  );
}

function NewMaterialCard({
  entry,
  resolution,
  onChange,
}: {
  entry: SupplierInvoiceReviewEntry;
  resolution: SupplierInvoiceReviewResolution;
  onChange: (resolution: SupplierInvoiceReviewResolution) => void;
}) {
  return (
    <article
      style={{
        border: "1px solid #d9dfeb",
        borderRadius: "14px",
        padding: "14px",
        background: "#eef4ff",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {entry.invoiceName} {entry.invoiceSku ? `· ${entry.invoiceSku}` : ""}
      </div>
      <div style={{ color: "#5b6475", fontSize: "13px" }}>
        Qty {formatQuantity(entry.quantity)} · Unit price {formatMoney(entry.unitPricePreTax)} · Extended{" "}
        {formatMoney(entry.lineTotalPreTax)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>New material name</div>
          <strong>{entry.invoiceName || "—"}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>New material SKU</div>
          <strong>{entry.invoiceSku || "—"}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Catalog cost to create</div>
          <strong>{formatMoney(entry.invoiceDerivedCatalogCost)}</strong>
        </div>
      </div>
      <label style={{ display: "grid", gap: "6px" }}>
        <span style={{ fontSize: "13px", color: "#5b6475" }}>Review action</span>
        <select
          value={resolution.action}
          onChange={(event) =>
            onChange({
              ...resolution,
              action: event.target.value as SupplierInvoiceReviewResolution["action"],
            })
          }
        >
          <option value="create">Create new material</option>
          <option value="skip">Skip for now</option>
        </select>
      </label>
    </article>
  );
}

export function SupplierInvoiceReviewPanel({
  preview,
  isPending,
  onApply,
  onClose,
}: SupplierInvoiceReviewPanelProps) {
  const [resolutions, setResolutions] = useState<Record<string, SupplierInvoiceReviewResolution>>({});

  useEffect(() => {
    if (!preview) {
      setResolutions({});
      return;
    }

    const next: Record<string, SupplierInvoiceReviewResolution> = {};
    for (const entry of [...preview.matchedExisting, ...preview.likelyMatches, ...preview.newMaterials]) {
      next[entry.id] = defaultResolutionForEntry(entry);
    }
    setResolutions(next);
  }, [preview]);

  const counts = useMemo(
    () =>
      preview
        ? {
            matched: preview.matchedExisting.length,
            likely: preview.likelyMatches.length,
            newMaterials: preview.newMaterials.length,
          }
        : null,
    [preview],
  );

  if (!preview || !counts) {
    return null;
  }

  return (
    <div
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
      <section
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Review Supplier Invoice</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Costs use the tax-included rule: unit price × 1.12. Review updates before touching the catalog.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            { label: "Matched Existing", value: counts.matched, color: "#1f6b37", background: "#f2fbf4" },
            { label: "Likely Matches", value: counts.likely, color: "#b54708", background: "#fff7ed" },
            { label: "New Materials", value: counts.newMaterials, color: "#163fcb", background: "#eef4ff" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                border: "1px solid #d9dfeb",
                borderRadius: "12px",
                padding: "12px",
                background: card.background,
                color: card.color,
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700 }}>{card.value}</div>
            </div>
          ))}
        </div>

        {preview.matchedExisting.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Matched Existing Materials</h4>
            {preview.matchedExisting.map((entry) => (
              <MatchCard
                key={entry.id}
                entry={entry}
                resolution={resolutions[entry.id] ?? defaultResolutionForEntry(entry)}
                onChange={(resolution) =>
                  setResolutions((current) => ({
                    ...current,
                    [entry.id]: resolution,
                  }))
                }
              />
            ))}
          </section>
        ) : null}

        {preview.likelyMatches.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Likely Matches Needing Review</h4>
            {preview.likelyMatches.map((entry) => (
              <LikelyMatchCard
                key={entry.id}
                entry={entry}
                resolution={resolutions[entry.id] ?? defaultResolutionForEntry(entry)}
                onChange={(resolution) =>
                  setResolutions((current) => ({
                    ...current,
                    [entry.id]: resolution,
                  }))
                }
              />
            ))}
          </section>
        ) : null}

        {preview.newMaterials.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>New Materials To Create</h4>
            {preview.newMaterials.map((entry) => (
              <NewMaterialCard
                key={entry.id}
                entry={entry}
                resolution={resolutions[entry.id] ?? defaultResolutionForEntry(entry)}
                onChange={(resolution) =>
                  setResolutions((current) => ({
                    ...current,
                    [entry.id]: resolution,
                  }))
                }
              />
            ))}
          </section>
        ) : null}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onApply(Object.values(resolutions))} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Applying..." : "Apply Reviewed Changes"}
          </button>
          <span style={{ color: "#5b6475", fontSize: "13px", alignSelf: "center" }}>
            Nothing is auto-applied. Review actions stay explicit for every invoice item.
          </span>
        </div>
      </section>
    </div>
  );
}
