import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import { getSupabaseClient } from "@/data/supabase/client";
import { getAllowedNextJobStatuses } from "@/domain/jobs/status";
import {
  deriveTimeEntryDraftElapsedLabel,
  deriveTimeEntryDraftHours,
  updateManualTimeEntryDraftHours,
  type TimeEntryDraft,
} from "@/domain/time-entries/draft";
import { useSchedulingSlice } from "@/features/scheduling/hooks/use-scheduling-slice";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";
import type { WorkbenchJobCard } from "@/services/workbench/workbench-service";

import {
  actionButtonStyle,
  addDays,
  buildLogoDataUrl,
  endOfWeek,
  fieldColors,
  formatBlockTime,
  formatElapsed,
  infoLabelStyle,
  inputStyle,
  loadRecentJobIds,
  noTimerMessagesByDay,
  shellCardStyle,
  softCardStyle,
  startOfWeek,
  storeRecentJobId,
  toDayKey,
  toScheduleRangeIso,
  toggleButtonStyle,
  weekdayLabels,
} from "./field-mode-shared";

const fieldJobRoute = (jobId: string) => `${APP_ROUTES.fieldJobs}/${jobId}`;
const MOBILE_FIELD_DESKTOP_OVERRIDE_KEY = "pack-ops-mobile-desktop-override";

