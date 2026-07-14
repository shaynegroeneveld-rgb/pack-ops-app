import { useEffect, useState } from "react";

import type { CatalogCleanupPair, CatalogCleanupResolution } from "@/domain/materials/types";
import { Modal } from "@/ui";

interface CatalogCleanupPanelProps {
  pairs: CatalogCleanupPair[] | null;
  isPending: boolean;
  onApply: (resolutions: CatalogCleanupResolution[]) => Promise<void>;
  onClose: () => void;
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

export function CatalogCleanupPanel({
  pairs,
  isPending,
  onApply,
  onClose,
}: CatalogCleanupPanelProps) {
  const [resolutions, setResolutions] = useState<Record<string, CatalogCleanupResolution>>({});

  useEffect(() => {
    setResolutions({});
  }, [pairs]);

  return (
    <Modal
      open={Boolean(pairs)}
      onClose={onClose}
      title="Catalog Cleanup"
      footer={
        pairs ? (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => void onApply(Object.values(resolutions))}
              disabled={isPending}
              style={{ fontWeight: 600 }}
            >
              {isPending ? "Applying..." : "Apply Cleanup Decisions"}
            </button>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>
              Pairs you leave on skip will not be merged.
            </span>
          </div>
        ) : null
      }
    >
      {pairs ? (
        <>
        <p style={{ margin: 0, color: "#5b6475" }}>
          Review likely duplicate materials, choose the primary record to keep, and merge only the rows you trust.
        </p>

        {pairs.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d9dfeb",
              borderRadius: "12px",
              padding: "16px",
              background: "#fafcff",
              color: "#5b6475",
            }}
          >
            No likely duplicate catalog items were found.
          </div>
        ) : (
          pairs.map((pair) => {
            const resolution = resolutions[pair.id];
            const chosenPrimaryId = resolution?.primaryCatalogItemId ?? pair.primary.id;
            return (
              <article
                key={pair.id}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "#fff",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Similarity score {pair.similarityScore.toFixed(2)}</div>
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>{pair.reasons.join(" · ")}</div>
                  </div>
                  <label style={{ display: "grid", gap: "6px", minWidth: "220px" }}>
                    <span style={{ fontSize: "13px", color: "#5b6475" }}>Action</span>
                    <select
                      value={resolution?.action ?? "skip"}
                      onChange={(event) =>
                        setResolutions((current) => ({
                          ...current,
                          [pair.id]:
                            event.target.value === "merge"
                              ? {
                                  pairId: pair.id,
                                  action: "merge",
                                  primaryCatalogItemId: chosenPrimaryId,
                                }
                              : { pairId: pair.id, action: "skip" },
                        }))
                      }
                    >
                      <option value="skip">Skip for now</option>
                      <option value="merge">Merge duplicate into primary</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                  {[pair.primary, pair.duplicate].map((item) => {
                    const isPrimary = chosenPrimaryId === item.id;
                    return (
                      <div
                        key={item.id}
                        style={{
                          border: isPrimary ? "1px solid #1b4dff" : "1px solid #d9dfeb",
                          borderRadius: "12px",
                          padding: "12px",
                          background: isPrimary ? "#eef4ff" : "#f8fafc",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="radio"
                            name={`primary-${pair.id}`}
                            checked={isPrimary}
                            onChange={() =>
                              setResolutions((current) => ({
                                ...current,
                                [pair.id]: {
                                  pairId: pair.id,
                                  action: current[pair.id]?.action === "merge" ? "merge" : "skip",
                                  primaryCatalogItemId: item.id,
                                },
                              }))
                            }
                          />
                          <span style={{ fontWeight: 700 }}>{isPrimary ? "Keep this record" : "Mark as duplicate"}</span>
                        </label>
                        <div style={{ fontWeight: 700 }}>
                          {item.name}
                          {item.sku ? ` · ${item.sku}` : ""}
                        </div>
                        <div style={{ color: "#5b6475", fontSize: "13px" }}>
                          {item.category || "Uncategorized"} · Cost {formatMoney(item.costPrice)}
                        </div>
                        {item.notes ? <div style={{ color: "#5b6475", fontSize: "13px" }}>{item.notes}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
        </>
      ) : null}
    </Modal>
  );
}
