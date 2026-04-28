import type { JobId, UserId } from "@/domain/ids";
import type { ActiveTimer } from "@/domain/time-entries/types";

export interface TimeEntryDraft {
  jobId: JobId;
  userId: UserId;
  activeTimerId: ActiveTimer["id"] | null;
  startedAt: string;
  endedAt: string | null;
  description: string;
  source: "timer" | "manual";
}

export function createRunningTimeEntryDraft(
  jobId: JobId,
  userId: UserId,
  now: Date = new Date(),
  description = "On-site work",
): TimeEntryDraft {
  return {
    jobId,
    userId,
    activeTimerId: null,
    startedAt: now.toISOString(),
    endedAt: null,
    description,
    source: "timer",
  };
}

export function createManualTimeEntryDraft(
  jobId: JobId,
  userId: UserId,
  now: Date = new Date(),
  description = "On-site work",
): TimeEntryDraft {
  return {
    jobId,
    userId,
    activeTimerId: null,
    startedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    endedAt: now.toISOString(),
    description,
    source: "manual",
  };
}

export function stopTimeEntryDraft(
  draft: TimeEntryDraft,
  stoppedAt: Date = new Date(),
): TimeEntryDraft {
  return {
    ...draft,
    endedAt: stoppedAt.toISOString(),
    activeTimerId: null,
  };
}

export function isTimeEntryDraftRunning(draft: TimeEntryDraft): boolean {
  return draft.endedAt === null;
}

export function createDraftFromActiveTimer(timer: ActiveTimer): TimeEntryDraft {
  return {
    jobId: timer.jobId,
    userId: timer.userId,
    activeTimerId: timer.id,
    startedAt: timer.startedAt,
    endedAt: null,
    description: timer.description ?? "On-site work",
    source: "timer",
  };
}

export function deriveTimeEntryDraftHours(
  draft: TimeEntryDraft,
  now: Date = new Date(),
): number {
  const startedAt = new Date(draft.startedAt).getTime();
  const endedAt = new Date(draft.endedAt ?? now.toISOString()).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return Number.NaN;
  }

  const durationMs = Math.max(0, endedAt - startedAt);

  return Math.max(0.05, Math.round((durationMs / 3600000) * 100) / 100);
}

export function deriveTimeEntryDraftWorkDate(draft: TimeEntryDraft): string {
  const startedAt = new Date(draft.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return "";
  }

  return startedAt.toISOString().slice(0, 10);
}

export function deriveTimeEntryDraftElapsedLabel(
  draft: TimeEntryDraft,
  now: Date = new Date(),
): string {
  const startedAt = new Date(draft.startedAt).getTime();
  const endedAt = new Date(draft.endedAt ?? now.toISOString()).getTime();
  const elapsedMs = Math.max(0, endedAt - startedAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function deriveTimeEntryDraftDateValue(draft: TimeEntryDraft): string {
  return draft.startedAt.slice(0, 10);
}

export function updateManualTimeEntryDraftDate(
  draft: TimeEntryDraft,
  date: string,
): TimeEntryDraft {
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return draft;
  }

  const start = new Date(draft.startedAt);
  const end = new Date(draft.endedAt ?? draft.startedAt);

  const nextStart = new Date(start);
  const nextEnd = new Date(end);

  const year = parts[0] as number;
  const month = parts[1] as number;
  const day = parts[2] as number;
  nextStart.setUTCFullYear(year, month - 1, day);
  nextEnd.setUTCFullYear(year, month - 1, day);

  return {
    ...draft,
    startedAt: nextStart.toISOString(),
    endedAt: nextEnd.toISOString(),
  };
}

export function updateManualTimeEntryDraftHours(
  draft: TimeEntryDraft,
  hours: number,
): TimeEntryDraft {
  const safeHours = Math.max(0.05, Number.isFinite(hours) ? hours : 0.05);
  const startedAt = new Date(draft.startedAt);
  const endedAt = new Date(startedAt.getTime() + safeHours * 60 * 60 * 1000);

  return {
    ...draft,
    endedAt: endedAt.toISOString(),
  };
}

export function validateTimeEntryDraft(draft: TimeEntryDraft, now: Date = new Date()): string | null {
  const startedAt = new Date(draft.startedAt).getTime();
  const endedAt = new Date(draft.endedAt ?? now.toISOString()).getTime();

  if (!Number.isFinite(startedAt)) {
    return "Start time is invalid.";
  }

  if (!Number.isFinite(endedAt)) {
    return draft.source === "manual" ? "End time is invalid." : "Stop time is invalid.";
  }

  if (endedAt < startedAt) {
    return "End time cannot be before start time.";
  }

  const hours = deriveTimeEntryDraftHours(draft, now);
  if (!Number.isFinite(hours)) {
    return "Hours could not be calculated.";
  }

  if (hours <= 0 || hours > 24) {
    return "Hours must be greater than 0 and no more than 24.";
  }

  const workDate = deriveTimeEntryDraftWorkDate(draft);
  if (!workDate) {
    return "Work date is invalid.";
  }

  return null;
}
