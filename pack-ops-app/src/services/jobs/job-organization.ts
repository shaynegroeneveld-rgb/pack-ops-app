import type { ActionItem } from "@/domain/action-items/types";

// Human-readable context survives existing action-item sync and older clients.
const PART_PREFIX = "Job part: ";
export function readTaskContext(description: string | null): {
  part: string;
  detail: string;
} {
  if (!description?.startsWith(PART_PREFIX))
    return { part: "General", detail: description ?? "" };
  const [header = "", ...rest] = description.split("\n");
  return {
    part: header.slice(PART_PREFIX.length).trim() || "General",
    detail: rest.join("\n").trim(),
  };
}
export function writeTaskContext(part: string, detail: string): string {
  const cleanPart = part.replace(/[\r\n]/g, " ").trim();
  return `${PART_PREFIX}${cleanPart || "General"}\n\n${detail.trim()}`;
}
export function jobTasks(items: ActionItem[], jobId: string): ActionItem[] {
  return items.filter(
    (item) =>
      item.entityType === "jobs" &&
      item.entityId === jobId &&
      !item.deletedAt &&
      item.status !== "dismissed",
  );
}
export function isTaskOpen(item: Pick<ActionItem, "status">): boolean {
  return item.status === "open" || item.status === "snoozed";
}
export function collectJobParts(
  ...groups: Array<Array<{ sectionName?: string | null }>>
): string[] {
  const names = new Set<string>(["General"]);
  groups.flat().forEach((row) => {
    if (row.sectionName?.trim()) names.add(row.sectionName.trim());
  });
  return [...names];
}
export function parseMaterialQuantity(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : null;
}
export function localDateInput(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isOverdue(dueAt: string | null, now = Date.now()): boolean {
  return (
    !!dueAt && Number.isFinite(Date.parse(dueAt)) && Date.parse(dueAt) < now
  );
}
