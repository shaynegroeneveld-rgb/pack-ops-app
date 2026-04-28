import type { Job, JobAssignment } from "@/domain/jobs/types";
import type { UserId } from "@/domain/ids";
import type { ScheduleBlock, WorkerUnavailability } from "@/domain/scheduling/types";
import type { SchedulingBlockDetail, SchedulingPlanIssue } from "@/services/scheduling/scheduling-service";

export interface DailyJobGroup {
  /** Stable unique key: `${jobId}::${day}` */
  key: string;
  jobId: Job["id"];
  /** Calendar day this group belongs to, YYYY-MM-DD. */
  day: string;
  job: Job;
  assignments: JobAssignment[];
  /** All blocks for this job on this day, sorted by startAt ascending. */
  blocks: ScheduleBlock[];
  /**
   * Unique worker IDs across all blocks on this day, in first-seen order.
   * null means the block is unassigned to a specific worker.
   */
  scheduledUserIds: Array<UserId | null>;
  /** True when any block in this group is the next upcoming block for the job. */
  isNextForJob: boolean;
  /** True when any block has notes containing "Auto-filled". */
  isAutoFilled: boolean;
  /** timeBucket from the first block (used for timed/untimed classification). */
  timeBucket: ScheduleBlock["timeBucket"];
  /** startAt of the earliest block in this group (ISO string). */
  startAt: string;
  /** Sum of durationHours across all blocks in this group. */
  totalHoursThisDay: number;
  /** Job's estimatedHours, or null if not set. */
  estimatedHours: number | null;
  /**
   * 1-based ordinal of this day among all scheduled days for this job
   * in the currently fetched scope.
   */
  dayIndex: number;
  /** Total number of scheduled days for this job in the currently fetched scope. */
  totalDays: number;
  /** True when any block in this group has a known plan issue (conflict). */
  hasConflict: boolean;
  /** True when at least one block uses less than the default full-day duration. */
  isSplitDay: boolean;
  /** True when job scheduling requires every assigned worker to be placed together. */
  requiresFullCrewTogether: boolean;
  /** True when a full-crew job is missing at least one active assignee on this day. */
  isMissingRequiredCrew: boolean;
  /** True when the job has crew assigned but all upcoming blocks have userId === null. */
  needsCrewRecalculation: boolean;
  /** Workers on this day's blocks who are also marked unavailable today. */
  unavailableWorkerIds: UserId[];
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function parseAutoFillOrdinal(blocks: ScheduleBlock[]): { dayIndex: number; totalDays: number } | null {
  for (const block of blocks) {
    const match = block.notes?.match(/Auto-filled day\s+(\d+)\s+of\s+(\d+)/i);
    if (!match) {
      continue;
    }

    const dayIndex = Number(match[1]);
    const totalDays = Number(match[2]);
    if (Number.isFinite(dayIndex) && dayIndex > 0 && Number.isFinite(totalDays) && totalDays > 0) {
      return { dayIndex, totalDays };
    }
  }

  return null;
}

/**
 * Groups raw per-worker ScheduleBlocks into one DailyJobGroup per (job, calendar day).
 * This is purely a view-model transform — the storage model is unchanged.
 */
export function buildDailyJobGroups(input: {
  items: SchedulingBlockDetail[];
  workerUnavailability: WorkerUnavailability[];
  planIssuesByBlockId: Map<ScheduleBlock["id"], SchedulingPlanIssue[]>;
  jobsNeedingCrewRecalculation: Set<Job["id"]>;
}): DailyJobGroup[] {
  // 1. Bucket items by (jobId, day)
  type Bucket = { items: SchedulingBlockDetail[]; day: string };
  const buckets = new Map<string, Bucket>();

  for (const item of input.items) {
    const day = toDateKey(item.block.startAt);
    const key = `${item.block.jobId}::${day}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, { items: [item], day });
    }
  }

  // 2. Compute sorted day lists per job for dayIndex / totalDays
  const daySetByJob = new Map<Job["id"], Set<string>>();
  for (const [, { items, day }] of buckets) {
    const jobId = items[0]!.job.id;
    const set = daySetByJob.get(jobId) ?? new Set<string>();
    set.add(day);
    daySetByJob.set(jobId, set);
  }
  const sortedDaysByJob = new Map<Job["id"], string[]>();
  for (const [jobId, days] of daySetByJob) {
    sortedDaysByJob.set(jobId, Array.from(days).sort());
  }

  // 3. Build a per-day unavailability index
  const unavailByDay = new Map<string, Set<UserId>>();
  for (const entry of input.workerUnavailability) {
    if (entry.deletedAt !== null) continue;
    const set = unavailByDay.get(entry.day) ?? new Set<UserId>();
    set.add(entry.userId);
    unavailByDay.set(entry.day, set);
  }

  // 4. Build one DailyJobGroup per bucket
  const groups: DailyJobGroup[] = [];

  for (const [key, { items, day }] of buckets) {
    const firstItem = items[0]!;
    const jobId = firstItem.job.id;

    const blocks = items
      .map((i) => i.block)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    // Deduplicate worker IDs in first-seen order
    const seenIds = new Set<UserId | null>();
    const scheduledUserIds: Array<UserId | null> = [];
    for (const block of blocks) {
      if (!seenIds.has(block.userId)) {
        seenIds.add(block.userId);
        scheduledUserIds.push(block.userId);
      }
    }

    const unavailToday = unavailByDay.get(day) ?? new Set<UserId>();
    const unavailableWorkerIds = scheduledUserIds.filter(
      (id): id is UserId => id !== null && unavailToday.has(id),
    );

    const activeAssignedUserIds = Array.from(
      new Set(
        firstItem.assignments
          .filter((assignment) => assignment.deletedAt === null)
          .map((assignment) => assignment.userId),
      ),
    );
    const scheduledAssignedUserIds = new Set(
      scheduledUserIds.filter((id): id is UserId => id !== null),
    );
    const isMissingRequiredCrew =
      firstItem.job.requiresFullCrewTogether &&
      activeAssignedUserIds.length > 1 &&
      activeAssignedUserIds.some((userId) => !scheduledAssignedUserIds.has(userId));

    const hasConflict = blocks.some((b) => input.planIssuesByBlockId.has(b.id)) || isMissingRequiredCrew;
    const isNextForJob = items.some((i) => i.isNextForJob);
    const isAutoFilled = blocks.some((b) => b.notes?.includes("Auto-filled") === true);
    const isSplitDay = blocks.some((b) => b.notes?.includes("Day split") === true);
    const totalHoursThisDay = blocks.reduce((sum, b) => sum + b.durationHours, 0);

    const autoFillOrdinal = parseAutoFillOrdinal(blocks);
    const sortedDays = sortedDaysByJob.get(jobId) ?? [day];
    const dayIndex = autoFillOrdinal?.dayIndex ?? sortedDays.indexOf(day) + 1;
    const totalDays = autoFillOrdinal?.totalDays ?? sortedDays.length;

    groups.push({
      key,
      jobId,
      day,
      job: firstItem.job,
      assignments: firstItem.assignments,
      blocks,
      scheduledUserIds,
      isNextForJob,
      isAutoFilled,
      timeBucket: blocks[0]!.timeBucket,
      startAt: blocks[0]!.startAt,
      totalHoursThisDay,
      estimatedHours: firstItem.job.estimatedHours ?? null,
      dayIndex,
      totalDays,
      hasConflict,
      isSplitDay,
      requiresFullCrewTogether: firstItem.job.requiresFullCrewTogether,
      isMissingRequiredCrew,
      needsCrewRecalculation: input.jobsNeedingCrewRecalculation.has(jobId),
      unavailableWorkerIds,
    });
  }

  // Sort by job number for a stable, predictable order within each day column
  groups.sort((a, b) => {
    const byNumber = a.job.number.localeCompare(b.job.number);
    if (byNumber !== 0) return byNumber;
    return a.jobId.localeCompare(b.jobId);
  });

  return groups;
}
