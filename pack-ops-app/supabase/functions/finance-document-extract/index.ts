import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const DOCUMENTS_BUCKET = "documents";
const MIN_USEFUL_TEXT_LENGTH = 80;
const INTERNAL_COST_MULTIPLIER = 1.12;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Actor = { id: string; orgId: string };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function createServiceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function currentUser(req: Request, supabase: ReturnType<typeof createServiceClient>): Promise<Actor> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Not authenticated.");

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", authData.user.id)
    .is("deleted_at", null)
    .single();
  if (userError || !userRow) throw new Error("User was not found.");
  if (!["owner", "office", "bookkeeper"].includes(userRow.role)) {
    throw new Error("You cannot extract finance documents.");
  }
  return { id: userRow.id as string, orgId: userRow.org_id as string };
}

function normalizeStoragePath(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\?.*$/, "")
    .replace(/^.*?\/storage\/v1\/object\/(?:sign|public)\/documents\//, "")
    .replace(/^\/+documents\/+/, "")
    .replace(/^\/+/, "");
}

function inferMimeType(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function moneyFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\\)/g, ")")
    .replace(/\\\(/g, "(")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function textFromPdfOperators(value: string): string {
  const chunks: string[] = [];
  for (const block of value.matchAll(/BT([\s\S]*?)ET/g)) {
    const content = block[1] ?? "";
    for (const match of content.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      chunks.push(decodePdfString(match[0].slice(1, -1)));
    }
  }
  return chunks.join("\n");
}

async function inflatePdfStream(stream: Uint8Array): Promise<string> {
  try {
    const response = new Response(new Blob([stream]).stream().pipeThrough(new DecompressionStream("deflate")));
    return await response.text();
  } catch {
    return new TextDecoder("latin1").decode(stream);
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const raw = new TextDecoder("latin1").decode(bytes);
  const texts: string[] = [textFromPdfOperators(raw)];

  for (const streamMatch of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const start = streamMatch.index ?? 0;
    const prefix = raw.slice(Math.max(0, start - 300), start);
    if (!/FlateDecode/.test(prefix)) continue;
    const binary = streamMatch[1] ?? "";
    const streamBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0) & 0xff);
    texts.push(textFromPdfOperators(await inflatePdfStream(streamBytes)));
  }

  return texts
    .join("\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function classifyDocument(text: string, mimeType: string | null) {
  const normalized = text.toLowerCase();
  if (/\b(payment confirmation|payment received|paid successfully|e-transfer|etransfer)\b/.test(normalized)) return { type: "payment_confirmation", confidence: 0.86 };
  if (/\b(statement|account summary|monthly statement)\b/.test(normalized)) return { type: "statement", confidence: 0.82 };
  if (/\b(receipt|purchase receipt)\b/.test(normalized)) return { type: "receipt", confidence: 0.78 };
  if (/\b(invoice|inv\s*#|tax invoice|amount due|balance due)\b/.test(normalized)) return { type: "supplier_invoice", confidence: 0.9 };
  if (mimeType === "application/pdf" && /\b(order|bill|due)\b/.test(normalized)) return { type: "supplier_invoice", confidence: 0.48 };
  return { type: "unknown", confidence: 0 };
}

function extractDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return { value: `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`, confidence: 0.82 };
  const compact = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (compact) return { value: `${compact[3]}-${String(compact[1]).padStart(2, "0")}-${String(compact[2]).padStart(2, "0")}`, confidence: 0.68 };
  const named = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i);
  if (named) {
    const parsed = new Date(named[0]);
    if (Number.isFinite(parsed.getTime())) return { value: parsed.toISOString().slice(0, 10), confidence: 0.72 };
  }
  return { value: null, confidence: 0 };
}

function extractAmount(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:#-]?\\s*\\$?\\s*(-?[0-9][0-9,]*\\.?[0-9]{0,2})`, "i");
    const value = moneyFromText(text.match(pattern)?.[1]);
    if (value !== null) return { value, confidence: 0.78 };
  }
  return { value: null, confidence: 0 };
}

function firstUsefulLine(text: string): string | null {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length >= 3 && !/^(invoice|tax invoice|receipt|statement)$/i.test(line)) ?? null;
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

