import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AssembliesRepositoryImpl,
  AssemblyItemsRepositoryImpl,
} from "@/data/repositories/assemblies.repository.impl";
import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type {
  Assembly,
  AssemblyItem,
  AssemblyItemInput,
  AssemblyView,
  CatalogCleanupPair,
  CatalogCleanupResolution,
  CatalogItem,
  CreateAssemblyInput,
  CreateCatalogItemInput,
  MaterialImportRollbackPreview,
  MaterialReconciliationCandidate,
  MaterialReconciliationPreview,
  MaterialReconciliationResolution,
  PurchaseHistoryImportRow,
  SupplierInvoiceImportRow,
  SupplierInvoiceMatchCandidate,
  SupplierInvoiceReviewPreview,
  SupplierInvoiceReviewResolution,
  UpdateAssemblyInput,
  UpdateCatalogItemInput,
} from "@/domain/materials/types";
import type { User } from "@/domain/users/types";
import { normalizePersistenceError } from "@/services/shared/persistence-errors";

function canManageMaterials(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function normalizeMoney(value: number | null | undefined, label: string): number | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  return Math.round(value * 100) / 100;
}

function normalizeLaborHours(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    throw new Error("Default labor hours cannot be negative.");
  }
  return Math.round(value * 100) / 100;
}

function requireName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeAssemblyQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Assembly item quantity must be greater than 0.");
  }
  return Math.round(value * 100) / 100;
}

const PURCHASE_HISTORY_NOTE = "Imported from purchase history. Price may not be accurate.";
const SUPPLIER_INVOICE_NOTE = "Created from supplier invoice review.";

const NORMALIZATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b1p\b/g, "1 pole"],
  [/\b2p\b/g, "2 pole"],
  [/\b3p\b/g, "3 pole"],
  [/\b2c\b/g, "2 conductor"],
  [/\b3c\b/g, "3 conductor"],
  [/\bbbh\b/g, "baseboard heater"],
  [/\bgfci\b/g, "ground fault receptacle"],
  [/\bafci\b/g, "arc fault breaker"],
  [/\btr\b/g, "tamper resistant"],
  [/\boct\b/g, "octagon"],
  [/\brpvc\b/g, "rigid pvc"],
  [/\bemt\b/g, "electrical metallic tubing"],
  [/\blb\b/g, "type lb"],
];

const STOP_WORDS = new Set(["and", "the", "for", "with", "white", "black", "bronze", "each", "ft", "inch", "in"]);

function normalizeSearchText(value: string): string {
  let normalized = value.toLowerCase().replace(/\uFEFF/g, " ");
  for (const [pattern, replacement] of NORMALIZATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function keywordSet(value: string): Set<string> {
  return new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((token) => token && !STOP_WORDS.has(token)),
  );
}

function keywordOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(left.size, right.size);
}

