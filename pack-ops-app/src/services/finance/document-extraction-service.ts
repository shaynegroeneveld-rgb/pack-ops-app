import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/data/supabase/types";
import type { Contact } from "@/domain/contacts/types";
import type { FinanceDocumentIntake, FinanceDocumentType } from "@/domain/finance/types";
import type { User } from "@/domain/users/types";

export interface FinanceDocumentExtractionResult {
  documentType: FinanceDocumentType;
  documentTypeConfidence: number;
  extractionConfidence: number;
  extractedVendor: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedSubtotal: number | null;
  extractedTax: number | null;
  extractedTotal: number | null;
  vendorConfidence: number;
  invoiceNumberConfidence: number;
  invoiceDateConfidence: number;
  subtotalConfidence: number;
  taxConfidence: number;
  totalConfidence: number;
  normalizedVendorContactId: Contact["id"] | null;
  vendorNormalizationConfidence: number;
  suggestionReason: string | null;
}

export interface FinanceDocumentStorageResolution {
  path: string;
  wasNormalized: boolean;
  originalPath: string;
}

export interface PdfExtractionResponse {
  ok: boolean;
  documentId: string;
  textCharacters: number;
  extractionMethod: "metadata" | "pdf_text" | "ocr";
  ocrStatus: "not_needed" | "needed" | "unavailable" | "completed";
  lineItems: number;
}

const DOCUMENTS_BUCKET = "documents";

function canReprocess(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function normalizeStoragePath(value: string | null | undefined): FinanceDocumentStorageResolution {
  const originalPath = value ?? "";
  let path = originalPath.trim();
  path = path.replace(/\?.*$/, "");
  path = path.replace(/^.*?\/storage\/v1\/object\/(?:sign|public)\/documents\//, "");
  path = path.replace(/^\/+documents\/+/, "");
  path = path.replace(/^\/+/, "");

  return {
    path,
    wasNormalized: path !== originalPath,
    originalPath,
  };
}

function normalizeVendorText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|ltd|limited|corp|corporation|company|co|llc|plumbing|electric|electrical|supply|supplies)\b/g, " ")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyFromText(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function extractDate(text: string): { value: string | null; confidence: number } {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    return { value: `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`, confidence: 0.72 };
  }
  const compact = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (compact) {
    return { value: `${compact[3]}-${String(compact[1]).padStart(2, "0")}-${String(compact[2]).padStart(2, "0")}`, confidence: 0.58 };
  }
  return { value: null, confidence: 0 };
}

function extractAmount(text: string, labels: string[]): { value: number | null; confidence: number } {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:#-]?\\s*\\$?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})`, "i");
    const value = moneyFromText(text.match(pattern)?.[1]);
    if (value !== null) {
      return { value, confidence: 0.62 };
    }
  }
  return { value: null, confidence: 0 };
}

