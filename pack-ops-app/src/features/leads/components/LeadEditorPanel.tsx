import { useEffect, useState } from "react";

import type { Lead } from "@/domain/leads/types";

export interface LeadEditorDraft {
  leadId?: Lead["id"];
  customerName: string;
  contactName: string;
  phone: string;
  email: string;
  projectSite: string;
  description: string;
  status: Lead["status"];
  followUpAt: string;
  notes: string;
}

interface LeadEditorPanelProps {
  initialDraft: LeadEditorDraft | null;
  isPending: boolean;
  onSubmit: (draft: LeadEditorDraft) => Promise<void>;
  onArchive?: () => Promise<void>;
  onCreateQuote?: () => Promise<void>;
  onClose: () => void;
}

export function LeadEditorPanel({
  initialDraft,
  isPending,
  onSubmit,
  onArchive,
  onCreateQuote,
  onClose,
}: LeadEditorPanelProps) {
  const [draft, setDraft] = useState<LeadEditorDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!draft) {
    return null;
  }

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
          maxWidth: "720px",
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
            <h3 style={{ margin: 0 }}>{draft.leadId ? "Edit Lead" : "New Lead"}</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Keep the pipeline simple: customer, contact, project, status, and next follow-up.
            </p>
          </div>
          <button onClick={onClose} disabled={isPending}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Customer / Company Name</span>
            <input
              value={draft.customerName}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, customerName: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Contact Name</span>
            <input
              value={draft.contactName}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, contactName: event.target.value } : current))}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Phone</span>
            <input
              value={draft.phone}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, phone: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Email</span>
            <input
              type="email"
              value={draft.email}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, email: event.target.value } : current))}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Project / Site</span>
            <input
              value={draft.projectSite}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, projectSite: event.target.value } : current))}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Status</span>
            <select
              value={draft.status}
              disabled={isPending}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, status: event.target.value as Lead["status"] } : current))
              }
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="quoting">Quoting</option>
              <option value="waiting">Waiting</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Short Description</span>
          <textarea
            rows={3}
            value={draft.description}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Follow-up Date</span>
            <input
              type="date"
              value={draft.followUpAt}
              disabled={isPending}
              onChange={(event) => setDraft((current) => (current ? { ...current, followUpAt: event.target.value } : current))}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Notes</span>
          <textarea
            rows={4}
            value={draft.notes}
            disabled={isPending}
            onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
          />
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => void onSubmit(draft)} disabled={isPending} style={{ fontWeight: 600 }}>
            {isPending ? "Saving..." : draft.leadId ? "Save Lead" : "Create Lead"}
          </button>
          {draft.leadId && onCreateQuote ? (
            <button onClick={() => void onCreateQuote()} disabled={isPending}>
              {isPending ? "Working..." : "Create Quote"}
            </button>
          ) : null}
          {draft.leadId && onArchive ? (
            <button onClick={() => void onArchive()} disabled={isPending} style={{ color: "#b42318" }}>
              {isPending ? "Working..." : "Archive Lead"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
