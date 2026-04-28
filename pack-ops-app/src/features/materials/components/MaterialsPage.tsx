import { type ChangeEvent, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { AssemblyEditorPanel, type AssemblyEditorDraft } from "@/features/materials/components/AssemblyEditorPanel";
import { CatalogCleanupPanel } from "@/features/materials/components/CatalogCleanupPanel";
import { CatalogReconciliationPanel } from "@/features/materials/components/CatalogReconciliationPanel";
import { ImportedMaterialsRollbackPanel } from "@/features/materials/components/ImportedMaterialsRollbackPanel";
import { MaterialEditorPanel, type MaterialEditorDraft } from "@/features/materials/components/MaterialEditorPanel";
import { SupplierInvoiceReviewPanel } from "@/features/materials/components/SupplierInvoiceReviewPanel";
import { useMaterialsSlice } from "@/features/materials/hooks/use-materials-slice";
import type {
  AssemblyView,
  CatalogCleanupPair,
  CatalogCleanupResolution,
  CatalogItem,
  MaterialReconciliationPreview,
  MaterialReconciliationResolution,
  MaterialImportRollbackPreview,
  PurchaseHistoryImportRow,
  SupplierInvoiceImportRow,
  SupplierInvoiceReviewPreview,
  SupplierInvoiceReviewResolution,
} from "@/domain/materials/types";

type MaterialsTab = "catalog" | "assemblies";

function createEmptyMaterialDraft(): MaterialEditorDraft {
  return {
    name: "",
    sku: "",
    unit: "each",
    costPrice: "",
    category: "",
    notes: "",
    isActive: true,
  };
}

function toMaterialDraft(item: CatalogItem): MaterialEditorDraft {
  return {
    itemId: item.id,
    name: item.name,
    sku: item.sku ?? "",
    unit: item.unit,
    costPrice: item.costPrice?.toString() ?? "",
    category: item.category ?? "",
    notes: item.notes ?? "",
    isActive: item.isActive,
  };
}

function createEmptyAssemblyDraft(): AssemblyEditorDraft {
  return {
    name: "",
    description: "",
    defaultLaborHours: "0",
    isActive: true,
    items: [],
  };
}

function toAssemblyDraft(assembly: AssemblyView): AssemblyEditorDraft {
  return {
    assemblyId: assembly.id,
    name: assembly.name,
    description: assembly.description ?? "",
    defaultLaborHours: assembly.defaultLaborHours.toString(),
    isActive: assembly.isActive,
    items: assembly.items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      quantity: item.quantity.toString(),
      note: item.note ?? "",
      sectionName: item.sectionName ?? "",
    })),
  };
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

type DetectedImportFormat = "simple catalog" | "purchase history" | "supplier invoice";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (isQuoted && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (char === "," && !isQuoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function normalizeCsvValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^"(.*)"$/, "$1").trim();
}

