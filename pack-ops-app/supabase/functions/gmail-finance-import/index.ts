import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const FINANCE_ATTACHMENT_QUERY =
  '(filename:pdf OR filename:png OR filename:jpg OR filename:jpeg OR filename:webp OR subject:invoice OR subject:receipt OR subject:statement)';
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const DEFAULT_IMPORT_WINDOW_DAYS = 1;
const MAX_MANUAL_WINDOW_DAYS = 30;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "connect-url" | "status" | "sync" | "disconnect";
type ImportActor = { id: string | null; orgId: string };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function textToBase64Url(value: string): string {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToText(value: string): string {
  return new TextDecoder().decode(base64UrlDecode(value));
}

function byteaHex(bytes: Uint8Array): string {
  return `\\x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function fromByteaHex(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = env("GMAIL_TOKEN_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(value: string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)),
  );
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv);
  packed.set(ciphertext, iv.length);
  return byteaHex(packed);
}

async function decryptToken(value: string): Promise<string> {
  const packed = fromByteaHex(value);
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), ciphertext);
  return new TextDecoder().decode(plaintext);
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseSender(value: string): { senderName: string | null; senderEmail: string | null; vendor: string | null } {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  const senderName = (match?.[1] ?? "").replace(/^"|"$/g, "").trim() || null;
  const senderEmail = (match?.[2] ?? value).trim() || null;
  const vendor = senderName || senderEmail?.split("@")[0]?.replace(/[._-]+/g, " ") || null;
  return { senderName, senderEmail, vendor };
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
  if (!value) return null;
  const normalized = value.replace(/[$,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function extractDate(text: string): { value: string | null; confidence: number } {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    return {
      value: `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`,
      confidence: 0.72,
    };
  }

  const compact = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (compact) {
    return {
      value: `${compact[3]}-${String(compact[1]).padStart(2, "0")}-${String(compact[2]).padStart(2, "0")}`,
      confidence: 0.58,
    };
  }

  return { value: null, confidence: 0 };
}

function extractAmount(text: string, labels: string[]): { value: number | null; confidence: number } {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:#-]?\\s*\\$?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})`, "i");
    const match = text.match(pattern);
    const value = moneyFromText(match?.[1]);
    if (value !== null) {
      return { value, confidence: 0.62 };
    }
  }
  return { value: null, confidence: 0 };
}

