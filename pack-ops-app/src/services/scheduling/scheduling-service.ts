import type { SupabaseClient } from "@supabase/supabase-js";

import { JobAssignmentsRepositoryImpl } from "@/data/repositories/job-assignments.repository.impl";
import { JobsRepositoryImpl } from "@/data/repositories/jobs.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { ScheduleBlocksRepositoryImpl } from "@/data/repositories/schedule-blocks.repository.impl";
import { WorkerUnavailabilityRepositoryImpl } from "@/data/repositories/worker-unavailability.repository.impl";
import { SyncEngine } from "@/data/sync/engine";
import { PullSyncService } from "@/data/sync/pull";
import { PushSyncService } from "@/data/sync/push";
import { WorkbenchSyncGateway } from "@/data/sync/workbench-sync-gateway";
import type { Database } from "@/data/supabase/types";
import { deriveUnscheduledJobs, getNextScheduledBlockForJob, mapUpcomingScheduleBlocks } from "@/domain/scheduling/derived";
import type { Job, JobAssignment } from "@/domain/jobs/types";
import type { ScheduleBlock, UpcomingScheduleBlock, WorkerUnavailability } from "@/domain/scheduling/types";
import type { User } from "@/domain/users/types";
import {
  buildAutoFillPlan,
  computeJobCapacitySummary,
  DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY,
  getActiveUniqueAssignments,
  getScheduleDay,
  getUnavailableUserIdsForDay,
} from "@/services/scheduling/job-capacity";

export interface CreateScheduleBlockInput {
  jobId: ScheduleBlock["jobId"];
  userId?: ScheduleBlock["userId"];
  day: string;
  timeBucket?: ScheduleBlock["timeBucket"];
  startTime?: string | null;
  durationHours?: ScheduleBlock["durationHours"];
  notes?: ScheduleBlock["notes"];
}

export interface UpdateScheduleBlockInput {
  scheduleBlockId: ScheduleBlock["id"];
  userId?: ScheduleBlock["userId"];
  day?: string;
  timeBucket?: ScheduleBlock["timeBucket"];
  startTime?: string | null;
  durationHours?: ScheduleBlock["durationHours"];
  notes?: ScheduleBlock["notes"];
}

export interface CarryOverScheduleBlockInput {
  scheduleBlockId: ScheduleBlock["id"];
  day: string;
  reason?: string | null;
}

export interface AutoFillScheduleInput {
  jobId: ScheduleBlock["jobId"];
  day: string;
  timeBucket?: ScheduleBlock["timeBucket"];
  startTime?: string | null;
  userId?: ScheduleBlock["userId"];
  notes?: ScheduleBlock["notes"];
  clearExisting?: boolean;
  findNextAvailable?: boolean;
}

export interface SchedulingBlockDetail extends UpcomingScheduleBlock {
  job: Job;
  assignments: JobAssignment[];
}

export interface SchedulingUserOption {
  id: User["id"];
  label: string;
  email: string;
  role: User["role"];
}

export interface SchedulingPlanIssue {
  blockId: ScheduleBlock["id"];
  jobId: Job["id"];
  userId: User["id"];
  day: string;
  reason: string;
}

