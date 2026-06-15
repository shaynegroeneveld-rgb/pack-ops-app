import { useEffect, useMemo, useState } from "react";

import type { JobMaterialView } from "@/domain/jobs/types";
import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import { matchesCatalogItemSearch } from "@/services/materials/material-search";

import { actionButtonStyle, fieldColors, infoLabelStyle, inputStyle, softCardStyle } from "./field-mode-shared";

type MaterialsUsedTab = "materials" | "assemblies" | "recent";

interface FieldMaterialsUsedPanelProps {
  jobId: string;
  catalogItems: CatalogItem[];
  assemblies: AssemblyView[];
  usedMaterials: JobMaterialView[];
  isPending: boolean;
  onCreateUsedMaterial: (input: {
    jobId: string;
    catalogItemId: string;
    kind: "used";
    quantity: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
    sourceAssemblyId?: string | null;
    sourceAssemblyName?: string | null;
    sourceAssemblyMultiplier?: number | null;
  }) => Promise<unknown>;
  onUpdateUsedMaterial: (input: {
    jobMaterialId: string;
    catalogItemId: string;
    quantity: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
  }) => Promise<unknown>;
  onDeleteUsedMaterial: (jobMaterialId: string) => Promise<unknown>;
}

function assemblyMatchesSearch(assembly: AssemblyView, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const searchText = [
    assembly.name,
    assembly.description ?? "",
    ...assembly.items.flatMap((item) => [item.materialName, item.materialSku ?? "", item.note ?? ""]),
  ]
    .join(" ")
    .toLowerCase();

  return searchText.includes(normalized);
}

