import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { invoiceLayout } from "./pdf.ts";
import { parseEbhInvoice } from "./parser.ts";
const env = (n: string) => {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`missing_${n}`);
  return v;
};
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const check = async (q: any) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};
const decode = (s: string) =>
  Uint8Array.from(
    atob(
      s
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(s.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
async function decrypt(s: string) {
  const hex = s.replace(/^\\x/, "");
  const bytes = Uint8Array.from(hex.match(/../g)!, (x) => parseInt(x, 16));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env("GMAIL_TOKEN_SECRET")),
  );
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "decrypt",
  ]);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    ),
  );
}
async function gmail(path: string, token: string) {
  const r = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me" + path,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw new Error(`gmail_http_${r.status}`);
  return r.json();
}
async function gmailToken(cfg: any) {
  const conn = await check(
    db
      .from("gmail_connections")
      .select("gmail_email,refresh_token_ciphertext")
      .eq("org_id", cfg.org_id)
      .is("deleted_at", null)
      .single(),
  );
  if (conn.gmail_email?.toLowerCase() !== cfg.gmail_email.toLowerCase())
    throw new Error("gmail_account_mismatch");
  if (!conn.refresh_token_ciphertext)
    throw new Error("gmail_reconnect_required");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: await decrypt(conn.refresh_token_ciphertext),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`gmail_reconnect_required_${r.status}`);
  return (await r.json()).access_token as string;
}
function parts(p: any): any[] {
  return [
    ...(p?.filename && p?.body?.attachmentId ? [p] : []),
    ...(p?.parts ?? []).flatMap(parts),
  ];
}
async function scan(cfg: any, token: string) {
  const end = cfg.scan_end ?? new Date().toISOString();
  const start =
    cfg.scan_start ??
    new Date(
      Math.max(
        Date.now() - 30 * 86400000,
        cfg.scanned_through
          ? Date.parse(cfg.scanned_through) - 2 * 86400000
          : 0,
      ),
    ).toISOString();
  // Preserve a fixed scan window and page token until every page is safely queued.
  await check(
    db
      .from("ebh_price_sync")
      .update({ scan_start: start, scan_end: end })
      .eq("org_id", cfg.org_id),
  );
  const q = `from:ar@ebhorsman.com has:attachment filename:pdf after:${Math.floor(Date.parse(start) / 1000)} before:${Math.ceil(Date.parse(end) / 1000)}`;
  const list = await gmail(
    `/messages?maxResults=10&q=${encodeURIComponent(q)}${cfg.page_token ? "&pageToken=" + encodeURIComponent(cfg.page_token) : ""}`,
    token,
  );
  for (const ref of list.messages ?? []) {
    const message = await gmail(`/messages/${ref.id}?format=full`, token);
    const from =
      message.payload?.headers?.find(
        (h: any) => h.name.toLowerCase() === "from",
      )?.value ?? "";
    const sender = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    if (sender !== "ar@ebhorsman.com") continue;
    for (const p of parts(message.payload).filter(
      (p) => p.mimeType === "application/pdf" && /\.pdf$/i.test(p.filename),
    )) {
      await check(
        db
          .from("ebh_invoice_queue")
          .upsert(
            {
              org_id: cfg.org_id,
              message_id: message.id,
              attachment_id: p.body.attachmentId,
              file_name: p.filename,
              received_at: new Date(Number(message.internalDate)).toISOString(),
            },
            {
              onConflict: "org_id,message_id,attachment_id",
              ignoreDuplicates: true,
            },
          ),
      );
    }
  }
  await check(
    db
      .from("ebh_price_sync")
      .update(
        list.nextPageToken
          ? { page_token: list.nextPageToken }
          : {
              page_token: null,
              scan_start: null,
              scan_end: null,
              scanned_through: end,
            },
      )
      .eq("org_id", cfg.org_id),
  );
  return (list.messages ?? []).length;
}
async function processItem(item: any, cfg: any, token: string, dry: boolean) {
  let bytes: Uint8Array;
  if (item.storage_path) {
    const { data, error } = await db.storage
      .from("documents")
      .download(item.storage_path);
    if (error) throw new Error("stored_pdf_download_failed");
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const a = await gmail(
      `/messages/${item.message_id}/attachments/${item.attachment_id}`,
      token,
    );
    bytes = decode(a.data);
    if (bytes.length > 12_000_000) throw new Error("pdf_too_large");
    const path = `${cfg.org_id}/ebh-prices/${item.id}.pdf`;
    const { error } = await db.storage
      .from("documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error("pdf_storage_failed");
    await check(
      db
        .from("ebh_invoice_queue")
        .update({ storage_path: path })
        .eq("id", item.id),
    );
  }
  const invoice = parseEbhInvoice(
    await invoiceLayout(bytes),
    cfg.account_id,
    cfg.branch_id,
  );
  const result = await check(
    db.rpc("ebh_apply_invoice", {
      p_org: cfg.org_id,
      p_queue: item.id,
      p_invoice: invoice,
      p_dry_run: dry,
    }),
  );
  if (!dry)
    await check(
      db
        .from("ebh_invoice_queue")
        .update({
          status: result.duplicate
            ? "duplicate"
            : result.lines.some((l: any) => l.status === "review")
              ? "review"
              : "processed",
          invoice_number: invoice.invoiceNumber,
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", item.id),
    );
  return { invoice: invoice.invoiceNumber, ...result };
}
const permanentErrors =
  /credit_memo|unsupported_document|currency_not_confirmed|wrong_account_or_branch|invoice_header_missing|mixed_documents|invalid_invoice_date|incomplete_pages|invoice_totals_missing|unknown_pricing_unit|non_purchase_line|line_arithmetic_mismatch|cost_below_catalog_precision|unparsed_item_row|incomplete_lines|non_material_charge|subtotal_mismatch|invalid_invoice|invoice_content_changed|pdf_too_large|too_many_pages/;
Deno.serve(async (req) => {
  const headers = { "Content-Type": "application/json" };
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const supplied = req.headers.get("x-ebh-secret") ?? "";
  const secret = Deno.env.get("EBH_IMPORT_SECRET");
  if (!secret || supplied !== secret)
    return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const dry = body.dryRun === true;
  let cfg: any;
  let lease = crypto.randomUUID();
  const started = Date.now();
  try {
    cfg = await check(
      db.from("ebh_price_sync").select("*").eq("org_id", body.orgId).single(),
    );
    if (!cfg.enabled)
      return new Response(JSON.stringify({ disabled: true }), { headers });
    if (
      !(await check(
        db.rpc("ebh_claim_sync", { p_org: cfg.org_id, p_lease: lease }),
      ))
    )
      return new Response(JSON.stringify({ busy: true }), { headers });
    const token = await gmailToken(cfg);
    const scanned = body.queueOnly === true ? 0 : await scan(cfg, token);
    const pending = await check(
      db
        .from("ebh_invoice_queue")
        .select("*")
        .eq("org_id", cfg.org_id)
        .in("status", ["pending", "retry"])
        .order("received_at", { ascending: false })
        .order("id")
        .limit(4),
    );
    const results = [];
    for (const item of pending) {
      if (Date.now() - started > 95000) break;
      try {
        results.push(await processItem(item, cfg, token, dry));
      } catch (e) {
        const reason = e instanceof Error ? e.message : "processing_error";
        const terminal = permanentErrors.test(reason);
        const status =
          reason === "credit_memo"
            ? "skipped"
            : terminal || item.attempts >= 2
              ? "review"
              : "retry";
        if (!dry)
          await check(
            db
              .from("ebh_invoice_queue")
              .update({
                status,
                error: reason.slice(0, 250),
                attempts: item.attempts + 1,
                processed_at: new Date().toISOString(),
              })
              .eq("id", item.id),
          );
        results.push({
          file: item.file_name,
          status: dry ? "preview_review" : status,
          reason,
        });
      }
    }
    await check(
      db
        .from("ebh_price_sync")
        .update({
          last_completed_at: new Date().toISOString(),
          last_error: null,
          lease_until: null,
          lease_id: null,
        })
        .eq("org_id", cfg.org_id)
        .eq("lease_id", lease),
    );
    return new Response(JSON.stringify({ dryRun: dry, scanned, results }), {
      headers,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "import_failed";
    if (cfg)
      await db
        .from("ebh_price_sync")
        .update({
          last_error: error.slice(0, 250),
          lease_until: null,
          lease_id: null,
        })
        .eq("org_id", cfg.org_id)
        .eq("lease_id", lease);
    return new Response(JSON.stringify({ error }), { status: 500, headers });
  }
});
