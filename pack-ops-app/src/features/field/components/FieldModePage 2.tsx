import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { WorkbenchJobCard } from "@/services/workbench/workbench-service";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";
import { useSchedulingSlice } from "@/features/scheduling/hooks/use-scheduling-slice";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { CatalogItem } from "@/domain/materials/types";
import {
  badgeStyle,
  brand,
  cardStyle,
  chipStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  softCardStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";

const RECENT_JOBS_STORAGE_KEY = "pack-ops-field-recent-jobs";

type FieldSection = "info" | "notes" | "attachments" | "needed" | "used" | "timer";

function toDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toDayKey(date);
}

function startOfWeek(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const currentDay = date.getDay();
  const offset = currentDay === 0 ? -6 : 1 - currentDay;
  date.setDate(date.getDate() + offset);
  return toDayKey(date);
}

function endOfWeek(day: string): string {
  return addDays(startOfWeek(day), 6);
}

function toScheduleRangeIso(day: string, end = false): string {
  return `${day}T${end ? "23:59:59" : "00:00:00"}.000Z`;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `$${value.toFixed(2)}`;
}

function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(2)}h`;
}

function buildJobSearchText(jobCard: WorkbenchJobCard): string {
  const job = jobCard.job;
  return [
    job.number,
    job.title,
    job.fieldName ?? "",
    job.description ?? "",
    jobCard.contactName ?? "",
    jobCard.contactSubtitle ?? "",
    job.addressLine1 ?? "",
    job.addressLine2 ?? "",
    job.city ?? "",
    job.region ?? "",
    job.postalCode ?? "",
    ...(job.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section style={cardStyle()}>
      <button
        type="button"
        onClick={props.onToggle}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          border: "none",
          background: "transparent",
          padding: 0,
          textAlign: "left",
          color: brand.text,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ ...sectionTitleStyle(), fontSize: "18px" }}>{props.title}</h3>
          {props.subtitle ? (
            <p style={{ margin: "4px 0 0", color: brand.textMuted, fontSize: "13px", overflowWrap: "anywhere" }}>
              {props.subtitle}
            </p>
          ) : null}
        </div>
        <span style={{ ...chipStyle(props.isOpen), minHeight: "36px", padding: "8px 12px", fontSize: "12px" }}>
          {props.isOpen ? "Hide" : "Open"}
        </span>
      </button>
      {props.isOpen ? <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>{props.children}</div> : null}
    </section>
  );
}

export function FieldModePage() {
  const { currentUser } = useAuthContext();
  const today = useMemo(() => toDayKey(), []);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekEnd = useMemo(() => endOfWeek(today), [today]);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recentJobIds, setRecentJobIds] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState<Record<FieldSection, boolean>>({
    info: true,
    notes: false,
    attachments: false,
    needed: false,
    used: true,
    timer: true,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [usedMaterialDraft, setUsedMaterialDraft] = useState({
    materialId: "",
    quantity: "1",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  if (!currentUser) {
    return null;
  }

  const workbench = useWorkbenchSlice(currentUser, {
    selectedJobId,
    activeTab: "actuals",
  });
  const scheduling = useSchedulingSlice(currentUser, {
    weekStartIso: toScheduleRangeIso(weekStart),
    weekEndIso: toScheduleRangeIso(weekEnd, true),
  });

  const jobCards = workbench.jobsQuery.data ?? [];
  const selectedJobCard = jobCards.find((card) => card.job.id === selectedJobId) ?? null;
  const jobWorkspace = workbench.jobWorkspaceQuery.data ?? null;
  const canManageSchedule = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const catalogItems = useMemo<CatalogItem[]>(
    () =>
      (jobWorkspace?.materialCatalogOptions ?? []).map((item) => ({
        id: item.id,
        orgId: currentUser.user.orgId,
        name: item.name,
        sku: item.sku,
        aliases: item.aliases,
        unit: item.unit,
        costPrice: item.costPrice,
        unitPrice: item.unitPrice,
        category: item.category,
        notes: item.notes,
        isActive: true,
        createdBy: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      })),
    [currentUser.user.orgId, jobWorkspace?.materialCatalogOptions],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_JOBS_STORAGE_KEY) ?? "[]");
      if (Array.isArray(parsed)) {
        setRecentJobIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setRecentJobIds([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedJobId || typeof window === "undefined") {
      return;
    }

    setRecentJobIds((current) => {
      const next = [selectedJobId, ...current.filter((value) => value !== selectedJobId)].slice(0, 6);
      window.localStorage.setItem(RECENT_JOBS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [selectedJobId]);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) {
      return jobCards;
    }
    const normalized = jobSearch.trim().toLowerCase();
    return jobCards.filter((jobCard) => buildJobSearchText(jobCard).includes(normalized));
  }, [jobCards, jobSearch]);

  const recentJobs = useMemo(
    () => recentJobIds.map((jobId) => jobCards.find((card) => card.job.id === jobId)).filter(Boolean) as WorkbenchJobCard[],
    [jobCards, recentJobIds],
  );

  const upcomingBlocks = scheduling.upcomingBlocksQuery.data ?? [];
  const todayBlocks = upcomingBlocks.filter((entry) => entry.block.startAt.slice(0, 10) === today);
  const tomorrowBlocks = upcomingBlocks.filter((entry) => entry.block.startAt.slice(0, 10) === tomorrow);
  const laterThisWeekBlocks = upcomingBlocks.filter((entry) => {
    const day = entry.block.startAt.slice(0, 10);
    return day !== today && day !== tomorrow;
  });

  const selectedAssignments = selectedJobCard?.assignments ?? [];
  const selectedCrewNames = selectedAssignments.map((assignment) => {
    const user = scheduling.assignableUsersQuery.data?.find((option) => option.id === assignment.userId);
    return user?.label ?? "Crew";
  });
  const selectedNeededMaterials = jobWorkspace?.neededMaterials ?? [];
  const selectedUsedMaterials = jobWorkspace?.usedMaterials ?? [];
  const selectedTimeEntries = jobWorkspace?.timeEntries ?? [];
  const selectedPerformance = jobWorkspace?.performance ?? null;
  const runningJobId = workbench.activeRunningTimerDraft?.jobId ?? null;
  const runningJob = runningJobId ? jobCards.find((card) => card.job.id === runningJobId) ?? null : null;

  async function handleAddUsedMaterial() {
    if (!selectedJobCard || !usedMaterialDraft.materialId) {
      return;
    }

    const quantity = Number(usedMaterialDraft.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const item = catalogItems.find((entry) => entry.id === usedMaterialDraft.materialId);
    await workbench.createJobMaterial.mutateAsync({
      jobId: selectedJobCard.job.id,
      catalogItemId: usedMaterialDraft.materialId,
      kind: "used",
      quantity,
      displayName: item?.name ?? null,
      skuSnapshot: item?.sku ?? null,
      unitSnapshot: item?.unit ?? null,
      unitCost: item?.costPrice ?? null,
      unitSell: item?.unitPrice ?? null,
      markupPercent: null,
    });
    setUsedMaterialDraft({ materialId: "", quantity: "1" });
  }

  async function handleAddNote() {
    if (!selectedJobCard || !noteDraft.trim()) {
      return;
    }
    await workbench.addJobNote.mutateAsync({ jobId: selectedJobCard.job.id, body: noteDraft.trim() });
    setNoteDraft("");
  }

  async function handleUploadAttachment(file: File | null) {
    if (!selectedJobCard || !file) {
      return;
    }
    await workbench.uploadJobAttachment.mutateAsync({ jobId: selectedJobCard.job.id, file });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleAutoFillNextAvailable(jobCard: { job: WorkbenchJobCard["job"] }) {
    await scheduling.autoFillScheduleBlocks.mutateAsync({
      jobId: jobCard.job.id,
      day: today,
      findNextAvailable: true,
      clearExisting: false,
      assumeDefaultDayWhenNoEstimate: !jobCard.job.estimatedHours,
      notes: !jobCard.job.estimatedHours ? "No estimate set — defaulted to one workday." : null,
    });
  }

  function toggleSection(section: FieldSection) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  const scheduleCards = (
    <div style={{ display: "grid", gap: "12px" }}>
      {[
        { label: "Today", entries: todayBlocks },
        { label: "Tomorrow", entries: tomorrowBlocks },
        { label: "This Week", entries: laterThisWeekBlocks },
      ].map((group) => (
        <section key={group.label} style={cardStyle()}>
          <div style={{ ...pageHeaderStyle(), marginBottom: "12px" }}>
            <div>
              <h3 style={{ ...sectionTitleStyle(), fontSize: "18px" }}>{group.label}</h3>
              <p style={{ margin: "4px 0 0", color: brand.textMuted, fontSize: "13px" }}>
                {group.entries.length === 0 ? "No scheduled work." : `${group.entries.length} scheduled job${group.entries.length === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {group.entries.length === 0 ? (
              <div style={softCardStyle()}>Nothing scheduled here yet.</div>
            ) : (
              group.entries.map((entry) => (
                <button
                  key={entry.block.id}
                  type="button"
                  onClick={() => setSelectedJobId(entry.job.id)}
                  style={{
                    ...softCardStyle(),
                    textAlign: "left",
                    border: `1px solid ${brand.border}`,
                    minWidth: 0,
                  }}
                >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong style={{ fontSize: "16px", overflowWrap: "anywhere" }}>
                        {entry.job.number} · {entry.job.title}
                      </strong>
                      {entry.job.fieldName ? (
                        <span style={{ color: brand.primaryDark, fontSize: "13px", fontWeight: 700, overflowWrap: "anywhere" }}>
                          {entry.job.fieldName}
                        </span>
                      ) : null}
                      <span style={{ color: brand.textMuted, fontSize: "13px", overflowWrap: "anywhere" }}>
                        {entry.assignments.length > 0 ? `${entry.assignments.length} assigned` : "No crew assigned"}
                      </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      ))}

      {canManageSchedule ? (
        <section style={cardStyle()}>
          <div style={{ ...pageHeaderStyle(), marginBottom: "12px" }}>
            <div>
              <h3 style={{ ...sectionTitleStyle(), fontSize: "18px" }}>Unscheduled Jobs</h3>
              <p style={{ margin: "4px 0 0", color: brand.textMuted, fontSize: "13px" }}>
                Use next available auto-fill without leaving Field Mode.
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {(scheduling.unscheduledJobsQuery.data ?? []).slice(0, 6).map((entry) => (
              <div key={entry.job.id} style={softCardStyle()}>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: "16px", overflowWrap: "anywhere" }}>
                      {entry.job.number} · {entry.job.title}
                    </strong>
                    {entry.job.fieldName ? (
                      <span style={{ display: "block", color: brand.primaryDark, fontSize: "13px", fontWeight: 700, overflowWrap: "anywhere" }}>
                        {entry.job.fieldName}
                      </span>
                    ) : null}
                    <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                      {entry.assignments.length} crew · {entry.job.estimatedHours ? formatHours(entry.job.estimatedHours) : "No estimated time set"}
                    </span>
                  </div>
                  {!entry.job.estimatedHours ? (
                    <div style={{ ...badgeStyle("#fff7ed", "#9a3412"), display: "inline-flex", width: "fit-content" }}>
                      No estimated time set — schedule as 1 day?
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <button
                      type="button"
                      style={primaryButtonStyle()}
                      disabled={scheduling.autoFillScheduleBlocks.isPending}
                      onClick={() => void handleAutoFillNextAvailable(entry)}
                    >
                      Auto-fill Next Available
                    </button>
                    <button type="button" style={secondaryButtonStyle()} onClick={() => setSelectedJobId(entry.job.id)}>
                      Open Job
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        ...pageStyle(),
        padding: "16px",
        maxWidth: "760px",
        margin: "0 auto",
        display: "grid",
        gap: "16px",
      }}
    >
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={{ ...titleStyle(), fontSize: "28px" }}>Field Mode</h1>
          <p style={{ ...subtitleStyle(), maxWidth: "42ch" }}>
            Fast job access, simple schedule view, quick materials, and timer control on the same Pack Ops data.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span style={chipStyle(Boolean(workbench.activeRunningTimerDraft))}>
            {workbench.activeRunningTimerDraft ? "Timer Running" : "No Timer"}
          </span>
          <span style={chipStyle(false)}>{workbench.syncStatus}</span>
        </div>
      </header>

      {workbench.feedback ? (
        <div
          style={{
            ...softCardStyle(),
            borderColor:
              workbench.feedback.tone === "error"
                ? "#fecaca"
                : workbench.feedback.tone === "success"
                  ? "#bbf7d0"
                  : "#bfdbfe",
            color:
              workbench.feedback.tone === "error"
                ? "#991b1b"
                : workbench.feedback.tone === "success"
                  ? "#166534"
                  : "#1d4ed8",
          }}
        >
          {workbench.feedback.text}
        </div>
      ) : null}

      {!selectedJobCard ? null : (
        <section style={cardStyle()}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ fontSize: "18px", overflowWrap: "anywhere" }}>
                    {selectedJobCard.job.number} · {selectedJobCard.job.title}
                  </strong>
                  {selectedJobCard.job.fieldName ? (
                    <span style={badgeStyle("#e7f5f2", "#0a4f45")}>{selectedJobCard.job.fieldName}</span>
                  ) : null}
                  <span style={badgeStyle("#eef4ff", "#163fcb")}>{selectedJobCard.job.status.replaceAll("_", " ")}</span>
                </div>
                <p style={{ margin: "6px 0 0", color: brand.textMuted, fontSize: "14px", overflowWrap: "anywhere" }}>
                  {selectedJobCard.contactName ?? "No customer linked"}
                  {selectedJobCard.contactSubtitle ? ` · ${selectedJobCard.contactSubtitle}` : ""}
                </p>
              </div>
              <button type="button" style={secondaryButtonStyle()} onClick={() => setSelectedJobId(null)}>
                Back to Field Home
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                style={primaryButtonStyle()}
                onClick={() =>
                  runningJobId === selectedJobCard.job.id
                    ? void workbench.stopTimer()
                    : void workbench.startTimer(selectedJobCard.job.id)
                }
              >
                {runningJobId === selectedJobCard.job.id ? "Stop Timer" : "Start Timer"}
              </button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => noteInputRef.current?.focus()}>
                Add Note
              </button>
              <button type="button" style={secondaryButtonStyle()} onClick={() => fileInputRef.current?.click()}>
                Add Attachment
              </button>
              <button
                type="button"
                style={secondaryButtonStyle()}
                onClick={() => toggleSection("used")}
              >
                Add Material Used
              </button>
            </div>
          </div>
        </section>
      )}

      {!selectedJobCard ? (
        <>
          <section style={cardStyle()}>
            <div style={{ display: "grid", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700 }}>Search Jobs</span>
                <input
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                  placeholder="Job name, customer, address, number, nickname"
                  style={{ fontSize: "16px", padding: "14px", borderRadius: "14px", border: `1px solid ${brand.border}` }}
                />
              </label>
              <div style={{ display: "grid", gap: "10px" }}>
                {filteredJobs.slice(0, 10).map((jobCard) => (
                  <button
                    key={jobCard.job.id}
                    type="button"
                    onClick={() => setSelectedJobId(jobCard.job.id)}
                    style={{
                      ...softCardStyle(),
                      textAlign: "left",
                      border: `1px solid ${brand.border}`,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong style={{ fontSize: "16px", overflowWrap: "anywhere" }}>
                        {jobCard.job.number} · {jobCard.job.title}
                      </strong>
                      {jobCard.job.fieldName ? (
                        <span style={{ color: brand.primaryDark, fontSize: "13px", fontWeight: 700, overflowWrap: "anywhere" }}>
                          {jobCard.job.fieldName}
                        </span>
                      ) : null}
                      <span style={{ color: brand.textMuted, overflowWrap: "anywhere" }}>
                        {jobCard.contactName ?? "No customer"} · {jobCard.job.addressLine1 ?? jobCard.job.city ?? "No address"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {recentJobs.length > 0 ? (
            <section style={cardStyle()}>
              <h2 style={{ ...sectionTitleStyle(), fontSize: "18px", marginBottom: "12px" }}>Recently Opened</h2>
              <div style={{ display: "grid", gap: "10px" }}>
                {recentJobs.map((jobCard) => (
                  <button
                    key={jobCard.job.id}
                    type="button"
                    onClick={() => setSelectedJobId(jobCard.job.id)}
                    style={{ ...softCardStyle(), textAlign: "left", border: `1px solid ${brand.border}` }}
                  >
                    <strong style={{ display: "block", overflowWrap: "anywhere" }}>{jobCard.job.title}</strong>
                    {jobCard.job.fieldName ? (
                      <span style={{ display: "block", color: brand.primaryDark, fontSize: "13px", fontWeight: 700, overflowWrap: "anywhere" }}>
                        {jobCard.job.fieldName}
                      </span>
                    ) : null}
                    <span style={{ color: brand.textMuted, fontSize: "13px" }}>{jobCard.contactName ?? jobCard.job.number}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {runningJob ? (
            <section style={cardStyle()}>
              <div style={{ display: "grid", gap: "10px" }}>
                <h2 style={{ ...sectionTitleStyle(), fontSize: "18px" }}>Quick Timer</h2>
                <div style={{ ...softCardStyle(), display: "grid", gap: "6px" }}>
                  <strong style={{ overflowWrap: "anywhere" }}>
                    {runningJob.job.number} · {runningJob.job.title}
                  </strong>
                  <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                    Started {new Date(workbench.activeRunningTimerDraft?.startedAt ?? "").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <button type="button" style={primaryButtonStyle()} onClick={() => void workbench.stopTimer()}>
                    Stop Timer
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {scheduleCards}
        </>
      ) : (
        <>
          <SectionCard
            title="Info"
            subtitle="Customer, address, crew, estimate, and current performance snapshot."
            isOpen={openSections.info}
            onToggle={() => toggleSection("info")}
          >
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ ...softCardStyle(), display: "grid", gap: "6px" }}>
                <strong>Customer</strong>
                <span style={{ color: brand.textMuted, overflowWrap: "anywhere" }}>{selectedJobCard.contactName ?? "No customer linked"}</span>
              </div>
              <div style={{ ...softCardStyle(), display: "grid", gap: "6px" }}>
                <strong>Address</strong>
                <span style={{ color: brand.textMuted, overflowWrap: "anywhere" }}>
                  {[selectedJobCard.job.addressLine1, selectedJobCard.job.addressLine2, selectedJobCard.job.city, selectedJobCard.job.region, selectedJobCard.job.postalCode]
                    .filter(Boolean)
                    .join(", ") || "No address added"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                <div style={softCardStyle()}>
                  <strong style={{ display: "block" }}>Assigned Crew</strong>
                  <span style={{ color: brand.textMuted }}>{selectedCrewNames.join(", ") || "No crew assigned"}</span>
                </div>
                <div style={softCardStyle()}>
                  <strong style={{ display: "block" }}>Estimated Hours</strong>
                  <span style={{ color: brand.textMuted }}>{formatHours(selectedJobCard.job.estimatedHours)}</span>
                </div>
                <div style={softCardStyle()}>
                  <strong style={{ display: "block" }}>Actual Cost</strong>
                  <span style={{ color: brand.textMuted }}>{formatMoney(selectedPerformance?.totalActualCost ?? null)}</span>
                </div>
              </div>
              {canManageSchedule ? (
                <div style={{ ...softCardStyle(), display: "grid", gap: "10px" }}>
                  <strong>Quick Scheduling</strong>
                  <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                    {!selectedJobCard.job.estimatedHours
                      ? "No estimated time set — schedule as 1 day?"
                      : "Use next available auto-fill from the field."}
                  </span>
                  <button
                    type="button"
                    style={primaryButtonStyle()}
                    disabled={scheduling.autoFillScheduleBlocks.isPending}
                    onClick={() => void handleAutoFillNextAvailable(selectedJobCard)}
                  >
                    Auto-fill Next Available
                  </button>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Notes"
            subtitle="Quick field notes for the active job."
            isOpen={openSections.notes}
            onToggle={() => toggleSection("notes")}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700 }}>New Note</span>
              <textarea
                ref={noteInputRef}
                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                style={{ fontSize: "16px", padding: "12px", borderRadius: "14px", border: `1px solid ${brand.border}` }}
              />
            </label>
            <button type="button" style={primaryButtonStyle()} onClick={() => void handleAddNote()} disabled={!noteDraft.trim()}>
              Save Note
            </button>
            <div style={{ display: "grid", gap: "10px" }}>
              {(jobWorkspace?.notes ?? []).slice(0, 8).map((note) => (
                <div key={note.id} style={softCardStyle()}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.body}</p>
                  <span style={{ color: brand.textMuted, fontSize: "12px" }}>
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Attachments"
            subtitle="Photos, PDFs, and field docs for this job."
            isOpen={openSections.attachments}
            onToggle={() => toggleSection("attachments")}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => void handleUploadAttachment(event.target.files?.[0] ?? null)}
            />
            <button type="button" style={primaryButtonStyle()} onClick={() => fileInputRef.current?.click()}>
              Upload Attachment
            </button>
            <div style={{ display: "grid", gap: "10px" }}>
              {(jobWorkspace?.attachments ?? []).length === 0 ? (
                <div style={softCardStyle()}>No attachments yet.</div>
              ) : (
                (jobWorkspace?.attachments ?? []).map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => void workbench.openAttachment(attachment.storagePath).then((url) => window.open(url, "_blank"))}
                    style={{ ...softCardStyle(), textAlign: "left", border: `1px solid ${brand.border}` }}
                  >
                    <strong style={{ display: "block", overflowWrap: "anywhere" }}>{attachment.fileName}</strong>
                    <span style={{ color: brand.textMuted, fontSize: "12px" }}>
                      {new Date(attachment.createdAt).toLocaleString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Material Needed"
            subtitle="Front-and-center pick list for the crew."
            isOpen={openSections.needed}
            onToggle={() => toggleSection("needed")}
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                style={primaryButtonStyle()}
                onClick={() => void workbench.clearNeededMaterials.mutateAsync(selectedJobCard.job.id)}
                disabled={selectedNeededMaterials.length === 0 || workbench.clearNeededMaterials.isPending}
              >
                Mark All Picked Up
              </button>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              {selectedNeededMaterials.length === 0 ? (
                <div style={softCardStyle()}>No materials needed right now.</div>
              ) : (
                selectedNeededMaterials.map((material) => (
                  <div key={material.id} style={softCardStyle()}>
                    <strong style={{ display: "block", overflowWrap: "anywhere" }}>
                      {material.displayName ?? material.materialName}
                    </strong>
                    <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                      {material.quantity} {material.unitSnapshot ?? material.materialUnit}
                    </span>
                    {material.note ? (
                      <p style={{ margin: "6px 0 0", color: brand.textMuted, fontSize: "13px", overflowWrap: "anywhere" }}>
                        {material.note}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Material Used"
            subtitle="Search item → quantity → save."
            isOpen={openSections.used}
            onToggle={() => toggleSection("used")}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700 }}>Material</span>
              <MaterialSearchSelect
                catalogItems={catalogItems}
                selectedMaterialId={usedMaterialDraft.materialId}
                isPending={workbench.createJobMaterial.isPending}
                placeholder="Search materials or nicknames"
                onSelect={(materialId) => setUsedMaterialDraft((current) => ({ ...current, materialId }))}
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700 }}>Quantity</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={usedMaterialDraft.quantity}
                onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
                style={{ fontSize: "16px", padding: "12px", borderRadius: "14px", border: `1px solid ${brand.border}` }}
              />
            </label>
            <button
              type="button"
              style={primaryButtonStyle()}
              disabled={!usedMaterialDraft.materialId || workbench.createJobMaterial.isPending}
              onClick={() => void handleAddUsedMaterial()}
            >
              Add Material Used
            </button>
            <div style={{ display: "grid", gap: "10px" }}>
              {selectedUsedMaterials.length === 0 ? (
                <div style={softCardStyle()}>No actual materials used yet.</div>
              ) : (
                selectedUsedMaterials.map((material: JobMaterialView) => (
                  <div key={material.id} style={softCardStyle()}>
                    <strong style={{ display: "block", overflowWrap: "anywhere" }}>
                      {material.displayName ?? material.materialName}
                    </strong>
                    <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                      {material.quantity} {material.unitSnapshot ?? material.materialUnit} · {formatMoney((material.unitCost ?? material.currentCatalogCost ?? 0) * material.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Timer"
            subtitle="Fast job timer without leaving the page."
            isOpen={openSections.timer}
            onToggle={() => toggleSection("timer")}
          >
            <div style={{ display: "grid", gap: "10px" }}>
              <button
                type="button"
                style={primaryButtonStyle()}
                onClick={() =>
                  runningJobId === selectedJobCard.job.id
                    ? void workbench.stopTimer()
                    : void workbench.startTimer(selectedJobCard.job.id)
                }
              >
                {runningJobId === selectedJobCard.job.id ? "Stop Timer" : "Start Timer"}
              </button>
              {runningJob ? (
                <div style={softCardStyle()}>
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>
                    Running on {runningJob.job.number} · {runningJob.job.title}
                  </strong>
                  <span style={{ color: brand.textMuted, fontSize: "13px" }}>
                    {workbench.activeRunningTimerDraft?.description || "On-site work"}
                  </span>
                </div>
              ) : null}
              {selectedTimeEntries.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {selectedTimeEntries.slice(0, 5).map((entry) => (
                    <div key={entry.id} style={softCardStyle()}>
                      <strong style={{ display: "block" }}>{formatHours(entry.hours)}</strong>
                      <span style={{ color: brand.textMuted, fontSize: "13px", overflowWrap: "anywhere" }}>
                        {entry.description ?? "Field labour"} · {entry.workDate}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {workbench.activeTimersQuery.data && workbench.activeTimersQuery.data.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  <strong>Currently clocked in</strong>
                  {workbench.activeTimersQuery.data.map((timer) => (
                    <div key={timer.timerId} style={softCardStyle()}>
                      <strong style={{ display: "block" }}>{timer.userName}</strong>
                      <span style={{ color: brand.textMuted, fontSize: "13px", overflowWrap: "anywhere" }}>
                        {timer.jobNumber} · {timer.jobTitle}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
