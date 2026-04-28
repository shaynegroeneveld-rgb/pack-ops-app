import type { MaterialImportRollbackPreview } from "@/domain/materials/types";

interface ImportedMaterialsRollbackPanelProps {
  preview: MaterialImportRollbackPreview | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ImportedMaterialsRollbackPanel({
  preview,
  isPending,
  onConfirm,
  onClose,
}: ImportedMaterialsRollbackPanelProps) {
  if (!preview) {
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
          maxWidth: "820px",
          maxHeight: "min(92vh, 900px)",
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
            <h3 style={{ margin: 0 }}>Remove Imported Materials</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              This safely removes materials created from purchase-history import. It does not blindly undo merged
              changes on original catalog records.
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
          <div
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "12px",
              padding: "12px",
              background: "#fff7ed",
            }}
          >
            <div style={{ fontSize: "13px", color: "#5b6475" }}>Imported Rows To Remove</div>
            <div style={{ fontSize: "26px", fontWeight: 700 }}>{preview.removableImportedMaterials.length}</div>
          </div>
          <div
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "12px",
              padding: "12px",
              background: "#eef4ff",
            }}
          >
            <div style={{ fontSize: "13px", color: "#5b6475" }}>Merged Records To Review Later</div>
            <div style={{ fontSize: "26px", fontWeight: 700 }}>{preview.mergedArtifactMaterials.length}</div>
          </div>
        </div>

        {preview.removableImportedMaterials.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Materials That Will Be Removed</h4>
            {preview.removableImportedMaterials.slice(0, 20).map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "12px",
                  padding: "12px",
                  background: "#f8fafc",
                }}
              >
                <strong>{item.name}</strong>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  {item.sku ? `${item.sku} · ` : ""}
                  {item.category || "Uncategorized"}
                </div>
              </div>
            ))}
            {preview.removableImportedMaterials.length > 20 ? (
              <div style={{ color: "#5b6475", fontSize: "13px" }}>
                +{preview.removableImportedMaterials.length - 20} more imported materials
              </div>
            ) : null}
          </section>
        ) : null}

        {preview.mergedArtifactMaterials.length > 0 ? (
          <section style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Merged Records Not Auto-Reverted</h4>
            {preview.mergedArtifactMaterials.slice(0, 10).map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "12px",
                  padding: "12px",
                  background: "#eef4ff",
                }}
              >
                <strong>{item.name}</strong>
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  {item.sku ? `${item.sku} · ` : ""}
                  {item.category || "Uncategorized"}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onConfirm()} disabled={isPending} style={{ fontWeight: 600, color: "#b42318" }}>
            {isPending ? "Removing..." : "Remove Imported Materials"}
          </button>
          <span style={{ color: "#5b6475", fontSize: "13px", alignSelf: "center" }}>
            This archives imported materials out of the catalog. Merged originals stay in place for manual review.
          </span>
        </div>
      </section>
    </div>
  );
}