export function FieldMaterialsUsedPanel({
  jobId,
  catalogItems,
  assemblies,
  usedMaterials,
  isPending,
  onCreateUsedMaterial,
  onUpdateUsedMaterial,
  onDeleteUsedMaterial,
}: FieldMaterialsUsedPanelProps) {
  const [activeTab, setActiveTab] = useState<MaterialsUsedTab>("materials");
  const [search, setSearch] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setQuantityDrafts((current) => {
      const next: Record<string, string> = {};
      for (const line of usedMaterials) {
        next[line.id] = current[line.id] ?? String(line.quantity);
      }
      return next;
    });
  }, [usedMaterials]);

  const catalogItemsById = useMemo(() => new Map(catalogItems.map((item) => [String(item.id), item])), [catalogItems]);

  const filteredMaterials = useMemo(
    () =>
      search.trim()
        ? catalogItems.filter((item) => matchesCatalogItemSearch(item, search)).slice(0, 10)
        : catalogItems.slice(0, 10),
    [catalogItems, search],
  );

  const filteredAssemblies = useMemo(
    () => (search.trim() ? assemblies.filter((assembly) => assemblyMatchesSearch(assembly, search)) : assemblies).slice(0, 8),
    [assemblies, search],
  );

  const recentItems = useMemo(() => {
    const recentMaterials: CatalogItem[] = [];
    const seenMaterialIds = new Set<string>();
    for (const line of [...usedMaterials].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
      const item = catalogItemsById.get(String(line.catalogItemId));
      if (!item || seenMaterialIds.has(String(item.id))) {
        continue;
      }
      seenMaterialIds.add(String(item.id));
      recentMaterials.push(item);
      if (recentMaterials.length >= 6) {
        break;
      }
    }

    return recentMaterials;
  }, [catalogItemsById, usedMaterials]);

  function getExistingUsedLine(catalogItemId: string) {
    return usedMaterials.find((line) => String(line.catalogItemId) === String(catalogItemId)) ?? null;
  }

  async function upsertCatalogMaterial(
    item: CatalogItem,
    quantityToAdd: number,
    options?: {
      note?: string | null;
      sectionName?: string | null;
      sourceAssemblyId?: string | null;
      sourceAssemblyName?: string | null;
      sourceAssemblyMultiplier?: number | null;
    },
  ) {
    const existingLine = getExistingUsedLine(String(item.id));
    if (existingLine) {
      await onUpdateUsedMaterial({
        jobMaterialId: existingLine.id,
        catalogItemId: existingLine.catalogItemId,
        quantity: Math.round((existingLine.quantity + quantityToAdd) * 100) / 100,
        note: existingLine.note,
        displayName: existingLine.displayName ?? existingLine.materialName,
        skuSnapshot: existingLine.skuSnapshot ?? existingLine.materialSku,
        unitSnapshot: existingLine.unitSnapshot ?? existingLine.materialUnit,
        unitCost: existingLine.unitCost ?? existingLine.currentCatalogCost ?? null,
        unitSell: existingLine.unitSell ?? existingLine.currentCatalogUnitPrice ?? null,
        markupPercent: existingLine.markupPercent,
        sectionName: existingLine.sectionName,
      });
      return;
    }

    await onCreateUsedMaterial({
      jobId,
      catalogItemId: String(item.id),
      kind: "used",
      quantity: Math.round(quantityToAdd * 100) / 100,
      note: options?.note ?? null,
      displayName: item.name,
      skuSnapshot: item.sku ?? null,
      unitSnapshot: item.unit ?? null,
      unitCost: item.costPrice ?? null,
      unitSell: item.unitPrice ?? null,
      markupPercent: null,
      sectionName: options?.sectionName ?? null,
      sourceAssemblyId: options?.sourceAssemblyId ?? null,
      sourceAssemblyName: options?.sourceAssemblyName ?? null,
      sourceAssemblyMultiplier: options?.sourceAssemblyMultiplier ?? null,
    });
  }

  async function handleAddAssembly(assembly: AssemblyView) {
    for (const item of assembly.items) {
      const catalogItem = catalogItemsById.get(String(item.catalogItemId));
      if (!catalogItem) {
        continue;
      }
      await upsertCatalogMaterial(catalogItem, item.quantity, {
        note: [assembly.name, item.note].filter(Boolean).join(" · ") || null,
        sectionName: item.sectionName ?? null,
        sourceAssemblyId: String(assembly.id),
        sourceAssemblyName: assembly.name,
        sourceAssemblyMultiplier: 1,
      });
    }
    setSearch("");
  }

  async function handleQuantityDelta(line: JobMaterialView, delta: number) {
    const nextQuantity = Math.round((line.quantity + delta) * 100) / 100;
    if (nextQuantity <= 0) {
      await onDeleteUsedMaterial(line.id);
      return;
    }
    await onUpdateUsedMaterial({
      jobMaterialId: line.id,
      catalogItemId: line.catalogItemId,
      quantity: nextQuantity,
      note: line.note,
      displayName: line.displayName ?? line.materialName,
      skuSnapshot: line.skuSnapshot ?? line.materialSku,
      unitSnapshot: line.unitSnapshot ?? line.materialUnit,
      unitCost: line.unitCost ?? line.currentCatalogCost ?? null,
      unitSell: line.unitSell ?? line.currentCatalogUnitPrice ?? null,
      markupPercent: line.markupPercent,
      sectionName: line.sectionName,
    });
    setQuantityDrafts((current) => ({ ...current, [line.id]: String(nextQuantity) }));
  }

  async function handleSetQuantity(line: JobMaterialView) {
    const nextQuantity = Number(quantityDrafts[line.id] ?? line.quantity);
    if (!Number.isFinite(nextQuantity)) {
      return;
    }
    if (nextQuantity <= 0) {
      await onDeleteUsedMaterial(line.id);
      return;
    }
    await onUpdateUsedMaterial({
      jobMaterialId: line.id,
      catalogItemId: line.catalogItemId,
      quantity: Math.round(nextQuantity * 100) / 100,
      note: line.note,
      displayName: line.displayName ?? line.materialName,
      skuSnapshot: line.skuSnapshot ?? line.materialSku,
      unitSnapshot: line.unitSnapshot ?? line.materialUnit,
      unitCost: line.unitCost ?? line.currentCatalogCost ?? null,
      unitSell: line.unitSell ?? line.currentCatalogUnitPrice ?? null,
      markupPercent: line.markupPercent,
      sectionName: line.sectionName,
    });
  }

  const tabButtonStyle = (isActive: boolean) => ({
    ...actionButtonStyle(isActive ? "primary" : "secondary"),
    width: "auto",
    minWidth: "unset",
    padding: "10px 14px",
    minHeight: "40px",
    fontSize: "14px",
  });

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <strong style={{ color: fieldColors.white }}>Materials Used</strong>
      <label style={{ display: "grid", gap: "6px" }}>
        <span style={infoLabelStyle()}>Quick Search</span>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={activeTab === "assemblies" ? "Search assemblies" : "Search name, SKU, or nickname"}
          style={inputStyle()}
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" style={tabButtonStyle(activeTab === "materials")} onClick={() => setActiveTab("materials")}>
          Materials
        </button>
        <button type="button" style={tabButtonStyle(activeTab === "assemblies")} onClick={() => setActiveTab("assemblies")}>
          Assemblies
        </button>
        <button type="button" style={tabButtonStyle(activeTab === "recent")} onClick={() => setActiveTab("recent")}>
          Recent
        </button>
      </div>

      {activeTab === "materials" ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {filteredMaterials.length === 0 ? (
            <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No materials matched that search.</div>
          ) : (
            filteredMaterials.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isPending}
                onClick={() => void upsertCatalogMaterial(item, 1)}
                style={{
                  ...softCardStyle(),
                  padding: "12px",
                  display: "grid",
                  gap: "8px",
                  textAlign: "left",
                  color: fieldColors.white,
                }}
              >
                <div style={{ display: "grid", gap: "2px" }}>
                  <strong style={{ overflowWrap: "anywhere" }}>{item.name}</strong>
                  <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                    {[item.sku, item.aliases.join(", ")].filter(Boolean).join(" · ") || item.category || "Catalog material"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                  <span style={{ ...actionButtonStyle("secondary"), display: "grid", placeItems: "center" }}>Tap to add +1</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void upsertCatalogMaterial(item, 5);
                    }}
                    style={actionButtonStyle("secondary")}
                  >
                    +5
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "assemblies" ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {filteredAssemblies.length === 0 ? (
            <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No assemblies matched that search.</div>
          ) : (
            filteredAssemblies.map((assembly) => (
              <button
                key={assembly.id}
                type="button"
                disabled={isPending}
                onClick={() => void handleAddAssembly(assembly)}
                style={{
                  ...softCardStyle(),
                  padding: "12px",
                  display: "grid",
                  gap: "8px",
                  textAlign: "left",
                  color: fieldColors.white,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                  <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{assembly.name}</strong>
                    <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                      {assembly.description || `${assembly.items.length} materials`}
                    </span>
                  </div>
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      fontWeight: 900,
                      background: "rgba(255, 180, 0, 0.18)",
                      color: fieldColors.goldBright,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Assembly
                  </span>
                </div>
                <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                  {assembly.items.length} materials · {assembly.materialCostTotal.toFixed(2)} current material cost
                </div>
                <span style={{ ...actionButtonStyle("secondary"), display: "grid", placeItems: "center" }}>
                  Tap to add assembly
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "recent" ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {recentItems.length === 0 ? (
            <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No recent used materials yet.</div>
          ) : (
            recentItems.map((item) => (
              <div key={`recent-${item.id}`} style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "8px" }}>
                <div style={{ display: "grid", gap: "2px" }}>
                  <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{item.name}</strong>
                  <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                    {[item.sku, item.aliases[0]].filter(Boolean).join(" · ") || item.category || "Catalog material"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                  <button type="button" disabled={isPending} onClick={() => void upsertCatalogMaterial(item, 1)} style={actionButtonStyle("secondary")}>
                    +1
                  </button>
                  <button type="button" disabled={isPending} onClick={() => void upsertCatalogMaterial(item, 5)} style={actionButtonStyle("secondary")}>
                    +5
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {usedMaterials.length === 0 ? (
        <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No used materials yet.</div>
      ) : (
        usedMaterials.map((line) => (
          <div key={line.id} style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gap: "2px" }}>
              <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{line.displayName ?? line.materialName}</strong>
              <span style={{ color: fieldColors.green, fontSize: "13px", fontWeight: 800 }}>
                {line.quantity} {line.unitSnapshot ?? line.materialUnit}
              </span>
              {line.sourceAssemblyName ? (
                <span style={{ color: fieldColors.goldBright, fontSize: "12px", overflowWrap: "anywhere" }}>
                  From assembly: {line.sourceAssemblyName}
                </span>
              ) : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
              <button type="button" disabled={isPending} style={actionButtonStyle("secondary")} onClick={() => void handleQuantityDelta(line, -1)}>
                -1
              </button>
              <button type="button" disabled={isPending} style={actionButtonStyle("secondary")} onClick={() => void handleQuantityDelta(line, 1)}>
                +1
              </button>
              <button type="button" disabled={isPending} style={actionButtonStyle("secondary")} onClick={() => void onDeleteUsedMaterial(line.id)}>
                Remove
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px", alignItems: "end" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Exact Quantity</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantityDrafts[line.id] ?? String(line.quantity)}
                  onChange={(event) => setQuantityDrafts((current) => ({ ...current, [line.id]: event.target.value }))}
                  style={inputStyle()}
                />
              </label>
              <button type="button" disabled={isPending} style={{ ...actionButtonStyle(), width: "auto", minWidth: "90px" }} onClick={() => void handleSetQuantity(line)}>
                Set
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
