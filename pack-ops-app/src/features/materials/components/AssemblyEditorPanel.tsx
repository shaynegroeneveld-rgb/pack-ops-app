import { useEffect, useMemo, useState } from "react";

import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";

export interface AssemblyItemDraft {
  id?: string;
  catalogItemId: string;
  quantity: string;
  note: string;
  sectionName: string;
}

export interface AssemblyEditorDraft {
  assemblyId?: AssemblyView["id"];
  name: string;
  description: string;
  defaultLaborHours: string;
  isActive: boolean;
  items: AssemblyItemDraft[];
}

interface AssemblyEditorPanelProps {
  initialDraft: AssemblyEditorDraft | null;
  catalogItems: CatalogItem[];
  isPending: boolean;
  onSubmit: (draft: AssemblyEditorDraft) => Promise<void>;
  onArchive?: () => Promise<void>;
  onClose: () => void;
}

function createEmptyItemDraft(sectionName = ""): AssemblyItemDraft {
  return {
    catalogItemId: "",
    quantity: "1",
    note: "",
    sectionName,
  };
}

export function AssemblyEditorPanel({
  initialDraft,
  catalogItems,
  isPending,
  onSubmit,
  onArchive,
  onClose,
}: AssemblyEditorPanelProps) {
  const [draft, setDraft] = useState<AssemblyEditorDraft | null>(initialDraft);
  const [sectionNames, setSectionNames] = useState<string[]>([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [quickAddItems, setQuickAddItems] = useState<Record<string, AssemblyItemDraft>>({});

  useEffect(() => {
    setDraft(initialDraft);
    setSectionNames(
      Array.from(
        new Set(
          initialDraft?.items
            .map((item) => item.sectionName?.trim())
            .filter((section): section is string => Boolean(section)) ?? [],
        ),
      ),
    );
    setQuickAddItems({});
    setNewSectionName("");
  }, [initialDraft]);

  const materialsById = useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems],
  );

  if (!draft) {
    return null;
  }

  const materialCostTotal = draft.items.reduce((total, item) => {
    const material = materialsById.get(item.catalogItemId as CatalogItem["id"]);
    const quantity = Number(item.quantity || 0);
    return total + (material?.costPrice ?? 0) * (Number.isFinite(quantity) ? quantity : 0);
  }, 0);

  const lineSectionNames = Array.from(
    new Set(
      draft.items
        .map((item) => item.sectionName?.trim())
        .filter((section): section is string => Boolean(section)),
    ),
  );
  const assemblySections = (() => {
    const ordered = new Set<string>();
    for (const sectionName of sectionNames) {
      if (sectionName.trim()) {
        ordered.add(sectionName.trim());
      }
    }
    for (const sectionName of lineSectionNames) {
      ordered.add(sectionName);
    }
    if (draft.items.some((item) => !item.sectionName?.trim()) || ordered.size === 0) {
      return ["General", ...Array.from(ordered)];
    }
    return Array.from(ordered);
  })();
  const itemsBySection = (() => {
    const grouped = new Map<string, Array<AssemblyItemDraft & { originalIndex: number }>>();
    for (const sectionName of assemblySections) {
      grouped.set(sectionName, []);
    }
    draft.items.forEach((item, originalIndex) => {
      const sectionName = item.sectionName?.trim() || "General";
      const current = grouped.get(sectionName) ?? [];
      current.push({ ...item, originalIndex });
      grouped.set(sectionName, current);
    });
    return Array.from(grouped.entries()).map(([name, items]) => {
      const materialCost = items.reduce((total, item) => {
        const material = materialsById.get(item.catalogItemId as CatalogItem["id"]);
        const quantity = Number(item.quantity || 0);
        return total + (material?.costPrice ?? 0) * (Number.isFinite(quantity) ? quantity : 0);
      }, 0);
      return { name, items, materialCost };
    });
  })();

  function addAssemblyPart() {
    const normalized = newSectionName.trim();
    if (!normalized) {
      return;
    }
    setSectionNames((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setNewSectionName("");
  }

  function toStoredSectionName(sectionName: string): string {
    const normalized = sectionName.trim();
    return normalized && normalized !== "General" ? normalized : "";
  }

  function handleQuickAddMaterial(sectionName: string) {
    const quickAddItem = quickAddItems[sectionName] ?? createEmptyItemDraft(toStoredSectionName(sectionName));
    if (!quickAddItem.catalogItemId) {
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            items: [...current.items, { ...quickAddItem, sectionName: toStoredSectionName(sectionName) }],
          }
        : current,
    );
    setQuickAddItems((current) => ({ ...current, [sectionName]: createEmptyItemDraft(toStoredSectionName(sectionName)) }));
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
          maxWidth: "880px",
          maxHeight: "min(92vh, 920px)",
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
            <h3 style={{ margin: 0 }}>{draft.assemblyId ? "Edit Assembly" : "New Assembly"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Build estimating assemblies from simple catalog materials and a labor-hours baseline.
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
            border: "1px solid #e4e8f1",
            borderRadius: "12px",
            background: "#f8fafc",
            padding: "12px",
          }}
        >
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Material Cost</div>
            <strong>${materialCostTotal.toFixed(2)}</strong>
          </div>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Labor Hours</div>
            <strong>{draft.defaultLaborHours || "0"}</strong>
          </div>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, isActive: event.target.checked } : current))}
            />
            <span>Active</span>
          </label>
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
            <span>Default Labor Hours</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={draft.defaultLaborHours}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, defaultLaborHours: event.target.value } : current))
              }
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Description</span>
          <textarea
            rows={3}
            value={draft.description}
            disabled={isPending}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </label>

        <section style={{ display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h4 style={{ margin: 0 }}>Assembly Parts</h4>
              <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                Add headers, then place materials under each part. No nested assemblies yet.
              </p>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e4e8f1",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafcff",
              display: "grid",
              gap: "10px",
            }}
          >
            <strong>Part Header</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", alignItems: "end" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span>New Part</span>
                <input
                  value={newSectionName}
                  disabled={isPending}
                  placeholder="Service, Rough-in, Finish..."
                  onChange={(event) => setNewSectionName(event.target.value)}
                />
              </label>
              <button type="button" onClick={addAssemblyPart} disabled={isPending || !newSectionName.trim()}>
                Add Part
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            {itemsBySection.map((section) => {
              const quickAddItem = quickAddItems[section.name] ?? createEmptyItemDraft(toStoredSectionName(section.name));

              return (
                <div
                  key={section.name}
                  style={{
                    border: "1px solid #d9dfeb",
                    borderRadius: "14px",
                    padding: "12px",
                    background: "#fff",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <strong>{section.name}</strong>
                      <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "3px" }}>
                        {section.items.length} materials
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#5b6475", fontSize: "12px" }}>Part Total</div>
                      <strong>${section.materialCost.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #e4e8f1",
                      borderRadius: "12px",
                      padding: "12px",
                      background: "#fafcff",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "12px",
                      alignItems: "end",
                    }}
                  >
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span>Add Material</span>
                      <MaterialSearchSelect
                        catalogItems={catalogItems}
                        selectedMaterialId={quickAddItem.catalogItemId}
                        isPending={isPending}
                        placeholder={`Search materials for ${section.name}...`}
                        onSelect={(materialId) =>
                          setQuickAddItems((current) => ({
                            ...current,
                            [section.name]: { ...quickAddItem, catalogItemId: materialId },
                          }))
                        }
                      />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span>Quantity</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={quickAddItem.quantity}
                        disabled={isPending}
                        onChange={(event) =>
                          setQuickAddItems((current) => ({
                            ...current,
                            [section.name]: { ...quickAddItem, quantity: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span>Note</span>
                      <input
                        value={quickAddItem.note}
                        disabled={isPending}
                        onChange={(event) =>
                          setQuickAddItems((current) => ({
                            ...current,
                            [section.name]: { ...quickAddItem, note: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={isPending || !quickAddItem.catalogItemId}
                      onClick={() => handleQuickAddMaterial(section.name)}
                      style={{ fontWeight: 600, minHeight: "40px" }}
                    >
                      Add Material
                    </button>
                  </div>

                  {section.items.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed #d9dfeb",
                        borderRadius: "12px",
                        padding: "12px",
                        background: "#fafcff",
                        color: "#5b6475",
                      }}
                    >
                      No materials under this part yet.
                    </div>
                  ) : null}

                  {section.items.map((item) => {
                    const material = materialsById.get(item.catalogItemId as CatalogItem["id"]);
                    const quantity = Number(item.quantity || 0);
                    const lineTotal = ((material?.costPrice ?? 0) * (Number.isFinite(quantity) ? quantity : 0)).toFixed(2);

                    return (
                      <div
                        key={`${item.id ?? "new"}-${item.originalIndex}`}
                        style={{
                          border: "1px solid #d9dfeb",
                          borderRadius: "12px",
                          padding: "12px",
                          background: "#fff",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "12px",
                          }}
                        >
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span>Material</span>
                            <MaterialSearchSelect
                              catalogItems={catalogItems}
                              selectedMaterialId={item.catalogItemId}
                              isPending={isPending}
                              placeholder="Search by name or SKU..."
                              onSelect={(materialId) =>
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        items: current.items.map((currentItem, currentIndex) =>
                                          currentIndex === item.originalIndex
                                            ? { ...currentItem, catalogItemId: materialId }
                                            : currentItem,
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          </label>
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span>Quantity</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              disabled={isPending}
                              onChange={(event) =>
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        items: current.items.map((currentItem, currentIndex) =>
                                          currentIndex === item.originalIndex
                                            ? { ...currentItem, quantity: event.target.value }
                                            : currentItem,
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          </label>
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span>Part</span>
                            <input
                              value={item.sectionName}
                              disabled={isPending}
                              placeholder="General, Service..."
                              onChange={(event) =>
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        items: current.items.map((currentItem, currentIndex) =>
                                          currentIndex === item.originalIndex
                                            ? { ...currentItem, sectionName: event.target.value }
                                            : currentItem,
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          </label>
                        </div>

                        <label style={{ display: "grid", gap: "6px" }}>
                          <span>Note</span>
                          <input
                            value={item.note}
                            disabled={isPending}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      items: current.items.map((currentItem, currentIndex) =>
                                        currentIndex === item.originalIndex
                                          ? { ...currentItem, note: event.target.value }
                                          : currentItem,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </label>

                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ color: "#5b6475", fontSize: "13px" }}>
                            {material
                              ? `Cost ${material.costPrice?.toFixed(2) ?? "—"} / ${material.unit} · Line ${lineTotal}`
                              : "Select a material to see cost."}
                          </span>
                          <button
                            type="button"
                            disabled={isPending}
                            style={{ color: "#b42318" }}
                            onClick={() =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      items: current.items.filter((_, currentIndex) => currentIndex !== item.originalIndex),
                                    }
                                  : current,
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section
          style={{
            border: "1px solid #d9dfeb",
            borderRadius: "14px",
            padding: "14px",
            background: "#f8fafc",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong>Assembly Grand Total</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            <div>
              <div style={{ color: "#5b6475", fontSize: "13px" }}>Material Cost</div>
              <strong>${materialCostTotal.toFixed(2)}</strong>
            </div>
            <div>
              <div style={{ color: "#5b6475", fontSize: "13px" }}>Default Labour Hours</div>
              <strong>{draft.defaultLaborHours || "0"}</strong>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onSubmit(draft)} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Saving..." : "Save Assembly"}
          </button>
          {draft.assemblyId && onArchive ? (
            <button onClick={() => void onArchive()} disabled={isPending} style={{ color: "#b42318" }}>
              {isPending ? "Working..." : "Archive Assembly"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
