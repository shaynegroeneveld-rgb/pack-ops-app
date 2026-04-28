import type { SupabaseClient } from "@supabase/supabase-js";

import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type {
  CreateFinanceDocumentLineItemInput,
  FinanceDocumentLineItem,
  FinanceDocumentLineItemMaterialSuggestion,
} from "@/domain/finance/types";
import type { CatalogItem, CreateCatalogItemInput } from "@/domain/materials/types";
import type { User } from "@/domain/users/types";
import { createId } from "@/lib/create-id";

type LineItemRow = {
  id: string;
  org_id: string;
  document_intake_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  total: number | string;
  supplier_price: number | string;
  internal_cost: number | string;
  matched_catalog_item_id: string | null;
  match_confidence: number | string;
  match_reason: string | null;
  review_status: FinanceDocumentLineItem["reviewStatus"];
  applied_catalog_item_id: string | null;
  applied_at: string | null;
  applied_by: string | null;
  ignored_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const INTERNAL_COST_MULTIPLIER = 1.12;
const STOP_WORDS = new Set(["and", "the", "for", "with", "white", "black", "each", "ft", "inch", "in"]);

function canManageDocumentMaterials(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function requireAccess(user: User) {
  if (!canManageDocumentMaterials(user)) {
    throw new Error("You cannot update materials from supplier invoices.");
  }
}

function money(value: number | string | null | undefined): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0;
}

function nullableMoney(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return money(value);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bemt\b/g, "electrical metallic tubing")
    .replace(/\bgfci\b/g, "ground fault receptacle")
    .replace(/\bafci\b/g, "arc fault breaker")
    .replace(/\b2p\b/g, "2 pole")
    .replace(/\b3p\b/g, "3 pole")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token && !STOP_WORDS.has(token)));
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
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

