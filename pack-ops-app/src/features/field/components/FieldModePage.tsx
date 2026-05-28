import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import { getSupabaseClient } from "@/data/supabase/client";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { CatalogItem } from "@/domain/materials/types";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import { useSchedulingSlice } from "@/features/scheduling/hooks/use-scheduling-slice";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";
import type { WorkbenchJobCard } from "@/services/workbench/workbench-service";

const RECENT_JOBS_STORAGE_KEY = "pack-ops-field-recent-jobs";

const fieldColors = {
  backgroundTop: "#1f0409",
  backgroundMid: "#510b14",
  backgroundBottom: "#280509",
  card: "rgba(113, 17, 29, 0.58)",
  cardSoft: "rgba(90, 12, 22, 0.56)",
  border: "rgba(255, 183, 32, 0.28)",
  gold: "#ffb100",
  goldBright: "#ffd24a",
  goldDeep: "#d48a00",
  white: "#fff8ef",
  whiteSoft: "rgba(255, 248, 239, 0.8)",
  warningBg: "#ffb100",
  warningText: "#4b1500",
  green: "#2f8f3c",
  danger: "#ff7d66",
};

const noTimerMessagesByDay = {
  0: "Even rest day jobs need a timer.",
  1: "New week, same chance to forget your timer.",
  2: "The tools are out. Is the timer?",
  3: "Halfway through the week, somehow still forgetting timers.",
  4: "Your future invoice is quietly judging you.",
  5: "Don't donate your Friday to the customer.",
  6: "Weekend work still counts. So does the timer.",
} as const;

const weekdayLabels = [
  { label: "SUN", style: { left: "8%", top: "16%" } },
  { label: "MON", style: { right: "8%", top: "16%" } },
  { label: "TUE", style: { right: "1%", top: "40%" } },
  { label: "WED", style: { right: "8%", bottom: "18%" } },
  { label: "THU", style: { left: "50%", bottom: "2%", transform: "translateX(-50%)" } },
  { label: "FRI", style: { left: "8%", bottom: "18%" } },
  { label: "SAT", style: { left: "1%", top: "40%" } },
] as const;

type MainAccordionKey = "today" | "tomorrow" | "week" | "jobs";
type JobAccordionKey = "info" | "timer" | "notes" | "attachments" | "materials";

function buildLogoDataUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

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

function formatElapsed(startedAt: string, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatBlockTime(startAt: string, endAt: string, timeBucket: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startText = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endText = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (timeBucket === "am") {
    return `${startText}-${endText} · Morning`;
  }
  if (timeBucket === "pm") {
    return `${startText}-${endText} · Afternoon`;
  }
  return `${startText}-${endText}`;
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
  ]
    .join(" ")
    .toLowerCase();
}

function shellCardStyle(): CSSProperties {
  return {
    borderRadius: "22px",
    border: `1px solid ${fieldColors.border}`,
    background: fieldColors.card,
    boxShadow: "0 18px 44px rgba(7, 0, 3, 0.28)",
    backdropFilter: "blur(8px)",
  };
}

function softCardStyle(): CSSProperties {
  return {
    borderRadius: "18px",
    border: `1px solid rgba(255, 183, 32, 0.16)`,
    background: fieldColors.cardSoft,
  };
}

function actionButtonStyle(kind: "primary" | "secondary" = "primary"): CSSProperties {
  return {
    minHeight: "46px",
    borderRadius: "16px",
    border: `1px solid ${kind === "primary" ? fieldColors.gold : fieldColors.border}`,
    background: kind === "primary" ? fieldColors.gold : "rgba(0, 0, 0, 0.18)",
    color: kind === "primary" ? "#411104" : fieldColors.white,
    padding: "12px 16px",
    fontSize: "16px",
    fontWeight: 800,
    width: "100%",
    boxShadow: kind === "primary" ? "0 10px 24px rgba(255, 177, 0, 0.2)" : "none",
  };
}

function toggleButtonStyle(isOpen: boolean): CSSProperties {
  return {
    width: "100%",
    borderRadius: "20px",
    border: `1px solid ${fieldColors.border}`,
    background: "rgba(124, 20, 32, 0.42)",
    color: fieldColors.white,
    padding: "18px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    textAlign: "left",
    fontWeight: 800,
    fontSize: "15px",
    letterSpacing: "0.01em",
    boxShadow: isOpen ? "0 0 0 1px rgba(255, 210, 74, 0.16) inset" : "none",
  };
}

