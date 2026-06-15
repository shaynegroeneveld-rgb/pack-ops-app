import { type CSSProperties } from "react";

export const RECENT_JOBS_STORAGE_KEY = "pack-ops-field-recent-jobs";

export const fieldColors = {
  backgroundTop: "#1f0409",
  backgroundMid: "#510b14",
  backgroundBottom: "#280509",
  card: "rgba(113, 17, 29, 0.58)",
  cardSoft: "rgba(90, 12, 22, 0.56)",
  border: "rgba(255, 183, 32, 0.28)",
  gold: "#ffb400",
  goldBright: "#ffe066",
  goldDeep: "#e09100",
  white: "#fff8ef",
  whiteSoft: "rgba(255, 248, 239, 0.8)",
  warningBg: "#ffb100",
  warningText: "#4b1500",
  green: "#2f8f3c",
  danger: "#ff7d66",
} as const;

export const noTimerMessagesByDay = {
  0: "Even rest day jobs need a timer.",
  1: "New week, same chance to forget your timer.",
  2: "The tools are out. Is the timer?",
  3: "Halfway through the week, somehow still forgetting timers.",
  4: "Your future invoice is quietly judging you.",
  5: "Don't donate your Friday to the customer.",
  6: "Weekend work still counts. So does the timer.",
} as const;

export const weekdayLabels = [
  { label: "SUN", style: { left: "8%", top: "16%" } },
  { label: "MON", style: { right: "8%", top: "16%" } },
  { label: "TUE", style: { right: "1%", top: "40%" } },
  { label: "WED", style: { right: "8%", bottom: "18%" } },
  { label: "THU", style: { left: "50%", bottom: "2%", transform: "translateX(-50%)" } },
  { label: "FRI", style: { left: "8%", bottom: "18%" } },
  { label: "SAT", style: { left: "1%", top: "40%" } },
] as const;

export function buildLogoDataUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

export function toDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toDayKey(date);
}

export function startOfWeek(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const currentDay = date.getDay();
  const offset = currentDay === 0 ? -6 : 1 - currentDay;
  date.setDate(date.getDate() + offset);
  return toDayKey(date);
}

export function endOfWeek(day: string): string {
  return addDays(startOfWeek(day), 6);
}

export function toScheduleRangeIso(day: string, end = false): string {
  return `${day}T${end ? "23:59:59" : "00:00:00"}.000Z`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `$${value.toFixed(2)}`;
}

export function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(2)}h`;
}

export function formatElapsed(startedAt: string, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatBlockTime(startAt: string, endAt: string, timeBucket: string): string {
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

export function shellCardStyle(): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    borderRadius: "22px",
    border: `1px solid ${fieldColors.border}`,
    background: fieldColors.card,
    boxShadow: "0 18px 44px rgba(7, 0, 3, 0.28)",
    backdropFilter: "blur(8px)",
  };
}

export function softCardStyle(): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    borderRadius: "18px",
    border: `1px solid rgba(255, 183, 32, 0.16)`,
    background: fieldColors.cardSoft,
  };
}

export function actionButtonStyle(kind: "primary" | "secondary" = "primary"): CSSProperties {
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
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: kind === "primary" ? "0 10px 24px rgba(255, 177, 0, 0.2)" : "none",
  };
}

export function toggleButtonStyle(isOpen: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
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

export function infoLabelStyle(): CSSProperties {
  return {
    color: fieldColors.goldBright,
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

export function inputStyle(): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    borderRadius: "16px",
    border: `1px solid rgba(255, 183, 32, 0.18)`,
    background: "rgba(20, 4, 8, 0.48)",
    color: fieldColors.white,
    padding: "14px 16px",
    fontSize: "16px",
  };
}

export function loadRecentJobIds(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_JOBS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function storeRecentJobId(jobId: string): string[] {
  const current = loadRecentJobIds();
  const next = [jobId, ...current.filter((value) => value !== jobId)].slice(0, 6);
  window.localStorage.setItem(RECENT_JOBS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