function bigramSet(value: string): Set<string> {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "");
  if (normalized.length < 2) {
    return new Set(normalized ? [normalized] : []);
  }

  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function normalizedSimilarity(left: string, right: string): number {
  const leftSet = bigramSet(left);
  const rightSet = bigramSet(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (leftSet.size + rightSet.size);
}

function averageCost(totalQty: number | null | undefined, totalAmount: number | null | undefined): number | null {
  if (
    totalQty == null ||
    totalAmount == null ||
    !Number.isFinite(totalQty) ||
    !Number.isFinite(totalAmount) ||
    totalQty <= 0
  ) {
    return null;
  }
  return Math.round((totalAmount / totalQty) * 100) / 100;
}

function invoiceDerivedCatalogCost(unitPrice: number | null | undefined): number | null {
  if (unitPrice == null || !Number.isFinite(unitPrice)) {
    return null;
  }
  return Math.round(unitPrice * 1.12 * 100) / 100;
}

function isInvoiceFooterRow(sku: string, name: string): boolean {
  if (sku.trim()) {
    return false;
  }
  const normalized = normalizeSearchText(name);
  return (
    normalized === "gst" ||
    normalized === "pst" ||
    normalized === "subtotal" ||
    normalized === "amount due" ||
    normalized === "total" ||
    normalized === "invoice total"
  );
}

function materialSimilarityText(item: CatalogItem): string {
  return [item.name, item.sku ?? "", item.category ?? ""].join(" ");
}

function toReconciliationCandidate(
  item: CatalogItem,
  similarityScore: number,
  reasons: string[],
): MaterialReconciliationCandidate {
  return {
    catalogItemId: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    similarityScore: Math.round(similarityScore * 100) / 100,
    reasons,
  };
}

function toInvoiceCandidate(
  item: CatalogItem,
  similarityScore: number,
  reasons: string[],
  invoiceSku: string,
): SupplierInvoiceMatchCandidate {
  const normalizedInvoiceSku = invoiceSku.trim().toLowerCase();
  const normalizedCatalogSku = item.sku?.trim().toLowerCase() ?? "";
  const canSuggestSkuUpdate = Boolean(normalizedInvoiceSku) && similarityScore >= 0.82 && normalizedCatalogSku !== normalizedInvoiceSku;

  return {
    catalogItemId: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    similarityScore: Math.round(similarityScore * 100) / 100,
    reasons,
    currentCatalogCost: item.costPrice,
    canSuggestSkuUpdate,
  };
}

function buildEntryId(sku: string, name: string, index: number): string {
  return `${sku || "no-sku"}::${name || "no-name"}::${index}`;
}

function buildCleanupPairId(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("::");
}

export class MaterialsService {
  readonly catalogItems;
  readonly assemblies;
  readonly assemblyItems;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
    this.assemblies = new AssembliesRepositoryImpl(context, client);
    this.assemblyItems = new AssemblyItemsRepositoryImpl(context, client);
  }

  private assertCanManage() {
    if (!canManageMaterials(this.currentUser)) {
      throw new Error("You cannot manage materials or assemblies.");
    }
  }

  async listCatalogItems(options?: { includeInactive?: boolean }): Promise<CatalogItem[]> {
    this.assertCanManage();
    return this.catalogItems.list(
      options?.includeInactive !== undefined
        ? { filter: { includeInactive: options.includeInactive } }
        : undefined,
    );
  }

  async createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
    this.assertCanManage();
    try {
      return await this.catalogItems.create({
        name: requireName(input.name, "Material name"),
        sku: input.sku?.trim() || null,
        unit: input.unit?.trim() || "each",
        costPrice: normalizeMoney(input.costPrice, "Cost"),
        unitPrice: normalizeMoney(input.unitPrice, "Sell price"),
        category: input.category?.trim() || null,
        notes: input.notes?.trim() || null,
        isActive: input.isActive ?? true,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Material",
        operation: "save",
        table: "catalog_items",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }
  }

  async updateCatalogItem(itemId: CatalogItem["id"], input: UpdateCatalogItemInput): Promise<CatalogItem> {
    this.assertCanManage();
    try {
      return await this.catalogItems.update(itemId, {
        ...(input.name !== undefined ? { name: requireName(input.name, "Material name") } : {}),
        ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
        ...(input.unit !== undefined ? { unit: input.unit?.trim() || "each" } : {}),
        ...(input.costPrice !== undefined ? { costPrice: normalizeMoney(input.costPrice, "Cost") } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: normalizeMoney(input.unitPrice, "Sell price") } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Material",
        operation: "save",
        table: "catalog_items",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }
  }

  async archiveCatalogItem(itemId: CatalogItem["id"]): Promise<void> {
    this.assertCanManage();
    try {
      await this.catalogItems.softDelete(itemId);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Material",
        operation: "archive",
        table: "catalog_items",
        migrationHint: "0028_business_entity_soft_delete_rpcs.sql",
      });
    }
  }

  private async buildAssemblyViews(assemblies: Assembly[]): Promise<AssemblyView[]> {
    if (assemblies.length === 0) {
      return [];
    }

    const [items, catalogItems] = await Promise.all([
      this.assemblyItems.listByAssemblyIds(assemblies.map((assembly) => assembly.id)),
      this.catalogItems.list({ filter: { includeInactive: true } }),
    ]);

    const itemsByAssemblyId = new Map<string, AssemblyItem[]>();
    for (const item of items) {
      const current = itemsByAssemblyId.get(item.assemblyId) ?? [];
      current.push(item);
      itemsByAssemblyId.set(item.assemblyId, current);
    }

    const materialsById = new Map(catalogItems.map((item) => [item.id, item]));

    return assemblies.map((assembly) => {
      const viewItems = (itemsByAssemblyId.get(assembly.id) ?? []).map((item) => {
        const material = materialsById.get(item.catalogItemId);
        const lineMaterialCost = ((material?.costPrice ?? 0) * item.quantity);

        return {
          ...item,
          materialName: material?.name ?? "Unknown material",
          materialSku: material?.sku ?? null,
          materialUnit: material?.unit ?? "each",
          materialCostPrice: material?.costPrice ?? null,
          lineMaterialCost: Math.round(lineMaterialCost * 100) / 100,
        };
      });

      const materialCostTotal = Math.round(
        viewItems.reduce((total, item) => total + item.lineMaterialCost, 0) * 100,
      ) / 100;

      return {
        ...assembly,
        items: viewItems,
        materialCostTotal,
      };
    });
  }

  async listAssemblies(): Promise<AssemblyView[]> {
    this.assertCanManage();
    const assemblies = await this.assemblies.list();
    return this.buildAssemblyViews(assemblies);
  }

  private normalizeAssemblyItems(items: AssemblyItemInput[] | undefined): AssemblyItemInput[] {
    return (items ?? []).map((item, index) => ({
      ...item,
      quantity: normalizeAssemblyQuantity(item.quantity),
      note: item.note?.trim() || null,
      sectionName: item.sectionName?.trim() || null,
      sortOrder: item.sortOrder ?? index,
    }));
  }

  async createAssembly(input: CreateAssemblyInput): Promise<AssemblyView> {
    this.assertCanManage();
    const normalizedItems = this.normalizeAssemblyItems(input.items);

    let assembly: Assembly;
    try {
      assembly = await this.assemblies.create({
        name: requireName(input.name, "Assembly name"),
        description: input.description?.trim() || null,
        defaultLaborHours: normalizeLaborHours(input.defaultLaborHours),
        isActive: input.isActive ?? true,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly",
        operation: "save",
        table: "assemblies",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }

    try {
      for (const item of normalizedItems) {
        await this.assemblyItems.create(assembly.id, item);
      }
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly items",
        operation: "save",
        table: "assembly_items",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }

    const [view] = await this.buildAssemblyViews([assembly]);
    if (!view) {
      throw new Error("Assembly could not be loaded after save.");
    }
    return view;
  }

  async updateAssembly(assemblyId: Assembly["id"], input: UpdateAssemblyInput): Promise<AssemblyView> {
    this.assertCanManage();

    const existing = await this.assemblies.getById(assemblyId);
    if (!existing) {
      throw new Error("Assembly not found.");
    }

    let updatedAssembly: Assembly;
    try {
      updatedAssembly = await this.assemblies.update(assemblyId, {
        ...(input.name !== undefined ? { name: requireName(input.name, "Assembly name") } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.defaultLaborHours !== undefined ? { defaultLaborHours: normalizeLaborHours(input.defaultLaborHours) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly",
        operation: "save",
        table: "assemblies",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }

    if (input.items !== undefined) {
      const normalizedItems = this.normalizeAssemblyItems(input.items);
      const existingItems = await this.assemblyItems.listByAssemblyIds([assemblyId]);
      const existingById = new Map(existingItems.map((item) => [item.id, item]));
      const keptIds = new Set<string>();

      try {
        for (const item of normalizedItems) {
          if (item.id && existingById.has(item.id)) {
            keptIds.add(item.id);
            await this.assemblyItems.update(item.id, item);
          } else {
            await this.assemblyItems.create(assemblyId, item);
          }
        }

        for (const item of existingItems) {
          if (!keptIds.has(item.id) && !normalizedItems.some((next) => next.id === item.id)) {
            await this.assemblyItems.hardDelete(item.id);
          }
        }
      } catch (error) {
        throw normalizePersistenceError(error, {
          entityLabel: "Assembly items",
          operation: "save",
          table: "assembly_items",
          migrationHint: "0026_materials_and_assemblies_foundation.sql",
        });
      }
    }

    const [view] = await this.buildAssemblyViews([updatedAssembly]);
    if (!view) {
      throw new Error("Assembly could not be loaded after update.");
    }
    return view;
  }

  async duplicateAssembly(assemblyId: Assembly["id"], input?: { name?: string | null }): Promise<AssemblyView> {
    this.assertCanManage();

    const existing = await this.assemblies.getById(assemblyId);
    if (!existing) {
      throw new Error("Assembly not found.");
    }

    const existingItems = await this.assemblyItems.listByAssemblyIds([assemblyId]);
    return this.createAssembly({
      name: input?.name?.trim() || `${existing.name} Copy`,
      description: existing.description,
      defaultLaborHours: existing.defaultLaborHours,
      isActive: true,
      items: existingItems.map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: item.quantity,
        note: item.note,
        sectionName: item.sectionName,
        sortOrder: item.sortOrder,
      })),
    });
  }

  async archiveAssembly(assemblyId: Assembly["id"]): Promise<void> {
    this.assertCanManage();
    try {
      await this.assemblies.softDelete(assemblyId);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly",
        operation: "archive",
        table: "assemblies",
        migrationHint: "0028_business_entity_soft_delete_rpcs.sql",
      });
    }
  }

  async importCatalogCsvRows(rows: Array<{ name?: string | null; sku?: string | null; cost?: number | null }>) {
    this.assertCanManage();
    const existingItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const itemsBySku = new Map(
      existingItems
        .filter((item) => item.sku)
        .map((item) => [item.sku?.trim().toLowerCase() ?? "", item]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = row.name?.trim() ?? "";
      const sku = row.sku?.trim() ?? "";
      const normalizedSku = sku.toLowerCase();

      if (!name && !sku) {
        skipped += 1;
        continue;
      }

      const existing = normalizedSku ? itemsBySku.get(normalizedSku) : null;
      const cost = row.cost != null && Number.isFinite(row.cost) ? normalizeMoney(row.cost, "Cost") : null;

      if (existing) {
        if (name && name !== existing.name) {
          await this.catalogItems.update(existing.id, { name });
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const createdItem = await this.catalogItems.create({
        name: requireName(name || sku, "Material name"),
        sku: sku || null,
        costPrice: cost,
        unit: "each",
        isActive: true,
      });
      created += 1;

      if (normalizedSku) {
        itemsBySku.set(normalizedSku, createdItem);
      }
    }

    return { created, updated, skipped };
  }

  async analyzePurchaseHistoryRows(rows: PurchaseHistoryImportRow[]): Promise<MaterialReconciliationPreview> {
    this.assertCanManage();
    const catalogItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const itemsBySku = new Map(
      catalogItems
        .filter((item) => item.sku)
        .map((item) => [item.sku?.trim().toLowerCase() ?? "", item]),
    );

    const grouped = new Map<string, { sku: string; name: string; totalQty: number; totalAmount: number; sourceRowCount: number }>();

    for (const row of rows) {
      const sku = row.sku.trim();
      const name = row.name.trim();
      if (!sku && !name) {
        continue;
      }

      const key = sku ? `sku:${sku.toLowerCase()}` : `name:${normalizeSearchText(name)}`;
      const current = grouped.get(key) ?? {
        sku,
        name,
        totalQty: 0,
        totalAmount: 0,
        sourceRowCount: 0,
      };

      current.sku = current.sku || sku;
      current.name = current.name.length >= name.length ? current.name : name;
      current.totalQty += Number.isFinite(row.totalQty ?? null) ? row.totalQty ?? 0 : 0;
      current.totalAmount += Number.isFinite(row.totalAmount ?? null) ? row.totalAmount ?? 0 : 0;
      current.sourceRowCount += 1;
      grouped.set(key, current);
    }

    const matched: MaterialReconciliationPreview["matched"] = [];
    const likelyDuplicates: MaterialReconciliationPreview["likelyDuplicates"] = [];
    const newItems: MaterialReconciliationPreview["newItems"] = [];

    Array.from(grouped.values()).forEach((entry, index) => {
      const avgCost = averageCost(entry.totalQty, entry.totalAmount);
      const normalizedSku = entry.sku.toLowerCase();
      const exactSkuMatch = normalizedSku ? itemsBySku.get(normalizedSku) : null;
      const id = buildEntryId(entry.sku, entry.name, index);

      if (exactSkuMatch) {
        matched.push({
          id,
          importSku: entry.sku,
          importName: entry.name,
          averageCost: avgCost,
          sourceRowCount: entry.sourceRowCount,
          status: "matched",
          suggestedMatch: toReconciliationCandidate(exactSkuMatch, 1, ["Exact SKU match"]),
          candidateMatches: [toReconciliationCandidate(exactSkuMatch, 1, ["Exact SKU match"])],
        });
        return;
      }

      const searchText = [entry.name, entry.sku].join(" ").trim();
      const searchKeywords = keywordSet(searchText);
      const candidates = catalogItems
        .map((item) => {
          const materialText = materialSimilarityText(item);
          const overlap = keywordOverlap(searchKeywords, keywordSet(materialText));
          const similarity = normalizedSimilarity(searchText, materialText);
          const containmentBonus =
            normalizeSearchText(searchText).includes(normalizeSearchText(item.name)) ||
            normalizeSearchText(item.name).includes(normalizeSearchText(searchText))
              ? 0.08
              : 0;
          const score = Math.min(1, overlap * 0.6 + similarity * 0.32 + containmentBonus);
          const reasons: string[] = [];
          if (overlap >= 0.45) reasons.push("Shared key wording");
          if (similarity >= 0.6) reasons.push("Very similar normalized text");
          if (containmentBonus > 0) reasons.push("One name contains the other");
          return { item, score, reasons };
        })
        .filter((candidate) => candidate.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

      const top = candidates[0] ?? null;
      const second = candidates[1] ?? null;
      const candidateMatches = candidates.map((candidate) =>
        toReconciliationCandidate(
          candidate.item,
          candidate.score,
          candidate.reasons.length > 0 ? candidate.reasons : ["Possible duplicate"],
        ),
      );

      const previewEntry = {
        id,
        importSku: entry.sku,
        importName: entry.name,
        averageCost: avgCost,
        sourceRowCount: entry.sourceRowCount,
        status: "new_item" as const,
        suggestedMatch: top
          ? toReconciliationCandidate(
              top.item,
              top.score,
              top.reasons.length > 0 ? top.reasons : ["Possible duplicate"],
            )
          : null,
        candidateMatches,
      };

      if (top && top.score >= 0.82 && (!second || top.score - second.score >= 0.08)) {
        matched.push({ ...previewEntry, status: "matched" });
      } else if (top && top.score >= 0.58) {
        likelyDuplicates.push({ ...previewEntry, status: "likely_duplicate" });
      } else {
        newItems.push(previewEntry);
      }
    });

    return { matched, likelyDuplicates, newItems };
  }

  async analyzeSupplierInvoiceRows(rows: SupplierInvoiceImportRow[]): Promise<SupplierInvoiceReviewPreview> {
    this.assertCanManage();
    const catalogItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const itemsBySku = new Map(
      catalogItems
        .filter((item) => item.sku)
        .map((item) => [item.sku?.trim().toLowerCase() ?? "", item]),
    );

    const grouped = new Map<string, { sku: string; name: string; quantity: number; lineTotal: number; sourceRowCount: number }>();

    for (const row of rows) {
      const sku = row.sku.trim();
      const name = row.name.trim();
      const quantity = Number.isFinite(row.quantity ?? null) ? row.quantity ?? 0 : 0;
      const lineTotal =
        Number.isFinite(row.lineTotal ?? null)
          ? row.lineTotal ?? 0
          : Number.isFinite(row.unitPrice ?? null) && quantity > 0
            ? (row.unitPrice ?? 0) * quantity
            : 0;

      if ((!sku && !name) || isInvoiceFooterRow(sku, name) || quantity <= 0) {
        continue;
      }

      const key = sku ? `sku:${sku.toLowerCase()}` : `name:${normalizeSearchText(name)}`;
      const current = grouped.get(key) ?? {
        sku,
        name,
        quantity: 0,
        lineTotal: 0,
        sourceRowCount: 0,
      };

      current.sku = current.sku || sku;
      current.name = current.name.length >= name.length ? current.name : name;
      current.quantity += quantity;
      current.lineTotal += lineTotal;
      current.sourceRowCount += 1;
      grouped.set(key, current);
    }

    const matchedExisting: SupplierInvoiceReviewPreview["matchedExisting"] = [];
    const likelyMatches: SupplierInvoiceReviewPreview["likelyMatches"] = [];
    const newMaterials: SupplierInvoiceReviewPreview["newMaterials"] = [];

    Array.from(grouped.values()).forEach((entry, index) => {
      const unitPricePreTax = entry.quantity > 0 ? Math.round((entry.lineTotal / entry.quantity) * 100) / 100 : null;
      const derivedCost = invoiceDerivedCatalogCost(unitPricePreTax);
      const normalizedSku = entry.sku.toLowerCase();
      const exactSkuMatch = normalizedSku ? itemsBySku.get(normalizedSku) : null;
      const id = buildEntryId(entry.sku, entry.name, index);

      if (exactSkuMatch) {
        const suggested = toInvoiceCandidate(exactSkuMatch, 1, ["Exact SKU match"], entry.sku);
        matchedExisting.push({
          id,
          invoiceSku: entry.sku,
          invoiceName: entry.name,
          quantity: Math.round(entry.quantity * 100) / 100,
          unitPricePreTax,
          lineTotalPreTax: Math.round(entry.lineTotal * 100) / 100,
          invoiceDerivedCatalogCost: derivedCost,
          sourceRowCount: entry.sourceRowCount,
          status: "matched",
          suggestedMatch: suggested,
          candidateMatches: [suggested],
        });
        return;
      }

      const searchText = [entry.name, entry.sku].join(" ").trim();
      const searchKeywords = keywordSet(searchText);
      const candidates = catalogItems
        .map((item) => {
          const materialText = materialSimilarityText(item);
          const overlap = keywordOverlap(searchKeywords, keywordSet(materialText));
          const similarity = normalizedSimilarity(searchText, materialText);
          const containmentBonus =
            normalizeSearchText(searchText).includes(normalizeSearchText(item.name)) ||
            normalizeSearchText(item.name).includes(normalizeSearchText(searchText))
              ? 0.08
              : 0;
          const score = Math.min(1, overlap * 0.6 + similarity * 0.32 + containmentBonus);
          const reasons: string[] = [];
          if (overlap >= 0.45) reasons.push("Shared key wording");
          if (similarity >= 0.6) reasons.push("Very similar normalized text");
          if (containmentBonus > 0) reasons.push("One name contains the other");
          return { item, score, reasons };
        })
        .filter((candidate) => candidate.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)
        .map((candidate) =>
          toInvoiceCandidate(
            candidate.item,
            candidate.score,
            candidate.reasons.length > 0 ? candidate.reasons : ["Possible match"],
            entry.sku,
          ),
        );

      const previewEntry = {
        id,
        invoiceSku: entry.sku,
        invoiceName: entry.name,
        quantity: Math.round(entry.quantity * 100) / 100,
        unitPricePreTax,
        lineTotalPreTax: Math.round(entry.lineTotal * 100) / 100,
        invoiceDerivedCatalogCost: derivedCost,
        sourceRowCount: entry.sourceRowCount,
        status: "new_item" as const,
        suggestedMatch: candidates[0] ?? null,
        candidateMatches: candidates,
      };

      if (candidates[0] && candidates[0].similarityScore >= 0.58) {
        likelyMatches.push({ ...previewEntry, status: "likely_match" });
      } else {
        newMaterials.push(previewEntry);
      }
    });

    return { matchedExisting, likelyMatches, newMaterials };
  }

  async applySupplierInvoiceReview(input: {
    preview: SupplierInvoiceReviewPreview;
    resolutions: SupplierInvoiceReviewResolution[];
  }) {
    this.assertCanManage();

    try {
      const existingItems = await this.catalogItems.list({ filter: { includeInactive: true } });
      const itemsById = new Map(existingItems.map((item) => [item.id, item]));
      const resolutionByEntryId = new Map(input.resolutions.map((resolution) => [resolution.entryId, resolution]));

      let merged = 0;
      let created = 0;
      let skipped = 0;
      let costUpdated = 0;
      let skuUpdated = 0;

      const entries = [
        ...input.preview.matchedExisting,
        ...input.preview.likelyMatches,
        ...input.preview.newMaterials,
      ];

      for (const entry of entries) {
        const resolution =
          resolutionByEntryId.get(entry.id) ??
          {
            entryId: entry.id,
            action:
              entry.status === "new_item" ? "create" : entry.status === "matched" ? "merge" : "skip",
            ...(entry.suggestedMatch ? { targetCatalogItemId: entry.suggestedMatch.catalogItemId } : {}),
            updateCost: entry.status === "matched",
            updateSku: false,
          };

        if (resolution.action === "skip") {
          skipped += 1;
          continue;
        }

        if (resolution.action === "create") {
          const createdItem = await this.catalogItems.create({
            name: requireName(entry.invoiceName || entry.invoiceSku, "Material name"),
            sku: entry.invoiceSku || null,
            costPrice: entry.invoiceDerivedCatalogCost,
            unit: "each",
            notes: SUPPLIER_INVOICE_NOTE,
            isActive: true,
          });
          itemsById.set(createdItem.id, createdItem);
          created += 1;
          continue;
        }

        const targetCatalogItemId = resolution.targetCatalogItemId ?? entry.suggestedMatch?.catalogItemId ?? null;
        if (!targetCatalogItemId) {
          skipped += 1;
          continue;
        }

        const existing = itemsById.get(targetCatalogItemId);
        if (!existing) {
          skipped += 1;
          continue;
        }

        const patch: UpdateCatalogItemInput = {};
        if (resolution.updateCost && entry.invoiceDerivedCatalogCost !== null) {
          patch.costPrice = entry.invoiceDerivedCatalogCost;
        }
        if (resolution.updateSku && entry.invoiceSku && entry.suggestedMatch?.canSuggestSkuUpdate) {
          patch.sku = entry.invoiceSku;
        }

        if (Object.keys(patch).length > 0) {
          const updated = await this.catalogItems.update(existing.id, patch);
          itemsById.set(updated.id, updated);
          if (patch.costPrice !== undefined) costUpdated += 1;
          if (patch.sku !== undefined) skuUpdated += 1;
        }

        merged += 1;
      }

      return { merged, created, skipped, costUpdated, skuUpdated };
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Supplier invoice review",
        operation: "save",
        table: "catalog_items",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }
  }

  async applyPurchaseHistoryReconciliation(input: {
    preview: MaterialReconciliationPreview;
    resolutions: MaterialReconciliationResolution[];
  }) {
    this.assertCanManage();
    const existingItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const itemsById = new Map(existingItems.map((item) => [item.id, item]));
    const resolutionByEntryId = new Map(input.resolutions.map((resolution) => [resolution.entryId, resolution]));

    let merged = 0;
    let created = 0;
    let skipped = 0;

    const entries = [...input.preview.matched, ...input.preview.likelyDuplicates, ...input.preview.newItems];

    for (const entry of entries) {
      const resolution = resolutionByEntryId.get(entry.id);
      const action =
        resolution?.action ??
        (entry.status === "matched" ? "merge" : entry.status === "new_item" ? "create" : "skip");

      if (action === "skip") {
        skipped += 1;
        continue;
      }

      if (action === "merge") {
        const targetCatalogItemId = resolution?.targetCatalogItemId ?? entry.suggestedMatch?.catalogItemId ?? null;
        if (!targetCatalogItemId) {
          skipped += 1;
          continue;
        }

        const existing = itemsById.get(targetCatalogItemId);
        if (!existing) {
          skipped += 1;
          continue;
        }

        if (!existing.sku && entry.importSku) {
          const updated = await this.catalogItems.update(existing.id, { sku: entry.importSku });
          itemsById.set(updated.id, updated);
        }

        merged += 1;
        continue;
      }

      const createdItem = await this.catalogItems.create({
        name: requireName(entry.importName || entry.importSku, "Material name"),
        sku: entry.importSku || null,
        costPrice: entry.averageCost,
        unit: "each",
        notes: PURCHASE_HISTORY_NOTE,
        isActive: true,
      });
      itemsById.set(createdItem.id, createdItem);
      created += 1;
    }

    return { merged, created, skipped };
  }

  async analyzeCatalogCleanup(): Promise<CatalogCleanupPair[]> {
    this.assertCanManage();
    const catalogItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const pairs: CatalogCleanupPair[] = [];
    const seen = new Set<string>();

    for (let leftIndex = 0; leftIndex < catalogItems.length; leftIndex += 1) {
      const left = catalogItems[leftIndex];
      if (!left) continue;

      for (let rightIndex = leftIndex + 1; rightIndex < catalogItems.length; rightIndex += 1) {
        const right = catalogItems[rightIndex];
        if (!right) continue;

        const pairId = buildCleanupPairId(left.id, right.id);
        if (seen.has(pairId)) continue;

        const leftSku = left.sku?.trim().toLowerCase() ?? "";
        const rightSku = right.sku?.trim().toLowerCase() ?? "";
        const leftName = normalizeSearchText(left.name);
        const rightName = normalizeSearchText(right.name);
        const leftCategory = normalizeSearchText(left.category ?? "");
        const rightCategory = normalizeSearchText(right.category ?? "");
        const overlap = keywordOverlap(keywordSet(left.name), keywordSet(right.name));
        const similarity = normalizedSimilarity(left.name, right.name);
        const exactSku = Boolean(leftSku && rightSku && leftSku === rightSku);
        const exactName = Boolean(leftName && rightName && leftName === rightName);
        const sameCategory = Boolean(leftCategory && rightCategory && leftCategory === rightCategory);
        const contained = leftName.includes(rightName) || rightName.includes(leftName);

        let score = overlap * 0.5 + similarity * 0.32;
        const reasons: string[] = [];

        if (exactSku) {
          score = 1;
          reasons.push("Exact SKU match");
        }
        if (exactName) {
          score += 0.2;
          reasons.push("Exact normalized name match");
        }
        if (sameCategory) {
          score += 0.08;
          reasons.push("Same category");
        }
        if (contained && !exactName) {
          score += 0.05;
          reasons.push("One name contains the other");
        }
        if (overlap >= 0.45 && !reasons.includes("Exact normalized name match")) {
          reasons.push("Shared key wording");
        }
        if (similarity >= 0.6) {
          reasons.push("Very similar normalized text");
        }

        score = Math.min(1, score);
        if (score < 0.58) continue;

        const leftSignalScore =
          Number(Boolean(left.sku)) +
          Number(Boolean(left.costPrice)) +
          Number(Boolean(left.unitPrice)) +
          Number(Boolean(left.notes));
        const rightSignalScore =
          Number(Boolean(right.sku)) +
          Number(Boolean(right.costPrice)) +
          Number(Boolean(right.unitPrice)) +
          Number(Boolean(right.notes));

        const primary = leftSignalScore >= rightSignalScore ? left : right;
        const duplicate = primary === left ? right : left;

        pairs.push({
          id: pairId,
          primary,
          duplicate,
          similarityScore: Math.round(score * 100) / 100,
          reasons,
        });
        seen.add(pairId);
      }
    }

    return pairs.sort((left, right) => right.similarityScore - left.similarityScore);
  }

  async applyCatalogCleanup(resolutions: CatalogCleanupResolution[]) {
    this.assertCanManage();
    const catalogItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    const itemsById = new Map(catalogItems.map((item) => [item.id, item]));
    const pairs = await this.analyzeCatalogCleanup();
    const pairsById = new Map(pairs.map((pair) => [pair.id, pair]));

    let merged = 0;
    let skipped = 0;

    for (const resolution of resolutions) {
      if (resolution.action === "skip") {
        skipped += 1;
        continue;
      }

      const pair = pairsById.get(resolution.pairId);
      if (!pair) {
        skipped += 1;
        continue;
      }

      const primaryId = resolution.primaryCatalogItemId ?? pair.primary.id;
      const primary = itemsById.get(primaryId);
      const duplicate = primaryId === pair.primary.id ? itemsById.get(pair.duplicate.id) : itemsById.get(pair.primary.id);

      if (!primary || !duplicate) {
        skipped += 1;
        continue;
      }

      const mergedNotes = [primary.notes, duplicate.notes ? `Merged duplicate note: ${duplicate.notes}` : null]
        .filter(Boolean)
        .join("\n\n");

      const updated = await this.catalogItems.update(primary.id, {
        sku: primary.sku || duplicate.sku || null,
        costPrice: primary.costPrice ?? duplicate.costPrice ?? null,
        unitPrice: primary.unitPrice ?? duplicate.unitPrice ?? null,
        notes: mergedNotes || null,
        isActive: primary.isActive || duplicate.isActive,
      });
      await this.catalogItems.softDelete(duplicate.id);

      itemsById.set(updated.id, updated);
      itemsById.delete(duplicate.id);
      merged += 1;
    }

    return { merged, skipped };
  }

  async inspectImportedMaterialRollback(): Promise<MaterialImportRollbackPreview> {
    this.assertCanManage();
    const catalogItems = await this.catalogItems.list({ filter: { includeInactive: true } });
    return {
      removableImportedMaterials: catalogItems.filter((item) => item.notes?.includes(PURCHASE_HISTORY_NOTE)),
      mergedArtifactMaterials: catalogItems.filter((item) => item.notes?.includes("Merged duplicate note:")),
    };
  }

  async rollbackImportedMaterials() {
    this.assertCanManage();
    const preview = await this.inspectImportedMaterialRollback();
    for (const item of preview.removableImportedMaterials) {
      await this.catalogItems.softDelete(item.id);
    }
    return {
      removed: preview.removableImportedMaterials.length,
      reviewCount: preview.mergedArtifactMaterials.length,
    };
  }
}

export default MaterialsService;
