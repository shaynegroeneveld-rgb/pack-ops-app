# Automatic E.B. Horsman material prices

The Supabase `ebh-price-import` function reads E.B. invoice PDFs from the existing encrypted Gmail connection. It uses a fixed, paginated 30-day initial scan, a durable attachment queue, and a two-day overlap on subsequent scans. Each invocation queues up to ten messages and processes up to twenty PDFs within its existing 95-second processing budget. The PostgreSQL job `ebh-material-prices` invokes it daily at 14:00 UTC (7 a.m. Pacific daylight time / 6 a.m. standard time); a five-minute lease prevents overlapping runs. This runs on Supabase without a browser or this computer being open.

Only `ar@ebhorsman.com` PDF attachments for the configured account and branch are eligible. The parser reconstructs text rows using PDF coordinates, validates complete page/line counts and line/subtotal arithmetic, and rejects credit memos, unknown units, unsupported layouts, and non-material charges. `C100` and `M1000` prices are divided by 100 and 1,000 respectively. Catalog cost is the before-tax unit cost × 1.12, rounded once to two decimals. No AI extraction service receives the invoices.

`ebh_apply_invoice` performs catalog matching, updates/creation, provenance and price history in a single transaction. It rechecks the live catalog under a lock. Normalized exact supplier codes are eligible; ambiguous, archived, unit-mismatched, recently manually edited, or >20% price changes are held. Similar informal wire names are also held, since many legacy wire entries use `each` rather than metres. New materials have no invented selling price. Existing names, aliases, selling prices and saved job/quote costs are preserved.

Invoice number and canonical payload provide replay protection. A changed invoice under an existing number requires review. Older invoices cannot replace newer linked costs; conflicting same-day costs require review. The first invoice is held when the catalog was edited after its date and the cost differs, because earlier manual price timestamps cannot be reconstructed reliably. Subsequent imports detect manual edits by comparing the last automatically saved cost.

Owner/office users can inspect **Materials → Price activity**, view privately stored source PDFs, find materials, use a reviewed price on a known compatible match, or keep the existing cost. Document extraction failures remain visible without changing prices. Unknown mappings and wire unit corrections should be resolved in the catalog rather than guessed.

## Operation and access

- `EBH_IMPORT_SECRET` is stored as a Supabase function secret and as `ebh_import_secret` in Supabase Vault. The scheduled SQL stores only the Vault lookup, never the secret itself.
- The function has its own shared-secret check and disables the platform JWT check. Browser users cannot invoke its privileged path. All writes use service-role-only RPCs; the review RPC separately requires the signed-in owner/office role and organization.
- `ebh_price_sync` stores enabled state, scan cursor, successful completion time, errors and lease state. `ebh_invoice_queue` stores attachment provenance and processing status. `ebh_price_receipts`, `ebh_price_history`, and `ebh_price_mappings` provide idempotency and audit data.
- A revoked/expired Gmail connection changes no prices and appears in the Materials status panel. Reconnect at Finance → Review → Document Inbox. The Google OAuth app must remain configured to permit durable offline Gmail access; Google can still revoke a grant.
- Check `cron.job_run_details` and `net._http_response` along with `ebh_price_sync`; an accepted scheduler call alone does not prove the HTTP import succeeded.
- To pause, an administrator sets the organization's `ebh_price_sync.enabled=false`. To retry a document after resolving a parser issue, set its queue status to `pending` and attempts to zero; do not delete the receipt/history records to force a replay.

## Validation

Run `npm test`, `npm run test:ebh-db`, `npm run typecheck`, and `npm run build`. Database tests run in disposable PGlite, never against production. Real invoice checks include multi-page, per-hundred, and per-thousand-metre PDFs. Source fixtures and the pre-import catalog backup are held outside the repository because they contain customer data.

Production frontend deployment is **GitHub main → Cloudflare Pages**. Do not use the legacy `npm run deploy`, which targets a separate Worker. Backend changes deploy with the Supabase CLI. Apply migrations before the frontend.