function infoLabelStyle(): CSSProperties {
  return {
    color: fieldColors.goldBright,
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    borderRadius: "16px",
    border: `1px solid rgba(255, 183, 32, 0.18)`,
    background: "rgba(20, 4, 8, 0.48)",
    color: fieldColors.white,
    padding: "14px 16px",
    fontSize: "16px",
  };
}

export function FieldModePage() {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const today = useMemo(() => toDayKey(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekEnd = useMemo(() => endOfWeek(today), [today]);
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recentJobIds, setRecentJobIds] = useState<string[]>([]);
  const [showAddJobForm, setShowAddJobForm] = useState(false);
  const [mainAccordions, setMainAccordions] = useState<Record<MainAccordionKey, boolean>>({
    today: false,
    tomorrow: false,
    week: false,
    jobs: false,
  });
  const [jobAccordions, setJobAccordions] = useState<Record<JobAccordionKey, boolean>>({
    info: false,
    timer: false,
    notes: false,
    attachments: false,
    materials: false,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [addJobDraft, setAddJobDraft] = useState({
    title: "",
    fieldName: "",
    contactName: "",
    address: "",
    description: "",
  });
  const [usedMaterialDraft, setUsedMaterialDraft] = useState({
    materialId: "",
    quantity: "1",
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const client = getSupabaseClient(import.meta.env);

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
  const jobCardById = useMemo(() => new Map(jobCards.map((card) => [String(card.job.id), card])), [jobCards]);
  const selectedJobCard = selectedJobId ? jobCardById.get(String(selectedJobId)) ?? null : null;
  const jobWorkspace = workbench.jobWorkspaceQuery.data ?? null;
  const todayMessage = noTimerMessagesByDay[new Date().getDay() as keyof typeof noTimerMessagesByDay];
  const runningDraft = workbench.activeRunningTimerDraft;
  const runningJob = runningDraft?.jobId ? jobCardById.get(String(runningDraft.jobId)) ?? null : null;
  const elapsed = runningDraft?.startedAt ? formatElapsed(runningDraft.startedAt, clockNowMs) : null;
  const selectedNeededMaterials = jobWorkspace?.neededMaterials ?? [];
  const selectedUsedMaterials = jobWorkspace?.usedMaterials ?? [];
  const selectedTimeEntries = jobWorkspace?.timeEntries ?? [];
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

  const userNamesById = useMemo(
    () => new Map((workbench.assignableUsersQuery.data ?? []).map((user) => [user.id, user.label])),
    [workbench.assignableUsersQuery.data],
  );
  const contactOptions = workbench.contactsQuery.data ?? [];

  const upcomingBlocks = scheduling.upcomingBlocksQuery.data ?? [];
  const todayBlocks = upcomingBlocks.filter((entry) => entry.block.startAt.slice(0, 10) === today);
  const tomorrowBlocks = upcomingBlocks.filter((entry) => entry.block.startAt.slice(0, 10) === tomorrow);
  const weekBlocks = upcomingBlocks.filter((entry) => {
    const day = entry.block.startAt.slice(0, 10);
    return day !== today && day !== tomorrow;
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadLogo() {
      const { data, error } = await client.from("app_settings").select("logo_b64").maybeSingle();
      if (!isActive) {
        return;
      }
      if (error) {
        console.error("[FieldModePage] logo load failed", error);
        return;
      }
      setLogoDataUrl(buildLogoDataUrl(data?.logo_b64 ?? null));
    }

    void loadLogo();
    return () => {
      isActive = false;
    };
  }, [client]);

  useEffect(() => {
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
    if (!selectedJobId) {
      return;
    }

    setRecentJobIds((current) => {
      const next = [selectedJobId, ...current.filter((value) => value !== selectedJobId)].slice(0, 6);
      window.localStorage.setItem(RECENT_JOBS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setJobAccordions({
      info: false,
      timer: false,
      notes: false,
      attachments: false,
      materials: false,
    });
  }, [selectedJobId]);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) {
      return jobCards;
    }
    return jobCards.filter((jobCard) => buildJobSearchText(jobCard).includes(jobSearch.trim().toLowerCase()));
  }, [jobCards, jobSearch]);

  const recentJobs = useMemo(
    () =>
      recentJobIds
        .map((jobId) => jobCards.find((jobCard) => jobCard.job.id === jobId))
        .filter(Boolean) as WorkbenchJobCard[],
    [jobCards, recentJobIds],
  );

  function toggleMainAccordion(key: MainAccordionKey) {
    setMainAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleJobAccordion(key: JobAccordionKey) {
    setJobAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleJobSelection(jobId: string) {
    setSelectedJobId((current) => (current === jobId ? null : jobId));
  }

  function getCrewNames(jobCard: WorkbenchJobCard): string[] {
    return jobCard.assignments.map((assignment) => userNamesById.get(assignment.userId) ?? "Crew");
  }

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
    await workbench.addJobNote.mutateAsync({
      jobId: selectedJobCard.job.id,
      body: noteDraft.trim(),
    });
    setNoteDraft("");
  }

  async function handleUploadAttachment(file: File | null) {
    if (!selectedJobCard || !file) {
      return;
    }
    await workbench.uploadJobAttachment.mutateAsync({
      jobId: selectedJobCard.job.id,
      file,
    });
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

  async function handleCreateJob() {
    const normalizedTitle = addJobDraft.title.trim();
    if (!normalizedTitle) {
      return;
    }

    const normalizedContactName = addJobDraft.contactName.trim();
    let contactId = contactOptions.find(
      (contact) =>
        contact.label.trim().toLowerCase() === normalizedContactName.toLowerCase(),
    )?.id;

    if (!contactId) {
      const contact = await workbench.createQuickContact.mutateAsync({
        displayName: normalizedContactName || normalizedTitle,
      });
      contactId = contact.id;
    }

    const createdJob = await workbench.createJob.mutateAsync({
      title: normalizedTitle,
      fieldName: addJobDraft.fieldName.trim() || null,
      addressLine1: addJobDraft.address.trim() || null,
      description: addJobDraft.description.trim(),
      contactId,
    });

    setAddJobDraft({
      title: "",
      fieldName: "",
      contactName: "",
      address: "",
      description: "",
    });
    setShowAddJobForm(false);
    setMainAccordions((current) => ({ ...current, jobs: true }));
    setSelectedJobId(String(createdJob.id));
  }

  function renderBrandHeader() {
    return (
      <header style={{ display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
          <div style={{ flex: 1, minWidth: 0, display: "grid", justifyItems: "center" }}>
            {logoDataUrl ? (
              <img
                src={logoDataUrl}
                alt="Pack Ops logo"
                style={{ width: "min(260px, 68vw)", maxWidth: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: fieldColors.gold }}>
                <div
                  style={{
                    fontSize: "58px",
                    lineHeight: 0.92,
                    fontWeight: 900,
                    letterSpacing: "-0.06em",
                    textTransform: "uppercase",
                    textShadow: "0 8px 28px rgba(0,0,0,0.38)",
                  }}
                >
                  PACK
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "28px",
                    fontWeight: 800,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                  }}
                >
                  OPS
                </div>
              </div>
            )}
            <div
              style={{
                marginTop: "6px",
                color: fieldColors.gold,
                fontWeight: 800,
                fontSize: "18px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Ryley Mode
            </div>
          </div>

          <button type="button" onClick={() => setActiveRoute(APP_ROUTES.workbench)} style={{ ...actionButtonStyle("secondary"), width: "auto", minWidth: "132px" }}>
            Back to Main Page
          </button>
        </div>
      </header>
    );
  }

  function renderTimerHero() {
    return (
      <section
        style={{
          ...shellCardStyle(),
          padding: "18px 16px 20px",
          display: "grid",
          justifyItems: "center",
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: "390px", minHeight: "300px", display: "grid", placeItems: "center" }}>
          {weekdayLabels.map((entry) => (
            <span
              key={entry.label}
              style={{
                position: "absolute",
                color: fieldColors.gold,
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                ...entry.style,
              }}
            >
              {entry.label}
            </span>
          ))}
          <div
            style={{
              width: "260px",
              height: "260px",
              borderRadius: "999px",
              border: `12px solid ${fieldColors.gold}`,
              background: "radial-gradient(circle at 50% 40%, rgba(130, 16, 33, 0.56), rgba(25, 3, 8, 0.82))",
              boxShadow: "0 0 0 6px rgba(255, 177, 0, 0.08), 0 24px 48px rgba(0,0,0,0.34)",
              display: "grid",
              placeItems: "center",
              padding: "28px",
              textAlign: "center",
            }}
          >
            {runningDraft && runningJob ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ color: fieldColors.gold, fontWeight: 800, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Timer Running
                </div>
                <strong style={{ color: fieldColors.white, fontSize: "23px", lineHeight: 1.15, overflowWrap: "anywhere" }}>
                  {runningJob.job.fieldName || runningJob.job.title}
                </strong>
                <div style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
                  {runningJob.job.number} · {runningJob.contactName ?? "No customer"}
                </div>
                <div style={{ color: fieldColors.goldBright, fontSize: "32px", fontWeight: 900, letterSpacing: "0.04em" }}>
                  {elapsed}
                </div>
                <button type="button" onClick={() => void workbench.stopTimer()} style={actionButtonStyle()}>
                  Stop Timer
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ color: fieldColors.gold, fontSize: "34px" }}>⏱</div>
                <strong style={{ color: fieldColors.white, fontSize: "22px", lineHeight: 1.15 }}>
                  Don&apos;t forget your timer!!!
                </strong>
                <div
                  style={{
                    width: "120px",
                    height: "2px",
                    background: "rgba(255, 210, 74, 0.55)",
                    justifySelf: "center",
                  }}
                />
                <div style={{ color: fieldColors.goldBright, fontSize: "18px", lineHeight: 1.35 }}>
                  {todayMessage}
                </div>
              </div>
            )}
          </div>
        </div>

        {workbench.feedback ? (
          <div
            style={{
              ...softCardStyle(),
              width: "100%",
              padding: "12px 14px",
              color:
                workbench.feedback.tone === "error"
                  ? fieldColors.danger
                  : workbench.feedback.tone === "success"
                    ? fieldColors.goldBright
                    : fieldColors.white,
            }}
          >
            {workbench.feedback.text}
          </div>
        ) : null}
      </section>
    );
  }

  function renderMainAccordion(
    key: MainAccordionKey,
    title: string,
    content: ReactNode,
    trailing?: ReactNode,
  ) {
    const isOpen = mainAccordions[key];
    return (
      <div style={{ display: "grid", gap: "10px" }}>
        <button type="button" onClick={() => toggleMainAccordion(key)} style={toggleButtonStyle(isOpen)}>
          <span style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <span style={{ fontSize: "20px" }}>{key === "jobs" ? "🧰" : "📅"}</span>
            <span>{title}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {trailing}
            <span style={{ color: fieldColors.goldBright, fontSize: "18px" }}>{isOpen ? "▾" : "▸"}</span>
          </span>
        </button>
        {isOpen ? content : null}
      </div>
    );
  }

  function renderNeededPreview(preview: WorkbenchJobCard["neededMaterialsPreview"]) {
    if (preview.length === 0) {
      return null;
    }
    return (
      <div style={{ display: "grid", gap: "8px" }}>
        {preview.map((material) => (
          <div key={material.id} style={{ ...softCardStyle(), padding: "12px 14px" }}>
            <strong style={{ display: "block", color: fieldColors.white, overflowWrap: "anywhere" }}>{material.name}</strong>
            <span style={{ color: fieldColors.goldBright, fontSize: "13px" }}>{material.quantity}</span>
            {material.note ? (
              <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", marginTop: "4px", overflowWrap: "anywhere" }}>
                {material.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  function renderScheduleJobCard(jobCard: WorkbenchJobCard, block: (typeof todayBlocks)[number]) {
    const crewNames = getCrewNames(jobCard);
    return (
      <div key={block.block.id} style={{ ...shellCardStyle(), padding: "16px", display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ color: fieldColors.white, fontSize: "20px", lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {jobCard.job.fieldName || jobCard.job.title}
          </strong>
          <div style={{ color: fieldColors.goldBright, fontSize: "13px", fontWeight: 800 }}>
            {jobCard.job.number || "No job number"}
          </div>
          <div style={{ color: fieldColors.white, fontSize: "14px", overflowWrap: "anywhere" }}>
            {jobCard.contactName ?? "No customer linked"}
          </div>
          <div style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
            {[jobCard.job.addressLine1, jobCard.job.addressLine2, jobCard.job.city, jobCard.job.region, jobCard.job.postalCode]
              .filter(Boolean)
              .join(", ") || "No address added"}
          </div>
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <span style={infoLabelStyle()}>Scheduled</span>
          <span style={{ color: fieldColors.white }}>{formatBlockTime(block.block.startAt, block.block.endAt, block.block.timeBucket)}</span>
          {crewNames.length > 0 ? (
            <>
              <span style={infoLabelStyle()}>Assigned Crew</span>
              <span style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>{crewNames.join(", ")}</span>
            </>
          ) : null}
        </div>

        {jobCard.neededMaterialsCount > 0 ? (
          <>
            <div
              style={{
                borderRadius: "14px",
                background: fieldColors.warningBg,
                color: fieldColors.warningText,
                padding: "12px 14px",
                fontWeight: 900,
                fontSize: "15px",
              }}
            >
              Material is needed — don&apos;t forget!
            </div>
            {renderNeededPreview(jobCard.neededMaterialsPreview)}
            <button
              type="button"
              style={actionButtonStyle()}
              disabled={workbench.clearNeededMaterials.isPending}
              onClick={() => void workbench.clearNeededMaterials.mutateAsync(jobCard.job.id)}
            >
              Mark materials picked up
            </button>
          </>
        ) : null}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" style={actionButtonStyle("secondary")} onClick={() => toggleJobSelection(jobCard.job.id)}>
            {selectedJobId === jobCard.job.id ? "Hide Job Details" : "Open Job"}
          </button>
        </div>
      </div>
    );
  }

  function renderSectionCard(key: JobAccordionKey, title: string, children: ReactNode) {
    const isOpen = jobAccordions[key];
    return (
      <div style={{ display: "grid", gap: "8px" }}>
        <button type="button" onClick={() => toggleJobAccordion(key)} style={toggleButtonStyle(isOpen)}>
          <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "20px" }}>
              {key === "info" ? "ℹ️" : key === "timer" ? "⏱️" : key === "notes" ? "📝" : key === "attachments" ? "📎" : "📦"}
            </span>
            <span>{title}</span>
          </span>
          <span style={{ color: fieldColors.goldBright, fontSize: "18px" }}>{isOpen ? "▾" : "▸"}</span>
        </button>
        {isOpen ? <div style={{ ...softCardStyle(), padding: "14px" }}>{children}</div> : null}
      </div>
    );
  }

  function renderSelectedJobDetails(jobCard: WorkbenchJobCard) {
    if (selectedJobId !== jobCard.job.id || !selectedJobCard || selectedJobCard.job.id !== jobCard.job.id) {
      return null;
    }

    const crewNames = getCrewNames(jobCard);

    return (
      <div style={{ ...shellCardStyle(), padding: "16px", display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ color: fieldColors.white, fontSize: "24px", lineHeight: 1.1, overflowWrap: "anywhere" }}>
            {jobCard.job.fieldName || jobCard.job.title}
          </strong>
          <div style={{ color: fieldColors.goldBright, fontSize: "14px", fontWeight: 800 }}>{jobCard.job.number}</div>
          <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>
            {[jobCard.job.addressLine1, jobCard.job.addressLine2, jobCard.job.city, jobCard.job.region, jobCard.job.postalCode]
              .filter(Boolean)
              .join(", ") || "No address added"}
          </div>
        </div>

        {selectedNeededMaterials.length > 0 ? (
          <div
            style={{
              borderRadius: "14px",
              background: fieldColors.warningBg,
              color: fieldColors.warningText,
              padding: "12px 14px",
              fontWeight: 900,
              fontSize: "15px",
            }}
          >
            Material is needed — don&apos;t forget!
          </div>
        ) : null}

        {renderSectionCard(
          "info",
          "Info",
          <div style={{ display: "grid", gap: "12px" }}>
            <div>
              <div style={infoLabelStyle()}>Customer</div>
              <div style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{jobCard.contactName ?? "No customer linked"}</div>
            </div>
            <div>
              <div style={infoLabelStyle()}>Contact</div>
              <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>{jobCard.contactSubtitle ?? "No contact details"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Assigned Crew</div>
                <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>{crewNames.join(", ") || "No crew assigned"}</div>
              </div>
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Estimated Hours</div>
                <div style={{ color: fieldColors.white }}>{formatHours(jobCard.job.estimatedHours)}</div>
              </div>
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Actual Cost</div>
                <div style={{ color: fieldColors.white }}>{formatMoney(jobWorkspace?.performance?.totalActualCost ?? null)}</div>
              </div>
            </div>
            {canManageSchedule ? (
              <button
                type="button"
                style={actionButtonStyle()}
                disabled={scheduling.autoFillScheduleBlocks.isPending}
                onClick={() => void handleAutoFillNextAvailable(jobCard)}
              >
                {jobCard.job.estimatedHours ? "Auto-fill Next Available" : "No estimated time set — schedule as 1 day?"}
              </button>
            ) : null}
          </div>,
        )}

        {renderSectionCard(
          "timer",
          "Timer",
          <div style={{ display: "grid", gap: "12px" }}>
            <button
              type="button"
              style={actionButtonStyle()}
              onClick={() =>
                runningDraft?.jobId === jobCard.job.id
                  ? void workbench.stopTimer()
                  : void workbench.startTimer(jobCard.job.id)
              }
            >
              {runningDraft?.jobId === jobCard.job.id ? "Stop Timer" : "Start Timer"}
            </button>
            {runningDraft?.jobId === jobCard.job.id && elapsed ? (
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Elapsed</div>
                <div style={{ color: fieldColors.goldBright, fontSize: "24px", fontWeight: 900 }}>{elapsed}</div>
              </div>
            ) : null}
            {selectedTimeEntries.slice(0, 4).map((entry) => (
              <div key={entry.id} style={{ ...softCardStyle(), padding: "12px" }}>
                <strong style={{ display: "block", color: fieldColors.white }}>{formatHours(entry.hours)}</strong>
                <span style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
                  {entry.description ?? "Field labour"} · {entry.workDate}
                </span>
              </div>
            ))}
          </div>,
        )}

        {renderSectionCard(
          "notes",
          "Notes",
          <div style={{ display: "grid", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={infoLabelStyle()}>New Note</span>
              <textarea
                ref={noteInputRef}
                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                style={inputStyle()}
              />
            </label>
            <button type="button" style={actionButtonStyle()} onClick={() => void handleAddNote()} disabled={!noteDraft.trim()}>
              Save Note
            </button>
            {(jobWorkspace?.notes ?? []).slice(0, 8).map((note) => (
              <div key={note.id} style={{ ...softCardStyle(), padding: "12px" }}>
                <p style={{ margin: 0, color: fieldColors.white, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {note.body}
                </p>
                <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", marginTop: "6px" }}>
                  {new Date(note.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>,
        )}

        {renderSectionCard(
          "attachments",
          "Attachments",
          <div style={{ display: "grid", gap: "12px" }}>
            <input ref={fileInputRef} type="file" hidden onChange={(event) => void handleUploadAttachment(event.target.files?.[0] ?? null)} />
            <button type="button" style={actionButtonStyle()} onClick={() => fileInputRef.current?.click()}>
              Upload Attachment
            </button>
            {(jobWorkspace?.attachments ?? []).length === 0 ? (
              <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No attachments yet.</div>
            ) : (
              (jobWorkspace?.attachments ?? []).map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => void workbench.openAttachment(attachment.storagePath).then((url) => window.open(url, "_blank"))}
                  style={{ ...softCardStyle(), padding: "12px", textAlign: "left", color: fieldColors.white }}
                >
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{attachment.fileName}</strong>
                  <span style={{ color: fieldColors.whiteSoft, fontSize: "12px" }}>
                    {new Date(attachment.createdAt).toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>,
        )}

        {renderSectionCard(
          "materials",
          "Materials",
          <div style={{ display: "grid", gap: "14px" }}>
            {selectedNeededMaterials.length > 0 ? (
              <div
                style={{
                  borderRadius: "14px",
                  background: fieldColors.warningBg,
                  color: fieldColors.warningText,
                  padding: "12px 14px",
                  fontWeight: 900,
                  fontSize: "15px",
                }}
              >
                Material is needed — don&apos;t forget!
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ color: fieldColors.white }}>Material Needed</strong>
                <button
                  type="button"
                  style={{ ...actionButtonStyle(), width: "auto", minWidth: "180px" }}
                  disabled={selectedNeededMaterials.length === 0 || workbench.clearNeededMaterials.isPending}
                  onClick={() => void workbench.clearNeededMaterials.mutateAsync(jobCard.job.id)}
                >
                  Mark all picked up
                </button>
              </div>
              {selectedNeededMaterials.length === 0 ? (
                <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No needed materials right now.</div>
              ) : (
                selectedNeededMaterials.map((material) => (
                  <div key={material.id} style={{ ...softCardStyle(), padding: "12px" }}>
                    <strong style={{ display: "block", color: fieldColors.white, overflowWrap: "anywhere" }}>
                      {material.displayName ?? material.materialName}
                    </strong>
                    <span style={{ color: fieldColors.goldBright, fontSize: "13px" }}>
                      {material.quantity} {material.unitSnapshot ?? material.materialUnit}
                    </span>
                    {material.note ? (
                      <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", marginTop: "4px", overflowWrap: "anywhere" }}>
                        {material.note}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <strong style={{ color: fieldColors.white }}>Material Used</strong>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Search Material</span>
                <MaterialSearchSelect
                  catalogItems={catalogItems}
                  selectedMaterialId={usedMaterialDraft.materialId}
                  isPending={workbench.createJobMaterial.isPending}
                  placeholder="Search materials or nicknames"
                  onSelect={(materialId) => setUsedMaterialDraft((current) => ({ ...current, materialId }))}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Quantity</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={usedMaterialDraft.quantity}
                  onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
                  style={inputStyle()}
                />
              </label>
              <button
                type="button"
                style={actionButtonStyle()}
                disabled={!usedMaterialDraft.materialId || workbench.createJobMaterial.isPending}
                onClick={() => void handleAddUsedMaterial()}
              >
                Add Material Used
              </button>
              {selectedUsedMaterials.length === 0 ? (
                <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No used materials yet.</div>
              ) : (
                selectedUsedMaterials.map((material: JobMaterialView) => (
                  <div key={material.id} style={{ ...softCardStyle(), padding: "12px" }}>
                    <strong style={{ display: "block", color: fieldColors.white, overflowWrap: "anywhere" }}>
                      {material.displayName ?? material.materialName}
                    </strong>
                    <span style={{ color: fieldColors.green, fontSize: "13px", fontWeight: 800 }}>
                      {material.quantity} {material.unitSnapshot ?? material.materialUnit}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>,
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${fieldColors.backgroundTop} 0%, ${fieldColors.backgroundMid} 48%, ${fieldColors.backgroundBottom} 100%)`,
        color: fieldColors.white,
        padding: "18px 14px 32px",
        overflowX: "hidden",
      }}
    >
      <div style={{ width: "100%", maxWidth: "760px", margin: "0 auto", display: "grid", gap: "16px", minWidth: 0 }}>
        {renderBrandHeader()}
        {renderTimerHero()}

        {renderMainAccordion(
          "today",
          "Work Scheduled For Today",
          <div style={{ display: "grid", gap: "12px" }}>
            {todayBlocks.length === 0 ? (
              <div style={{ ...softCardStyle(), padding: "14px", color: fieldColors.whiteSoft }}>Nothing scheduled for today.</div>
            ) : (
              todayBlocks.map((entry) => {
                const card = jobCardById.get(entry.job.id);
                return card ? renderScheduleJobCard(card, entry) : null;
              })
            )}
          </div>,
        )}

        {renderMainAccordion(
          "tomorrow",
          "Work Scheduled For Tomorrow",
          <div style={{ display: "grid", gap: "12px" }}>
            {tomorrowBlocks.length === 0 ? (
              <div style={{ ...softCardStyle(), padding: "14px", color: fieldColors.whiteSoft }}>Nothing scheduled for tomorrow.</div>
            ) : (
              tomorrowBlocks.map((entry) => {
                const card = jobCardById.get(entry.job.id);
                return card ? renderScheduleJobCard(card, entry) : null;
              })
            )}
          </div>,
        )}

        {renderMainAccordion(
          "week",
          "Work Scheduled This Week",
          <div style={{ display: "grid", gap: "12px" }}>
            {weekBlocks.length === 0 ? (
              <div style={{ ...softCardStyle(), padding: "14px", color: fieldColors.whiteSoft }}>Nothing else scheduled this week.</div>
            ) : (
              weekBlocks.map((entry) => {
                const card = jobCardById.get(entry.job.id);
                return card ? renderScheduleJobCard(card, entry) : null;
              })
            )}
          </div>,
        )}

        {renderMainAccordion(
          "jobs",
          "Job List",
          <div style={{ display: "grid", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={infoLabelStyle()}>Search Jobs</span>
              <input
                value={jobSearch}
                onChange={(event) => setJobSearch(event.target.value)}
                placeholder="Job title, number, customer, address, field name"
                style={inputStyle()}
              />
            </label>

            <button
              type="button"
              style={actionButtonStyle()}
              onClick={() => setShowAddJobForm((current) => !current)}
            >
              {showAddJobForm ? "Close Add Job" : "Add Job"}
            </button>

            {showAddJobForm ? (
              <div style={{ ...shellCardStyle(), padding: "16px", display: "grid", gap: "12px" }}>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Job Name / Title</span>
                  <input
                    value={addJobDraft.title}
                    onChange={(event) => setAddJobDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Required"
                    style={inputStyle()}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Field Name / Nickname</span>
                  <input
                    value={addJobDraft.fieldName}
                    onChange={(event) => setAddJobDraft((current) => ({ ...current, fieldName: event.target.value }))}
                    placeholder="Shop, Smith Reno, Lake Cabin"
                    style={inputStyle()}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Customer / Contact</span>
                  <input
                    value={addJobDraft.contactName}
                    onChange={(event) => setAddJobDraft((current) => ({ ...current, contactName: event.target.value }))}
                    placeholder="Use an existing contact or type a new one"
                    list="field-mode-contact-options"
                    style={inputStyle()}
                  />
                  <datalist id="field-mode-contact-options">
                    {contactOptions.map((contact) => (
                      <option key={contact.id} value={contact.label} />
                    ))}
                  </datalist>
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Address</span>
                  <input
                    value={addJobDraft.address}
                    onChange={(event) => setAddJobDraft((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Site address"
                    style={inputStyle()}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Notes / Description</span>
                  <textarea
                    rows={3}
                    value={addJobDraft.description}
                    onChange={(event) => setAddJobDraft((current) => ({ ...current, description: event.target.value }))}
                    style={inputStyle()}
                  />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={actionButtonStyle()}
                    disabled={!addJobDraft.title.trim() || workbench.createJob.isPending || workbench.createQuickContact.isPending}
                    onClick={() => void handleCreateJob()}
                  >
                    {workbench.createJob.isPending || workbench.createQuickContact.isPending ? "Saving..." : "Save Job"}
                  </button>
                  <button
                    type="button"
                    style={{ ...actionButtonStyle("secondary"), width: "auto", minWidth: "120px" }}
                    onClick={() => setShowAddJobForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {recentJobs.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={infoLabelStyle()}>Recently Opened</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {recentJobs.map((jobCard) => (
                    <button
                      key={jobCard.job.id}
                      type="button"
                      onClick={() => toggleJobSelection(jobCard.job.id)}
                      style={{ ...softCardStyle(), padding: "12px", textAlign: "left", color: fieldColors.white }}
                    >
                      <strong style={{ display: "block", overflowWrap: "anywhere" }}>{jobCard.job.fieldName || jobCard.job.title}</strong>
                      <span style={{ color: fieldColors.whiteSoft, fontSize: "13px" }}>{jobCard.job.number}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ ...infoLabelStyle(), justifySelf: "center" }}>Expand a job to view details</div>
              {filteredJobs.map((jobCard) => (
                <div key={jobCard.job.id} style={{ display: "grid", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => toggleJobSelection(jobCard.job.id)}
                    style={{ ...shellCardStyle(), padding: "16px", textAlign: "left", color: fieldColors.white }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong style={{ fontSize: "24px", lineHeight: 1.1, overflowWrap: "anywhere" }}>
                        {jobCard.job.fieldName || jobCard.job.title}
                      </strong>
                      <div style={{ color: fieldColors.goldBright, fontSize: "14px", fontWeight: 800 }}>{jobCard.job.number}</div>
                      <div style={{ color: fieldColors.white, fontSize: "15px", overflowWrap: "anywhere" }}>
                        {jobCard.contactName ?? "No customer linked"}
                      </div>
                      <div style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
                        {[jobCard.job.addressLine1, jobCard.job.addressLine2, jobCard.job.city, jobCard.job.region, jobCard.job.postalCode]
                          .filter(Boolean)
                          .join(", ") || "No address added"}
                      </div>
                    </div>
                  </button>
                  {renderSelectedJobDetails(jobCard)}
                </div>
              ))}
            </div>
          </div>,
        )}
      </div>
    </div>
  );
}
