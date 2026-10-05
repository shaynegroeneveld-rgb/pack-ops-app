export function validateTimeEntryHours(hours: number): number {
  const rounded = Math.round(hours * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || rounded <= 0) {
    throw new Error("Labour hours must be at least 0.01 and no more than 24 per time entry. For assembly materials only, turn off assembly labour; otherwise record actual hours by worker and day.");
  }
  return rounded;
}
