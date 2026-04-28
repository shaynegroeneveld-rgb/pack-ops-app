import type { JobAssignment } from "@/domain/jobs/types";
import type { ScheduleBlock, WorkerUnavailability } from "@/domain/scheduling/types";
import type { UserId } from "@/domain/ids";

export interface JobCapacitySummary {
  estimatedHours: number | null;
  assignedCrewCount: number;
  planningCrewCount: number;
  dailyCapacityHours: number;
  personDays: number | null;
  daysNeededRaw: number | null;
  daysNeededRounded: number | null;
  suggestedEndDate: string | null;
  daysNeeded: number | null;
}

// Single source of truth for the default workday length used by all capacity helpers
// and auto-fill block creation. Do not hardcode 8 elsewhere.
export const DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY = 8;
const MAX_AUTO_FILL_LOOKAHEAD_DAYS = 90;

export interface AutoFillPlanDay {
  day: string;
  userIds: Array<UserId | null>;
  allocations: Array<{ userId: UserId | null; hours: number }>;
  workerHours: number;
  unavailableUserIds: UserId[];
}

export interface AutoFillPlan {
  days: AutoFillPlanDay[];
  estimatedHours: number;
  assignedCrewCount: number;
  planningCrewCount: number;
  daysNeededRounded: number;
  totalPlannedHours: number;
  skippedDayCount: number;
  extendedByAvailability: boolean;
  hasAvailabilityConflict: boolean;
}