function canManageSchedule(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function canViewSchedule(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "field";
}

const NEXT_AVAILABLE_TODAY_CUTOFF_HOUR = 12;

function addHours(startAt: string, durationHours: number): string {
  return new Date(new Date(startAt).getTime() + durationHours * 60 * 60 * 1000).toISOString();
}

function toLocalDayValue(dateIso: string): string {
  const date = new Date(dateIso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeValue(dateIso: string): string {
  const date = new Date(dateIso);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDayValue(date.toISOString());
}

function isWeekendDay(day: string): boolean {
  const date = new Date(`${day}T12:00:00`);
  return date.getDay() === 0 || date.getDay() === 6;
}

function nextWeekday(day: string): string {
  let candidate = addCalendarDays(day, 1);
  while (isWeekendDay(candidate)) {
    candidate = addCalendarDays(candidate, 1);
  }
  return candidate;
}

function getNextAvailableSearchStartDay(requestedDay: string, now = new Date()): string {
  const today = toLocalDayValue(now.toISOString());
  let candidate = requestedDay < today ? today : requestedDay;

  // Scheduling is day-level. Once the planning cutoff passes, today is no longer a useful default day.
  if (candidate === today && now.getHours() >= NEXT_AVAILABLE_TODAY_CUTOFF_HOUR) {
    candidate = nextWeekday(today);
  }

  while (isWeekendDay(candidate)) {
    candidate = nextWeekday(candidate);
  }

  return candidate;
}

function getDefaultStartTimeForBucket(timeBucket: ScheduleBlock["timeBucket"]): string {
  switch (timeBucket) {
    case "am":
      return "08:00";
    case "pm":
      return "13:00";
    default:
      return "09:00";
  }
}

function hasExplicitStartTime(block: Pick<ScheduleBlock, "startAt" | "timeBucket">): boolean {
  return toLocalTimeValue(block.startAt) !== getDefaultStartTimeForBucket(block.timeBucket);
}

export class SchedulingService {
  readonly jobs;
  readonly jobAssignments;
  readonly scheduleBlocks;
  readonly workerUnavailability;
  readonly sync;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    const gateway = new WorkbenchSyncGateway(client);

    this.jobs = new JobsRepositoryImpl(context, client);
    this.jobAssignments = new JobAssignmentsRepositoryImpl(context, client);
    this.scheduleBlocks = new ScheduleBlocksRepositoryImpl(context, client);
    this.workerUnavailability = new WorkerUnavailabilityRepositoryImpl(context, client);
    this.sync = new SyncEngine({
      push: new PushSyncService(gateway),
      pull: new PullSyncService(gateway),
    });
  }

  private assertCanManageSchedule() {
    if (!canManageSchedule(this.currentUser)) {
      throw new Error("You cannot manage scheduling.");
    }
  }

  private buildScheduleWindow(input: {
    day: string;
    timeBucket?: ScheduleBlock["timeBucket"];
    startTime?: string | null;
    durationHours?: number;
  }): Pick<ScheduleBlock, "startAt" | "endAt" | "durationHours" | "timeBucket"> {
    const durationHours = input.durationHours ?? null;

    if (!durationHours || durationHours <= 0) {
      throw new Error("Schedule blocks need a positive duration.");
    }

    const timeBucket = input.timeBucket ?? "anytime";
    const normalizedStartTime = input.startTime?.trim() || getDefaultStartTimeForBucket(timeBucket);
    const startAt = new Date(`${input.day}T${normalizedStartTime}:00`);

    if (Number.isNaN(startAt.getTime())) {
      throw new Error("Choose a valid schedule day.");
    }

    const endAt = addHours(startAt.toISOString(), durationHours);
    if (new Date(endAt).getTime() <= startAt.getTime()) {
      throw new Error("Schedule block end time must be after start time.");
    }

    return {
      startAt: startAt.toISOString(),
      endAt,
      timeBucket,
      durationHours,
    };
  }

  async createScheduleBlock(input: CreateScheduleBlockInput): Promise<ScheduleBlock> {
    this.assertCanManageSchedule();

    const window = this.buildScheduleWindow(input);
    const block = await this.scheduleBlocks.create({
      jobId: input.jobId,
      userId: input.userId ?? null,
      notes: input.notes ?? null,
      ...window,
    });

    await this.sync.flushPendingQueue();
    return block;
  }

  async updateJobEstimatedHours(input: {
    jobId: Job["id"];
    estimatedHours: number | null;
  }): Promise<Job> {
    this.assertCanManageSchedule();

    const estimatedHours =
      input.estimatedHours == null
        ? null
        : Number.isFinite(input.estimatedHours) && input.estimatedHours > 0
          ? Number(input.estimatedHours)
          : null;

    const job = await this.jobs.update(input.jobId, { estimatedHours });
    await this.sync.flushPendingQueue({ force: true });
    await this.sync.refreshScheduling();
    return job;
  }

  async updateJobFullCrewRule(input: {
    jobId: Job["id"];
    requiresFullCrewTogether: boolean;
  }): Promise<Job> {
    this.assertCanManageSchedule();

    const job = await this.jobs.update(input.jobId, {
      requiresFullCrewTogether: input.requiresFullCrewTogether,
    });
    await this.sync.flushPendingQueue({ force: true });
    await this.sync.refreshScheduling();
    return job;
  }

  async autoFillScheduleBlocks(input: AutoFillScheduleInput): Promise<ScheduleBlock[]> {
    this.assertCanManageSchedule();

    const job = await this.jobs.getById(input.jobId);
    if (!job) {
      throw new Error("Job not found.");
    }

    if (!job.estimatedHours || job.estimatedHours <= 0) {
      throw new Error("Add an estimate to auto-fill days.");
    }

    const startDay = input.findNextAvailable ? await this.findNextAvailableStartDay(input.jobId, input.day) : input.day;
    const planWindowEnd = new Date(`${startDay}T00:00:00`);
    planWindowEnd.setDate(planWindowEnd.getDate() + 90);
    const planWindowEndDay = toLocalDayValue(planWindowEnd.toISOString());

    const [rawAssignments, unavailability, scheduleBlocks] = await Promise.all([
      this.jobAssignments.list({ filter: { jobId: job.id } }),
      this.workerUnavailability.list({ filter: { from: startDay, to: planWindowEndDay } }),
      this.scheduleBlocks.list({
        filter: {
          from: new Date(`${startDay}T00:00:00`).toISOString(),
          to: new Date(`${planWindowEndDay}T23:59:59`).toISOString(),
        },
      }),
    ]);
    const assignments = getActiveUniqueAssignments(rawAssignments);

    const existingJobBlocks = scheduleBlocks.filter((block) => block.jobId === job.id);
    if (existingJobBlocks.length > 0 && !input.clearExisting) {
      throw new Error("This job already has upcoming scheduled blocks. Use Recalculate schedule to replace them.");
    }

    if (input.clearExisting) {
      for (const block of existingJobBlocks) {
        await this.scheduleBlocks.softDelete(block.id);
      }
    }

    const plan = buildAutoFillPlan({
      estimatedHours: job.estimatedHours,
      assignments,
      startDay,
      unavailability,
      blockingScheduleBlocks: scheduleBlocks.filter((block) => block.jobId !== job.id),
      usePartialDayCapacity: input.findNextAvailable === true,
      requiresFullCrewTogether: job.requiresFullCrewTogether,
    });

    if (!plan) {
      throw new Error(assignments.length > 0 ? "No available crew space found in the next 90 days." : "Choose a valid start day.");
    }

    const blocks: ScheduleBlock[] = [];
    for (const [dayIndex, planDay] of plan.days.entries()) {
      for (const allocation of planDay.allocations) {
        const window = this.buildScheduleWindow({
          day: planDay.day,
          timeBucket: input.timeBucket ?? "anytime",
          startTime: input.startTime ?? null,
          durationHours: allocation.hours,
        });

        const notes = [
          input.notes?.trim() || null,
          `Auto-filled day ${dayIndex + 1} of ${plan.days.length}.`,
          allocation.hours < DEFAULT_WORK_HOURS_PER_PERSON_PER_DAY ? "Day split: used remaining daily capacity." : null,
          plan.extendedByAvailability && dayIndex === plan.days.length - 1
            ? "Schedule was extended due to crew availability."
            : null,
        ].filter(Boolean).join("\n");

        const block = await this.scheduleBlocks.create({
          jobId: input.jobId,
          userId: allocation.userId,
          notes,
          ...window,
        });
        blocks.push(block);
      }
    }

    await this.sync.flushPendingQueue();
    return blocks;
  }

  async updateScheduleBlock(input: UpdateScheduleBlockInput): Promise<ScheduleBlock> {
    this.assertCanManageSchedule();

    const existing = await this.scheduleBlocks.getById(input.scheduleBlockId);
    if (!existing) {
      throw new Error("Schedule block not found.");
    }

    const window = this.buildScheduleWindow({
      day: input.day ?? toLocalDayValue(existing.startAt),
      timeBucket: input.timeBucket ?? existing.timeBucket,
      startTime: input.startTime ?? (hasExplicitStartTime(existing) ? toLocalTimeValue(existing.startAt) : null),
      durationHours: input.durationHours ?? existing.durationHours,
    });

    const updated = await this.scheduleBlocks.update(input.scheduleBlockId, {
      userId: input.userId ?? existing.userId,
      notes: input.notes ?? existing.notes,
      ...window,
    });

    await this.sync.flushPendingQueue();
    return updated;
  }

  async carryOverScheduleBlock(input: CarryOverScheduleBlockInput): Promise<ScheduleBlock> {
    this.assertCanManageSchedule();

    const existing = await this.scheduleBlocks.getById(input.scheduleBlockId);
    if (!existing) {
      throw new Error("Schedule block not found.");
    }

    const reason = input.reason?.trim() ?? "";
    const nextNotes = reason
      ? existing.notes?.trim()
        ? `${existing.notes.trim()}\nCarryover: ${reason}`
        : `Carryover: ${reason}`
      : existing.notes;

    const updated = await this.updateScheduleBlock({
      scheduleBlockId: input.scheduleBlockId,
      day: input.day,
      timeBucket: existing.timeBucket,
      startTime: hasExplicitStartTime(existing) ? toLocalTimeValue(existing.startAt) : null,
      durationHours: existing.durationHours,
      userId: existing.userId,
      notes: nextNotes,
    });

    return updated;
  }

  async deleteScheduleBlock(scheduleBlockId: ScheduleBlock["id"]): Promise<void> {
    this.assertCanManageSchedule();
    await this.scheduleBlocks.softDelete(scheduleBlockId);
    await this.sync.flushPendingQueue();
  }

  async listAssignableUsers(): Promise<SchedulingUserOption[]> {
    if (!canManageSchedule(this.currentUser)) {
      return [];
    }

    const { data, error } = await this.client
      .from("users")
      .select("id, full_name, email, role")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((user) => ({
      id: user.id as User["id"],
      label: user.full_name ?? user.email,
      email: user.email,
      role: user.role as User["role"],
    }));
  }

  async assignJobToUser(jobId: Job["id"], userId: User["id"]): Promise<JobAssignment> {
    this.assertCanManageSchedule();

    const [existingAssignments, users] = await Promise.all([
      this.jobAssignments.list({ filter: { jobId } }),
      this.listAssignableUsers(),
    ]);
    const existing = existingAssignments.find((assignment) => assignment.userId === userId);
    if (existing) {
      return existing;
    }

    const selectedUser = users.find((user) => user.id === userId);
    if (!selectedUser) {
      throw new Error("Choose a valid crew member.");
    }

    const assignment = await this.jobAssignments.create({
      jobId,
      userId,
      assignmentRole: selectedUser.role === "field" ? "technician" : "lead",
      assignedBy: this.currentUser.id,
    });
    await this.sync.flushPendingQueue();
    return assignment;
  }

  async removeJobAssignment(assignmentId: JobAssignment["id"]): Promise<void> {
    this.assertCanManageSchedule();
    await this.jobAssignments.softDelete(assignmentId);
    await this.sync.flushPendingQueue();
  }

  async listWorkerUnavailability(options: { from: string; to: string }): Promise<WorkerUnavailability[]> {
    if (!canViewSchedule(this.currentUser)) {
      throw new Error("You cannot view scheduling.");
    }

    return this.workerUnavailability.list({
      filter: {
        from: options.from,
        to: options.to,
      },
    });
  }

  async markWorkerUnavailable(input: {
    userId: User["id"];
    day: string;
    reason?: string | null;
  }): Promise<WorkerUnavailability> {
    this.assertCanManageSchedule();

    const existing = (await this.workerUnavailability.list({
      filter: {
        userId: input.userId,
        from: input.day,
        to: input.day,
      },
    }))[0];
    if (existing) {
      return existing;
    }

    const entry = await this.workerUnavailability.create({
      orgId: this.context.orgId as WorkerUnavailability["orgId"],
      userId: input.userId,
      day: input.day,
      reason: input.reason?.trim() || null,
      createdBy: this.currentUser.id,
      updatedBy: this.currentUser.id,
    });
    await this.sync.flushPendingQueue();
    return entry;
  }

  async removeWorkerUnavailability(id: WorkerUnavailability["id"]): Promise<void> {
    this.assertCanManageSchedule();
    await this.workerUnavailability.softDelete(id);
    await this.sync.flushPendingQueue();
  }

  async getPlanIssues(options: { from: string; to: string }): Promise<SchedulingPlanIssue[]> {
    if (!canViewSchedule(this.currentUser)) {
      throw new Error("You cannot view scheduling.");
    }

    const [blocks, unavailability] = await Promise.all([
      this.scheduleBlocks.list({
        filter: {
          from: new Date(`${options.from}T00:00:00`).toISOString(),
          to: new Date(`${options.to}T23:59:59`).toISOString(),
        },
      }),
      this.workerUnavailability.list({ filter: options }),
    ]);

    return blocks.flatMap((block) => {
      if (!block.userId) {
        return [];
      }

      const day = getScheduleDay(block);
      const unavailableUserIds = getUnavailableUserIdsForDay(day, unavailability);
      if (!unavailableUserIds.has(block.userId)) {
        return [];
      }

      return [{
        blockId: block.id,
        jobId: block.jobId,
        userId: block.userId,
        day,
        reason: "Assigned worker is marked off this day.",
      }];
    });
  }

  // "Next Available" rule:
  // Walks forward from requestedDay one calendar day at a time (up to 90 days).
  // For each candidate start day, builds a full auto-fill plan from that day.
  // Returns the first candidate where the plan's first scheduled day equals the candidate —
  // meaning at least one assigned worker is free that day and the full job can be planned.
  //
  // Partial staffing is intentional: if only some workers are available on day 1, the
  // plan starts with those workers and picks up the rest on days when they become free.
  // This keeps dispatch moving rather than waiting for full crew availability.
  // The resulting plan may span more calendar days than the minimum if crew is partially
  // unavailable, and extendedByAvailability will be true in the returned plan metadata.
  private async findNextAvailableStartDay(jobId: Job["id"], requestedDay: string): Promise<string> {
    const job = await this.jobs.getById(jobId);
    if (!job?.estimatedHours) {
      throw new Error("Add an estimate to use next available auto-fill.");
    }

    const assignments = getActiveUniqueAssignments(await this.jobAssignments.list({ filter: { jobId } }));
    if (assignments.length === 0) {
      throw new Error("Assign crew to use next available auto-fill.");
    }

    const searchStartDay = getNextAvailableSearchStartDay(requestedDay);

    for (let index = 0; index < 90; index += 1) {
      const candidate = index === 0 ? searchStartDay : addCalendarDays(searchStartDay, index);
      const planWindowEnd = new Date(`${candidate}T00:00:00`);
      planWindowEnd.setDate(planWindowEnd.getDate() + 90);
      const planWindowEndDay = toLocalDayValue(planWindowEnd.toISOString());
      const [unavailability, scheduleBlocks] = await Promise.all([
        this.workerUnavailability.list({ filter: { from: candidate, to: planWindowEndDay } }),
        this.scheduleBlocks.list({
          filter: {
            from: new Date(`${candidate}T00:00:00`).toISOString(),
            to: new Date(`${planWindowEndDay}T23:59:59`).toISOString(),
          },
        }),
      ]);
      const plan = buildAutoFillPlan({
        estimatedHours: job.estimatedHours,
        assignments,
        startDay: candidate,
        unavailability,
        blockingScheduleBlocks: scheduleBlocks.filter((block) => block.jobId !== job.id),
        usePartialDayCapacity: true,
        requiresFullCrewTogether: job.requiresFullCrewTogether,
      });

      if (plan?.days[0]?.day === candidate) {
        return candidate;
      }
    }

    throw new Error("No available crew space found in the next 90 days.");
  }

  async getUpcomingScheduleBlocks(options?: {
    from?: string;
    to?: string;
    userId?: ScheduleBlock["userId"];
  }): Promise<SchedulingBlockDetail[]> {
    if (!canViewSchedule(this.currentUser)) {
      throw new Error("You cannot view scheduling.");
    }

    const from = options?.from ?? new Date().toISOString();
    await this.sync.refreshScheduling();

    const scheduleFilter = {
      from,
      ...(options?.to !== undefined ? { to: options.to } : {}),
      ...(options?.userId !== undefined
        ? { userId: options.userId }
        : this.currentUser.role === "field"
          ? { userId: this.currentUser.id }
          : {}),
    };

    const [jobs, assignments, blocks] = await Promise.all([
      this.jobs.list(),
      this.jobAssignments.list(),
      this.scheduleBlocks.list({
        filter: scheduleFilter,
      }),
    ]);

    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    return mapUpcomingScheduleBlocks(blocks, from)
      .map((entry) => {
        const job = jobsById.get(entry.block.jobId);
        if (!job) {
          return null;
        }

        return {
          ...entry,
          job,
          assignments: assignments.filter((assignment) => assignment.jobId === job.id),
        } satisfies SchedulingBlockDetail;
      })
      .filter((entry): entry is SchedulingBlockDetail => entry !== null);
  }

  async getUnscheduledJobs(options?: { from?: string }): Promise<
    Array<{
      job: Job;
      nextScheduledBlock: ScheduleBlock | null;
      assignments: JobAssignment[];
    }>
  > {
    if (!canManageSchedule(this.currentUser)) {
      return [];
    }

    const from = options?.from ?? new Date().toISOString();
    await this.sync.refreshScheduling();

    const [jobs, assignments, blocks] = await Promise.all([
      this.jobs.list(),
      this.jobAssignments.list(),
      this.scheduleBlocks.list({ filter: { from } }),
    ]);

    return deriveUnscheduledJobs(jobs, blocks, from).map((job) => ({
      job,
      nextScheduledBlock: getNextScheduledBlockForJob(job.id, blocks, from),
      assignments: assignments.filter((assignment) => assignment.jobId === job.id),
    }));
  }
}