function parseCsvNumber(value: string | undefined): number | null {
  const normalized = normalizeCsvValue(value).replace(/[$,]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MaterialsPage() {
  const { currentUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState<MaterialsTab>("catalog");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [materialDraft, setMaterialDraft] = useState<MaterialEditorDraft | null>(null);
  const [assemblyDraft, setAssemblyDraft] = useState<AssemblyEditorDraft | null>(null);
  const [catalogCleanupPairs, setCatalogCleanupPairs] = useState<CatalogCleanupPair[] | null>(null);
  const [importRollbackPreview, setImportRollbackPreview] = useState<MaterialImportRollbackPreview | null>(null);
  const [reconciliationPreview, setReconciliationPreview] = useState<MaterialReconciliationPreview | null>(null);
  const [supplierInvoicePreview, setSupplierInvoicePreview] = useState<SupplierInvoiceReviewPreview | null>(null);

  if (!currentUser) {
    return null;
  }

  const {
    catalogQuery,
    assembliesQuery,
    createCatalogItem,
    updateCatalogItem,
    archiveCatalogItem,
    importCatalogCsv,
    analyzePurchaseHistoryImport,
    applyPurchaseHistoryReconciliation,
    analyzeSupplierInvoiceImport,
    applySupplierInvoiceReview,
    analyzeCatalogCleanup,
    applyCatalogCleanup,
    inspectImportedMaterialRollback,
    rollbackImportedMaterials,
    createAssembly,
    updateAssembly,
    duplicateAssembly,
    archiveAssembly,
  } = useMaterialsSlice(currentUser);

  const canManage = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const catalogItems = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const assemblies = useMemo(() => assembliesQuery.data ?? [], [assembliesQuery.data]);
  const isPending =
    createCatalogItem.isPending ||
    updateCatalogItem.isPending ||
    archiveCatalogItem.isPending ||
    createAssembly.isPending ||
    updateAssembly.isPending ||
    duplicateAssembly.isPending ||
    archiveAssembly.isPending ||
    importCatalogCsv.isPending ||
    analyzePurchaseHistoryImport.isPending ||
    applyPurchaseHistoryReconciliation.isPending ||
    analyzeSupplierInvoiceImport.isPending ||
    applySupplierInvoiceReview.isPending ||
    analyzeCatalogCleanup.isPending ||
    applyCatalogCleanup.isPending ||
    inspectImportedMaterialRollback.isPending ||
    rollbackImportedMaterials.isPending;

  const filteredCatalogItems = useMemo(() => {
    const normalized = catalogSearch.trim().toLowerCase();
    if (!normalized) {
      return catalogItems;
    }

    return catalogItems.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(normalized);
      const skuMatch = item.sku?.toLowerCase().includes(normalized) ?? false;
      return nameMatch || skuMatch;
    });
  }, [catalogItems, catalogSearch]);

  async function handleMaterialSubmit(draft: MaterialEditorDraft) {
    try {
      const payload = {
        name: draft.name,
        sku: draft.sku || null,
        unit: draft.unit || "each",
        costPrice: draft.costPrice ? Number(draft.costPrice) : null,
        category: draft.category || null,
        notes: draft.notes || null,
        isActive: draft.isActive,
      };

      if (draft.itemId) {
        await updateCatalogItem.mutateAsync({
          itemId: draft.itemId,
          ...payload,
        });
        setFeedback({ tone: "success", text: "Material updated." });
      } else {
        await createCatalogItem.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Material created." });
      }

      setMaterialDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Material save failed.",
      });
    }
  }

  async function handleAssemblySubmit(draft: AssemblyEditorDraft) {
    try {
      const payload = {
        name: draft.name,
        description: draft.description || null,
        defaultLaborHours: Number(draft.defaultLaborHours || 0),
        isActive: draft.isActive,
        items: draft.items.map((item, index) => ({
          ...(item.id ? { id: item.id as AssemblyView["items"][number]["id"] } : {}),
          catalogItemId: item.catalogItemId as CatalogItem["id"],
          quantity: Number(item.quantity || 0),
          note: item.note || null,
          sectionName: item.sectionName || null,
          sortOrder: index,
        })),
      };

      if (draft.assemblyId) {
        await updateAssembly.mutateAsync({
          assemblyId: draft.assemblyId,
          ...payload,
        });
        setFeedback({ tone: "success", text: "Assembly updated." });
      } else {
        await createAssembly.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Assembly created." });
      }

      setAssemblyDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Assembly save failed.",
      });
    }
  }

  async function handleArchiveMaterial() {
    if (!materialDraft?.itemId) {
      return;
    }

    try {
      await archiveCatalogItem.mutateAsync(materialDraft.itemId);
      setFeedback({ tone: "success", text: "Material archived." });
      setMaterialDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Material archive failed.",
      });
    }
  }

  async function handleArchiveAssembly() {
    if (!assemblyDraft?.assemblyId) {
      return;
    }

    try {
      await archiveAssembly.mutateAsync(assemblyDraft.assemblyId);
      setFeedback({ tone: "success", text: "Assembly archived." });
      setAssemblyDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Assembly archive failed.",
      });
    }
  }

  async function handleDuplicateAssembly(assembly: AssemblyView) {
    const name = window.prompt("Duplicate assembly as", `${assembly.name} Copy`);
    if (name === null) {
      return;
    }

    try {
      await duplicateAssembly.mutateAsync({
        assemblyId: assembly.id,
        name,
      });
      setFeedback({ tone: "success", text: "Assembly duplicated." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Assembly duplicate failed.",
      });
    }
  }

  async function handleImportCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const [headerLine, ...dataLines] = text.split(/\r?\n/).filter((line) => line.trim());
      if (!headerLine) {
        throw new Error("CSV file is empty.");
      }

      const headers = parseCsvLine(headerLine).map((value) => normalizeCsvValue(value).toLowerCase());
      const simpleNameIndex = headers.indexOf("name");
      const simpleSkuIndex = headers.indexOf("sku");
      const simpleCostIndex = headers.indexOf("cost");
      const purchaseSkuIndex = headers.indexOf("item");
      const purchaseNameIndex = headers.indexOf("item description");
      const supplierSkuIndex = headers.indexOf("item id");
      const supplierNameIndex = headers.indexOf("item description");
      const supplierQtyIndex = headers.indexOf("qty shipped");
      const supplierUnitPriceIndex = headers.indexOf("unit price");
      const supplierExtendedPriceIndex = headers.indexOf("extended price");

      let detectedFormat: DetectedImportFormat | null = null;
      let nameIndex = -1;
      let skuIndex = -1;
      let costIndex = -1;

      if (simpleNameIndex >= 0 && simpleSkuIndex >= 0) {
        detectedFormat = "simple catalog";
        nameIndex = simpleNameIndex;
        skuIndex = simpleSkuIndex;
        costIndex = simpleCostIndex;
      } else if (
        supplierSkuIndex >= 0 &&
        supplierNameIndex >= 0 &&
        supplierQtyIndex >= 0 &&
        supplierUnitPriceIndex >= 0 &&
        supplierExtendedPriceIndex >= 0
      ) {
        detectedFormat = "supplier invoice";
        nameIndex = supplierNameIndex;
        skuIndex = supplierSkuIndex;
      } else if (purchaseSkuIndex >= 0 && purchaseNameIndex >= 0) {
        detectedFormat = "purchase history";
        nameIndex = purchaseNameIndex;
        skuIndex = purchaseSkuIndex;
      }

      if (!detectedFormat) {
        throw new Error(
          `CSV format not recognized. Use name/sku[/cost], Item/Item Description purchase-history headers, or supplier invoice headers like Item ID / Item Description / Qty Shipped / Unit Price / Extended Price. Detected headers: ${headers.join(", ") || "(none)"}.`,
        );
      }

      const rows = dataLines.map((line) => {
        const columns = parseCsvLine(line).map((value) => normalizeCsvValue(value));
        const costRaw = costIndex >= 0 ? columns[costIndex] : "";
        return {
          name: columns[nameIndex] ?? "",
          sku: columns[skuIndex] ?? "",
          cost: costRaw ? Number(costRaw.replace(/[$,]/g, "")) : null,
        };
      });

      if (detectedFormat === "supplier invoice") {
        const invoiceRows: SupplierInvoiceImportRow[] = dataLines.map((line) => {
          const columns = parseCsvLine(line).map((value) => normalizeCsvValue(value));

          return {
            sku: columns[supplierSkuIndex] ?? "",
            name: columns[supplierNameIndex] ?? "",
            quantity: parseCsvNumber(columns[supplierQtyIndex]),
            unitPrice: parseCsvNumber(columns[supplierUnitPriceIndex]),
            lineTotal: parseCsvNumber(columns[supplierExtendedPriceIndex]),
          };
        });

        const preview = await analyzeSupplierInvoiceImport.mutateAsync(invoiceRows);
        setSupplierInvoicePreview(preview);
        setFeedback({
          tone: "success",
          text: `Detected supplier invoice CSV. Review ${preview.matchedExisting.length} matched materials, ${preview.likelyMatches.length} likely matches, and ${preview.newMaterials.length} new materials before applying.`,
        });
      } else if (detectedFormat === "purchase history") {
        const purchaseQtyIndex = headers.indexOf("total qty");
        const purchaseAmountIndex = headers.indexOf("total amount");
        const purchaseRows: PurchaseHistoryImportRow[] = dataLines.map((line) => {
          const columns = parseCsvLine(line).map((value) => normalizeCsvValue(value));
          const totalQty = purchaseQtyIndex >= 0 ? parseCsvNumber(columns[purchaseQtyIndex]) : null;
          const totalAmount = purchaseAmountIndex >= 0 ? parseCsvNumber(columns[purchaseAmountIndex]) : null;

          return {
            name: columns[nameIndex] ?? "",
            sku: columns[skuIndex] ?? "",
            totalQty,
            totalAmount,
            averageCost:
              totalQty !== null && totalAmount !== null && totalQty > 0
                ? Math.round((totalAmount / totalQty) * 100) / 100
                : null,
          };
        });

        const preview = await analyzePurchaseHistoryImport.mutateAsync(purchaseRows);
        setReconciliationPreview(preview);
        setFeedback({
          tone: "success",
          text: `Detected purchase history CSV. Review ${preview.matched.length} matches, ${preview.likelyDuplicates.length} likely duplicates, and ${preview.newItems.length} new materials before applying.`,
        });
      } else {
        const result = await importCatalogCsv.mutateAsync(rows);
        setFeedback({
          tone: "success",
          text: `Imported ${detectedFormat} CSV. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`,
        });
      }
      event.target.value = "";
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "CSV import failed.",
      });
    }
  }

  async function handleApplyReconciliation(resolutions: MaterialReconciliationResolution[]) {
    if (!reconciliationPreview) {
      return;
    }

    try {
      const result = await applyPurchaseHistoryReconciliation.mutateAsync({
        preview: reconciliationPreview,
        resolutions,
      });
      setFeedback({
        tone: "success",
        text: `Reconciliation applied. Merged ${result.merged}, created ${result.created}, skipped ${result.skipped}.`,
      });
      setReconciliationPreview(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Reconciliation apply failed.",
      });
    }
  }

  async function handleApplySupplierInvoiceReview(resolutions: SupplierInvoiceReviewResolution[]) {
    if (!supplierInvoicePreview) {
      return;
    }

    try {
      const result = await applySupplierInvoiceReview.mutateAsync({
        preview: supplierInvoicePreview,
        resolutions,
      });
      setFeedback({
        tone: "success",
        text: `Supplier invoice review applied. Merged ${result.merged}, created ${result.created}, skipped ${result.skipped}. Updated ${result.costUpdated} costs and ${result.skuUpdated} SKUs.`,
      });
      setSupplierInvoicePreview(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Supplier invoice apply failed.",
      });
    }
  }

  async function handleOpenCatalogCleanup() {
    try {
      const pairs = await analyzeCatalogCleanup.mutateAsync();
      setCatalogCleanupPairs(pairs);
      setFeedback({
        tone: "success",
        text: pairs.length
          ? `Found ${pairs.length} likely duplicate catalog pairs to review.`
          : "No likely duplicate catalog items were found.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Catalog cleanup analysis failed.",
      });
    }
  }

  async function handleApplyCatalogCleanup(resolutions: CatalogCleanupResolution[]) {
    try {
      const result = await applyCatalogCleanup.mutateAsync(resolutions);
      setFeedback({
        tone: "success",
        text: `Catalog cleanup applied. Merged ${result.merged}, skipped ${result.skipped}.`,
      });
      setCatalogCleanupPairs(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Catalog cleanup apply failed.",
      });
    }
  }

  async function handleOpenImportedMaterialRollback() {
    try {
      const preview = await inspectImportedMaterialRollback.mutateAsync();
      setImportRollbackPreview(preview);
      setFeedback({
        tone: "success",
        text: preview.removableImportedMaterials.length
          ? `Found ${preview.removableImportedMaterials.length} imported materials that can be removed safely.`
          : "No purchase-history imported materials were found to remove.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Imported-material rollback scan failed.",
      });
    }
  }

  async function handleConfirmImportedMaterialRollback() {
    try {
      const result = await rollbackImportedMaterials.mutateAsync();
      setFeedback({
        tone: "success",
        text: `Removed ${result.removed} imported materials. ${result.reviewCount} merged catalog records still need manual review if you want to fully unwind prior cleanup work.`,
      });
      setImportRollbackPreview(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Imported-material rollback failed.",
      });
    }
  }

  return (
    <main style={{ padding: "24px", fontFamily: "ui-sans-serif, system-ui", color: "#172033" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Materials</h1>
          <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
            Build the estimating foundation first: a practical material catalog and reusable assemblies.
          </p>
        </div>
        {canManage ? (
          activeTab === "catalog" ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "10px",
                  background: "#fff",
                  padding: "8px 12px",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={isPending}
                  onChange={(event) => void handleImportCsv(event)}
                  style={{ display: "none" }}
                />
                {importCatalogCsv.isPending ? "Importing..." : "Import CSV / Invoice"}
              </label>
              <button onClick={() => void handleOpenCatalogCleanup()} disabled={isPending}>
                {analyzeCatalogCleanup.isPending ? "Analyzing..." : "Catalog Cleanup"}
              </button>
              <button onClick={() => void handleOpenImportedMaterialRollback()} disabled={isPending}>
                {inspectImportedMaterialRollback.isPending ? "Checking..." : "Remove Imported"}
              </button>
              <button onClick={() => setMaterialDraft(createEmptyMaterialDraft())}>New Material</button>
            </div>
          ) : (
            <button onClick={() => setAssemblyDraft(createEmptyAssemblyDraft())}>New Assembly</button>
          )
        ) : null}
      </header>

      {feedback ? (
        <section
          style={{
            border: "1px solid",
            borderColor: feedback.tone === "error" ? "#f3b2b2" : "#b7e0c0",
            borderRadius: "12px",
            padding: "12px 14px",
            background: feedback.tone === "error" ? "#fff4f4" : "#f2fbf4",
            color: feedback.tone === "error" ? "#8f1d1d" : "#1f6b37",
            marginBottom: "16px",
          }}
        >
          {feedback.text}
        </section>
      ) : null}

      <section style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {[
          { value: "catalog" as const, label: "Catalog" },
          { value: "assemblies" as const, label: "Assemblies" },
        ].map((option) => {
          const isActive = activeTab === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setActiveTab(option.value)}
              style={{
                borderRadius: "999px",
                border: isActive ? "1px solid #1b4dff" : "1px solid #d9dfeb",
                background: isActive ? "#eef4ff" : "#ffffff",
                color: isActive ? "#163fcb" : "#172033",
                padding: "8px 14px",
                fontWeight: 600,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </section>

      {activeTab === "catalog" ? (
        <section style={{ display: "grid", gap: "12px" }}>
          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Search materials by name or SKU..."
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "12px",
              padding: "10px 12px",
              background: "#fff",
            }}
          />
          {catalogQuery.isLoading ? <p>Loading catalog...</p> : null}
          {!catalogQuery.isLoading && filteredCatalogItems.length === 0 ? (
            <div
              style={{
                border: "1px dashed #d9dfeb",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafcff",
                color: "#5b6475",
              }}
            >
              <strong style={{ display: "block", color: "#172033", marginBottom: "6px" }}>
                No catalog items are available yet.
              </strong>
              {catalogSearch
                ? "No materials match that search."
                : "Add the first material so assemblies and quoting have a real base to work from."}
            </div>
          ) : null}

          {filteredCatalogItems.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid #d9dfeb",
                borderRadius: "14px",
                padding: "14px",
                background: "#fff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: "#5b6475", marginTop: "4px" }}>
                    {item.category || "Uncategorized"}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: item.isActive ? "#f2fbf4" : "#fff3f0",
                    color: item.isActive ? "#1f6b37" : "#b54708",
                  }}
                >
                  {item.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#5b6475", fontSize: "13px" }}>
                <span>Unit: {item.unit}</span>
                <span>Cost: {formatMoney(item.costPrice)}</span>
              </div>

              {item.notes ? <div style={{ color: "#5b6475" }}>{item.notes}</div> : null}

              {canManage ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => setMaterialDraft(toMaterialDraft(item))}>Edit</button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <section style={{ display: "grid", gap: "12px" }}>
          {assembliesQuery.isLoading ? <p>Loading assemblies...</p> : null}
          {!assembliesQuery.isLoading && assemblies.length === 0 ? (
            <div
              style={{
                border: "1px dashed #d9dfeb",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafcff",
                color: "#5b6475",
              }}
            >
              <strong style={{ display: "block", color: "#172033", marginBottom: "6px" }}>
                No assemblies are available yet.
              </strong>
              Build the first reusable assembly from catalog materials and labor hours.
            </div>
          ) : null}

          {assemblies.map((assembly) => (
            <article
              key={assembly.id}
              style={{
                border: "1px solid #d9dfeb",
                borderRadius: "14px",
                padding: "14px",
                background: "#fff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{assembly.name}</div>
                  <div style={{ color: "#5b6475", marginTop: "4px" }}>
                    {assembly.items.length} material{assembly.items.length === 1 ? "" : "s"} · {assembly.defaultLaborHours.toFixed(2)} labor hrs
                  </div>
                </div>
                <span
                  style={{
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: assembly.isActive ? "#f2fbf4" : "#fff3f0",
                    color: assembly.isActive ? "#1f6b37" : "#b54708",
                  }}
                >
                  {assembly.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {assembly.description ? <div>{assembly.description}</div> : null}

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#5b6475", fontSize: "13px" }}>
                <span>Material Cost: ${assembly.materialCostTotal.toFixed(2)}</span>
                <span>Labor Hours: {assembly.defaultLaborHours.toFixed(2)}</span>
              </div>

              {assembly.items.length > 0 ? (
                <div style={{ color: "#5b6475", fontSize: "13px" }}>
                  {assembly.items.slice(0, 3).map((item) => item.materialName).join(" · ")}
                  {assembly.items.length > 3 ? ` +${assembly.items.length - 3} more` : ""}
                </div>
              ) : null}

              {canManage ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => setAssemblyDraft(toAssemblyDraft(assembly))}>Edit</button>
                  <button onClick={() => void handleDuplicateAssembly(assembly)} disabled={isPending}>
                    Duplicate
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      <MaterialEditorPanel
        initialDraft={materialDraft}
        isPending={isPending}
        onSubmit={handleMaterialSubmit}
        {...(materialDraft?.itemId ? { onArchive: handleArchiveMaterial } : {})}
        onClose={() => setMaterialDraft(null)}
      />

      <AssemblyEditorPanel
        initialDraft={assemblyDraft}
        catalogItems={catalogItems.filter((item) => item.isActive || assemblyDraft?.items.some((draftItem) => draftItem.catalogItemId === item.id))}
        isPending={isPending}
        onSubmit={handleAssemblySubmit}
        {...(assemblyDraft?.assemblyId ? { onArchive: handleArchiveAssembly } : {})}
        onClose={() => setAssemblyDraft(null)}
      />

      <CatalogReconciliationPanel
        preview={reconciliationPreview}
        isPending={applyPurchaseHistoryReconciliation.isPending}
        onApply={handleApplyReconciliation}
        onClose={() => setReconciliationPreview(null)}
      />

      <SupplierInvoiceReviewPanel
        preview={supplierInvoicePreview}
        isPending={applySupplierInvoiceReview.isPending}
        onApply={handleApplySupplierInvoiceReview}
        onClose={() => setSupplierInvoicePreview(null)}
      />

      <CatalogCleanupPanel
        pairs={catalogCleanupPairs}
        isPending={applyCatalogCleanup.isPending}
        onApply={handleApplyCatalogCleanup}
        onClose={() => setCatalogCleanupPairs(null)}
      />

      <ImportedMaterialsRollbackPanel
        preview={importRollbackPreview}
        isPending={rollbackImportedMaterials.isPending}
        onConfirm={handleConfirmImportedMaterialRollback}
        onClose={() => setImportRollbackPreview(null)}
      />
    </main>
  );
}
