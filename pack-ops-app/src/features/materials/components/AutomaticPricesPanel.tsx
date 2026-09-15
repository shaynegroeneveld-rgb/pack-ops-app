import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/data/supabase/client";
const reasons: Record<string, string> = {
  duplicate_catalog_sku: "More than one material has this SKU.",
  unit_mismatch: "Invoice and catalog units differ.",
  catalog_edited_after_invoice: "The material was edited after this invoice.",
  manual_price_change: "A manually entered cost is being preserved.",
  price_change_over_20_percent: "Price changed by more than 20%.",
  possible_existing_material: "A similar material already exists.",
  same_day_price_conflict:
    "Different prices appear on invoices from the same day.",
  older_invoice: "A newer invoice price is already saved.",
  unknown_pricing_unit: "The supplier’s pricing unit needs checking.",
  credit_memo: "Credit memo — no price change.",
  inactive_material: "This material is inactive.",
  catalog_mapping_changed: "The linked material or SKU changed.",
};
const money = (v: number | string | null) =>
  v === null
    ? "No cost"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }).format(Number(v));
export function AutomaticPricesPanel({
  orgId,
  onFind,
}: {
  orgId: string;
  onFind: (sku: string) => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"recent" | "review">("recent");
  const [limit, setLimit] = useState(30);
  const [fileError, setFileError] = useState<string | null>(null);
  const db = getSupabaseClient(import.meta.env);
  const status = useQuery({
    queryKey: ["ebh-price-status", orgId],
    queryFn: async () => {
      const [cfg, review, waiting, documents] = await Promise.all([
        db
          .from("ebh_price_sync")
          .select("enabled,last_completed_at,last_error,last_started_at")
          .eq("org_id", orgId)
          .maybeSingle(),
        db
          .from("ebh_price_history")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "review"),
        db
          .from("ebh_invoice_queue")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("status", ["pending", "retry"]),
        db
          .from("ebh_invoice_queue")
          .select("id,file_name,error,storage_path")
          .eq("org_id", orgId)
          .eq("status", "review")
          .not("error", "is", null)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      for (const r of [cfg, review, waiting, documents])
        if (r.error) throw r.error;
      return {
        cfg: cfg.data,
        review: review.count ?? 0,
        waiting: waiting.count ?? 0,
        documents: documents.data ?? [],
      };
    },
    refetchInterval: 60000,
  });
  const history = useQuery({
    queryKey: ["ebh-price-history", orgId, view, limit],
    enabled: open,
    queryFn: async () => {
      let q = db
        .from("ebh_price_history")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(limit);
      if (view === "review") q = q.eq("status", "review");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  async function source(invoice: string) {
    setFileError(null);
    const { data, error } = await db
      .from("ebh_invoice_queue")
      .select("storage_path")
      .eq("org_id", orgId)
      .eq("invoice_number", invoice)
      .not("storage_path", "is", null)
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      setFileError("The source invoice could not be opened.");
      return;
    }
    await openPdf(data.storage_path);
  }
  async function openPdf(path: string | null) {
    if (!path) return;
    const { data, error } = await db.storage
      .from("documents")
      .createSignedUrl(path, 60);
    if (error || !data) {
      setFileError("The source invoice could not be opened.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function reviewPrice(
    row: { id: string; catalog_item_id: string | null },
    usePrice: boolean,
  ) {
    setBusy(row.id);
    setFileError(null);
    try {
      let cost: number | null = null;
      if (usePrice) {
        const { data, error } = await db
          .from("catalog_items")
          .select("cost_price")
          .eq("org_id", orgId)
          .eq("id", row.catalog_item_id)
          .single();
        if (error) throw error;
        cost = data.cost_price;
      }
      const { error } = await db.rpc("ebh_review_price", {
        p_id: row.id,
        p_use_price: usePrice,
        p_expected_cost: cost,
      });
      if (error) throw error;
      await Promise.all([
        status.refetch(),
        history.refetch(),
        queryClient.invalidateQueries({ queryKey: ["materials", "catalog"] }),
      ]);
    } catch {
      setFileError(
        "Could not apply this review. Refresh and check the material and invoice again.",
      );
    } finally {
      setBusy(null);
    }
  }
  if (status.isLoading) return null;
  if (status.error)
    return (
      <p role="status">
        Automatic price status is unavailable. Refresh to try again.
      </p>
    );
  const data = status.data;
  if (!data?.cfg) return null;
  const cfg = data.cfg;
  const stale =
    cfg.last_completed_at &&
    Date.now() - Date.parse(cfg.last_completed_at) > 2 * 3600000;
  const state = cfg.last_error?.includes("gmail_reconnect")
    ? "Reconnect Gmail in Finance → Review → Document Inbox"
    : cfg.last_error
      ? "Email price updates need attention"
      : !cfg.enabled
        ? "Automatic prices paused"
        : stale
          ? "Price checks are overdue"
          : "E.B. invoice prices · Automatic";
  return (
    <section
      aria-label="Automatic material prices"
      style={{
        border: "1px solid #d9dfeb",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong>{state}</strong>
          <div style={{ fontSize: 13, color: "#5b6475", marginTop: 4 }}>
            Supplier cost + 12% · Checks every 15 minutes ·{" "}
            {cfg.last_completed_at
              ? `Last checked ${new Date(cfg.last_completed_at).toLocaleString()}`
              : "First check pending"}
            {data.waiting ? ` · ${data.waiting} invoices queued` : ""}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          {open
            ? "Hide price activity"
            : `Price activity${data.review + data.documents.length ? ` (${data.review + data.documents.length} to review)` : ""}`}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13 }}>
            Clear SKU matches update automatically. New materials are added when
            there is no existing match. Prices are converted to each, metre or
            foot before the 12% addition. Review items have not changed your
            costs.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              aria-pressed={view === "recent"}
              onClick={() => {
                setView("recent");
                setLimit(30);
              }}
            >
              Recent activity
            </button>
            <button
              aria-pressed={view === "review"}
              onClick={() => {
                setView("review");
                setLimit(30);
              }}
            >
              Needs review ({data.review})
            </button>
            <button
              onClick={() => {
                void status.refetch();
                void history.refetch();
              }}
            >
              Refresh
            </button>
          </div>
          {fileError && <p role="alert">{fileError}</p>}
          {history.error && <p role="alert">Could not load price activity.</p>}
          {history.data?.length === 0 && (
            <p>
              {view === "review"
                ? "No material prices need review."
                : "No invoice prices have been processed yet."}
            </p>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {history.data?.map((row) => (
              <article
                key={row.id}
                style={{
                  background: "white",
                  border: "1px solid #d9dfeb",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <strong>
                  {row.supplier_sku} · {row.description}
                </strong>
                <div style={{ marginTop: 4 }}>
                  {row.status === "created"
                    ? "Added new material"
                    : row.status === "updated"
                      ? "Updated cost"
                      : row.status === "approved"
                        ? "Price approved"
                        : row.status === "dismissed"
                          ? "Kept existing cost"
                          : row.status === "unchanged"
                            ? "Cost confirmed"
                            : "Held for review"}{" "}
                  · {money(row.old_cost)} → {money(row.new_cost)} / {row.unit}
                </div>
                <div style={{ color: "#5b6475", fontSize: 13, marginTop: 4 }}>
                  Invoice {row.invoice_number} · {row.invoice_date}
                  {row.reason
                    ? ` · ${reasons[row.reason] ?? "Check the invoice and catalog before changing this price."}`
                    : ""}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onFind(row.supplier_sku);
                    }}
                  >
                    Find material
                  </button>
                  <button onClick={() => void source(row.invoice_number)}>
                    View invoice
                  </button>
                  {row.status === "review" && (
                    <>
                      {row.catalog_item_id &&
                        ![
                          "unit_mismatch",
                          "inactive_material",
                          "older_invoice",
                          "catalog_mapping_changed",
                        ].includes(row.reason ?? "") && (
                          <button
                            disabled={busy !== null}
                            onClick={() => void reviewPrice(row, true)}
                          >
                            Use {money(row.new_cost)} cost
                          </button>
                        )}
                      <button
                        disabled={busy !== null}
                        onClick={() => void reviewPrice(row, false)}
                      >
                        Keep existing cost
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {history.data?.length === limit && (
            <button
              style={{ marginTop: 10 }}
              onClick={() => setLimit(limit + 30)}
            >
              Show more price activity
            </button>
          )}
          {data.documents.length > 0 && (
            <>
              <h3>Invoices needing a check</h3>
              <p>These invoices were not used to change prices.</p>
              {data.documents.map((doc) => (
                <div key={doc.id} style={{ marginTop: 8 }}>
                  {doc.file_name} ·{" "}
                  {reasons[doc.error ?? ""] ??
                    "Invoice layout or totals need checking."}{" "}
                  {doc.storage_path && (
                    <button onClick={() => void openPdf(doc.storage_path)}>
                      View PDF
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
