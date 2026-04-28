import { useEffect, useMemo, useState } from "react";

import {
  deriveTimeEntryDraftDateValue,
  deriveTimeEntryDraftElapsedLabel,
  deriveTimeEntryDraftHours,
  isTimeEntryDraftRunning,
  type TimeEntryDraft,
  updateManualTimeEntryDraftDate,
  updateManualTimeEntryDraftHours,
} from "@/domain/time-entries/draft";

interface TimeTrackingJobOption {
  id: string;
  label: string;
  canTrack: boolean;
}

export interface TimeTrackerPanelProps {
  selectedJobId: string;
  canCreateTimeEntry: boolean;
  availableJobs: TimeTrackingJobOption[];
  availableWorkers: Array<{ id: string; label: string }>;
  draft: TimeEntryDraft | null;
  activeRunningTimerDraft: TimeEntryDraft | null;
  isSaving: boolean;
  runningJobLabel: string | null;
  onStart: (jobId: string) => void | Promise<void>;
  onStartManual: (jobId: string) => void | Promise<void>;
  onUpdateDraft: (
    patch: Partial<Pick<TimeEntryDraft, "jobId" | "userId" | "startedAt" | "endedAt" | "description">>,
  ) => void;
  onStop: () => void | Promise<void>;
  onSave: () => Promise<void>;
  onDiscard: () => void | Promise<void>;
  onGoToRunningJob: () => void;
}

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function TimeTrackerPanel({
  selectedJobId,
  canCreateTimeEntry,
  availableJobs,
  availableWorkers,
  draft,
  activeRunningTimerDraft,
  isSaving,
  runningJobLabel,
  onStart,
  onStartManual,
  onUpdateDraft,
  onStop,
  onSave,
  onDiscard,
  onGoToRunningJob,
}: TimeTrackerPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const runningDraft = activeRunningTimerDraft ?? (draft?.activeTimerId ? draft : null);
  const isRunning = draft ? isTimeEntryDraftRunning(draft) : false;
  const hasRunningTimerElsewhere = Boolean(runningDraft && runningDraft.jobId !== selectedJobId);
  const isRunningOnAnotherJob = Boolean(draft && draft.activeTimerId && isRunning && draft.jobId !== selectedJobId);
  const selectedTrackableJobCount = availableJobs.filter((job) => job.canTrack).length;

  useEffect(() => {
    if (!runningDraft || !isTimeEntryDraftRunning(runningDraft)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [runningDraft]);

  const elapsedLabel = useMemo(() => {
    if (!draft) {
      return null;
    }

    return deriveTimeEntryDraftElapsedLabel(draft, new Date(now));
  }, [draft, now]);

  const draftHours = useMemo(() => {
    if (!draft) {
      return null;
    }

    return deriveTimeEntryDraftHours(draft, new Date(now));
  }, [draft, now]);

  const manualDateValue = useMemo(() => {
    if (!draft || draft.source !== "manual") {
      return "";
    }

    return deriveTimeEntryDraftDateValue(draft);
  }, [draft]);

  return (
    <div
      style={{
        marginBottom: "20px",
        border: "1px solid #d9dfeb",
        borderRadius: "14px",
        padding: "14px",
        background: draft ? (isRunning ? "#f5f8ff" : "#f8fbf7") : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: "6px" }}>Time Entry</h3>
          <p style={{ color: "#5b6475", margin: 0 }}>
            Use the timer for live tracking, or add hours manually when you need to backfill work.
          </p>
        </div>
        {draft ? (
          <div
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "999px",
              padding: "6px 10px",
              background: isRunning ? "#e8f0ff" : "#eef8ef",
              color: isRunning ? "#2440a8" : "#1f6b37",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {isRunning ? `Running · ${elapsedLabel}` : `Ready to save · ${draftHours?.toFixed(2)}h`}
          </div>
        ) : null}
      </div>

      {!draft ? (
        <>
          {hasRunningTimerElsewhere ? (
            <div
              style={{
                marginTop: "12px",
                marginBottom: "12px",
                border: "1px solid #c9d8f2",
                borderRadius: "12px",
                padding: "12px 14px",
                background: "#f8fbff",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>
                You have an active timer running on {runningJobLabel ?? "another job"}.
              </strong>
              <p style={{ color: "#5b6475", margin: 0 }}>
                You can still use Add Time here, but Start Timer stays blocked until that running timer is stopped.
              </p>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
            <button
              disabled={!canCreateTimeEntry || hasRunningTimerElsewhere}
              onClick={() => void onStart(selectedJobId)}
              style={{ minWidth: "120px", fontWeight: 600 }}
            >
              Start Timer
            </button>
            <button
              disabled={!canCreateTimeEntry}
              onClick={() => void onStartManual(selectedJobId)}
              style={{ minWidth: "120px" }}
            >
              Add Time
            </button>
          </div>
          {!canCreateTimeEntry ? (
            <p style={{ color: "#5b6475", marginBottom: 0 }}>
              You need to be assigned to this job before you can log time.
            </p>
          ) : (
            <p style={{ color: "#5b6475", marginBottom: 0 }}>
              {hasRunningTimerElsewhere
                ? `A timer is already running on ${runningJobLabel ?? "another job"}. You can still use Add Time here.`
                : "Start the timer for live tracking, or use Add Time to enter hours manually for this job."}
            </p>
          )}
        </>
      ) : isRunningOnAnotherJob ? (
        <div
          style={{
            marginTop: "14px",
            border: "1px solid #c9d8f2",
            borderRadius: "12px",
            padding: "14px",
            background: "#f8fbff",
          }}
        >
          <strong style={{ display: "block", marginBottom: "6px" }}>
            A timer is already running on {runningJobLabel ?? "another job"}.
          </strong>
          <p style={{ color: "#5b6475", marginTop: 0 }}>
            You can only have one active timer at a time. Go back to the running job to edit it, or stop it before starting work on this one.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={onGoToRunningJob}>
              Go to Running Job
            </button>
            <button onClick={() => void onStartManual(selectedJobId)}>
              Add Time Here
            </button>
            <button onClick={() => void onStop()}>
              Stop Existing Timer
            </button>
          </div>
        </div>
      ) : (
        <>
          {draft.source === "manual" && hasRunningTimerElsewhere ? (
            <div
              style={{
                marginTop: "14px",
                marginBottom: "14px",
                border: "1px solid #c9d8f2",
                borderRadius: "12px",
                padding: "12px 14px",
                background: "#f8fbff",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>
                You have an active timer running on {runningJobLabel ?? "another job"}.
              </strong>
              <p style={{ color: "#5b6475", margin: 0 }}>
                You can still add manual time here. Start Timer stays blocked until the running timer is stopped.
              </p>
            </div>
          ) : null}
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: "14px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "13px", color: "#5b6475" }}>Job</span>
              <select
                value={draft.jobId}
                onChange={(event) => onUpdateDraft({ jobId: event.target.value as TimeEntryDraft["jobId"] })}
              >
                {availableJobs.map((job) => (
                  <option key={job.id} value={job.id} disabled={!job.canTrack}>
                    {job.label}{job.canTrack ? "" : " (no time access)"}
                  </option>
                ))}
              </select>
            </label>

            {draft.source === "manual" ? (
              <>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "#5b6475" }}>Worked By</span>
                  <select
                    value={draft.userId}
                    onChange={(event) => onUpdateDraft({ userId: event.target.value as TimeEntryDraft["userId"] })}
                  >
                    {availableWorkers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "#5b6475" }}>Date</span>
                  <input
                    type="date"
                    value={manualDateValue}
                    onChange={(event) => {
                      const nextDraft = updateManualTimeEntryDraftDate(draft, event.target.value);
                      onUpdateDraft({
                        startedAt: nextDraft.startedAt,
                        endedAt: nextDraft.endedAt,
                      });
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "#5b6475" }}>Hours</span>
                  <input
                    type="number"
                    min="0.05"
                    step="0.25"
                    value={draftHours?.toFixed(2) ?? "1.00"}
                    onChange={(event) => {
                      const nextDraft = updateManualTimeEntryDraftHours(
                        draft,
                        Number(event.target.value),
                      );
                      onUpdateDraft({
                        endedAt: nextDraft.endedAt,
                      });
                    }}
                  />
                </label>
              </>
            ) : (
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: "#5b6475" }}>Start time</span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(draft.startedAt)}
                  onChange={(event) => onUpdateDraft({ startedAt: fromDateTimeLocalValue(event.target.value) })}
                />
              </label>
            )}

            {draft.source !== "manual" && !isRunning ? (
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: "#5b6475" }}>End time</span>
                <input
                  type="datetime-local"
                  value={draft.endedAt ? toDateTimeLocalValue(draft.endedAt) : ""}
                  onChange={(event) => onUpdateDraft({ endedAt: fromDateTimeLocalValue(event.target.value) })}
                />
              </label>
            ) : isRunning ? (
              <div
                style={{
                  border: "1px dashed #c9d8f2",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  background: "#f8fbff",
                }}
              >
                <strong style={{ display: "block" }}>Live elapsed</strong>
                <span style={{ color: "#2440a8", fontSize: "18px" }}>{elapsedLabel}</span>
                <p style={{ marginBottom: 0, color: "#5b6475", fontSize: "13px" }}>
                  Stop the timer when you are ready to set an end time and save.
                </p>
              </div>
            ) : null}
          </div>

          <label style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
            <span style={{ fontSize: "13px", color: "#5b6475" }}>Work note</span>
            <input
              value={draft.description}
              onChange={(event) => onUpdateDraft({ description: event.target.value })}
              placeholder="What are you working on?"
            />
          </label>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "14px",
            }}
          >
            <div style={{ color: "#5b6475", fontSize: "13px" }}>
              {isRunning
                ? `Tracking live on one of ${selectedTrackableJobCount} trackable job${selectedTrackableJobCount === 1 ? "" : "s"}.`
                : draft.source === "manual"
                  ? `This entry will save ${draftHours?.toFixed(2)}h on ${new Date(draft.startedAt).toLocaleDateString()}.`
                  : `This entry will save ${draftHours?.toFixed(2)}h on ${new Date(draft.startedAt).toLocaleDateString()}.`}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => void onDiscard()} disabled={isSaving}>
                  Cancel
                </button>
              {isRunning ? (
                <button onClick={() => void onStop()} style={{ minWidth: "120px", fontWeight: 600 }}>
                  Stop Timer
                </button>
              ) : (
                <button onClick={() => void onSave()} disabled={isSaving} style={{ minWidth: "120px", fontWeight: 600 }}>
                  {isSaving ? "Saving..." : "Save Entry"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
