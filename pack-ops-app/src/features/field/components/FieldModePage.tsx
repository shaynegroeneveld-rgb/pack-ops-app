import "./field-home.css";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import {
  deriveTimeEntryDraftElapsedLabel,
  deriveTimeEntryDraftHours,
  parseTimeEntryHoursInput,
  formatTimeEntryHoursInput,
  updateManualTimeEntryDraftHours,
  type TimeEntryDraft,
} from "@/domain/time-entries/draft";

import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";
import type { WorkbenchJobCard } from "@/services/workbench/workbench-service";
import { Button, Modal } from "@/ui";

import {
  actionButtonStyle,
  fieldColors,
  formatElapsed,
  infoLabelStyle,
  inputStyle,
  loadRecentJobIds,
  shellCardStyle,
  softCardStyle,
  storeRecentJobId,
} from "./field-mode-shared";

const fieldJobRoute = (jobId: string) => `${APP_ROUTES.fieldJobs}/${jobId}`;
const MOBILE_FIELD_DESKTOP_OVERRIDE_KEY = "pack-ops-mobile-desktop-override";

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
  const timerLock=useRef(false);
  const [timerBusy,setTimerBusy]=useState(false);
  const [hoursText,setHoursText]=useState("");
  const hoursFocused=useRef(false);
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const [jobSearch, setJobSearch] = useState("");
  const [recentJobIds, setRecentJobIds] = useState<string[]>([]);
  const [showAddJobForm, setShowAddJobForm] = useState(false);
  const [showTimerStartEditor, setShowTimerStartEditor] = useState(false);
  const [timerStartDraft, setTimerStartDraft] = useState("");
  const [timerStartError, setTimerStartError] = useState<string | null>(null);
  const [addJobDraft, setAddJobDraft] = useState({
    title: "",
    fieldName: "",
    contactName: "",
    address: "",
    description: "",
  });
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());

  if (!currentUser) {
    return null;
  }

  const workbench = useWorkbenchSlice(currentUser);

  const jobCards = workbench.jobsQuery.data ?? [];
  const jobCardById = useMemo(() => new Map(jobCards.map((card) => [String(card.job.id), card])), [jobCards]);
  const runningDraft = workbench.activeRunningTimerDraft;
  const timeEntryDraft = workbench.timeEntryDraft;
  const runningJob = runningDraft?.jobId ? jobCardById.get(String(runningDraft.jobId)) ?? null : null;
  const elapsed = runningDraft?.startedAt ? formatElapsed(runningDraft.startedAt, clockNowMs) : null;
  const contactOptions = workbench.contactsQuery.data ?? [];
  const assignableUsers = workbench.assignableUsersQuery.data ?? [];
  const availableWorkerOptions = useMemo(() => {
    const currentUserOption = {
      id: String(currentUser.user.id),
      label: currentUser.user.fullName,
    };
    return assignableUsers.some((user) => user.id === currentUserOption.id)
      ? assignableUsers
      : [currentUserOption, ...assignableUsers];
  }, [assignableUsers, currentUser.user.fullName, currentUser.user.id]);
  const draftJobCard = timeEntryDraft?.jobId ? jobCardById.get(String(timeEntryDraft.jobId)) ?? null : null;
  const timeDraftHours = timeEntryDraft ? deriveTimeEntryDraftHours(timeEntryDraft, new Date(clockNowMs)) : null;
  const hoursInvalid=parseTimeEntryHoursInput(hoursText)===null;
  useEffect(()=>{
    if(!hoursFocused.current)setHoursText(timeEntryDraft?formatTimeEntryHoursInput(deriveTimeEntryDraftHours(timeEntryDraft)):"");
  },[timeEntryDraft?.jobId,timeEntryDraft?.startedAt,timeEntryDraft?.endedAt]);
  const timeDraftElapsed = timeEntryDraft ? deriveTimeEntryDraftElapsedLabel(timeEntryDraft, new Date(clockNowMs)) : null;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setRecentJobIds(loadRecentJobIds());
  }, []);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) {
      return jobCards;
    }
    return jobCards.filter((jobCard) => jobSearch.trim().toLowerCase().split(/\s+/).every(term=>buildJobSearchText(jobCard).includes(term)));
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
  }, [recentJobs.length, filteredJobs.length, showAddJobForm, showTimerStartEditor]);

  function openFieldJob(jobId: string) {
    setRecentJobIds(storeRecentJobId(jobId));
    setActiveRoute(fieldJobRoute(jobId));
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

  async function runTimerAction(action:()=>Promise<void>){
    if(timerLock.current)return;
    timerLock.current=true;setTimerBusy(true);
    try{await action();}finally{timerLock.current=false;setTimerBusy(false);}
  }

  function renderBrandHeader() {
    return <header className="field-home-brand">
      <img src="/pack-electric-brand.jpeg" alt="Pack Electric" />
      <div className="field-home-brand-bar"><span>FIELD WORKSPACE</span><button type="button" onClick={()=>{window.sessionStorage.setItem(MOBILE_FIELD_DESKTOP_OVERRIDE_KEY,"1");setActiveRoute(APP_ROUTES.workbench);}}>Office view ↗</button></div>
    </header>;
  }

  function renderTimerHero() {
    return <section className="field-home-timer" aria-label="Work timer">
      <div className="field-home-timer-heading"><span className={runningDraft?"field-live-dot":"field-idle-dot"}/><span>{runningDraft?"ON THE CLOCK":"READY WHEN YOU ARE"}</span></div>
      <div className="field-home-time">{elapsed??"00:00:00"}</div>
      <p>{runningDraft?(runningJob?.job.fieldName||runningJob?.job.title||"Current job"):"Choose a job below to start your day."}</p>
      {runningDraft&&<><div className="field-home-timer-actions">
       <button type="button" className="field-home-primary" disabled={timerBusy} onClick={()=>void runTimerAction(()=>workbench.stopTimer())}>Stop & review time</button>
       <button type="button" onClick={()=>openFieldJob(String(runningDraft.jobId))}>Open job ↗</button>
      </div><button type="button" className="field-home-text-button" onClick={()=>{setTimerStartDraft(toDateTimeLocalValue(runningDraft.startedAt));setTimerStartError(null);setShowTimerStartEditor(!showTimerStartEditor);}}>Started {new Date(runningDraft.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · Edit</button>
      {showTimerStartEditor&&<div className="field-home-start-editor"><label>Start time<input type="datetime-local" value={timerStartDraft} onChange={e=>setTimerStartDraft(e.target.value)}/></label>{timerStartError&&<p role="alert">{timerStartError}</p>}<button type="button" onClick={()=>void handleSaveRunningTimerStart()}>Save start time</button></div>}</>}
      {workbench.feedback&&<p role="status">{workbench.feedback.text}</p>}
    </section>;
  }

  function renderFinishTimerPanel() {
    if (!timeEntryDraft) {
      return null;
    }

    const canSave =
      Boolean(timeEntryDraft.jobId) &&
      Boolean(timeEntryDraft.startedAt) &&
      Boolean(timeEntryDraft.endedAt) &&
      (timeDraftHours ?? 0) > 0 && !hoursInvalid;

    return (
      <Modal
        open
        onClose={() => undefined}
        theme="field"
        placement="bottom"
        footer={
          <div style={{ display: "grid", gap: "10px", width: "100%" }}>
            <Button
              fullWidth
              disabled={!canSave}
              loading={workbench.isSavingTimeEntryDraft}
              onClick={() => void workbench.saveTimeEntryDraft()}
            >
              Save Time Entry
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={workbench.isSavingTimeEntryDraft}
              onClick={() => void workbench.discardTimeEntryDraft()}
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "12px" }}>
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
              type="text"
              inputMode="decimal"
              placeholder=".5 or 1.5"
              aria-invalid={hoursInvalid}
              value={hoursText}
              onFocus={()=>{hoursFocused.current=true;}}
              onBlur={()=>{hoursFocused.current=false;const hours=parseTimeEntryHoursInput(hoursText);if(hours!==null)setHoursText(formatTimeEntryHoursInput(hours));}}
              onChange={event=>{
                setHoursText(event.target.value);
                const hours=parseTimeEntryHoursInput(event.target.value);
                if(hours===null)return;
                const next=updateManualTimeEntryDraftHours(timeEntryDraft,hours);
                workbench.updateTimeEntryDraft({startedAt:next.startedAt,endedAt:next.endedAt});
              }}
              style={inputStyle()}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            {hoursInvalid && <span role="alert">Enter 0.05 to 24 hours, with up to 2 decimals. .5 means 30 minutes.</span>}
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
        </div>
      </Modal>
    );
  }

  function renderJobListCard(jobCard: WorkbenchJobCard) {
    const running=String(runningDraft?.jobId)===String(jobCard.job.id);
    return <article className="field-home-job" key={jobCard.job.id}>
     <button type="button" className="field-home-job-open" onClick={()=>openFieldJob(jobCard.job.id)}>
      <span className="field-home-job-meta">{jobCard.job.number||"JOB"}<span>{running?"Timer running":jobCard.job.status.replaceAll('_',' ')}</span></span>
      <strong>{jobCard.job.fieldName||jobCard.job.title}</strong>
      <span>{jobCard.contactName||"No customer linked"}</span>
      <span className="field-home-address">{[jobCard.job.addressLine1,jobCard.job.city].filter(Boolean).join(', ')||"No address added"}</span>
     </button>
     {jobCard.neededMaterialsCount>0&&<button type="button" className="field-home-pickup" onClick={()=>openFieldJob(jobCard.job.id)}>{jobCard.neededMaterialsCount} materials to pick up ↗</button>}
     <div className="field-home-job-actions"><button type="button" onClick={()=>openFieldJob(jobCard.job.id)}>Open job ↗</button>
      {!runningDraft&&<button type="button" className="field-home-start" disabled={timerBusy} onClick={()=>void runTimerAction(()=>workbench.startTimer(jobCard.job.id))}>▶ Start timer</button>}
     </div>
    </article>;
  }

  return (
    <div
      className="field-home"
      data-theme="field"
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

        <section className="field-home-jobs" aria-label="Jobs">
          <div className="field-home-section-heading"><div><span>YOUR WORK</span><h1>Jobs</h1></div><button type="button" onClick={()=>setShowAddJobForm(!showAddJobForm)}>{showAddJobForm?"Close":"+ New job"}</button></div>
          <label className="field-home-search"><span>Find a job</span><input type="search" value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="Search number, name, customer or address…" /></label>
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

          {!jobSearch.trim()&&recentJobs.length>0&&<div className="field-home-recent" aria-label="Recent jobs">{recentJobs.slice(0,4).map(card=><button type="button" key={card.job.id} onClick={()=>openFieldJob(card.job.id)}>{card.job.fieldName||card.job.title} ↗</button>)}</div>}
          <p className="field-home-result-count" role="status">{workbench.jobsQuery.isLoading?"Loading jobs…":`${filteredJobs.length} ${filteredJobs.length===1?'job':'jobs'}${jobSearch.trim()?' found':''}`}</p>
          {workbench.jobsQuery.isError&&<p role="alert">Jobs could not load. <button type="button" onClick={()=>void workbench.jobsQuery.refetch()}>Try again</button></p>}
          <div className="field-home-job-grid">{filteredJobs.map(renderJobListCard)}</div>
          {!workbench.jobsQuery.isLoading&&!workbench.jobsQuery.isError&&!filteredJobs.length&&<p className="field-home-empty">{jobSearch.trim()?"No matching jobs. Try a different name or job number.":"Your jobs will appear here."}</p>}
        </section>
      </div>
      {renderFinishTimerPanel()}
    </div>
  );
}
