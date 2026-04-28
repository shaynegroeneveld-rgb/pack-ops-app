import type { Job } from "@/domain/jobs/types";
import type { ScheduleBlock, UpcomingScheduleBlock } from "@/domain/scheduling/types";

const NON_SCHEDULABLE_JOB_STATUSES = new Set<Job["status"]>([
  "work_complete",
  "ready_to_invoice",
  "invoiced",
  "closed",
  "cancelled",
]);

export function getNextScheduledBlockForJob(
  jobId: Job["id"],
  blocks: ScheduleBlock[],
  fromIso: string,
): ScheduleBlock | null {
  return (
    blocks
      .filter(
        (block) =>
          block.jobId === jobId &&
          block.deletedAt === null &&
          new Date(block.endAt).getTime() >= new Date(fromIso).getTime(),
      )
      .sort((left, right) => left.startAt.localeCompare(right.startAt))[0] ?? null
  );
}

// Returns the calendar-day string (YYYY-MM-DD) for a block's start time.
// Kept local to the domain layer to avoid importing service helpers.
function blockDay(block: ScheduleBlock): string {
  const d = new Date(block.startAt);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mapUpcomingScheduleBlocks(
  blocks: ScheduleBlock[],
  fromIso: string,
): UpcomingScheduleBlock[] {
  const upcomingBlocks = blocks
    .filter(
      (block) =>
        block.deletedAt === null &&
        new Date(block.endAt).getTime() >= new Date(fromIso).getTime(),
    )
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  // Track the first scheduled calendar day per job, not just the first block ID.
  // Multi-worker auto-fill produces several blocks on the same day for the same job —
  // all of them should be flagged isNextForJob = true so the UI highlights the full
  // crew for that day, not an arbitrary single block.
  const nextDayByJob = new Map<Job["id"], string>();
  for (const block of upcomingBlocks) {
    if (!nextDayByJob.has(block.jobId)) {
      nextDayByJob.set(block.jobId, blockDay(block));
    }
  }

  return upcomingBlocks.map((block) => ({
    block,
    isNextForJob: nextDayByJob.get(block.jobId) === blockDay(block),
  }));
}

export function deriveUnscheduledJobs(
  jobs: Job[],
  blocks: ScheduleBlock[],
  fromIso: string,
): Job[] {
  return jobs.filter((job) => {
    if (job.deletedAt !== null || NON_SCHEDULABLE_JOB_STATUSES.has(job.status)) {
      return false;
    }

    return getNextScheduledBlockForJob(job.id, blocks, fromIso) === null;
  });
}
