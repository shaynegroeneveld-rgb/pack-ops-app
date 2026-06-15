import { useEffect, useMemo, useRef, useState } from "react";

import type { JobMaterialView } from "@/domain/jobs/types";
import type { AssemblyView, CatalogItem } from "@/domain/materials/types";
import { matchesCatalogItemSearch } from "@/services/materials/material-search";

import { actionButtonStyle, fieldColors, infoLabelStyle, inputStyle, softCardStyle } from "./field-mode-shared";

type MaterialsUsedTab = "materials" | "assemblies" | "recent";
type MaterialActionStatus = "saving" | "saved" | "error";

interface MaterialActionState {
  status: MaterialActionStatus;
  message: string;
}

interface OptimisticTempRow {
  id: string;
  jobId: string;
  catalogItemId: string;
  quantity: number;
  note: string | null;
  displayName: string | null;
  skuSnapshot: string | null;
  unitSnapshot: string | null;
  unitCost: number | null;
  unitSell: number | null;
  markupPercent: number | null;
  sectionName: string | null;
  sourceAssemblyId: string | null;
  sourceAssemblyName: string | null;
  sourceAssemblyMultiplier: number | null;
}

interface FieldMaterialsUsedPanelProps {
  jobId: string;
  catalogItems: CatalogItem[];
  assemblies: AssemblyView[];
  usedMaterials: JobMaterialView[];
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

function actionKeyForCatalog(catalogItemId: string): string {
  return `catalog:${catalogItemId}`;
}

function tempRowId(catalogItemId: string): string {
  return `temp:${catalogItemId}`;
}

function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export function FieldMaterialsUsedPanel({
  jobId,
  catalogItems,
  assemblies,
  usedMaterials,
  onCreateUsedMaterial,
  onUpdateUsedMaterial,
  onDeleteUsedMaterial,
}: FieldMaterialsUsedPanelProps) {
  const [activeTab, setActiveTab] = useState<MaterialsUsedTab>("materials");
  const [search, setSearch] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [optimisticQuantities, setOptimisticQuantities] = useState<Record<string, number>>({});
  const [deletedRowIds, setDeletedRowIds] = useState<Record<string, true>>({});
  const [tempRows, setTempRows] = useState<Record<string, OptimisticTempRow>>({});
  const [actionStates, setActionStates] = useState<Record<string, MaterialActionState>>({});
  const createTimersRef = useRef<Record<string, number>>({});
  const updateTimersRef = useRef<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, number>>({});
  const tempRowsRef = useRef<Record<string, OptimisticTempRow>>({});
  const optimisticQuantitiesRef = useRef<Record<string, number>>({});
  const deletedRowIdsRef = useRef<Record<string, true>>({});
  const usedMaterialsRef = useRef<JobMaterialView[]>(usedMaterials);
  const hasSearch = search.trim().length > 0;

  useEffect(() => {
    tempRowsRef.current = tempRows;
  }, [tempRows]);

  useEffect(() => {
    optimisticQuantitiesRef.current = optimisticQuantities;
  }, [optimisticQuantities]);

  useEffect(() => {
    deletedRowIdsRef.current = deletedRowIds;
  }, [deletedRowIds]);

  useEffect(() => {
    usedMaterialsRef.current = usedMaterials;
  }, [usedMaterials]);

  const catalogItemsById = useMemo(() => new Map(catalogItems.map((item) => [String(item.id), item])), [catalogItems]);

  const displayedUsedMaterials = useMemo(() => {
    const serverRows = usedMaterials
      .filter((line) => !deletedRowIds[line.id])
      .map((line) => ({
        ...line,
        quantity: optimisticQuantities[line.id] ?? line.quantity,
      }))
      .filter((line) => line.quantity > 0);

    const rowsByCatalogId = new Set(serverRows.map((line) => String(line.catalogItemId)));
    const optimisticTempRows: JobMaterialView[] = Object.values(tempRows)
      .filter((row) => !rowsByCatalogId.has(String(row.catalogItemId)) && row.quantity > 0)
      .map((row) => ({
        ...row,
        orgId: catalogItems[0]?.orgId ?? ("temp-org" as never),
        kind: "used",
        materialName: row.displayName ?? "Material",
        materialSku: row.skuSnapshot,
        materialUnit: row.unitSnapshot ?? "each",
        currentCatalogCost: row.unitCost,
        currentCatalogUnitPrice: row.unitSell,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
      }) as JobMaterialView);

    return [...serverRows, ...optimisticTempRows].sort((left, right) =>
      (left.displayName ?? left.materialName).localeCompare(right.displayName ?? right.materialName),
    );
  }, [catalogItems, deletedRowIds, optimisticQuantities, tempRows, usedMaterials]);

  useEffect(() => {
    setQuantityDrafts((current) => {
      const next = { ...current };
      for (const line of displayedUsedMaterials) {
        next[line.id] = next[line.id] ?? String(line.quantity);
      }
      return next;
    });
  }, [displayedUsedMaterials]);

  useEffect(() => {
    setTempRows((current) => {
      const next = { ...current };
      let changed = false;
      for (const line of usedMaterials) {
        const key = actionKeyForCatalog(String(line.catalogItemId));
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setDeletedRowIds((current) => {
      const next = { ...current };
      let changed = false;
      for (const line of usedMaterials) {
        if (next[line.id]) {
          delete next[line.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [usedMaterials]);

  useEffect(
    () => () => {
      for (const timer of Object.values(createTimersRef.current)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(updateTimersRef.current)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(flashTimersRef.current)) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  const filteredMaterials = useMemo(
    () => (hasSearch ? catalogItems.filter((item) => matchesCatalogItemSearch(item, search)).slice(0, 10) : []),
    [catalogItems, hasSearch, search],
  );

  const filteredAssemblies = useMemo(
    () => (hasSearch ? assemblies.filter((assembly) => assemblyMatchesSearch(assembly, search)) : []).slice(0, 8),
    [assemblies, hasSearch, search],
  );

  const recentItems = useMemo(() => {
    const recentMaterials: CatalogItem[] = [];
    const seenMaterialIds = new Set<string>();
    for (const line of [...displayedUsedMaterials].sort((left, right) => {
      const leftUpdated = left.updatedAt || "";
      const rightUpdated = right.updatedAt || "";
      return rightUpdated.localeCompare(leftUpdated);
    })) {
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
  }, [catalogItemsById, displayedUsedMaterials]);

  function setActionState(key: string, status: MaterialActionStatus, message: string) {
    setActionStates((current) => ({
      ...current,
      [key]: { status, message },
    }));

    if (flashTimersRef.current[key]) {
      window.clearTimeout(flashTimersRef.current[key]);
    }

    if (status !== "saving") {
      flashTimersRef.current[key] = window.setTimeout(() => {
        setActionStates((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }, status === "error" ? 2200 : 1200);
    }
  }

  function getExistingDisplayedLine(catalogItemId: string) {
    return displayedUsedMaterials.find((line) => String(line.catalogItemId) === String(catalogItemId)) ?? null;
  }

  function scheduleCreate(key: string) {
    if (createTimersRef.current[key]) {
      window.clearTimeout(createTimersRef.current[key]);
    }

    createTimersRef.current[key] = window.setTimeout(() => {
      void flushCreate(key);
    }, 200);
  }

  function scheduleUpdate(rowId: string) {
    if (updateTimersRef.current[rowId]) {
      window.clearTimeout(updateTimersRef.current[rowId]);
    }

    updateTimersRef.current[rowId] = window.setTimeout(() => {
      void flushUpdate(rowId);
    }, 200);
  }

  async function flushCreate(key: string) {
    const row = tempRowsRef.current[key];
    if (!row || row.quantity <= 0) {
      return;
    }

    try {
      setActionState(key, "saving", "Saving…");
      await onCreateUsedMaterial({
        jobId,
        catalogItemId: row.catalogItemId,
        kind: "used",
        quantity: row.quantity,
        note: row.note,
        displayName: row.displayName,
        skuSnapshot: row.skuSnapshot,
        unitSnapshot: row.unitSnapshot,
        unitCost: row.unitCost,
        unitSell: row.unitSell,
        markupPercent: row.markupPercent,
        sectionName: row.sectionName,
        sourceAssemblyId: row.sourceAssemblyId,
        sourceAssemblyName: row.sourceAssemblyName,
        sourceAssemblyMultiplier: row.sourceAssemblyMultiplier,
      });
      setTempRows((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setActionState(key, "saved", "Added");
    } catch (error) {
      setTempRows((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setActionState(
        key,
        "error",
        error instanceof Error ? error.message : "Could not add material.",
      );
    }
  }

  async function flushUpdate(rowId: string) {
    const sourceLine = usedMaterialsRef.current.find((line) => line.id === rowId);
    if (!sourceLine) {
      return;
    }

    const nextQuantity = optimisticQuantitiesRef.current[rowId];
    const actionKey = rowId;

    try {
      setActionState(actionKey, "saving", "Saving…");
      if (deletedRowIdsRef.current[rowId] || nextQuantity === 0) {
        await onDeleteUsedMaterial(rowId);
      } else if (nextQuantity != null && nextQuantity > 0) {
        await onUpdateUsedMaterial({
          jobMaterialId: sourceLine.id,
          catalogItemId: sourceLine.catalogItemId,
          quantity: nextQuantity,
          note: sourceLine.note,
          displayName: sourceLine.displayName ?? sourceLine.materialName,
          skuSnapshot: sourceLine.skuSnapshot ?? sourceLine.materialSku,
          unitSnapshot: sourceLine.unitSnapshot ?? sourceLine.materialUnit,
          unitCost: sourceLine.unitCost ?? sourceLine.currentCatalogCost ?? null,
          unitSell: sourceLine.unitSell ?? sourceLine.currentCatalogUnitPrice ?? null,
          markupPercent: sourceLine.markupPercent,
          sectionName: sourceLine.sectionName,
        });
      }

      setOptimisticQuantities((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setDeletedRowIds((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setActionState(actionKey, "saved", nextQuantity === 0 ? "Removed" : "Updated");
    } catch (error) {
      setOptimisticQuantities((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setDeletedRowIds((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setActionState(
        actionKey,
        "error",
        error instanceof Error ? error.message : "Could not update material.",
      );
    }
  }

  function incrementOrCreateMaterial(
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
    const existingLine = getExistingDisplayedLine(String(item.id));
    if (existingLine && !String(existingLine.id).startsWith("temp:")) {
      const nextQuantity = roundQuantity((optimisticQuantities[existingLine.id] ?? existingLine.quantity) + quantityToAdd);
      setOptimisticQuantities((current) => ({
        ...current,
        [existingLine.id]: nextQuantity,
      }));
      setQuantityDrafts((current) => ({
        ...current,
        [existingLine.id]: String(nextQuantity),
      }));
      setActionState(existingLine.id, "saving", "Updating…");
      scheduleUpdate(existingLine.id);
      return;
    }

    const key = actionKeyForCatalog(String(item.id));
    const existingTempRow = tempRowsRef.current[key];
    const nextQuantity = roundQuantity((existingTempRow?.quantity ?? 0) + quantityToAdd);
    setTempRows((current) => ({
      ...current,
      [key]: {
        id: tempRowId(String(item.id)),
        jobId,
        catalogItemId: String(item.id),
        quantity: nextQuantity,
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
      },
    }));
    setQuantityDrafts((current) => ({
      ...current,
      [tempRowId(String(item.id))]: String(nextQuantity),
    }));
    setActionState(key, "saving", "Adding…");
    scheduleCreate(key);
  }

  function handleAddMaterial(item: CatalogItem, quantityToAdd: number) {
    incrementOrCreateMaterial(item, quantityToAdd);
    setSearch("");
  }

  function handleAddAssembly(assembly: AssemblyView) {
    for (const item of assembly.items) {
      const catalogItem = catalogItemsById.get(String(item.catalogItemId));
      if (!catalogItem) {
        continue;
      }
      incrementOrCreateMaterial(catalogItem, item.quantity, {
        note: [assembly.name, item.note].filter(Boolean).join(" · ") || null,
        sectionName: item.sectionName ?? null,
        sourceAssemblyId: String(assembly.id),
        sourceAssemblyName: assembly.name,
        sourceAssemblyMultiplier: 1,
      });
    }
    setSearch("");
    setActionState(`assembly:${assembly.id}`, "saved", "Assembly added");
  }

  function handleQuantityDelta(line: JobMaterialView, delta: number) {
    if (String(line.id).startsWith("temp:")) {
      const key = actionKeyForCatalog(String(line.catalogItemId));
      const tempRow = tempRowsRef.current[key];
      if (!tempRow) {
        return;
      }
      const nextQuantity = roundQuantity(tempRow.quantity + delta);
      if (nextQuantity <= 0) {
        setTempRows((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setActionState(key, "saved", "Removed");
        return;
      }
      setTempRows((current) => {
        const existing = current[key];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...existing,
            quantity: nextQuantity,
          },
        };
      });
      setQuantityDrafts((current) => ({
        ...current,
        [line.id]: String(nextQuantity),
      }));
      setActionState(key, "saving", "Updating…");
      scheduleCreate(key);
      return;
    }

    const nextQuantity = roundQuantity((optimisticQuantities[line.id] ?? line.quantity) + delta);
    setOptimisticQuantities((current) => ({
      ...current,
      [line.id]: Math.max(0, nextQuantity),
    }));
    setDeletedRowIds((current) => {
      const next = { ...current };
      if (nextQuantity <= 0) {
        next[line.id] = true;
      } else {
        delete next[line.id];
      }
      return next;
    });
    setQuantityDrafts((current) => ({
      ...current,
      [line.id]: String(Math.max(0, nextQuantity)),
    }));
    setActionState(line.id, "saving", nextQuantity <= 0 ? "Removing…" : "Updating…");
    scheduleUpdate(line.id);
  }

  function handleSetQuantity(line: JobMaterialView) {
    const rawQuantity = Number(quantityDrafts[line.id] ?? line.quantity);
    if (!Number.isFinite(rawQuantity)) {
      return;
    }
    const nextQuantity = Math.max(0, roundQuantity(rawQuantity));

    if (String(line.id).startsWith("temp:")) {
      const key = actionKeyForCatalog(String(line.catalogItemId));
      if (nextQuantity <= 0) {
        setTempRows((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setActionState(key, "saved", "Removed");
        return;
      }
      setTempRows((current) => {
        const existing = current[key];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...existing,
            quantity: nextQuantity,
          },
        };
      });
      setActionState(key, "saving", "Updating…");
      scheduleCreate(key);
      return;
    }

    setOptimisticQuantities((current) => ({
      ...current,
      [line.id]: nextQuantity,
    }));
    setDeletedRowIds((current) => {
      const next = { ...current };
      if (nextQuantity <= 0) {
        next[line.id] = true;
      } else {
        delete next[line.id];
      }
      return next;
    });
    setActionState(line.id, "saving", nextQuantity <= 0 ? "Removing…" : "Updating…");
    scheduleUpdate(line.id);
  }

  function handleRemoveLine(line: JobMaterialView) {
    if (String(line.id).startsWith("temp:")) {
      const key = actionKeyForCatalog(String(line.catalogItemId));
      setTempRows((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setActionState(key, "saved", "Removed");
      return;
    }

    setOptimisticQuantities((current) => ({
      ...current,
      [line.id]: 0,
    }));
    setDeletedRowIds((current) => ({
      ...current,
      [line.id]: true,
    }));
    setActionState(line.id, "saving", "Removing…");
    scheduleUpdate(line.id);
  }

  const tabButtonStyle = (isActive: boolean) => ({
    ...actionButtonStyle(isActive ? "primary" : "secondary"),
    width: "auto",
    minWidth: "unset",
    padding: "10px 14px",
    minHeight: "40px",
    fontSize: "14px",
  });

  function renderActionState(actionKey: string) {
    const state = actionStates[actionKey];
    if (!state) {
      return null;
    }

    const color =
      state.status === "error"
        ? fieldColors.danger
        : state.status === "saved"
          ? fieldColors.goldBright
          : fieldColors.whiteSoft;

    return <span style={{ color, fontSize: "12px", fontWeight: 700 }}>{state.message}</span>;
  }

  function resultCardStyle(actionKey: string) {
    const state = actionStates[actionKey];
    return {
      ...softCardStyle(),
      padding: "12px",
      display: "grid",
      gap: "8px",
      textAlign: "left" as const,
      color: fieldColors.white,
      boxShadow:
        state?.status === "saved"
          ? "0 0 0 1px rgba(255, 224, 102, 0.35) inset"
          : state?.status === "error"
            ? "0 0 0 1px rgba(255, 125, 102, 0.35) inset"
            : undefined,
    };
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <strong style={{ color: fieldColors.white }}>Materials Used</strong>
        <span style={{ color: fieldColors.whiteSoft, fontSize: "13px" }}>
          Search materials or assemblies, then tap once to add them to actual usage.
        </span>
      </div>
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

      {!hasSearch && activeTab !== "recent" ? (
        <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>
          Search materials or assemblies.
        </div>
      ) : null}

      {activeTab === "materials" && hasSearch ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {filteredMaterials.length === 0 ? (
            <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No materials matched that search.</div>
          ) : (
            filteredMaterials.map((item) => {
              const actionKey = actionKeyForCatalog(String(item.id));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddMaterial(item, 1)}
                  style={resultCardStyle(actionKey)}
                >
                  <div style={{ display: "grid", gap: "2px" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{item.name}</strong>
                    <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                      {[item.sku, item.aliases.join(", ")].filter(Boolean).join(" · ") || item.category || "Catalog material"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    {renderActionState(actionKey)}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", width: "100%" }}>
                      <span style={{ ...actionButtonStyle("secondary"), display: "grid", placeItems: "center" }}>Tap to add +1</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAddMaterial(item, 5);
                        }}
                        style={actionButtonStyle("secondary")}
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {activeTab === "assemblies" && hasSearch ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {filteredAssemblies.length === 0 ? (
            <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No assemblies matched that search.</div>
          ) : (
            filteredAssemblies.map((assembly) => (
              <button
                key={assembly.id}
                type="button"
                onClick={() => handleAddAssembly(assembly)}
                style={resultCardStyle(`assembly:${assembly.id}`)}
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
                {renderActionState(`assembly:${assembly.id}`)}
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
            recentItems.map((item) => {
              const actionKey = actionKeyForCatalog(String(item.id));
              return (
                <div key={`recent-${item.id}`} style={resultCardStyle(actionKey)}>
                  <div style={{ display: "grid", gap: "2px" }}>
                    <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{item.name}</strong>
                    <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                      {[item.sku, item.aliases[0]].filter(Boolean).join(" · ") || item.category || "Catalog material"}
                    </span>
                  </div>
                  {renderActionState(actionKey)}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                    <button type="button" onClick={() => handleAddMaterial(item, 1)} style={actionButtonStyle("secondary")}>
                      +1
                    </button>
                    <button type="button" onClick={() => handleAddMaterial(item, 5)} style={actionButtonStyle("secondary")}>
                      +5
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "8px" }}>
        <div style={infoLabelStyle()}>Used Materials</div>
        {displayedUsedMaterials.length === 0 ? (
          <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No used materials yet.</div>
        ) : (
          displayedUsedMaterials.map((line) => {
            const actionKey = String(line.id).startsWith("temp:")
              ? actionKeyForCatalog(String(line.catalogItemId))
              : line.id;
            return (
              <div
                key={line.id}
                style={{
                  ...softCardStyle(),
                  padding: "12px",
                  display: "grid",
                  gap: "10px",
                  boxShadow:
                    actionStates[actionKey]?.status === "saved"
                      ? "0 0 0 1px rgba(255, 224, 102, 0.35) inset"
                      : actionStates[actionKey]?.status === "error"
                        ? "0 0 0 1px rgba(255, 125, 102, 0.35) inset"
                        : undefined,
                }}
              >
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
                  {renderActionState(actionKey)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                  <button type="button" style={actionButtonStyle("secondary")} onClick={() => handleQuantityDelta(line, -1)}>
                    -1
                  </button>
                  <button type="button" style={actionButtonStyle("secondary")} onClick={() => handleQuantityDelta(line, 1)}>
                    +1
                  </button>
                  <button
                    type="button"
                    style={actionButtonStyle("secondary")}
                    onClick={() => handleRemoveLine(line)}
                  >
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
                  <button type="button" style={{ ...actionButtonStyle(), width: "auto", minWidth: "90px" }} onClick={() => handleSetQuantity(line)}>
                    Set
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