export function classifyFinanceDocument(text: string, mimeType: string | null): { type: FinanceDocumentType; confidence: number } {
  const normalized = text.toLowerCase();
  if (/\b(payment confirmation|payment received|paid successfully|e-transfer|etransfer)\b/.test(normalized)) {
    return { type: "payment_confirmation", confidence: 0.82 };
  }
  if (/\b(statement|account summary|monthly statement)\b/.test(normalized)) {
    return { type: "statement", confidence: 0.78 };
  }
  if (/\b(receipt|paid|purchase receipt)\b/.test(normalized)) {
    return { type: "receipt", confidence: 0.72 };
  }
  if (/\b(invoice|inv\s*#|tax invoice|amount due)\b/.test(normalized)) {
    return { type: "supplier_invoice", confidence: 0.76 };
  }
  if (mimeType === "application/pdf" && /\b(order|bill|due)\b/.test(normalized)) {
    return { type: "supplier_invoice", confidence: 0.44 };
  }
  return { type: "unknown", confidence: 0 };
}

export function extractFinanceDocumentHeader(document: FinanceDocumentIntake, contacts: Contact[]): FinanceDocumentExtractionResult {
  const receivedAt = document.emailReceivedAt ?? document.uploadedAt ?? document.createdAt;
  const senderVendor = document.senderName || document.senderEmail?.split("@")[0]?.replace(/[._-]+/g, " ") || null;
  const text = [
    document.emailSubject,
    document.fileName,
    document.senderName,
    document.senderEmail,
    document.extractedVendor,
  ].filter(Boolean).join(" ");
  const classification = classifyFinanceDocument(text, document.mimeType);
  const invoiceNumberMatch = text.match(/\b(?:invoice|inv)\s*(?:number|no|#|:)?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  const date = extractDate(text);
  const subtotal = extractAmount(text, ["subtotal", "sub total"]);
  const tax = extractAmount(text, ["gst", "tax", "sales tax"]);
  const total = extractAmount(text, ["total due", "amount due", "invoice total", "total"]);
  const vendor = document.extractedVendor || senderVendor;
  const vendorConfidence = vendor ? 0.55 : 0;
  const vendorMatch = bestVendorContactMatch(contacts, {
    senderEmail: document.senderEmail,
    vendor,
  });
  const confidences = [
    classification.confidence,
    vendorConfidence,
    invoiceNumberMatch ? 0.58 : 0,
    date.confidence,
    subtotal.confidence,
    tax.confidence,
    total.confidence,
    vendorMatch?.confidence ?? 0,
  ].filter((value) => value > 0);

  return {
    documentType: classification.type,
    documentTypeConfidence: classification.confidence,
    extractionConfidence: confidences.length ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 1000) / 1000 : 0,
    extractedVendor: vendorMatch?.contact.displayName ?? vendor,
    extractedInvoiceNumber: invoiceNumberMatch?.[1] ?? document.extractedInvoiceNumber,
    extractedDate: date.value ?? document.extractedDate ?? receivedAt.slice(0, 10),
    extractedSubtotal: subtotal.value ?? document.extractedSubtotal,
    extractedTax: tax.value ?? document.extractedTax,
    extractedTotal: total.value ?? document.extractedTotal,
    vendorConfidence,
    invoiceNumberConfidence: invoiceNumberMatch ? 0.58 : document.invoiceNumberConfidence,
    invoiceDateConfidence: date.value ? date.confidence : document.invoiceDateConfidence,
    subtotalConfidence: subtotal.value !== null ? subtotal.confidence : document.subtotalConfidence,
    taxConfidence: tax.value !== null ? tax.confidence : document.taxConfidence,
    totalConfidence: total.value !== null ? total.confidence : document.totalConfidence,
    normalizedVendorContactId: vendorMatch?.contact.id ?? document.normalizedVendorContactId,
    vendorNormalizationConfidence: vendorMatch?.confidence ?? document.vendorNormalizationConfidence,
    suggestionReason: vendorMatch?.reason ?? "Document metadata extraction",
  };
}

function bestVendorContactMatch(contacts: Contact[], input: { senderEmail: string | null; vendor: string | null }) {
  const senderDomain = input.senderEmail?.split("@")[1]?.toLowerCase() ?? "";
  const vendorText = normalizeVendorText(input.vendor);
  let best: { contact: Contact; confidence: number; reason: string } | null = null;

  for (const contact of contacts) {
    const aliases = [
      contact.displayName,
      contact.companyName,
      contact.email,
      contact.notes,
      contact.email ? contact.email.split("@")[1] : "",
    ].filter(Boolean);

    for (const alias of aliases) {
      const aliasText = normalizeVendorText(alias);
      let confidence = 0;
      let reason = "vendor alias";
      if (senderDomain && aliasText.includes(senderDomain)) {
        confidence = 0.92;
        reason = "sender domain matched contact";
      } else if (vendorText && aliasText && (aliasText.includes(vendorText) || vendorText.includes(aliasText))) {
        confidence = aliasText === vendorText ? 0.9 : 0.72;
        reason = "vendor text matched contact";
      }

      if (confidence > (best?.confidence ?? 0)) {
        best = { contact, confidence, reason };
      }
    }
  }

  return best;
}

export class FinanceDocumentExtractionService {
  constructor(
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {}

  resolveStoragePath(document: FinanceDocumentIntake): FinanceDocumentStorageResolution {
    return normalizeStoragePath(document.storagePath);
  }

  async signedUrl(document: FinanceDocumentIntake): Promise<string> {
    const resolution = this.resolveStoragePath(document);
    if (!resolution.path) {
      console.warn("[finance-document-view] missing storage path", {
        documentId: document.id,
        fileName: document.fileName,
        originalPath: resolution.originalPath,
      });
      throw new Error("This document does not have a storage path yet.");
    }

    if (resolution.wasNormalized) {
      console.info("[finance-document-view] normalized storage path", {
        documentId: document.id,
        originalPath: resolution.originalPath,
        normalizedPath: resolution.path,
      });
      await this.repairStorageMetadata(document, resolution);
    }

    const { data, error } = await this.client.storage.from(DOCUMENTS_BUCKET).createSignedUrl(resolution.path, 60 * 10);
    if (error) {
      console.error("[finance-document-view] signed URL failed", {
        documentId: document.id,
        storagePath: resolution.path,
        error,
      });
      throw new Error(`Could not open source file from storage: ${error.message}`);
    }
    return data.signedUrl;
  }

  async repairStorageMetadata(
    document: FinanceDocumentIntake,
    resolution = this.resolveStoragePath(document),
  ): Promise<void> {
    if (!resolution.path) {
      return;
    }
    const { error } = await (this.client as any)
      .from("finance_document_intake")
      .update({
        storage_path: resolution.path,
        file_name: document.fileName || resolution.path.split("/").pop() || "unknown-document",
        mime_type: document.mimeType || inferMimeType(resolution.path),
        file_size: document.sizeBytes,
        uploaded_at: document.uploadedAt ?? document.createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", this.currentUser.orgId)
      .eq("id", document.id);

    if (error) {
      console.warn("[finance-document-view] storage metadata repair failed", {
        documentId: document.id,
        storagePath: resolution.path,
        error,
      });
    }
  }

  async reprocess(document: FinanceDocumentIntake, contacts: Contact[]): Promise<PdfExtractionResponse | null> {
    if (!canReprocess(this.currentUser)) {
      throw new Error("You cannot re-run finance document extraction.");
    }
    const resolution = this.resolveStoragePath(document);
    if (!resolution.path) {
      throw new Error("This document is missing a storage path.");
    }
    if (resolution.wasNormalized || !document.uploadedAt) {
      await this.repairStorageMetadata(document, resolution);
    }
    if ((document.mimeType || inferMimeType(resolution.path)) === "application/pdf") {
      const { data, error } = await this.client.functions.invoke<PdfExtractionResponse>("finance-document-extract", {
        body: { documentId: document.id },
      });
      if (error) {
        console.error("[finance-document-extraction] PDF extraction function failed", {
          documentId: document.id,
          storagePath: resolution.path,
          error,
        });
        throw new Error(error.message || "PDF extraction failed.");
      }
      return data ?? null;
    }

    const extraction = extractFinanceDocumentHeader(document, contacts);
    const now = new Date().toISOString();
    console.info("[finance-document-extraction] reprocessing document", {
      documentId: document.id,
      fileName: document.fileName,
      storagePath: resolution.path || document.storagePath,
    });
    const { error } = await (this.client as any)
      .from("finance_document_intake")
      .update({
        document_type: extraction.documentType,
        document_type_confidence: extraction.documentTypeConfidence,
        extraction_status: "needs_review",
        extraction_confidence: extraction.extractionConfidence,
        extracted_vendor: extraction.extractedVendor,
        extracted_invoice_number: extraction.extractedInvoiceNumber,
        extracted_date: extraction.extractedDate,
        extracted_subtotal: extraction.extractedSubtotal,
        extracted_tax: extraction.extractedTax,
        extracted_total: extraction.extractedTotal,
        vendor_confidence: extraction.vendorConfidence,
        invoice_number_confidence: extraction.invoiceNumberConfidence,
        invoice_date_confidence: extraction.invoiceDateConfidence,
        subtotal_confidence: extraction.subtotalConfidence,
        tax_confidence: extraction.taxConfidence,
        total_confidence: extraction.totalConfidence,
        normalized_vendor_contact_id: extraction.normalizedVendorContactId,
        vendor_normalization_confidence: extraction.vendorNormalizationConfidence,
        suggested_contact_id: extraction.normalizedVendorContactId,
        suggestion_confidence: Math.max(extraction.vendorNormalizationConfidence, extraction.extractionConfidence),
        suggestion_reason: extraction.suggestionReason,
        file_name: document.fileName || resolution.path.split("/").pop() || "unknown-document",
        mime_type: document.mimeType || inferMimeType(resolution.path),
        file_size: document.sizeBytes,
        uploaded_at: document.uploadedAt ?? document.createdAt,
        storage_path: resolution.path || document.storagePath,
        updated_at: now,
      })
      .eq("org_id", this.currentUser.orgId)
      .eq("id", document.id);

    if (error) {
      console.error("[finance-document-extraction] reprocess failed", {
        documentId: document.id,
        error,
      });
      throw new Error(`Extraction failed: ${error.message}`);
    }
    return null;
  }

  async reprocessMany(documents: FinanceDocumentIntake[], contacts: Contact[]): Promise<number> {
    let count = 0;
    for (const document of documents) {
      await this.reprocess(document, contacts);
      count += 1;
    }
    return count;
  }
}

function inferMimeType(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}
