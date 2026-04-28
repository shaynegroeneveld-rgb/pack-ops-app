import { useEffect, useState } from "react";

import type { QuoteView } from "@/domain/quotes/types";

export interface QuoteEditorDraft {
  quoteId?: QuoteView["id"];
  title: string;
  customerName: string;
  contactName: string;
  phone: string;
  email: string;
  description: string;
  notes: string;
  subtotal: string;
  taxRate: string;
  status: QuoteView["status"];
  expiresAt: string;
}

interface QuoteEditorPanelProps {
  initialDraft: QuoteEditorDraft | null;
  isPending: boolean;
  onSubmit: (draft: QuoteEditorDraft) => Promise<void>;
  onAccept?: (draft: QuoteEditorDraft) => Promise<void>;
  onCreateJob?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onClose: () => void;
}

function getStatusActions(status: QuoteView["status"]): Array<{ label: string; nextStatus: QuoteView["status"] }> {
  switch (status) {
    case "draft":
      return [
        { label: "Mark as Sent", nextStatus: "sent" },
        { label: "Mark as Accepted", nextStatus: "accepted" },
      ];
    case "sent":
    case "viewed":
      return [
        { label: "Mark as Accepted", nextStatus: "accepted" },
        { label: "Mark as Rejected", nextStatus: "rejected" },
      ];
    case "rejected":
    case "expired":
      return [{ label: "Move Back to Draft", nextStatus: "draft" }];
    case "accepted":
      return [];
  }
}

export function QuoteEditorPanel({
  initialDraft,
  isPending,
  onSubmit,
  onAccept,
  onCreateJob,
  onArchive,
  onClose,
}: QuoteEditorPanelProps) {
  const [draft, setDraft] = useState<QuoteEditorDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!draft) {
    return null;
  }

  const statusActions = getStatusActions(draft.status);
  const statusHelpText =
    draft.status === "draft"
      ? "Draft quotes must be marked Sent before they can be accepted."
      : draft.status === "accepted"
        ? "Accepted quotes are read-only for status."
        : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 32, 51, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        zIndex: 30,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "min(90vh, 860px)",
          overflow: "auto",
          border: "1px solid #d9dfeb",
          borderRadius: "18px",
          padding: "18px",
          background: "#fff",
          display: "grid",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{draft.quoteId ? "Edit Quote" : "New Quote"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Keep the first quoting flow light: project, scope starter text, amount, status, and notes.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <div
          style={{
            border: "1px solid #e4e8f1",
            borderRadius: "12px",
            background: "#f8fafc",
            padding: "12px",
            color: "#5b6475",
            fontSize: "14px",
          }}
        >
          <strong style={{ color: "#172033" }}>{draft.customerName}</strong>
          <div style={{ marginTop: "4px" }}>
            {draft.contactName}
            {draft.phone ? ` · ${draft.phone}` : ""}
            {draft.email ? ` · ${draft.email}` : ""}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Project / Site</span>
            <input
              value={draft.title}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Status</span>
            <div
              style={{
                border: "1px solid #d9dfeb",
                borderRadius: "12px",
                padding: "10px",
                background: "#f8fafc",
                display: "grid",
                gap: "8px",
              }}
            >
              <strong style={{ color: "#172033" }}>{draft.status}</strong>
              {statusActions.length > 0 ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {statusActions.map((action) => (
                    <button
                      key={action.nextStatus}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (action.nextStatus === "accepted" && onAccept) {
                          void onAccept(draft);
                          return;
                        }

                        setDraft((current) =>
                          current ? { ...current, status: action.nextStatus } : current,
                        );
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span style={{ color: "#5b6475", fontSize: "14px" }}>No further status changes here.</span>
              )}
              {statusHelpText ? <span style={{ color: "#5b6475", fontSize: "13px" }}>{statusHelpText}</span> : null}
            </div>
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Description / Scope Starter</span>
          <textarea
            rows={4}
            value={draft.description}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Notes</span>
          <textarea
            rows={3}
            value={draft.notes}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Subtotal</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.subtotal}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, subtotal: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Tax Rate</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={draft.taxRate}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, taxRate: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Expires On</span>
            <input
              type="date"
              value={draft.expiresAt}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, expiresAt: event.target.value } : current))}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onSubmit(draft)} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Saving..." : "Save Quote"}
          </button>
          {draft.quoteId && draft.status === "accepted" && onCreateJob ? (
            <button onClick={() => void onCreateJob()} disabled={isPending}>
              {isPending ? "Working..." : "Create Job"}
            </button>
          ) : null}
          {draft.quoteId && onArchive ? (
            <button onClick={() => void onArchive()} disabled={isPending} style={{ color: "#b42318" }}>
              {isPending ? "Working..." : "Archive Quote"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
