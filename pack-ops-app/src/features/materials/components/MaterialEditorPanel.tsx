import { useEffect, useState } from "react";

import type { CatalogItem } from "@/domain/materials/types";

export interface MaterialEditorDraft {
  itemId?: CatalogItem["id"];
  name: string;
  sku: string;
  unit: string;
  costPrice: string;
  category: string;
  notes: string;
  isActive: boolean;
}

interface MaterialEditorPanelProps {
  initialDraft: MaterialEditorDraft | null;
  isPending: boolean;
  onSubmit: (draft: MaterialEditorDraft) => Promise<void>;
  onArchive?: () => Promise<void>;
  onClose: () => void;
}

export function MaterialEditorPanel({
  initialDraft,
  isPending,
  onSubmit,
  onArchive,
  onClose,
}: MaterialEditorPanelProps) {
  const [draft, setDraft] = useState<MaterialEditorDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!draft) {
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
        zIndex: 30,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "720px",
          maxHeight: "min(90vh, 860px)",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{draft.itemId ? "Edit Material" : "New Material"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Keep the catalog practical: cost-based materials, simple categories, and active/inactive.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Name</span>
            <input
              value={draft.name}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>SKU / Supplier Code</span>
            <input
              value={draft.sku}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, sku: event.target.value } : current))}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Unit</span>
            <input
              value={draft.unit}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, unit: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Cost</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.costPrice}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, costPrice: event.target.value } : current))
              }
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Category</span>
            <input
              value={draft.category}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, category: event.target.value } : current))
              }
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Notes</span>
          <textarea
            rows={3}
            value={draft.notes}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
          />
        </label>

        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={draft.isActive}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, isActive: event.target.checked } : current))}
          />
          <span>Active</span>
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onSubmit(draft)} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Saving..." : "Save Material"}
          </button>
          {draft.itemId && onArchive ? (
            <button onClick={() => void onArchive()} disabled={isPending} style={{ color: "#b42318" }}>
              {isPending ? "Working..." : "Archive Material"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
