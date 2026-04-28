import { useEffect, useMemo, useState } from "react";

import type {
  MaterialReconciliationEntry,
  MaterialReconciliationPreview,
  MaterialReconciliationResolution,
} from "@/domain/materials/types";

interface CatalogReconciliationPanelProps {
  preview: MaterialReconciliationPreview | null;
  isPending: boolean;
  onApply: (resolutions: MaterialReconciliationResolution[]) => Promise<void>;
  onClose: () => void;
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function ResolutionSelector({
  entry,
  onChange,
}: {
  entry: MaterialReconciliationEntry;
  onChange: (resolution: MaterialReconciliationResolution) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span style={{ fontSize: "13px", color: "#5b6475" }}>Review action</span>
      <select
        defaultValue="skip"
        onChange={(event) => {
          const value = event.target.value;
          if (value === "create") {
            onChange({ entryId: entry.id, action: "create" });
            return;
          }
          if (value === "skip") {
            onChange({ entryId: entry.id, action: "skip" });
            return;
          }
          onChange({
            entryId: entry.id,
            action: "merge",
            targetCatalogItemId: value as MaterialReconciliationEntry["candidateMatches"][number]["catalogItemId"],
          });
        }}
      >
        <option value="skip">Skip for now</option>
        <option value="create">Create new material</option>
        {entry.candidateMatches.map((candidate) => (
          <option key={candidate.catalogItemId} value={candidate.catalogItemId}>
            Merge into {candidate.name}
            {candidate.sku ? ` (${candidate.sku})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CatalogReconciliationPanel({
  preview,
  isPending,
  onApply,
  onClose,
}: CatalogReconciliationPanelProps) {
  const [resolutions, setResolutions] = useState<Record<string, MaterialReconciliationResolution>>({});

  useEffect(() => {
    setResolutions({});
  }, [preview]);

  const counts = useMemo(
    () =>
      preview
        ? {
            matched: preview.matched.length,
            likelyDuplicates: preview.likelyDuplicates.length,
            newItems: preview.newItems.length,
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
            <h3 style={{ margin: 0 }}>Review Purchase-History Reconciliation</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Clear matches and true new materials are ready to apply. Low-confidence duplicates stay reviewable until
              you choose what to do with them.
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
            {
              label: "Likely Duplicates",
              value: counts.likelyDuplicates,
              color: "#b54708",
              background: "#fff7ed",
            },
            { label: "New Materials", value: counts.newItems, color: "#163fcb", background: "#eef4ff" },
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

        {preview.matched.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Matched Existing Materials</h4>
            {preview.matched.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "#f8fafc",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {entry.importName} {entry.importSku ? `· ${entry.importSku}` : ""}
                </div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  Avg import price: {formatMoney(entry.averageCost)} · Source rows: {entry.sourceRowCount}
                </div>
                <div style={{ color: "#172033" }}>
                  Match: {entry.suggestedMatch?.name}
                  {entry.suggestedMatch?.sku ? ` (${entry.suggestedMatch.sku})` : ""}
                </div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  {entry.suggestedMatch?.reasons.join(" · ") || "Ready to merge into the existing catalog item."}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {preview.likelyDuplicates.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Likely Duplicates Requiring Review</h4>
            {preview.likelyDuplicates.map((entry) => (
              <article
                key={entry.id}
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
                  {entry.importName} {entry.importSku ? `· ${entry.importSku}` : ""}
                </div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  Avg import price: {formatMoney(entry.averageCost)} · Source rows: {entry.sourceRowCount}
                </div>
                {entry.candidateMatches.map((candidate) => (
                  <div
                    key={candidate.catalogItemId}
                    style={{
                      border: "1px solid #ead7a4",
                      borderRadius: "10px",
                      padding: "10px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {candidate.name}
                      {candidate.sku ? ` (${candidate.sku})` : ""}
                    </div>
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>
                      Score {candidate.similarityScore.toFixed(2)} · {candidate.category || "Uncategorized"}
                    </div>
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>{candidate.reasons.join(" · ")}</div>
                  </div>
                ))}
                <ResolutionSelector
                  entry={entry}
                  onChange={(resolution) =>
                    setResolutions((current) => ({
                      ...current,
                      [entry.id]: resolution,
                    }))
                  }
                />
              </article>
            ))}
          </section>
        ) : null}

        {preview.newItems.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>New Materials To Create</h4>
            {preview.newItems.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "#eef4ff",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {entry.importName} {entry.importSku ? `· ${entry.importSku}` : ""}
                </div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  Avg import price: {formatMoney(entry.averageCost)} · Source rows: {entry.sourceRowCount}
                </div>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  Will be created with a caution note. Existing prices will not be overwritten elsewhere.
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => void onApply(Object.values(resolutions))}
            disabled={isPending}
            style={{ fontWeight: 600 }}
          >
            {isPending ? "Applying..." : "Apply Reviewed Changes"}
          </button>
          <span style={{ color: "#5b6475", fontSize: "13px", alignSelf: "center" }}>
            Unreviewed likely duplicates will be skipped until you choose merge or create.
          </span>
        </div>
      </section>
    </div>
  );
}
