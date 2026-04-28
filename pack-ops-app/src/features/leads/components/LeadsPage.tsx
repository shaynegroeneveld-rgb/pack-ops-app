import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import { LeadEditorPanel, type LeadEditorDraft } from "@/features/leads/components/LeadEditorPanel";
import { useLeadsSlice } from "@/features/leads/hooks/use-leads-slice";
import { useQuotesSlice } from "@/features/quotes/hooks/use-quotes-slice";
import {
  badgeStyle,
  cardStyle,
  chipStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import type { Lead } from "@/domain/leads/types";

const STATUS_OPTIONS: Array<{ value: Lead["status"] | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoting", label: "Quoting" },
  { value: "waiting", label: "Waiting" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

function toDateInputValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLeadStatusLabel(status: Lead["status"]): string {
  switch (status) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "quoting":
      return "Quoting";
    case "waiting":
      return "Waiting";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
  }
}

function getLeadStatusTone(status: Lead["status"]): { background: string; color: string } {
  switch (status) {
    case "new":
      return { background: "#eef4ff", color: "#163fcb" };
    case "contacted":
      return { background: "#f5f8ff", color: "#445168" };
    case "quoting":
      return { background: "#fff8e8", color: "#8a5a00" };
    case "waiting":
      return { background: "#fff3f0", color: "#b54708" };
    case "won":
      return { background: "#f2fbf4", color: "#1f6b37" };
    case "lost":
      return { background: "#fff4f4", color: "#b42318" };
  }
}

function createEmptyDraft(): LeadEditorDraft {
  return {
    customerName: "",
    contactName: "",
    phone: "",
    email: "",
    projectSite: "",
    description: "",
    status: "new",
    followUpAt: "",
    notes: "",
  };
}

function toDraft(lead: Lead): LeadEditorDraft {
  return {
    leadId: lead.id,
    customerName: lead.customerName,
    contactName: lead.contactName,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    projectSite: lead.projectSite,
    description: lead.description ?? "",
    status: lead.status,
    followUpAt: toDateInputValue(lead.followUpAt),
    notes: lead.notes ?? "",
  };
}

export function LeadsPage() {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const setSelectedQuoteId = useUiStore((state) => state.setSelectedQuoteId);
  const [activeStatus, setActiveStatus] = useState<Lead["status"] | "all">("all");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editorDraft, setEditorDraft] = useState<LeadEditorDraft | null>(null);

  if (!currentUser) {
    return null;
  }

  const { leadsQuery, createLead, updateLead, archiveLead } = useLeadsSlice(currentUser, {
    status: activeStatus,
  });
  const { createQuoteFromLead } = useQuotesSlice(currentUser);

  const leads = leadsQuery.data ?? [];
  const canManage = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const isPending =
    createLead.isPending || updateLead.isPending || archiveLead.isPending || createQuoteFromLead.isPending;

  async function handleSubmit(draft: LeadEditorDraft) {
    try {
      const payload = {
        customerName: draft.customerName,
        contactName: draft.contactName,
        phone: draft.phone || null,
        email: draft.email || null,
        projectSite: draft.projectSite,
        description: draft.description || null,
        status: draft.status,
        followUpAt: draft.followUpAt || null,
        notes: draft.notes || null,
      };

      if (draft.leadId) {
        await updateLead.mutateAsync({
          leadId: draft.leadId,
          ...payload,
        });
        setFeedback({ tone: "success", text: "Lead updated." });
      } else {
        await createLead.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Lead created." });
      }

      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Lead save failed.",
      });
    }
  }

  async function handleArchive() {
    if (!editorDraft?.leadId) {
      return;
    }

    try {
      await archiveLead.mutateAsync(editorDraft.leadId);
      setFeedback({ tone: "success", text: "Lead archived." });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Lead archive failed.",
      });
    }
  }

  async function handleCreateQuote(leadId: Lead["id"]) {
    try {
      const quote = await createQuoteFromLead.mutateAsync(leadId);
      setSelectedQuoteId(quote.id);
      setActiveRoute(APP_ROUTES.quotes);
      setFeedback({ tone: "success", text: "Draft quote created from lead." });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Quote creation failed.",
      });
    }
  }

  return (
    <main style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Leads</h1>
          <p style={subtitleStyle()}>
            Keep the pipeline lightweight: who it is, what the job looks like, and what needs follow-up next.
          </p>
        </div>
        {canManage ? <button onClick={() => setEditorDraft(createEmptyDraft())} style={primaryButtonStyle()}>New Lead</button> : null}
      </header>

      {feedback ? (
        <section style={feedbackStyle(feedback.tone)}>
          {feedback.text}
        </section>
      ) : null}

      <section style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {STATUS_OPTIONS.map((option) => {
          const isActive = activeStatus === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setActiveStatus(option.value)}
              style={chipStyle(isActive)}
            >
              {option.label}
            </button>
          );
        })}
      </section>

      <section style={{ display: "grid", gap: "12px" }}>
        {leadsQuery.isLoading ? <p>Loading leads...</p> : null}
        {!leadsQuery.isLoading && leads.length === 0 ? (
          <div style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5d6978" }}>
            <strong style={{ display: "block", color: "#172033", marginBottom: "6px" }}>
              No leads are showing for this filter.
            </strong>
            {canManage
              ? "Add the next incoming lead so the team has a simple pipeline to work from."
              : "Owner or office users can add and update leads here."}
          </div>
        ) : null}

        {leads.map((lead) => {
          const tone = getLeadStatusTone(lead.status);
          return (
            <article
              key={lead.id}
              style={{
                ...cardStyle("#fff"),
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{lead.customerName}</div>
                  <div style={{ color: "#5b6475", marginTop: "4px" }}>{lead.projectSite}</div>
                </div>
                <span
                  style={badgeStyle(tone.background, tone.color)}
                >
                  {getLeadStatusLabel(lead.status)}
                </span>
              </div>

              <div style={{ color: "#445168", fontSize: "15px", lineHeight: 1.45 }}>
                {lead.contactName}
                {lead.phone ? ` · ${lead.phone}` : ""}
                {lead.email ? ` · ${lead.email}` : ""}
              </div>

              {lead.description ? <div>{lead.description}</div> : null}
              {lead.notes ? <div style={{ color: "#5b6475", whiteSpace: "pre-wrap" }}>{lead.notes}</div> : null}

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#5d6978", fontSize: "14px" }}>
                <span>Follow-up: {lead.followUpAt ? toDateInputValue(lead.followUpAt) : "Not set"}</span>
                <span>Updated: {toDateInputValue(lead.updatedAt)}</span>
              </div>

              {canManage ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => setEditorDraft(toDraft(lead))} style={secondaryButtonStyle()}>Edit</button>
                  <button onClick={() => void handleCreateQuote(lead.id)} disabled={createQuoteFromLead.isPending} style={primaryButtonStyle()}>
                    {createQuoteFromLead.isPending ? "Creating Quote..." : "Create Quote"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <LeadEditorPanel
        initialDraft={editorDraft}
        isPending={isPending}
        onSubmit={handleSubmit}
        {...(editorDraft?.leadId ? { onArchive: handleArchive } : {})}
        {...(editorDraft?.leadId ? { onCreateQuote: () => handleCreateQuote(editorDraft.leadId!) } : {})}
        onClose={() => setEditorDraft(null)}
      />
    </main>
  );
}
