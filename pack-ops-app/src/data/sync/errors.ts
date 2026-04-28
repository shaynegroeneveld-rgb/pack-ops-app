import type { SyncQueueEntry } from "@/data/dexie/outbox";

export class SyncPushError extends Error {
  constructor(
    message: string,
    readonly entry: Pick<SyncQueueEntry, "id" | "entityType" | "entityId" | "operation" | "orgId">,
    readonly payload: Record<string, unknown>,
    readonly causeData?: unknown,
  ) {
    super(message);
    this.name = "SyncPushError";
  }
}

export function getInvalidJobStatusTransition(error: unknown): { fromStatus: string; toStatus: string } | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? String((error as { message: string }).message)
        : "";

  const match = message.match(/Invalid job status transition:\s*([a-z_]+)\s*[→-]+\s*([a-z_]+)/i);
  if (!match) {
    return null;
  }

  return {
    fromStatus: match[1] ?? "",
    toStatus: match[2] ?? "",
  };
}

export function getSyncErrorMessage(error: unknown, fallback = "Sync failed."): string {
  if (error instanceof SyncPushError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message : null;
    const details = typeof candidate.details === "string" ? candidate.details : null;
    const hint = typeof candidate.hint === "string" ? candidate.hint : null;
    const code = typeof candidate.code === "string" ? candidate.code : null;

    return [message, details, hint, code ? `(code: ${code})` : null].filter(Boolean).join(" — ") || fallback;
  }

  return fallback;
}
