import type { AssemblyId, AssemblyItemId, CatalogItemId, OrgId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";

export interface CatalogItem extends AuditedEntity {
  id: CatalogItemId;
  orgId: OrgId;
  name: string;
  sku: string | null;
  unit: string;
  costPrice: number | null;
  unitPrice: number | null;
  category: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy: UserId | null;
}

export interface CreateCatalogItemInput {
  name: string;
  sku?: string | null;
  unit?: string | null;
  costPrice?: number | null;
  unitPrice?: number | null;
  category?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateCatalogItemInput {
  name?: string;
  sku?: string | null;
  unit?: string | null;
  costPrice?: number | null;
  unitPrice?: number | null;
  category?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface Assembly extends AuditedEntity {
  id: AssemblyId;
  orgId: OrgId;
  name: string;
  description: string | null;
  defaultLaborHours: number;
  isActive: boolean;
  createdBy: UserId | null;
}

export interface AssemblyItem extends AuditedEntity {
  id: AssemblyItemId;
  orgId: OrgId;
  assemblyId: AssemblyId;
  catalogItemId: CatalogItemId;
  quantity: number;
  note: string | null;
  sectionName: string | null;
  sortOrder: number;
}

export interface AssemblyItemInput {
  id?: AssemblyItemId;
  catalogItemId: CatalogItemId;
  quantity: number;
  note?: string | null;
  sectionName?: string | null;
  sortOrder?: number;
}

export interface CreateAssemblyInput {
  name: string;
  description?: string | null;
  defaultLaborHours?: number;
  isActive?: boolean;
  items?: AssemblyItemInput[];
}

export interface UpdateAssemblyInput {
  name?: string;
  description?: string | null;
  defaultLaborHours?: number;
  isActive?: boolean;
  items?: AssemblyItemInput[];
}

export interface AssemblyItemView extends AssemblyItem {
  materialName: string;
  materialSku: string | null;
  materialUnit: string;
  materialCostPrice: number | null;
  lineMaterialCost: number;
}

export interface AssemblyView extends Assembly {
  items: AssemblyItemView[];
  materialCostTotal: number;
}

export interface PurchaseHistoryImportRow {
  sku: string;
  name: string;
  totalQty?: number | null;
  totalAmount?: number | null;
  averageCost?: number | null;
}

export interface SupplierInvoiceImportRow {
  sku: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface SupplierInvoiceMatchCandidate {
  catalogItemId: CatalogItemId;
  name: string;
  sku: string | null;
  category: string | null;
  similarityScore: number;
  reasons: string[];
  currentCatalogCost: number | null;
  canSuggestSkuUpdate: boolean;
}

export type SupplierInvoiceReviewStatus = "matched" | "likely_match" | "new_item";

export interface SupplierInvoiceReviewEntry {
  id: string;
  invoiceSku: string;
  invoiceName: string;
  quantity: number;
  unitPricePreTax: number | null;
  lineTotalPreTax: number | null;
  invoiceDerivedCatalogCost: number | null;
  sourceRowCount: number;
  status: SupplierInvoiceReviewStatus;
  suggestedMatch: SupplierInvoiceMatchCandidate | null;
  candidateMatches: SupplierInvoiceMatchCandidate[];
}

export interface SupplierInvoiceReviewPreview {
  matchedExisting: SupplierInvoiceReviewEntry[];
  likelyMatches: SupplierInvoiceReviewEntry[];
  newMaterials: SupplierInvoiceReviewEntry[];
}

export interface SupplierInvoiceReviewResolution {
  entryId: string;
  action: "merge" | "create" | "skip";
  targetCatalogItemId?: CatalogItemId;
  updateCost?: boolean;
  updateSku?: boolean;
}

export interface MaterialReconciliationCandidate {
  catalogItemId: CatalogItemId;
  name: string;
  sku: string | null;
  category: string | null;
  similarityScore: number;
  reasons: string[];
}

export type MaterialReconciliationStatus = "matched" | "likely_duplicate" | "new_item";

export interface MaterialReconciliationEntry {
  id: string;
  importSku: string;
  importName: string;
  averageCost: number | null;
  sourceRowCount: number;
  status: MaterialReconciliationStatus;
  suggestedMatch: MaterialReconciliationCandidate | null;
  candidateMatches: MaterialReconciliationCandidate[];
}

export interface MaterialReconciliationPreview {
  matched: MaterialReconciliationEntry[];
  likelyDuplicates: MaterialReconciliationEntry[];
  newItems: MaterialReconciliationEntry[];
}

export interface MaterialReconciliationResolution {
  entryId: string;
  action: "merge" | "create" | "skip";
  targetCatalogItemId?: CatalogItemId;
}

export interface CatalogCleanupPair {
  id: string;
  primary: CatalogItem;
  duplicate: CatalogItem;
  similarityScore: number;
  reasons: string[];
}

export interface CatalogCleanupResolution {
  pairId: string;
  action: "merge" | "skip";
  primaryCatalogItemId?: CatalogItemId;
}

export interface MaterialImportRollbackPreview {
  removableImportedMaterials: CatalogItem[];
  mergedArtifactMaterials: CatalogItem[];
}