function bigrams(value: string): Set<string> {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (normalized.length < 2) {
    return new Set(normalized ? [normalized] : []);
  }
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function bigramSimilarity(left: string, right: string): number {
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
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

function mapLineItem(row: LineItemRow): FinanceDocumentLineItem {
  return {
    id: row.id as FinanceDocumentLineItem["id"],
    orgId: row.org_id as FinanceDocumentLineItem["orgId"],
    documentIntakeId: row.document_intake_id as FinanceDocumentLineItem["documentIntakeId"],
    description: row.description,
    quantity: money(row.quantity),
    unitPrice: money(row.unit_price),
    total: money(row.total),
    supplierPrice: money(row.supplier_price),
    internalCost: money(row.internal_cost),
    matchedCatalogItemId: row.matched_catalog_item_id as FinanceDocumentLineItem["matchedCatalogItemId"],
    matchConfidence: money(row.match_confidence),
    matchReason: row.match_reason,
    reviewStatus: row.review_status,
    appliedCatalogItemId: row.applied_catalog_item_id as FinanceDocumentLineItem["appliedCatalogItemId"],
    appliedAt: row.applied_at,
    appliedBy: row.applied_by as FinanceDocumentLineItem["appliedBy"],
    ignoredReason: row.ignored_reason,
    createdBy: row.created_by as FinanceDocumentLineItem["createdBy"],
    updatedBy: row.updated_by as FinanceDocumentLineItem["updatedBy"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function calculateLineAmounts(input: { quantity: number; unitPrice: number; total?: number | null }) {
  const quantity = Math.max(0.001, Number(input.quantity || 1));
  const unitPrice = Math.max(0, Number(input.unitPrice || 0));
  const total = input.total != null && Number.isFinite(input.total)
    ? money(input.total)
    : money(quantity * unitPrice);
  const supplierPrice = money(unitPrice);
  const internalCost = money(supplierPrice * INTERNAL_COST_MULTIPLIER);
  return { quantity: Math.round(quantity * 1000) / 1000, unitPrice, total, supplierPrice, internalCost };
}

export class DocumentMaterialService {
  private readonly catalogItems;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
  }

  private async bestMatch(description: string, vendor: string | null): Promise<{
    material: CatalogItem | null;
    confidence: number;
    reason: string | null;
  }> {
    const materials = await this.catalogItems.list({ filter: { includeInactive: true } });
    const lineTokens = tokens(`${description} ${vendor ?? ""}`);
    const normalizedDescription = normalizeText(description);

    const candidates = materials
      .map((material) => {
        const materialText = [material.name, material.sku ?? "", material.category ?? "", material.notes ?? ""].join(" ");
        const overlap = tokenOverlap(lineTokens, tokens(materialText));
        const similarity = bigramSimilarity(description, materialText);
        const containment =
          normalizedDescription.includes(normalizeText(material.name)) ||
          normalizeText(material.name).includes(normalizedDescription)
            ? 0.08
            : 0;
        const vendorHint = vendor && normalizeText(material.notes ?? "").includes(normalizeText(vendor)) ? 0.08 : 0;
        const confidence = Math.min(1, overlap * 0.58 + similarity * 0.32 + containment + vendorHint);
        const reasons = [];
        if (overlap >= 0.45) reasons.push("shared keywords");
        if (similarity >= 0.6) reasons.push("similar name");
        if (containment > 0) reasons.push("name containment");
        if (vendorHint > 0) reasons.push("supplier note");
        return { material, confidence, reason: reasons.join(", ") || "possible match" };
      })
      .filter((candidate) => candidate.confidence >= 0.35)
      .sort((left, right) => right.confidence - left.confidence);

    const top = candidates[0];
    if (!top) {
      return { material: null, confidence: 0, reason: null };
    }
    return {
      material: top.material,
      confidence: Math.round(top.confidence * 100) / 100,
      reason: top.reason,
    };
  }

  async listLineItems(documentIntakeId: string): Promise<FinanceDocumentLineItem[]> {
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("document_intake_id", documentIntakeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }
    return ((data ?? []) as LineItemRow[]).map(mapLineItem);
  }

  async createLineItem(input: CreateFinanceDocumentLineItemInput, vendor?: string | null): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const description = input.description.trim();
    if (!description) {
      throw new Error("Line item description is required.");
    }
    const amounts = calculateLineAmounts(input);
    const match = await this.bestMatch(description, vendor ?? null);
    const now = new Date().toISOString();

    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .insert({
        id: createId(),
        org_id: this.context.orgId,
        document_intake_id: input.documentIntakeId,
        description,
        quantity: amounts.quantity,
        unit_price: amounts.unitPrice,
        total: amounts.total,
        supplier_price: amounts.supplierPrice,
        internal_cost: amounts.internalCost,
        matched_catalog_item_id: match.material?.id ?? null,
        match_confidence: match.confidence,
        match_reason: match.reason,
        created_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  async updateLineItem(lineItemId: string, input: Omit<CreateFinanceDocumentLineItemInput, "documentIntakeId">, vendor?: string | null): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const lineItem = await this.getLineItemForApply(lineItemId);
    if (lineItem.reviewStatus !== "new") {
      throw new Error("This line item has already been reviewed.");
    }
    const description = input.description.trim();
    if (!description) {
      throw new Error("Line item description is required.");
    }
    const amounts = calculateLineAmounts(input);
    const match = await this.bestMatch(description, vendor ?? null);
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .update({
        description,
        quantity: amounts.quantity,
        unit_price: amounts.unitPrice,
        total: amounts.total,
        supplier_price: amounts.supplierPrice,
        internal_cost: amounts.internalCost,
        matched_catalog_item_id: match.material?.id ?? null,
        match_confidence: match.confidence,
        match_reason: match.reason,
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", lineItemId)
      .eq("review_status", "new")
      .select("*")
      .single();

    if (error) {
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  async approveLineItem(lineItemId: string): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .update({
        review_status: "approved",
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", lineItemId)
      .eq("review_status", "new")
      .select("*")
      .single();

    if (error) {
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  async suggestions(documentIntakeId: string): Promise<FinanceDocumentLineItemMaterialSuggestion[]> {
    const [lineItems, materials] = await Promise.all([
      this.listLineItems(documentIntakeId),
      this.catalogItems.list({ filter: { includeInactive: true } }),
    ]);
    const materialById = new Map(materials.map((material) => [material.id, material]));

    return lineItems.map((lineItem) => {
      const matchedMaterial = lineItem.matchedCatalogItemId
        ? materialById.get(lineItem.matchedCatalogItemId) ?? null
        : null;
      const currentPrice = matchedMaterial?.costPrice ?? null;
      const percentChange =
        currentPrice && currentPrice > 0
          ? Math.round(((lineItem.internalCost - currentPrice) / currentPrice) * 10000) / 100
          : null;

      return {
        lineItem,
        matchedMaterial,
        confidence: lineItem.matchConfidence,
        reason: lineItem.matchReason,
        currentPrice,
        newPrice: lineItem.internalCost,
        percentChange,
      };
    });
  }

  async updateMaterialPrice(lineItemId: string, catalogItemId: CatalogItem["id"]): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const lineItem = await this.getLineItemForApply(lineItemId);
    if (lineItem.reviewStatus !== "new") {
      throw new Error("This line item has already been reviewed.");
    }
    await this.assertMaterialNotAlreadyApplied(lineItem.documentIntakeId, catalogItemId);

    const existing = await this.catalogItems.getById(catalogItemId);
    const updateNote = `Updated from finance document ${lineItem.documentIntakeId} on ${new Date().toISOString().slice(0, 10)}.`;
    const notes = [existing?.notes, updateNote].filter(Boolean).join("\n");

    await this.catalogItems.update(catalogItemId, {
      costPrice: lineItem.internalCost,
      notes,
    });

    return this.markApplied(lineItem, catalogItemId, "updated_material");
  }

  async createMaterialFromLine(lineItemId: string, input: { name: string; sku?: string | null }): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const lineItem = await this.getLineItemForApply(lineItemId);
    if (lineItem.reviewStatus !== "new") {
      throw new Error("This line item has already been reviewed.");
    }

    const materialInput: CreateCatalogItemInput = {
      name: input.name.trim() || lineItem.description,
      sku: input.sku?.trim() || null,
      unit: "each",
      costPrice: lineItem.internalCost,
      notes: `Created from finance document ${lineItem.documentIntakeId}. Supplier price ${lineItem.supplierPrice.toFixed(2)} with 12% internal cost.`,
      isActive: true,
    };
    const material = await this.catalogItems.create(materialInput);
    return this.markApplied(lineItem, material.id, "created_material");
  }

  async ignoreLineItem(lineItemId: string, reason?: string | null): Promise<FinanceDocumentLineItem> {
    requireAccess(this.currentUser);
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .update({
        review_status: "ignored",
        ignored_reason: reason?.trim() || null,
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", lineItemId)
      .eq("review_status", "new")
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  private async getLineItemForApply(lineItemId: string): Promise<FinanceDocumentLineItem> {
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", lineItemId)
      .is("deleted_at", null)
      .single();
    if (error) {
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  private async markApplied(
    lineItem: FinanceDocumentLineItem,
    catalogItemId: CatalogItem["id"],
    status: "updated_material" | "created_material",
  ): Promise<FinanceDocumentLineItem> {
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .update({
        review_status: status,
        applied_catalog_item_id: catalogItemId,
        applied_at: new Date().toISOString(),
        applied_by: this.context.actorUserId,
        updated_by: this.context.actorUserId,
      })
      .eq("org_id", this.context.orgId)
      .eq("id", lineItem.id)
      .eq("review_status", "new")
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("This document already applied an update to that material.");
      }
      throw error;
    }
    return mapLineItem(data as LineItemRow);
  }

  private async assertMaterialNotAlreadyApplied(documentIntakeId: string, catalogItemId: string): Promise<void> {
    const { data, error } = await (this.client as any)
      .from("finance_document_line_items")
      .select("id")
      .eq("org_id", this.context.orgId)
      .eq("document_intake_id", documentIntakeId)
      .eq("applied_catalog_item_id", catalogItemId)
      .not("applied_at", "is", null)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data) {
      throw new Error("This document has already applied an update to that material.");
    }
  }
}