export function getActiveUniqueAssignments(assignments: JobAssignment[]): JobAssignment[] {
  const seenUserIds = new Set<UserId>();
  const uniqueAssignments: JobAssignment[] = [];

  for (const assignment of assignments) {
    if (assignment.deletedAt !== null || seenUserIds.has(assignment.userId)) {
      continue;
    }

    seenUserIds.add(assignment.userId);
    uniqueAssignments.push(assignment);
  }

  return uniqueAssignments;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateInputValue(input: Date): string {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addWorkdays(startDay: string, workdayOffset: number): string | null {
  const date = new Date(`${startDay}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  let remaining = Math.max(0, Math.floor(workdayOffset));
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      remaining -= 1;
    }
  }

  return toDateInputValue(date);
}

export function getWorkdaySequence(startDay: string, count: number): string[] {
  const days: string[] = [];
  for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) {
    const day = addWorkdays(startDay, index);
    if (day) {
      days.push(day);
    }
  }
  return days;
}

export function isWeekend(day: string): boolean {
  const date = new Date(`${day}T12:00:00`);
  return date.getDay() === 0 || date.getDay() === 6;
}

export function getScheduleDay(block: Pick<ScheduleBlock, "startAt">): string {
  return toDateInputValue(new Date(block.startAt));
}

export function getUnavailableUserIdsForDay(
  day: string,
  unavailability: WorkerUnavailability[],
): Set<UserId> {
  return new Set(
    unavailability
      .filter((entry) => entry.day === day && entry.deletedAt === null)
      .map((entry) => entry.userId),
  );
}

export function buildAutoFillPlan(input: {
  estimatedHours: number | null;
  assignments: JobAssignment[];
  startDay: string;
  unavailability: WorkerUnavailability[];
  blockingScheduleBlocks?: ScheduleBlock[];
  usePartialDayCapacity?: boolean;
  requiresFullCrewTogether?: boolean;
}): AutoFillPlan | null {
  const assignments = getActiveUniqueAssignments(input.assignments);
  const capacity = computeJobCapacitySummary({
    estimatedHours: input.estimatedHours,
    assignedCrewCount: assignments.length,
    startDay: input.startDay,
  });

  if (!capacity.estimatedHours || !capacity.daysNeededRounded) {
    return null;
  }

  const assignedUserIds = assignments.map((assignment) => assignment.userId);
  const planningUserIds: Array<UserId | null> = assignedUserIds.length > 0 ? assignedUserIds : [null];
  // Occupancy rule: day-based. Any existing schedule block for a worker on a given calendar
  // day marks that worker as unavailable for the entire day, regardless of block duration or
  // time bucket. This keeps dispatch simple — one worker, one job per day by default.
  const busyByDay = new Map<string, Set<UserId>>();
  const bookedHoursByDayUser = new Map<string, Map<UserId, number>>();

  for (const block of input.blockingScheduleBlocks ?? []) {
    if (!block.userId || block.deletedAt !== null) {
      continue;
    }

    const day = getScheduleDay(block);
    if (input.usePartialDayCapacity) {
      const hoursByUser = bookedHoursByDayUser.get(day) ?? new Map<UserId, number>();
      hoursByUser.set(block.userId, (hoursByUser.get(block.userId) ?? 0) + block.durationHours);
      bookedHoursByDayUser.set(day, hoursByUser);
    } else {
      const busyUsers = busyByDay.get(day) ?? new Set<UserId>();
      busyUsers.add(block.userId);
      busyByDay.set(day, busyUsers);
    }
  }

  const days: AutoFillPlanDay[] = [];
  let totalPlannedHours = 0;
  let remainingHours = capacity.estimatedHours;
  let skippedDayCount = 0;
  let cursor = input.startDay;

  for (let index = 0; index < MAX_AUTO_FILL_LOOKAHEAD_DAYS && remainingHours > 0; index += 1) {
    if (index > 0) {
      const nextDay = addWorkdays(cursor, 1);
      if (!nextDay) {
        break;
      }
      cursor = nextDay;
    }

    if (isWeekend(cursor)) {
      skippedDayCount += 1;
      continue;
    }

    const unavailableUserIds = getUnavailableUserIdsForDay(cursor, input.unavailability);
    const busyUserIds = busyByDay.get(cursor) ?? new Set<UserId>();
    const bookedHoursByUser = bookedHoursByDayUser.get(cursor) ?? new Map<UserId, number>();
    const allocations: Array<{ userId: UserId | null; hours: number }> = [];

    if (input.requiresFullCrewTogether && assignedUserIds.length > 1) {
      const requiredUserIds = assignedUserIds;
      const capacities: number[] = [];
      let allRequiredCrewAvailable = true;

      for (const userId of requiredUserIds) {
        if (unavailableUserIds.has(userId) || busyUserIds.has(userId)) {
          allRequiredCrewAvailable = false;
          break;
        }

        const alreadyBookedHours = input.usePartialDayCapacity ? bookedHoursByUser.get(userId) ?? 0 : 0;
        const remainingDailyCapacity = Math.max(0, DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY - alreadyBookedHours);
        if (remainingDailyCapacity <= 0) {
          allRequiredCrewAvailable = false;
          break;
        }

        capacities.push(remainingDailyCapacity);
      }

      if (allRequiredCrewAvailable) {
        const sharedHours = Math.min(
          Math.min(...capacities),
          remainingHours / requiredUserIds.length,
        );

        if (sharedHours > 0) {
          for (const userId of requiredUserIds) {
            allocations.push({ userId, hours: sharedHours });
          }
          remainingHours -= sharedHours * requiredUserIds.length;
        }
      }
    } else {
      for (const userId of planningUserIds) {
        if (!userId) {
          const hours = Math.min(DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY, remainingHours);
          allocations.push({ userId, hours });
          remainingHours -= hours;
          continue;
        }

        if (unavailableUserIds.has(userId) || busyUserIds.has(userId)) {
          continue;
        }

        const alreadyBookedHours = input.usePartialDayCapacity ? bookedHoursByUser.get(userId) ?? 0 : 0;
        const remainingDailyCapacity = Math.max(0, DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY - alreadyBookedHours);
        const hours = Math.min(remainingDailyCapacity, remainingHours);
        if (hours <= 0) {
          continue;
        }

        allocations.push({ userId, hours });
        remainingHours -= hours;

        if (remainingHours <= 0) {
          break;
        }
      }
    }

    if (allocations.length === 0) {
      skippedDayCount += 1;
      continue;
    }

    const availableUserIds = allocations.map((allocation) => allocation.userId);
    const workerHours = allocations.reduce((sum, allocation) => sum + allocation.hours, 0);
    days.push({
      day: cursor,
      userIds: availableUserIds,
      allocations,
      workerHours,
      unavailableUserIds: planningUserIds.reduce<UserId[]>((userIds, userId) => {
        if (userId && unavailableUserIds.has(userId)) {
          userIds.push(userId);
        }
        return userIds;
      }, []),
    });
    totalPlannedHours += workerHours;
  }

  if (days.length === 0 || totalPlannedHours < capacity.estimatedHours) {
    return null;
  }

  return {
    days,
    estimatedHours: capacity.estimatedHours,
    assignedCrewCount: capacity.assignedCrewCount,
    planningCrewCount: capacity.planningCrewCount,
    daysNeededRounded: capacity.daysNeededRounded,
    totalPlannedHours,
    skippedDayCount,
    extendedByAvailability: days.length > capacity.daysNeededRounded,
    hasAvailabilityConflict: days.some((day) => day.unavailableUserIds.length > 0) || skippedDayCount > 0,
  };
}

/**
 * Returns true when a job has assigned crew but its upcoming auto-filled blocks are all
 * unassigned (userId === null). This signals that crew was added after the plan was created
 * and the schedule should be recalculated to assign workers properly.
 */
export function hasUnassignedBlocksWithCrew(input: {
  assignedCrewCount: number;
  upcomingBlocks: Array<Pick<ScheduleBlock, "userId" | "jobId">>;
  jobId: string;
}): boolean {
  if (input.assignedCrewCount === 0) {
    return false;
  }
  const jobBlocks = input.upcomingBlocks.filter((block) => block.jobId === input.jobId);
  return jobBlocks.length > 0 && jobBlocks.every((block) => block.userId === null);
}

export function computeJobCapacitySummary(input: {
  estimatedHours: number | null;
  assignedCrewCount: number;
  startDay?: string | null;
}): JobCapacitySummary {
  const estimatedHours =
    typeof input.estimatedHours === "number" && Number.isFinite(input.estimatedHours) && input.estimatedHours > 0
      ? input.estimatedHours
      : null;
  const assignedCrewCount = Math.max(0, Math.floor(input.assignedCrewCount));
  const planningCrewCount = Math.max(assignedCrewCount, 1);
  const dailyCapacityHours = planningCrewCount * DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY;
  const personDays =
    estimatedHours !== null ? roundToTwo(estimatedHours / DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY) : null;
  const daysNeededRaw = estimatedHours !== null ? roundToTwo(estimatedHours / dailyCapacityHours) : null;
  const daysNeededRounded = daysNeededRaw !== null ? Math.max(1, Math.ceil(daysNeededRaw)) : null;
  const suggestedEndDate =
    input.startDay && daysNeededRounded !== null ? addWorkdays(input.startDay, daysNeededRounded - 1) : null;

  return {
    estimatedHours,
    assignedCrewCount,
    planningCrewCount,
    dailyCapacityHours,
    personDays,
    daysNeededRaw,
    daysNeededRounded,
    suggestedEndDate,
    daysNeeded: daysNeededRaw,
  };
}