function bestVendorContactMatch(contacts: any[], input: { senderEmail: string | null; vendor: string | null }) {
  const senderDomain = input.senderEmail?.split("@")[1]?.toLowerCase() ?? "";
  const vendorText = normalizeVendorText(input.vendor);
  let best: { contact: any; confidence: number; reason: string } | null = null;
  for (const contact of contacts) {
    const aliases = [contact.name, contact.company_name, contact.email, contact.notes, contact.email ? contact.email.split("@")[1] : ""].filter(Boolean);
    for (const alias of aliases) {
      const aliasText = normalizeVendorText(alias);
      let confidence = 0;
      let reason = "vendor alias";
      if (senderDomain && aliasText.includes(senderDomain)) {
        confidence = 0.92;
        reason = "sender domain matched contact";
      } else if (vendorText && aliasText && (aliasText.includes(vendorText) || vendorText.includes(aliasText))) {
        confidence = aliasText === vendorText ? 0.9 : 0.74;
        reason = "PDF vendor matched contact";
      }
      if (confidence > (best?.confidence ?? 0)) best = { contact, confidence, reason };
    }
  }
  return best;
}

function extractHeader(text: string, document: any, contacts: any[]) {
  const classification = classifyDocument(text, document.mime_type);
  const invoiceNumberMatch = text.match(/\b(?:invoice|inv)\s*(?:number|no|#|:)?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  const date = extractDate(text);
  const subtotal = extractAmount(text, ["subtotal", "sub total"]);
  const tax = extractAmount(text, ["gst", "tax", "sales tax"]);
  const total = extractAmount(text, ["total due", "amount due", "balance due", "invoice total", "total"]);
  const vendor = firstUsefulLine(text) ?? document.extracted_vendor ?? document.sender_name ?? null;
  const vendorMatch = bestVendorContactMatch(contacts, { senderEmail: document.sender_email, vendor });
  const confidences = [
    classification.confidence,
    vendor ? 0.72 : 0,
    invoiceNumberMatch ? 0.76 : 0,
    date.confidence,
    subtotal.confidence,
    tax.confidence,
    total.confidence,
    vendorMatch?.confidence ?? 0,
  ].filter((value) => value > 0);
  return {
    documentType: classification.type,
    documentTypeConfidence: classification.confidence,
    extractionConfidence: confidences.length ? roundMoney(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : 0,
    vendor: vendorMatch?.contact?.name ?? vendor,
    vendorConfidence: vendor ? 0.72 : 0,
    invoiceNumber: invoiceNumberMatch?.[1] ?? document.extracted_invoice_number ?? null,
    invoiceNumberConfidence: invoiceNumberMatch ? 0.76 : Number(document.invoice_number_confidence ?? 0),
    invoiceDate: date.value ?? document.extracted_date ?? null,
    invoiceDateConfidence: date.value ? date.confidence : Number(document.invoice_date_confidence ?? 0),
    subtotal: subtotal.value ?? document.extracted_subtotal ?? null,
    subtotalConfidence: subtotal.value !== null ? subtotal.confidence : Number(document.subtotal_confidence ?? 0),
    tax: tax.value ?? document.extracted_tax ?? null,
    taxConfidence: tax.value !== null ? tax.confidence : Number(document.tax_confidence ?? 0),
    total: total.value ?? document.extracted_total ?? null,
    totalConfidence: total.value !== null ? total.confidence : Number(document.total_confidence ?? 0),
    vendorMatch,
  };
}

function parseLineItems(text: string) {
  const lines = text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];
  for (const line of lines) {
    if (/subtotal|total|gst|tax|amount due|balance due|invoice/i.test(line)) continue;
    const match = line.match(/^(.{3,}?)\s+(\d+(?:\.\d{1,3})?)\s+\$?([0-9][0-9,]*\.\d{2})\s+\$?([0-9][0-9,]*\.\d{2})$/);
    if (!match) continue;
    const quantity = Number(match[2]);
    const unitPrice = moneyFromText(match[3]);
    const total = moneyFromText(match[4]);
    if (!Number.isFinite(quantity) || unitPrice === null || total === null) continue;
    const expected = roundMoney(quantity * unitPrice);
    if (Math.abs(expected - total) > Math.max(1, total * 0.08)) continue;
    items.push({
      description: (match[1] ?? "").trim(),
      quantity: Math.round(quantity * 1000) / 1000,
      unitPrice,
      total,
    });
    if (items.length >= 80) break;
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createServiceClient();
  try {
    const actor = await currentUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const documentId = String(body?.documentId ?? "");
    if (!documentId) throw new Error("Document id is required.");

    const { data: document, error: documentError } = await supabase
      .from("finance_document_intake")
      .select("*")
      .eq("org_id", actor.orgId)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (documentError || !document) throw new Error("Document was not found.");

    const storagePath = normalizeStoragePath(document.storage_path);
    if (!storagePath) throw new Error("This document is missing a storage path.");

    const { data: fileData, error: downloadError } = await supabase.storage.from(DOCUMENTS_BUCKET).download(storagePath);
    if (downloadError || !fileData) throw new Error(`Could not download source file from storage: ${downloadError?.message ?? "missing file"}`);

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const mimeType = document.mime_type || fileData.type || inferMimeType(storagePath);
    if (mimeType !== "application/pdf") {
      throw new Error("PDF extraction currently supports PDF source files only.");
    }

    const text = await extractPdfText(bytes);
    const hasUsefulText = text.length >= MIN_USEFUL_TEXT_LENGTH;
    const ocrStatus = hasUsefulText ? "not_needed" : "needed";
    const ocrError = hasUsefulText ? null : "PDF text extraction was insufficient; OCR fallback is required but no OCR provider is configured.";

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, name, company_name, email, notes")
      .eq("org_id", actor.orgId)
      .is("deleted_at", null);
    if (contactsError) throw contactsError;

    const header = extractHeader(hasUsefulText ? text : [document.email_subject, document.file_name, document.sender_name, document.sender_email].filter(Boolean).join("\n"), document, contacts ?? []);
    const parsedLines = hasUsefulText && header.documentType === "supplier_invoice" ? parseLineItems(text) : [];
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("finance_document_intake")
      .update({
        storage_path: storagePath,
        file_name: document.file_name || storagePath.split("/").pop() || "unknown-document",
        mime_type: mimeType,
        file_size: bytes.byteLength,
        size_bytes: document.size_bytes ?? bytes.byteLength,
        uploaded_at: document.uploaded_at ?? document.created_at,
        document_type: header.documentType,
        document_type_confidence: header.documentTypeConfidence,
        extraction_status: "needs_review",
        extraction_method: hasUsefulText ? "pdf_text" : "metadata",
        extraction_confidence: header.extractionConfidence,
        extracted_vendor: header.vendor,
        extracted_invoice_number: header.invoiceNumber,
        extracted_date: header.invoiceDate,
        extracted_subtotal: header.subtotal,
        extracted_tax: header.tax,
        extracted_total: header.total,
        vendor_confidence: header.vendorConfidence,
        invoice_number_confidence: header.invoiceNumberConfidence,
        invoice_date_confidence: header.invoiceDateConfidence,
        subtotal_confidence: header.subtotalConfidence,
        tax_confidence: header.taxConfidence,
        total_confidence: header.totalConfidence,
        normalized_vendor_contact_id: header.vendorMatch?.contact?.id ?? document.normalized_vendor_contact_id,
        vendor_normalization_confidence: header.vendorMatch?.confidence ?? document.vendor_normalization_confidence ?? 0,
        suggested_contact_id: header.vendorMatch?.contact?.id ?? document.suggested_contact_id,
        suggestion_confidence: Math.max(header.vendorMatch?.confidence ?? 0, header.extractionConfidence),
        suggestion_reason: header.vendorMatch?.reason ?? "PDF invoice extraction",
        pdf_text_extracted_at: hasUsefulText ? now : null,
        pdf_text_char_count: text.length,
        ocr_status: ocrStatus,
        ocr_error: ocrError,
        updated_at: now,
      })
      .eq("org_id", actor.orgId)
      .eq("id", documentId);
    if (updateError) throw updateError;

    await supabase
      .from("finance_document_line_items")
      .update({ deleted_at: now, updated_at: now, updated_by: actor.id })
      .eq("org_id", actor.orgId)
      .eq("document_intake_id", documentId)
      .eq("extraction_source", "pdf_parse")
      .eq("review_status", "new")
      .is("deleted_at", null);

    if (parsedLines.length > 0) {
      const rows = parsedLines.map((item) => ({
        org_id: actor.orgId,
        document_intake_id: documentId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
        supplier_price: item.unitPrice,
        internal_cost: roundMoney(item.unitPrice * INTERNAL_COST_MULTIPLIER),
        match_confidence: 0,
        match_reason: "Parsed from PDF text",
        review_status: "new",
        extraction_source: "pdf_parse",
        extracted_at: now,
        created_by: actor.id,
        updated_by: actor.id,
        created_at: now,
        updated_at: now,
      }));
      const { error: insertError } = await supabase.from("finance_document_line_items").insert(rows);
      if (insertError) throw insertError;
    }

    return json({
      ok: true,
      documentId,
      textCharacters: text.length,
      extractionMethod: hasUsefulText ? "pdf_text" : "metadata",
      ocrStatus,
      lineItems: parsedLines.length,
    });
  } catch (error) {
    console.error("[finance-document-extract]", error);
    return json({ error: error instanceof Error ? error.message : "PDF invoice extraction failed." }, { status: 500 });
  }
});