type MainAccordionKey = "today" | "tomorrow" | "week" | "jobs";

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

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function FieldModePage() {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const today = useMemo(() => toDayKey(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekEnd = useMemo(() => endOfWeek(today), [today]);
  const [jobSearch, setJobSearch] = useState("");
  const [recentJobIds, setRecentJobIds] = useState<string[]>([]);
  const [showAddJobForm, setShowAddJobForm] = useState(false);
  const [showTimerStartEditor, setShowTimerStartEditor] = useState(false);
  const [timerStartDraft, setTimerStartDraft] = useState("");
  const [timerStartError, setTimerStartError] = useState<string | null>(null);
  const [mainAccordions, setMainAccordions] = useState<Record<MainAccordionKey, boolean>>({
    today: false,
    tomorrow: false,
    week: false,
    jobs: false,
  });
  const [addJobDraft, setAddJobDraft] = useState({
    title: "",
    fieldName: "",
    contactName: "",
    address: "",
    description: "",
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const client = getSupabaseClient(import.meta.env);

  if (!currentUser) {
    return null;
  }

  const workbench = useWorkbenchSlice(currentUser);
  const scheduling = useSchedulingSlice(currentUser, {
    weekStartIso: toScheduleRangeIso(weekStart),
    weekEndIso: toScheduleRangeIso(weekEnd, true),
  });

  const jobCards = workbench.jobsQuery.data ?? [];
  const jobCardById = useMemo(() => new Map(jobCards.map((card) => [String(card.job.id), card])), [jobCards]);
  const todayMessage = noTimerMessagesByDay[new Date().getDay() as keyof typeof noTimerMessagesByDay];
  const runningDraft = workbench.activeRunningTimerDraft;
  const timeEntryDraft = workbench.timeEntryDraft;
  const runningJob = runningDraft?.jobId ? jobCardById.get(String(runningDraft.jobId)) ?? null : null;
  const elapsed = runningDraft?.startedAt ? formatElapsed(runningDraft.startedAt, clockNowMs) : null;
  const contactOptions = workbench.contactsQuery.data ?? [];
  const assignableUsers = workbench.assignableUsersQuery.data ?? [];
  const userNamesById = useMemo(() => new Map(assignableUsers.map((user) => [user.id, user.label])), [assignableUsers]);
  const availableWorkerOptions = useMemo(() => {
    const currentUserOption = {
      id: String(currentUser.user.id),
      label: currentUser.user.fullName,
    };
    return assignableUsers.some((user) => user.id === currentUserOption.id)
      ? assignableUsers
      : [currentUserOption, ...assignableUsers];
  }, [assignableUsers, currentUser.user.fullName, currentUser.user.id]);
  const canManageSchedule = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const draftJobCard = timeEntryDraft?.jobId ? jobCardById.get(String(timeEntryDraft.jobId)) ?? null : null;
  const timeDraftHours = timeEntryDraft ? deriveTimeEntryDraftHours(timeEntryDraft, new Date(clockNowMs)) : null;
  const timeDraftElapsed = timeEntryDraft ? deriveTimeEntryDraftElapsedLabel(timeEntryDraft, new Date(clockNowMs)) : null;

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
      if (!isActive || error) {
        if (error) {
          console.error("[FieldModePage] logo load failed", error);
        }
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
    setRecentJobIds(loadRecentJobIds());
  }, []);

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

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const docWidth = document.documentElement.clientWidth;
      const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
        .filter((element) => element.clientWidth > 0 && element.scrollWidth - element.clientWidth > 2)
        .filter((element) => element.scrollWidth > docWidth + 2)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          text: (element.textContent ?? "").trim().slice(0, 80),
        }));

      if (offenders.length > 0) {
        console.info("[FieldModePage] mobile overflow offenders", offenders);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [mainAccordions, recentJobs.length, filteredJobs.length, showAddJobForm, showTimerStartEditor]);

  function toggleMainAccordion(key: MainAccordionKey) {
    setMainAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  function getCrewNames(jobCard: WorkbenchJobCard): string[] {
    return jobCard.assignments.map((assignment) => userNamesById.get(assignment.userId) ?? "Crew");
  }

  function openFieldJob(jobId: string) {
    setRecentJobIds(storeRecentJobId(jobId));
    setActiveRoute(fieldJobRoute(jobId));
  }

  async function handleAutoFillNextAvailable(jobCard: WorkbenchJobCard) {
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
      (contact) => contact.label.trim().toLowerCase() === normalizedContactName.toLowerCase(),
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
    openFieldJob(String(createdJob.id));
  }

  async function handleSaveRunningTimerStart() {
    if (!runningDraft) {
      return;
    }

    const nextStartedAt = fromDateTimeLocalValue(timerStartDraft);
    const nextStartedAtMs = new Date(nextStartedAt).getTime();

    if (!Number.isFinite(nextStartedAtMs)) {
      setTimerStartError("Start time is invalid.");
      return;
    }

    if (nextStartedAtMs > Date.now()) {
      setTimerStartError("Start time cannot be in the future.");
      return;
    }

    setTimerStartError(null);
    workbench.updateActiveRunningTimerDraft({ startedAt: nextStartedAt });
    setShowTimerStartEditor(false);
  }

  async function handleMarkJobComplete(jobCard: WorkbenchJobCard) {
    if (!getAllowedNextJobStatuses(jobCard.job.status).includes("work_complete")) {
      window.alert("This job cannot be marked complete from its current status yet.");
      return;
    }

    const confirmed = window.confirm(`Mark ${jobCard.job.title} as complete?`);
    if (!confirmed) {
      return;
    }

    await workbench.updateJobStatus.mutateAsync({
      jobId: jobCard.job.id,
      status: "work_complete",
      waitingReason: null,
    });
  }

  function renderBrandHeader() {
    return (
      <header style={{ display: "grid", gap: "10px", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap", width: "100%", maxWidth: "100%", minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "grid", justifyItems: "center", paddingTop: "2px" }}>
            {logoDataUrl ? (
              <div
                style={{
                  width: "min(280px, calc(100vw - 72px))",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  display: "grid",
                  justifyItems: "center",
                  gap: "2px",
                }}
              >
                <img
                  src={logoDataUrl}
                  alt="Pack Ops dog logo"
                  style={{
                    width: "min(120px, 32vw)",
                    maxWidth: "100%",
                    objectFit: "contain",
                    display: "block",
                    mixBlendMode: "multiply",
                    filter: "brightness(1.12) saturate(1.22) contrast(1.06)",
                    isolation: "isolate",
                  }}
                />
                <div style={{ textAlign: "center", color: fieldColors.gold }}>
                  <div
                    style={{
                      fontSize: "60px",
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
                      marginTop: "3px",
                      fontSize: "28px",
                      fontWeight: 800,
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                    }}
                  >
                    OPS
                  </div>
                </div>
              </div>
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

          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(MOBILE_FIELD_DESKTOP_OVERRIDE_KEY, "1");
              }
              setActiveRoute(APP_ROUTES.workbench);
            }}
            style={{
              ...actionButtonStyle("secondary"),
              width: "auto",
              maxWidth: "100%",
              minWidth: "min(132px, 100%)",
              padding: "10px 14px",
              minHeight: "42px",
              boxSizing: "border-box",
            }}
          >
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          height: "auto",
          minHeight: "unset",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "min(100%, 390px)",
            maxWidth: "calc(100vw - 56px)",
            minWidth: 0,
            aspectRatio: "1 / 1",
            display: "grid",
            placeItems: "center",
            boxSizing: "border-box",
            overflow: "visible",
            flex: "0 0 auto",
          }}
        >
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
              width: "min(72vw, 340px)",
              aspectRatio: "1 / 1",
              maxWidth: "100%",
              borderRadius: "999px",
              border: `12px solid ${fieldColors.gold}`,
              background: "radial-gradient(circle at 50% 40%, rgba(130, 16, 33, 0.56), rgba(25, 3, 8, 0.82))",
              boxShadow: "0 0 0 6px rgba(255, 177, 0, 0.08), 0 24px 48px rgba(0,0,0,0.34)",
              display: "grid",
              placeItems: "center",
              padding: "28px",
              textAlign: "center",
              boxSizing: "border-box",
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

        {runningDraft && runningJob ? (
          <>
            <button
              type="button"
              onClick={() => {
                setTimerStartDraft(toDateTimeLocalValue(runningDraft.startedAt));
                setTimerStartError(null);
                setShowTimerStartEditor((current) => !current);
              }}
              style={{
                ...actionButtonStyle("secondary"),
                width: "min(100%, 430px)",
                maxWidth: "100%",
                minHeight: "42px",
                padding: "10px 12px",
                position: "static",
                transform: "none",
                boxSizing: "border-box",
              }}
            >
              Edit Start Time
            </button>
            {showTimerStartEditor ? (
              <div
                style={{
                  ...softCardStyle(),
                  width: "min(100%, 430px)",
                  maxWidth: "100%",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "8px",
                  position: "static",
                  transform: "none",
                  boxSizing: "border-box",
                }}
              >
                <label style={{ display: "grid", gap: "6px", textAlign: "left" }}>
                  <span style={infoLabelStyle()}>Running Timer Start</span>
                  <input
                    type="datetime-local"
                    value={timerStartDraft}
                    onChange={(event) => setTimerStartDraft(event.target.value)}
                    style={inputStyle()}
                  />
                </label>
                {timerStartError ? (
                  <div style={{ color: fieldColors.danger, fontSize: "13px", textAlign: "left" }}>{timerStartError}</div>
                ) : null}
                <div style={{ display: "grid", gap: "8px" }}>
                  <button type="button" onClick={() => void handleSaveRunningTimerStart()} style={actionButtonStyle()}>
                    Save Start Time
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTimerStartEditor(false);
                      setTimerStartError(null);
                    }}
                    style={actionButtonStyle("secondary")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  ...softCardStyle(),
                  width: "min(100%, 430px)",
                  maxWidth: "100%",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "4px",
                  boxSizing: "border-box",
                }}
              >
                <div style={infoLabelStyle()}>Running Timer Start</div>
                <div style={{ color: fieldColors.white, fontWeight: 700 }}>
                  {new Date(runningDraft.startedAt).toLocaleString()}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void workbench.stopTimer()}
              style={{ ...actionButtonStyle(), width: "min(100%, 430px)", maxWidth: "100%", boxSizing: "border-box" }}
            >
              Stop Timer
            </button>
          </>
        ) : null}

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

  function renderFinishTimerPanel() {
    if (!timeEntryDraft) {
      return null;
    }

    const canSave =
      Boolean(timeEntryDraft.jobId) &&
      Boolean(timeEntryDraft.startedAt) &&
      Boolean(timeEntryDraft.endedAt) &&
      (timeDraftHours ?? 0) > 0;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(10, 1, 4, 0.72)",
          display: "grid",
          alignItems: "end",
          padding: "12px",
        }}
      >
        <div
          style={{
            ...shellCardStyle(),
            borderTopLeftRadius: "28px",
            borderTopRightRadius: "28px",
            padding: "18px 16px 20px",
            display: "grid",
            gap: "12px",
            maxHeight: "88vh",
            overflowY: "auto",
            width: "min(100%, 760px)",
            maxWidth: "calc(100vw - 24px)",
            boxSizing: "border-box",
            justifySelf: "center",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ fontSize: "24px", color: fieldColors.white }}>Finish Timer</strong>
            <span style={{ color: fieldColors.whiteSoft }}>
              Review this timer entry before saving it to the job history.
            </span>
          </div>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={infoLabelStyle()}>Job</span>
            <select
              value={timeEntryDraft.jobId}
              onChange={(event) => workbench.updateTimeEntryDraft({ jobId: event.target.value as TimeEntryDraft["jobId"] })}
              style={inputStyle()}
            >
              {jobCards
                .filter((jobCard) => jobCard.permissions.canCreateTimeEntry)
                .map((jobCard) => (
                  <option key={jobCard.job.id} value={jobCard.job.id}>
                    {jobCard.job.number ? `${jobCard.job.number} · ` : ""}
                    {jobCard.job.fieldName || jobCard.job.title}
                  </option>
                ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={infoLabelStyle()}>Worked By</span>
            <select
              value={timeEntryDraft.userId}
              onChange={(event) => workbench.updateTimeEntryDraft({ userId: event.target.value as TimeEntryDraft["userId"] })}
              style={inputStyle()}
            >
              {availableWorkerOptions.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
            <label style={{ display: "grid", gap: "6px", minWidth: 0 }}>
              <span style={infoLabelStyle()}>Start Time</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(timeEntryDraft.startedAt)}
                onChange={(event) => workbench.updateTimeEntryDraft({ startedAt: fromDateTimeLocalValue(event.target.value) })}
                style={inputStyle()}
              />
            </label>
            <label style={{ display: "grid", gap: "6px", minWidth: 0 }}>
              <span style={infoLabelStyle()}>Stop Time</span>
              <input
                type="datetime-local"
                value={timeEntryDraft.endedAt ? toDateTimeLocalValue(timeEntryDraft.endedAt) : ""}
                onChange={(event) => workbench.updateTimeEntryDraft({ endedAt: fromDateTimeLocalValue(event.target.value) })}
                style={inputStyle()}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={infoLabelStyle()}>Total Hours</span>
            <input
              type="number"
              min="0.05"
              max="24"
              step="0.05"
              value={timeDraftHours?.toFixed(2) ?? ""}
              onChange={(event) => {
                const nextHours = Number(event.target.value);
                if (!Number.isFinite(nextHours) || nextHours <= 0) {
                  return;
                }
                const nextDraft = updateManualTimeEntryDraftHours(timeEntryDraft, nextHours);
                workbench.updateTimeEntryDraft({
                  startedAt: nextDraft.startedAt,
                  endedAt: nextDraft.endedAt,
                });
              }}
              style={inputStyle()}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={infoLabelStyle()}>Note / Description</span>
            <textarea
              rows={3}
              value={timeEntryDraft.description}
              onChange={(event) => workbench.updateTimeEntryDraft({ description: event.target.value })}
              style={inputStyle()}
            />
          </label>

          <div style={{ ...softCardStyle(), padding: "12px 14px", display: "grid", gap: "4px" }}>
            <span style={infoLabelStyle()}>Summary</span>
            <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>
              {draftJobCard ? (draftJobCard.job.fieldName || draftJobCard.job.title) : "Selected job"}
            </strong>
            <span style={{ color: fieldColors.goldBright }}>
              {timeDraftHours?.toFixed(2) ?? "0.00"}h {timeDraftElapsed ? `· ${timeDraftElapsed}` : ""}
            </span>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <button
              type="button"
              style={actionButtonStyle()}
              disabled={!canSave || workbench.isSavingTimeEntryDraft}
              onClick={() => void workbench.saveTimeEntryDraft()}
            >
              {workbench.isSavingTimeEntryDraft ? "Saving..." : "Save Time Entry"}
            </button>
            <button
              type="button"
              style={actionButtonStyle("secondary")}
              disabled={workbench.isSavingTimeEntryDraft}
              onClick={() => void workbench.discardTimeEntryDraft()}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
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

        <div style={{ display: "grid", gap: "10px" }}>
          <button type="button" style={actionButtonStyle("secondary")} onClick={() => openFieldJob(jobCard.job.id)}>
            Open Job
          </button>
          {getAllowedNextJobStatuses(jobCard.job.status).includes("work_complete") ? (
            <button
              type="button"
              style={actionButtonStyle()}
              disabled={workbench.updateJobStatus.isPending}
              onClick={() => void handleMarkJobComplete(jobCard)}
            >
              {workbench.updateJobStatus.isPending ? "Completing..." : "Job Complete"}
            </button>
          ) : null}
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
        </div>
      </div>
    );
  }

  function renderJobListCard(jobCard: WorkbenchJobCard) {
    return (
      <div key={jobCard.job.id} style={{ ...shellCardStyle(), padding: "16px", display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ fontSize: "24px", lineHeight: 1.1, color: fieldColors.white, overflowWrap: "anywhere" }}>
            {jobCard.job.fieldName || jobCard.job.title}
          </strong>
          <span style={{ color: fieldColors.goldBright, fontSize: "14px", fontWeight: 800 }}>{jobCard.job.number || "No job number"}</span>
          <span style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{jobCard.contactName ?? "No customer linked"}</span>
          <span style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
            {[jobCard.job.addressLine1, jobCard.job.city, jobCard.job.region].filter(Boolean).join(", ") || "No address added"}
          </span>
        </div>

        {jobCard.neededMaterialsCount > 0 ? (
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

        <button type="button" onClick={() => openFieldJob(jobCard.job.id)} style={actionButtonStyle()}>
          Open Job
        </button>
        {getAllowedNextJobStatuses(jobCard.job.status).includes("work_complete") ? (
          <button
            type="button"
            onClick={() => void handleMarkJobComplete(jobCard)}
            style={actionButtonStyle("secondary")}
            disabled={workbench.updateJobStatus.isPending}
          >
            {workbench.updateJobStatus.isPending ? "Completing..." : "Job Complete"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        boxSizing: "border-box",
        background: `linear-gradient(180deg, ${fieldColors.backgroundTop} 0%, ${fieldColors.backgroundMid} 48%, ${fieldColors.backgroundBottom} 100%)`,
        color: fieldColors.white,
        padding: "8px 12px 32px",
        overflowX: "hidden",
      }}
    >
      <div style={{ width: "min(100%, 760px)", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", margin: "0 auto", display: "grid", gap: "16px", minWidth: 0 }}>
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
                      onClick={() => openFieldJob(jobCard.job.id)}
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
              <div style={{ ...infoLabelStyle(), justifySelf: "center" }}>Tap a job to open details</div>
              {filteredJobs.map((jobCard) => renderJobListCard(jobCard))}
            </div>
          </div>,
          <span style={{ fontSize: "24px" }}>🔎</span>,
        )}
      </div>
      {renderFinishTimerPanel()}
    </div>
  );
}
