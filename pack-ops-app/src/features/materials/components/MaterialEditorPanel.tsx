import { useEffect, useState } from "react";

import type { CatalogItem } from "@/domain/materials/types";
import { Modal } from "@/ui";

export interface MaterialEditorDraft {
  itemId?: CatalogItem["id"];
  name: string;
  sku: string;
  aliases: string;
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

  return (
    <Modal
      open={Boolean(draft)}
      onClose={onClose}
      title={draft?.itemId ? "Edit Material" : "New Material"}
      footer={
        draft ? (
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
        ) : null
      }
    >
      {draft ? (
        <>
        <p style={{ margin: 0, color: "#5b6475" }}>
          Keep the catalog practical: cost-based materials, simple categories, and active/inactive.
        </p>

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

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Nicknames / Aliases</span>
          <textarea
            rows={2}
            value={draft.aliases}
            disabled={isPending}
            placeholder="pot light, marettes, staples"
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, aliases: event.target.value } : current))
            }
          />
        </label>

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
        </>
      ) : null}
    </Modal>
  );
}