function classifyDocument(text: string, mimeType: string): { type: string; confidence: number } {
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

function extractInvoiceHeader(input: {
  subject: string;
  snippet: string;
  fileName: string;
  senderVendor: string | null;
  receivedAt: string;
  mimeType: string;
}) {
  const text = [input.subject, input.snippet, input.fileName, input.senderVendor ?? ""].join(" ");
  const classification = classifyDocument(text, input.mimeType);
  const invoiceNumberMatch = text.match(/\b(?:invoice|inv)\s*(?:number|no|#|:)?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  const date = extractDate(text);
  const subtotal = extractAmount(text, ["subtotal", "sub total"]);
  const tax = extractAmount(text, ["gst", "tax", "sales tax"]);
  const total = extractAmount(text, ["total due", "amount due", "invoice total", "total"]);
  const vendorConfidence = input.senderVendor ? 0.55 : 0;
  const populatedConfidences = [
    vendorConfidence,
    invoiceNumberMatch ? 0.58 : 0,
    date.confidence,
    subtotal.confidence,
    tax.confidence,
    total.confidence,
    classification.confidence,
  ].filter((value) => value > 0);

  return {
    documentType: classification.type,
    documentTypeConfidence: classification.confidence,
    vendor: input.senderVendor,
    vendorConfidence,
    invoiceNumber: invoiceNumberMatch?.[1] ?? null,
    invoiceNumberConfidence: invoiceNumberMatch ? 0.58 : 0,
    invoiceDate: date.value ?? input.receivedAt.slice(0, 10),
    invoiceDateConfidence: date.value ? date.confidence : 0.24,
    subtotal: subtotal.value,
    subtotalConfidence: subtotal.confidence,
    tax: tax.value,
    taxConfidence: tax.confidence,
    total: total.value,
    totalConfidence: total.confidence,
    extractionConfidence: populatedConfidences.length
      ? Math.round((populatedConfidences.reduce((sum, value) => sum + value, 0) / populatedConfidences.length) * 1000) / 1000
      : 0,
  };
}

function bestVendorContactMatch(contacts: any[], input: { senderEmail: string | null; vendor: string | null }) {
  const senderDomain = input.senderEmail?.split("@")[1]?.toLowerCase() ?? "";
  const vendorText = normalizeVendorText(input.vendor);
  let best: { contact: any; confidence: number; reason: string } | null = null;

  for (const contact of contacts) {
    const aliases = [
      contact.name,
      contact.company_name,
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

function walkParts(part: any, output: any[] = []): any[] {
  if (!part) {
    return output;
  }
  if (part.filename && part.body?.attachmentId) {
    output.push(part);
  }
  for (const child of part.parts ?? []) {
    walkParts(child, output);
  }
  return output;
}

async function gmailFetch(path: string, accessToken: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Gmail request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GMAIL_TOKEN_URL, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Gmail token refresh failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
    redirect_uri: env("GMAIL_OAUTH_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  const response = await fetch(GMAIL_TOKEN_URL, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Gmail OAuth exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function createServiceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function currentUser(req: Request, supabase: ReturnType<typeof createServiceClient>) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Error("Not authenticated.");
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", authData.user.id)
    .is("deleted_at", null)
    .single();
  if (userError || !userRow) {
    throw new Error("User was not found.");
  }
  if (!["owner", "office", "bookkeeper"].includes(userRow.role)) {
    throw new Error("You cannot manage Gmail finance imports.");
  }

  return { id: userRow.id as string, orgId: userRow.org_id as string };
}

async function importActor(req: Request, body: any, supabase: ReturnType<typeof createServiceClient>): Promise<ImportActor> {
  const cronSecret = Deno.env.get("GMAIL_IMPORT_CRON_SECRET");
  const requestSecret = req.headers.get("x-gmail-import-secret");
  if (cronSecret && requestSecret && requestSecret === cronSecret) {
    const orgId = String(body?.orgId ?? "");
    if (!orgId) {
      throw new Error("Scheduled Gmail import requires orgId.");
    }
    return { id: null, orgId };
  }

  return currentUser(req, supabase);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function gmailDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function utcStartOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function clampWindowDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IMPORT_WINDOW_DAYS;
  }
  return Math.min(MAX_MANUAL_WINDOW_DAYS, Math.ceil(parsed));
}

function resolveImportWindow(connection: any, override: any): { start: Date; end: Date; label: string } {
  const now = new Date();
  const mode = override?.mode ?? "default";

  if (mode === "today") {
    return { start: utcStartOfToday(now), end: now, label: "today" };
  }
  if (mode === "last_3_days") {
    return { start: addDays(now, -3), end: now, label: "last_3_days" };
  }
  if (mode === "custom") {
    const days = clampWindowDays(override?.windowDays);
    return { start: addDays(now, -days), end: now, label: `last_${days}_days` };
  }

  const lastSuccess = connection.last_successful_import_at
    ? new Date(connection.last_successful_import_at)
    : null;
  if (lastSuccess && Number.isFinite(lastSuccess.getTime())) {
    return { start: lastSuccess, end: now, label: "since_last_success" };
  }

  return { start: addDays(now, -DEFAULT_IMPORT_WINDOW_DAYS), end: now, label: "default_recent" };
}

async function handleConnectUrl(req: Request, body: any, supabase: ReturnType<typeof createServiceClient>) {
  const user = await currentUser(req, supabase);
  const state = crypto.randomUUID();
  const stateHash = await sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase.from("gmail_oauth_states").insert({
    org_id: user.orgId,
    requested_by: user.id,
    state_hash: stateHash,
    expires_at: expiresAt,
  });
  if (error) {
    throw error;
  }

  const redirectTo = String(body?.redirectTo ?? "");
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GMAIL_OAUTH_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state: `${state}:${textToBase64Url(redirectTo)}`,
  });

  return json({ authUrl: `${GMAIL_AUTH_URL}?${params.toString()}` });
}

async function handleOAuthCallback(req: Request, supabase: ReturnType<typeof createServiceClient>) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") ?? "";
  const [state, redirectToEncoded = ""] = stateParam.split(":");
  const redirectTo = redirectToEncoded ? base64UrlToText(redirectToEncoded) : "";
  if (!code || !state) {
    return new Response("Missing code or state.", { status: 400, headers: corsHeaders });
  }

  const stateHash = await sha256Hex(state);
  const { data: stateRow, error: stateError } = await supabase
    .from("gmail_oauth_states")
    .select("id, org_id, requested_by, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .single();
  if (stateError || !stateRow || stateRow.consumed_at || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return new Response("Invalid or expired OAuth state.", { status: 400, headers: corsHeaders });
  }

  const tokens = await exchangeCode(code);
  const profile = await gmailFetch("/profile", tokens.access_token);
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();

  const { data: existing } = await supabase
    .from("gmail_connections")
    .select("refresh_token_ciphertext")
    .eq("org_id", stateRow.org_id)
    .maybeSingle();

  const { error: upsertError } = await supabase.from("gmail_connections").upsert({
    org_id: stateRow.org_id,
    connected_by: stateRow.requested_by,
    gmail_email: profile.emailAddress ?? null,
    access_token_ciphertext: await encryptToken(tokens.access_token),
    refresh_token_ciphertext: await encryptToken(tokens.refresh_token) ?? existing?.refresh_token_ciphertext ?? null,
    token_expires_at: expiresAt,
    deleted_at: null,
  }, { onConflict: "org_id" });
  if (upsertError) {
    throw upsertError;
  }

  await supabase.from("gmail_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stateRow.id);

  if (redirectTo) {
    return Response.redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}gmail=connected`, 302);
  }
  return new Response("Gmail connected. You can close this tab.", { headers: corsHeaders });
}

async function loadConnection(orgId: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function handleStatus(req: Request, supabase: ReturnType<typeof createServiceClient>) {
  const user = await currentUser(req, supabase);
  const connection = await loadConnection(user.orgId, supabase);
  return json({
    connected: Boolean(connection),
    gmailEmail: connection?.gmail_email ?? null,
    lastSyncAt: connection?.last_sync_at ?? null,
    lastSuccessfulImportAt: connection?.last_successful_import_at ?? null,
    lastImportStartedAt: connection?.last_import_started_at ?? null,
    lastImportCompletedAt: connection?.last_import_completed_at ?? null,
    lastImportWindowStartAt: connection?.last_import_window_start_at ?? null,
    lastImportWindowEndAt: connection?.last_import_window_end_at ?? null,
    lastImportEmailsScanned: connection?.last_import_emails_scanned ?? 0,
    lastImportAttachmentsImported: connection?.last_import_attachments_imported ?? 0,
    lastImportItemsSkipped: connection?.last_import_items_skipped ?? 0,
  });
}

async function accessTokenForConnection(connection: any, supabase: ReturnType<typeof createServiceClient>) {
  let accessToken = await decryptToken(connection.access_token_ciphertext);
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() > Date.now() + 60_000) {
    return accessToken;
  }

  if (!connection.refresh_token_ciphertext) {
    throw new Error("Gmail refresh token is missing. Reconnect Gmail.");
  }

  const refreshed = await refreshAccessToken(await decryptToken(connection.refresh_token_ciphertext));
  accessToken = refreshed.access_token;
  await supabase.from("gmail_connections").update({
    access_token_ciphertext: await encryptToken(accessToken),
    token_expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString(),
  }).eq("org_id", connection.org_id);
  return accessToken;
}

async function handleSync(req: Request, body: any, supabase: ReturnType<typeof createServiceClient>) {
  const actor = await importActor(req, body, supabase);
  const connection = await loadConnection(actor.orgId, supabase);
  if (!connection) {
    throw new Error("Connect Gmail before importing documents.");
  }

  const accessToken = await accessTokenForConnection(connection, supabase);
  const window = resolveImportWindow(connection, body?.override);
  const query = `${FINANCE_ATTACHMENT_QUERY} after:${gmailDate(window.start)} before:${gmailDate(addDays(window.end, 1))}`;
  const startedAt = new Date().toISOString();
  await supabase.from("gmail_connections").update({
    last_import_started_at: startedAt,
    last_import_window_start_at: window.start.toISOString(),
    last_import_window_end_at: window.end.toISOString(),
  }).eq("org_id", actor.orgId);

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, company_name, email, notes")
    .eq("org_id", actor.orgId)
    .is("deleted_at", null);
  if (contactsError) {
    throw contactsError;
  }

  const list = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=25`, accessToken);
  let imported = 0;
  let skipped = 0;
  let emailsScanned = 0;

  for (const messageRef of list.messages ?? []) {
    const message = await gmailFetch(`/messages/${messageRef.id}?format=full`, accessToken);
    const messageReceivedAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
    if (messageReceivedAt < window.start || messageReceivedAt > window.end) {
      skipped += 1;
      continue;
    }
    emailsScanned += 1;
    const headers = message.payload?.headers ?? [];
    const subject = headerValue(headers, "Subject");
    const from = parseSender(headerValue(headers, "From"));
    const receivedAt = messageReceivedAt.toISOString();

    for (const part of walkParts(message.payload)) {
      const mimeType = part.mimeType || "application/octet-stream";
      if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) {
        skipped += 1;
        continue;
      }

      const attachmentId = part.body.attachmentId;
      const fileName = part.filename || `${message.id}-${attachmentId}`;
      const extraction = extractInvoiceHeader({
        subject,
        snippet: message.snippet ?? "",
        fileName,
        senderVendor: from.vendor,
        receivedAt,
        mimeType,
      });
      const vendorMatch = bestVendorContactMatch(contacts ?? [], {
        senderEmail: from.senderEmail,
        vendor: extraction.vendor,
      });
      const normalizedVendor = vendorMatch?.contact?.name ?? extraction.vendor;
      const { data: existing } = await supabase
        .from("finance_document_intake")
        .select("id")
        .eq("org_id", actor.orgId)
        .eq("gmail_message_id", message.id)
        .eq("gmail_attachment_id", attachmentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }

      const attachment = await gmailFetch(`/messages/${message.id}/attachments/${attachmentId}`, accessToken);
      const bytes = base64UrlDecode(attachment.data);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
      const storagePath = `${actor.orgId}/finance-gmail/${message.id}/${attachmentId}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, bytes, {
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError && !uploadError.message.includes("already exists")) {
        throw uploadError;
      }

      const { error: insertError } = await supabase.from("finance_document_intake").insert({
        org_id: actor.orgId,
        status: "needs_review",
        source: "gmail",
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
        file_size: bytes.byteLength,
        uploaded_at: new Date().toISOString(),
        sender_email: from.senderEmail,
        sender_name: from.senderName,
        email_subject: subject || null,
        email_received_at: receivedAt,
        external_source_id: `${message.id}:${attachmentId}`,
        gmail_message_id: message.id,
        gmail_attachment_id: attachmentId,
        document_type: extraction.documentType,
        document_type_confidence: extraction.documentTypeConfidence,
        extraction_status: "needs_review",
        extraction_confidence: extraction.extractionConfidence,
        extracted_vendor: normalizedVendor,
        extracted_invoice_number: extraction.invoiceNumber,
        extracted_date: extraction.invoiceDate,
        extracted_subtotal: extraction.subtotal,
        extracted_tax: extraction.tax,
        extracted_total: extraction.total,
        vendor_confidence: extraction.vendorConfidence,
        invoice_number_confidence: extraction.invoiceNumberConfidence,
        invoice_date_confidence: extraction.invoiceDateConfidence,
        subtotal_confidence: extraction.subtotalConfidence,
        tax_confidence: extraction.taxConfidence,
        total_confidence: extraction.totalConfidence,
        normalized_vendor_contact_id: vendorMatch?.contact?.id ?? null,
        vendor_normalization_confidence: vendorMatch?.confidence ?? 0,
        suggested_contact_id: vendorMatch?.contact?.id ?? null,
        suggestion_confidence: vendorMatch?.confidence ?? extraction.extractionConfidence,
        suggestion_reason: vendorMatch?.reason ?? "Gmail header extraction",
        uploaded_by: actor.id ?? connection.connected_by ?? null,
      });
      if (insertError) {
        if (insertError.code === "23505") {
          skipped += 1;
          continue;
        }
        throw insertError;
      }
      imported += 1;
    }
  }

  const completedAt = new Date().toISOString();
  await supabase.from("gmail_connections").update({
    last_sync_at: completedAt,
    last_successful_import_at: completedAt,
    last_import_completed_at: completedAt,
    last_import_emails_scanned: emailsScanned,
    last_import_attachments_imported: imported,
    last_import_items_skipped: skipped,
    last_import_window_start_at: window.start.toISOString(),
    last_import_window_end_at: window.end.toISOString(),
  }).eq("org_id", actor.orgId);
  return json({
    imported,
    skipped,
    emailsScanned,
    windowStartAt: window.start.toISOString(),
    windowEndAt: window.end.toISOString(),
    windowLabel: window.label,
  });
}

async function handleDisconnect(req: Request, supabase: ReturnType<typeof createServiceClient>) {
  const user = await currentUser(req, supabase);
  const { error } = await supabase
    .from("gmail_connections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("org_id", user.orgId);
  if (error) {
    throw error;
  }
  return json({ disconnected: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createServiceClient();
  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/oauth-callback")) {
      return await handleOAuthCallback(req, supabase);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action as Action;
    if (action === "connect-url") {
      return await handleConnectUrl(req, body, supabase);
    }
    if (action === "status") {
      return await handleStatus(req, supabase);
    }
    if (action === "sync") {
      return await handleSync(req, body, supabase);
    }
    if (action === "disconnect") {
      return await handleDisconnect(req, supabase);
    }
    return json({ error: "Unknown Gmail finance import action." }, { status: 400 });
  } catch (error) {
    console.error("[gmail-finance-import]", error);
    return json({ error: error instanceof Error ? error.message : "Gmail finance import failed." }, { status: 500 });
  }
});
