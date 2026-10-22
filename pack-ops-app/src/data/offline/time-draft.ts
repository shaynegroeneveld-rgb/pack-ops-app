import type { TimeEntryDraft } from "@/domain/time-entries/draft";

export const draftKey = (orgId: string, userId: string) => `pack-ops:time-draft:${orgId}:${userId}`;

export function loadTimeDraft(orgId: string, userId: string): TimeEntryDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(orgId, userId)) ?? "null") as TimeEntryDraft | null;
    return value && typeof value.jobId === "string" && typeof value.userId === "string" && typeof value.description === "string"
      && typeof value.startedAt === "string" && (value.source === "timer" || value.source === "manual") ? value : null;
  } catch { return null; }
}

export function saveTimeDraft(orgId: string, userId: string, value: TimeEntryDraft | null) {
  if (value) localStorage.setItem(draftKey(orgId, userId), JSON.stringify(value));
  else localStorage.removeItem(draftKey(orgId, userId));
}
