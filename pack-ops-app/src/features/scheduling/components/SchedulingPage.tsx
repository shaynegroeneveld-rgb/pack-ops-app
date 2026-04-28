import { useEffect, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import type { JobAssignment, Job } from "@/domain/jobs/types";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import type { UserId, WorkerUnavailabilityId } from "@/domain/ids";
import { buildDailyJobGroups, type DailyJobGroup } from "@/domain/scheduling/board-groups";
import { CarryOverPanel, type CarryOverDraft } from "@/features/scheduling/components/CarryOverPanel";
import { DayDetailPanel } from "@/features/scheduling/components/DayDetailPanel";
import { ScheduleEditorPanel, type ScheduleEditorDraft } from "@/features/scheduling/components/ScheduleEditorPanel";
import { useSchedulingSlice } from "@/features/scheduling/hooks/use-scheduling-slice";
import {
  cardStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import {
  computeJobCapacitySummary,
  getActiveUniqueAssignments,
  hasUnassignedBlocksWithCrew,
} from "@/services/scheduling/job-capacity";
import type { SchedulingUserOption } from "@/services/scheduling/scheduling-service";

function startOfWeekMonday(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(input: Date, days: number): Date {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function nextWorkday(input: Date): Date {
  const date = addDays(input, 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function toDateInputValue(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDayKey(input: string): string {
  return toDateInputValue(new Date(input));
}

function toTimeInputValue(input: string): string {
  const date = new Date(input);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toDurationValue(hours: number | null | undefined): string {
  if (!hours || Number.isNaN(hours)) {
    return "4";
  }

  return Number(hours).toString();
}

function getWeekRangeLabel(days: Date[]): string {
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return `${formatter.format(days[0])} - ${formatter.format(days[days.length - 1])}`;
}

function getDayLabel(day: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(day);
}

function getScheduleTimeLabel(block: ScheduleBlock): string | null {
  const defaultTime =
    block.timeBucket === "pm" ? "13:00" : block.timeBucket === "am" ? "08:00" : "09:00";
  if (toTimeInputValue(block.startAt) === defaultTime) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(block.startAt));
}

function getAssigneeLabel(
  scheduleBlock: ScheduleBlock,
  assignments: JobAssignment[],
  currentUserId: string,
): string {
  if (!scheduleBlock.userId) {
    return assignments.length > 0 ? "Crew assigned" : "Unassigned";
  }

  if (scheduleBlock.userId === currentUserId) {
    return "Assigned to you";
  }

  const matchingAssignment = assignments.find((assignment) => assignment.userId === scheduleBlock.userId);
  if (matchingAssignment) {
    return `${matchingAssignment.assignmentRole} · ${matchingAssignment.userId.slice(0, 8)}`;
  }

  return `Assigned · ${scheduleBlock.userId.slice(0, 8)}`;
}

function getTimeBucketLabel(timeBucket: ScheduleBlock["timeBucket"]): string {
  switch (timeBucket) {
    case "am":
      return "AM";
    case "pm":
      return "PM";
    default:
      return "Anytime";
  }
}

const TIME_BUCKET_ORDER: Record<ScheduleBlock["timeBucket"], number> = {
  am: 0,
  pm: 1,
  anytime: 2,
};

function getScheduleSummaryLabel(day: Date, block: ScheduleBlock): string {
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day);
  const timeLabel = getScheduleTimeLabel(block);
  return `${dayLabel} • ${timeLabel ?? getTimeBucketLabel(block.timeBucket)}`;
}

function getScheduledDayCount(blocks: ScheduleBlock[]): number {
  return new Set(blocks.map((block) => toLocalDayKey(block.startAt))).size;
}

function getAutoFillFeedback(blocks: ScheduleBlock[], prefix = "Auto-filled"): string {
  const dayCount = getScheduledDayCount(blocks);
  return `${prefix} ${dayCount} scheduled day${dayCount === 1 ? "" : "s"} (${blocks.length} worker block${blocks.length === 1 ? "" : "s"}).`;
}

function compareJobsStable(left: Job, right: Job): number {
  const byNumber = left.number.localeCompare(right.number);
  if (byNumber !== 0) {
    return byNumber;
  }

  const byTitle = left.title.localeCompare(right.title);
  if (byTitle !== 0) {
    return byTitle;
  }

  return left.id.localeCompare(right.id);
}

function compareScheduledItemsStable(
  left: { block: ScheduleBlock; job: Job },
  right: { block: ScheduleBlock; job: Job },
): number {
  const leftTime = getScheduleTimeLabel(left.block);
  const rightTime = getScheduleTimeLabel(right.block);

  if (leftTime && rightTime) {
    const byStart = left.block.startAt.localeCompare(right.block.startAt);
    if (byStart !== 0) {
      return byStart;
    }
  } else if (!leftTime && !rightTime) {
    const byBucket = TIME_BUCKET_ORDER[left.block.timeBucket] - TIME_BUCKET_ORDER[right.block.timeBucket];
    if (byBucket !== 0) {
      return byBucket;
    }
  }

  const byJob = compareJobsStable(left.job, right.job);
  if (byJob !== 0) {
    return byJob;
  }

  return left.block.id.localeCompare(right.block.id);
}

function compareUnscheduledItems(
  left: { job: Job; assignments: JobAssignment[] },
  right: { job: Job; assignments: JobAssignment[] },
): number {
  const leftAssigned = left.assignments.length > 0 ? 0 : 1;
  const rightAssigned = right.assignments.length > 0 ? 0 : 1;
  if (leftAssigned !== rightAssigned) {
    return leftAssigned - rightAssigned;
  }

  const leftHasEstimate = left.job.estimatedHours ? 0 : 1;
  const rightHasEstimate = right.job.estimatedHours ? 0 : 1;
  if (leftHasEstimate !== rightHasEstimate) {
    return leftHasEstimate - rightHasEstimate;
  }

  const byUpdatedAt = right.job.updatedAt.localeCompare(left.job.updatedAt);
  if (byUpdatedAt !== 0) {
    return byUpdatedAt;
  }

  return compareJobsStable(left.job, right.job);
}

function getWorkloadMeta(totalHours: number): { label: string; tone: string; width: string } {
  if (totalHours <= 4) {
    return { label: "Light", tone: "#1f6b37", width: `${Math.max(16, totalHours * 12)}%` };
  }
  if (totalHours <= 8) {
    return { label: "Steady", tone: "#8a5a00", width: `${Math.min(100, totalHours * 12)}%` };
  }
  return { label: "Heavy", tone: "#b42318", width: "100%" };
}

function getCapacitySummaryLabel(job: Job, assignments: JobAssignment[]): string {
  const activeAssignments = getActiveUniqueAssignments(assignments);
  const capacity = computeJobCapacitySummary({
    estimatedHours: job.estimatedHours,
    assignedCrewCount: activeAssignments.length,
  });

  if (capacity.daysNeeded === null || capacity.personDays === null) {
    return "No labor estimate yet";
  }

  const crewText =
    activeAssignments.length > 0 ? `${capacity.assignedCrewCount} crew` : "crew TBD (showing 1)";
  return `${capacity.estimatedHours}h · ${capacity.personDays.toFixed(2)} person-days · ${capacity.daysNeededRaw?.toFixed(2)} day${capacity.daysNeededRaw === 1 ? "" : "s"} @ ${crewText}`;
}

function getCrewLabel(
  scheduledUserIds: Array<UserId | null>,
  userNamesById: Map<UserId, string>,
): string {
  if (scheduledUserIds.length === 0) {
    return "Unassigned";
  }

  return scheduledUserIds
    .map((userId) => (userId ? userNamesById.get(userId) ?? userId.slice(0, 8) : "Unassigned"))
    .join(", ");
}

function getDefaultScheduleDuration(job: Job, assignments: JobAssignment[], day: string): number {
  const capacity = computeJobCapacitySummary({
    estimatedHours: job.estimatedHours,
    assignedCrewCount: getActiveUniqueAssignments(assignments).length,
    startDay: day,
  });

  if (capacity.daysNeededRounded && capacity.daysNeededRounded > 1) {
    return 8;
  }

  return Math.min(capacity.dailyCapacityHours, job.estimatedHours ?? 4);
}

type ScheduleDragPayload =
  | {
      kind: "unscheduled_job";
      jobId: Job["id"];
    }
  | {
      kind: "scheduled_group";
      groupKey: string;
    };

export function SchedulingPage() {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const setSelectedWorkbenchJobId = useUiStore((state) => state.setSelectedWorkbenchJobId);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 820 : false,
  );
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editorDraft, setEditorDraft] = useState<ScheduleEditorDraft | null>(null);
  const [carryOverDraft, setCarryOverDraft] = useState<CarryOverDraft | null>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<Date | null>(null);
  const [mobileAddJobDay, setMobileAddJobDay] = useState<Date | null>(null);
  const [isAvailabilityPanelOpen, setIsAvailabilityPanelOpen] = useState(false);
  const [availabilityDraft, setAvailabilityDraft] = useState({
    userId: "",
    day: toDateInputValue(new Date()),
    reason: "",
  });
  const [pendingCardAction, setPendingCardAction] = useState<{
    blockId: ScheduleBlock["id"];
    action: "today" | "tomorrow" | "unschedule" | "carryover";
  } | null>(null);
  const [pendingGroupAction, setPendingGroupAction] = useState<{
    groupKey: string;
    action: "today" | "tomorrow" | "unschedule" | "carryover";
  } | null>(null);
  const [draggingPayload, setDraggingPayload] = useState<ScheduleDragPayload | null>(null);
  const [activeDropDay, setActiveDropDay] = useState<string | null>(null);
  const [pendingDropDay, setPendingDropDay] = useState<string | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const weekStartIso = useMemo(() => new Date(`${toDateInputValue(weekDays[0]!)}T00:00:00`).toISOString(), [weekDays]);
  const weekEndIso = useMemo(() => new Date(`${toDateInputValue(weekDays[4]!)}T23:59:59`).toISOString(), [weekDays]);

  if (!currentUser) {
    return null;
  }

  const canManageScheduling = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const showPlanningSidebar = canManageScheduling && !isMobileLayout;

  useEffect(() => {
    function handleResize() {
      setIsMobileLayout(window.innerWidth <= 820);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const {
    upcomingBlocksQuery,
    unscheduledJobsQuery,
    assignableUsersQuery,
    workerUnavailabilityQuery,
    planIssuesQuery,
    createScheduleBlock,
    updateScheduleBlock,
    autoFillScheduleBlocks,
    updateJobEstimatedHours,
    updateJobFullCrewRule,
    assignJobToUser,
    removeJobAssignment,
    markWorkerUnavailable,
    removeWorkerUnavailability,
    deleteScheduleBlock,
    carryOverScheduleBlock,
    refreshScheduling,
  } = useSchedulingSlice(currentUser, { weekStartIso, weekEndIso });

  const upcomingBlocks = upcomingBlocksQuery.data ?? [];
  const unscheduledJobs = unscheduledJobsQuery.data ?? [];
  const assignableUsers = assignableUsersQuery.data ?? [];
  const workerUnavailability = workerUnavailabilityQuery.data ?? [];
  const planIssues = planIssuesQuery.data ?? [];
  const userNamesById = useMemo(
    () => new Map(assignableUsers.map((user) => [user.id, user.label])),
    [assignableUsers],
  );
  const planIssuesByBlockId = useMemo(() => {
    const map = new Map<ScheduleBlock["id"], typeof planIssues>();
    for (const issue of planIssues) {
      map.set(issue.blockId, [...(map.get(issue.blockId) ?? []), issue]);
    }
    return map;
  }, [planIssues]);
  // Jobs whose upcoming blocks are all unassigned (userId: null) but now have crew assigned.
  // This means crew was added after the unassigned plan was created — user should recalculate.
  const jobsNeedingCrewRecalculation = useMemo(() => {
    const result = new Set<Job["id"]>();
    const seen = new Set<Job["id"]>();
    for (const item of upcomingBlocks) {
      if (seen.has(item.job.id)) {
        continue;
      }
      seen.add(item.job.id);
      const jobBlocksInWindow = upcomingBlocks
        .filter((b) => b.job.id === item.job.id)
        .map((b) => b.block);
      const activeAssignments = getActiveUniqueAssignments(item.assignments);
      if (
        hasUnassignedBlocksWithCrew({
          assignedCrewCount: activeAssignments.length,
          upcomingBlocks: jobBlocksInWindow,
          jobId: item.job.id,
        })
      ) {
        result.add(item.job.id);
      }
    }
    return result;
  }, [upcomingBlocks]);

  const jobsForEditor = useMemo(() => {
    const map = new Map<Job["id"], Job>();

    for (const item of unscheduledJobs) {
      map.set(item.job.id, item.job);
    }
    for (const item of upcomingBlocks) {
      map.set(item.job.id, item.job);
    }

    return Array.from(map.values()).sort(compareJobsStable);
  }, [unscheduledJobs, upcomingBlocks]);

  const assignmentsByJobId = useMemo(() => {
    const map = new Map<Job["id"], JobAssignment[]>();

    for (const item of unscheduledJobs) {
      map.set(item.job.id, item.assignments);
    }
    for (const item of upcomingBlocks) {
      map.set(item.job.id, item.assignments);
    }

    return map;
  }, [unscheduledJobs, upcomingBlocks]);

  const groupsByDay = useMemo(() => {
    const map = new Map<string, DailyJobGroup[]>();
    for (const day of weekDays) {
      map.set(toDateInputValue(day), []);
    }
    const allGroups = buildDailyJobGroups({
      items: upcomingBlocks,
      workerUnavailability,
      planIssuesByBlockId,
      jobsNeedingCrewRecalculation,
    });
    for (const group of allGroups) {
      const existing = map.get(group.day);
      if (existing) {
        existing.push(group);
      }
    }
    return map;
  }, [upcomingBlocks, workerUnavailability, planIssuesByBlockId, jobsNeedingCrewRecalculation, weekDays]);

  const groupsByKey = useMemo(() => {
    const map = new Map<string, DailyJobGroup>();
    for (const groups of groupsByDay.values()) {
      for (const group of groups) {
        map.set(group.key, group);
      }
    }
    return map;
  }, [groupsByDay]);

  const scheduledJobIds = useMemo(
    () => new Set(upcomingBlocks.map((item) => item.job.id)),
    [upcomingBlocks],
  );

  const unavailableByDay = useMemo(() => {
    const map = new Map<string, typeof workerUnavailability>();
    for (const entry of workerUnavailability) {
      if (entry.deletedAt !== null) continue;
      const existing = map.get(entry.day) ?? [];
      existing.push(entry);
      map.set(entry.day, existing);
    }
    return map;
  }, [workerUnavailability]);

  useEffect(() => {
    if (!editorDraft) {
      return;
    }

    const stillExists =
      jobsForEditor.some((job) => job.id === editorDraft.jobId) ||
      upcomingBlocks.some((item) => item.block.id === editorDraft.scheduleBlockId);

    if (!stillExists) {
      setEditorDraft(null);
    }
  }, [editorDraft, jobsForEditor, upcomingBlocks]);

  const orderedUnscheduledJobs = useMemo(
    () => [...unscheduledJobs].sort(compareUnscheduledItems),
    [unscheduledJobs],
  );

  const selectedDayGroups = useMemo(() => {
    if (!selectedDayDetail) {
      return [];
    }
    return groupsByDay.get(toDateInputValue(selectedDayDetail)) ?? [];
  }, [groupsByDay, selectedDayDetail]);

  async function handleSubmit(draft: ScheduleEditorDraft) {
    try {
      const durationHours = Number(draft.durationHours);

      if (!draft.day) {
        throw new Error("Choose a day for this schedule block.");
      }
      if (!Number.isFinite(durationHours) || durationHours <= 0) {
        throw new Error("Duration must be greater than 0 hours.");
      }

      const payload = {
        jobId: draft.jobId,
        day: draft.day,
        timeBucket: draft.timeBucket,
        startTime: draft.startTime.trim() || null,
        durationHours,
        ...(draft.userId ? { userId: draft.userId as ScheduleBlock["userId"] } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      };

      if (draft.scheduleBlockId) {
        await updateScheduleBlock.mutateAsync({
          scheduleBlockId: draft.scheduleBlockId,
          ...payload,
        });
        setFeedback({ tone: "success", text: "Schedule block updated." });
      } else {
        const blocks = await autoFillScheduleBlocks.mutateAsync({
          jobId: draft.jobId,
          day: draft.day,
          timeBucket: draft.timeBucket,
          startTime: draft.startTime.trim() || null,
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        });
        setFeedback({ tone: "success", text: getAutoFillFeedback(blocks) });
      }

      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Scheduling update failed.",
      });
    }
  }

  async function handleAutoFillDays(draft: ScheduleEditorDraft) {
    try {
      if (!draft.day) {
        throw new Error("Choose a start day before auto-filling days.");
      }

      const blocks = await autoFillScheduleBlocks.mutateAsync({
        jobId: draft.jobId,
        day: draft.day,
        timeBucket: draft.timeBucket,
        startTime: draft.startTime.trim() || null,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        clearExisting: true,
      });

      setFeedback({
        tone: "success",
        text: getAutoFillFeedback(blocks),
      });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Auto-fill days failed.",
      });
    }
  }

  async function handleAutoFillNextAvailable(draft: ScheduleEditorDraft) {
    try {
      if (!draft.day) {
        throw new Error("Choose the earliest start day before finding next available space.");
      }

      const blocks = await autoFillScheduleBlocks.mutateAsync({
        jobId: draft.jobId,
        day: draft.day,
        timeBucket: draft.timeBucket,
        startTime: draft.startTime.trim() || null,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        clearExisting: true,
        findNextAvailable: true,
      });

      setFeedback({
        tone: "success",
        text: getAutoFillFeedback(blocks, "Scheduled in next available space across"),
      });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Next available scheduling failed.",
      });
    }
  }

  async function handleRecalculateJobSchedule(jobId: Job["id"], startDay: string) {
    const confirmed = window.confirm(
      "Recalculating will replace all existing schedule blocks for this job with a new auto-filled plan. Any manual edits will be lost. Continue?",
    );
    if (!confirmed) {
      return;
    }

    try {
      const blocks = await autoFillScheduleBlocks.mutateAsync({
        jobId,
        day: startDay,
        clearExisting: true,
        findNextAvailable: true,
      });
      setFeedback({
        tone: "success",
        text: getAutoFillFeedback(blocks, "Recalculated schedule into"),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not recalculate schedule.",
      });
    }
  }

  async function handleAssignUser(jobId: Job["id"], userId: SchedulingUserOption["id"]) {
    try {
      await assignJobToUser.mutateAsync({ jobId, userId });
      setFeedback({ tone: "success", text: "Crew member assigned." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not assign crew member.",
      });
    }
  }

  async function handleUpdateEstimatedHours(jobId: Job["id"], estimatedHours: number | null) {
    try {
      await updateJobEstimatedHours.mutateAsync({ jobId, estimatedHours });
      const isScheduled = scheduledJobIds.has(jobId);
      setFeedback({
        tone: "success",
        text: isScheduled
          ? "Estimated hours updated. Use Recalculate to reflow the existing schedule."
          : "Estimated hours updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update estimated hours.",
      });
    }
  }

  async function handleUpdateFullCrewRule(jobId: Job["id"], requiresFullCrewTogether: boolean) {
    try {
      await updateJobFullCrewRule.mutateAsync({ jobId, requiresFullCrewTogether });
      const isScheduled = scheduledJobIds.has(jobId);
      setFeedback({
        tone: "success",
        text: isScheduled
          ? "Full crew rule updated. Use Recalculate to reflow the existing schedule."
          : "Full crew rule updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update full crew rule.",
      });
    }
  }

  async function handleRemoveAssignment(assignmentId: JobAssignment["id"]) {
    try {
      await removeJobAssignment.mutateAsync(assignmentId);
      setFeedback({ tone: "success", text: "Crew member removed." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not remove crew member.",
      });
    }
  }

  async function handleMarkUnavailable() {
    try {
      if (!availabilityDraft.userId || !availabilityDraft.day) {
        throw new Error("Choose a person and day off.");
      }

      await markWorkerUnavailable.mutateAsync({
        userId: availabilityDraft.userId as UserId,
        day: availabilityDraft.day,
        reason: availabilityDraft.reason,
      });
      setAvailabilityDraft((current) => ({ ...current, reason: "" }));
      setFeedback({ tone: "success", text: "Worker marked unavailable." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not mark worker unavailable.",
      });
    }
  }

  async function handleRemoveUnavailable(id: string) {
    try {
      await removeWorkerUnavailability.mutateAsync(id as WorkerUnavailabilityId);
      setFeedback({ tone: "success", text: "Availability restored." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not remove day off.",
      });
    }
  }

  async function handleDelete() {
    if (!editorDraft?.scheduleBlockId) {
      return;
    }

    try {
      await deleteScheduleBlock.mutateAsync(editorDraft.scheduleBlockId);
      setFeedback({ tone: "success", text: "Schedule block deleted." });
      setEditorDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Schedule delete failed.",
      });
    }
  }

  function openCreateForJob(job: Job, day: Date) {
    const assignments = assignmentsByJobId.get(job.id) ?? [];
    const dayValue = toDateInputValue(day);
    setEditorDraft({
      jobId: job.id,
      day: dayValue,
      timeBucket: "anytime",
      startTime: "",
      durationHours: toDurationValue(getDefaultScheduleDuration(job, assignments, dayValue)),
      userId: assignments[0]?.userId ?? "",
      notes: "",
    });
  }

  function openEditForBlock(block: ScheduleBlock) {
    setEditorDraft({
      scheduleBlockId: block.id,
      jobId: block.jobId,
      day: toLocalDayKey(block.startAt),
      timeBucket: block.timeBucket,
      startTime: getScheduleTimeLabel(block) ? toTimeInputValue(block.startAt) : "",
      durationHours: toDurationValue(block.durationHours),
      userId: block.userId ?? "",
      notes: block.notes ?? "",
    });
  }

  async function moveBlockToDate(
    block: ScheduleBlock,
    day: Date,
    action: "today" | "tomorrow",
    message: string,
  ) {
    setPendingCardAction({ blockId: block.id, action });
    try {
      await updateScheduleBlock.mutateAsync({
        scheduleBlockId: block.id,
        day: toDateInputValue(day),
        timeBucket: block.timeBucket,
        startTime: getScheduleTimeLabel(block) ? toTimeInputValue(block.startAt) : null,
        durationHours: block.durationHours,
      });
      setFeedback({ tone: "success", text: message });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Move failed.",
      });
    } finally {
      setPendingCardAction((current) => (current?.blockId === block.id ? null : current));
    }
  }

  async function unscheduleBlock(blockId: ScheduleBlock["id"]) {
    setPendingCardAction({ blockId, action: "unschedule" });
    try {
      await deleteScheduleBlock.mutateAsync(blockId);
      setFeedback({ tone: "success", text: "Schedule block removed from the calendar." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Unschedule failed.",
      });
    } finally {
      setPendingCardAction((current) => (current?.blockId === blockId ? null : current));
    }
  }

  function openCarryOverForBlock(block: ScheduleBlock) {
    setCarryOverDraft({
      blockIds: [block.id],
      mode: "tomorrow",
      day: toDateInputValue(addDays(new Date(block.startAt), 1)),
      reason: "",
    });
  }

  function openCarryOverForGroup(group: DailyJobGroup) {
    setPendingGroupAction({ groupKey: group.key, action: "carryover" });
    setCarryOverDraft({
      blockIds: group.blocks.map((b) => b.id),
      mode: "tomorrow",
      day: toDateInputValue(addDays(new Date(group.startAt), 1)),
      reason: "",
    });
  }

  async function handleCarryOverSubmit(draft: CarryOverDraft) {
    const firstBlockId = draft.blockIds[0];
    if (!firstBlockId) return;

    const firstBlock = upcomingBlocks.find((item) => item.block.id === firstBlockId)?.block;
    const baseDate = firstBlock ? new Date(firstBlock.startAt) : new Date();

    const carryDay =
      draft.mode === "pick_date"
        ? draft.day
        : toDateInputValue(draft.mode === "next_workday" ? nextWorkday(baseDate) : addDays(baseDate, 1));

    if (!carryDay) {
      setFeedback({ tone: "error", text: "Choose a carryover date." });
      return;
    }

    setPendingCardAction({ blockId: firstBlockId, action: "carryover" });

    try {
      for (const blockId of draft.blockIds) {
        await carryOverScheduleBlock.mutateAsync({
          scheduleBlockId: blockId,
          day: carryDay,
          ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
        });
      }
      setFeedback({ tone: "success", text: "Carried over." });
      setCarryOverDraft(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Carry over failed.",
      });
    } finally {
      setPendingCardAction(null);
      setPendingGroupAction(null);
    }
  }

  function handleMoveToday(block: ScheduleBlock) {
    return void moveBlockToDate(block, new Date(), "today", "Moved to today.");
  }

  function handleMoveTomorrow(block: ScheduleBlock) {
    return void moveBlockToDate(block, addDays(new Date(), 1), "tomorrow", "Moved to tomorrow.");
  }

  function handleStartWork(jobId: Job["id"]) {
    setSelectedWorkbenchJobId(jobId);
    setActiveRoute(APP_ROUTES.workbench);
  }

  function handleDragStart(payload: ScheduleDragPayload) {
    setDraggingPayload(payload);
  }

  async function moveGroupToDate(
    group: DailyJobGroup,
    targetDay: Date,
    action: "today" | "tomorrow",
    message: string,
  ) {
    setPendingGroupAction({ groupKey: group.key, action });
    try {
      const dayValue = toDateInputValue(targetDay);
      await Promise.all(
        group.blocks.map((block) =>
          updateScheduleBlock.mutateAsync({
            scheduleBlockId: block.id,
            day: dayValue,
            timeBucket: block.timeBucket,
            startTime: getScheduleTimeLabel(block) ? toTimeInputValue(block.startAt) : null,
            durationHours: block.durationHours,
            ...(block.userId ? { userId: block.userId } : {}),
          }),
        ),
      );
      setFeedback({ tone: "success", text: message });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Move failed.",
      });
    } finally {
      setPendingGroupAction((current) => (current?.groupKey === group.key ? null : current));
    }
  }

  function handleMoveGroupToday(group: DailyJobGroup) {
    return void moveGroupToDate(group, new Date(), "today", "Moved to today.");
  }

  function handleMoveGroupTomorrow(group: DailyJobGroup) {
    return void moveGroupToDate(group, addDays(new Date(), 1), "tomorrow", "Moved to tomorrow.");
  }

  async function unscheduleGroup(group: DailyJobGroup) {
    setPendingGroupAction({ groupKey: group.key, action: "unschedule" });
    try {
      for (const block of group.blocks) {
        await deleteScheduleBlock.mutateAsync(block.id);
      }
      setFeedback({ tone: "success", text: "Day unscheduled." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Unschedule failed.",
      });
    } finally {
      setPendingGroupAction((current) => (current?.groupKey === group.key ? null : current));
    }
  }

  function handleDragEnd() {
    setDraggingPayload(null);
    setActiveDropDay(null);
  }

  async function handleDropOnDay(day: Date) {
    if (!draggingPayload) {
      return;
    }

    const dayValue = toDateInputValue(day);
    setPendingDropDay(dayValue);

    try {
      if (draggingPayload.kind === "unscheduled_job") {
        const jobEntry = orderedUnscheduledJobs.find((item) => item.job.id === draggingPayload.jobId);
        if (!jobEntry) {
          throw new Error("Job could not be found for scheduling.");
        }

        const blocks = await autoFillScheduleBlocks.mutateAsync({
          jobId: jobEntry.job.id,
          day: dayValue,
          timeBucket: "anytime",
          clearExisting: true,
        });
        setFeedback({
          tone: "success",
          text: getAutoFillFeedback(blocks, "Auto-filled from the unscheduled list across"),
        });
      } else {
        const group = groupsByKey.get(draggingPayload.groupKey);
        if (!group) {
          throw new Error("Scheduled group could not be found.");
        }

        await Promise.all(
          group.blocks.map((block) =>
            updateScheduleBlock.mutateAsync({
              scheduleBlockId: block.id,
              day: dayValue,
              timeBucket: block.timeBucket,
              startTime: getScheduleTimeLabel(block) ? toTimeInputValue(block.startAt) : null,
              durationHours: block.durationHours,
              ...(block.userId ? { userId: block.userId } : {}),
            }),
          ),
        );
        setFeedback({ tone: "success", text: "Job moved." });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Drag and drop scheduling failed.",
      });
    } finally {
      setPendingDropDay(null);
      setDraggingPayload(null);
      setActiveDropDay(null);
    }
  }

  const isSaving =
    createScheduleBlock.isPending ||
    updateScheduleBlock.isPending ||
    autoFillScheduleBlocks.isPending ||
    updateJobEstimatedHours.isPending ||
    updateJobFullCrewRule.isPending ||
    assignJobToUser.isPending ||
    removeJobAssignment.isPending ||
    markWorkerUnavailable.isPending ||
    removeWorkerUnavailability.isPending ||
    deleteScheduleBlock.isPending ||
    carryOverScheduleBlock.isPending;

  return (
    <main style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Scheduling</h1>
          <p style={subtitleStyle()}>
            {showPlanningSidebar
              ? "Plan the next few days of work, keep unscheduled jobs visible, and make the upcoming week clear."
              : canManageScheduling
                ? "See the live schedule first on phone, then add jobs into the week as needed."
                : "See your assigned work for the week and jump into jobs quickly from the field."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setWeekStart((current) => addDays(current, -7))} style={secondaryButtonStyle()}>Previous Week</button>
          <strong>{getWeekRangeLabel(weekDays)}</strong>
          <button onClick={() => setWeekStart((current) => addDays(current, 7))} style={secondaryButtonStyle()}>Next Week</button>
          <button onClick={() => refreshScheduling.mutate()} disabled={refreshScheduling.isPending} style={secondaryButtonStyle()}>
            {refreshScheduling.isPending ? "Refreshing..." : "Refresh"}
          </button>
          {canManageScheduling ? (
            <button onClick={() => setIsAvailabilityPanelOpen(true)} style={primaryButtonStyle()}>
              Mark Worker Away
            </button>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <section style={feedbackStyle(feedback.tone)}>
          {feedback.text}
        </section>
      ) : null}

      {canManageScheduling && isAvailabilityPanelOpen ? (
        <div
          role="presentation"
          onClick={() => setIsAvailabilityPanelOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            zIndex: 26,
            display: "grid",
            placeItems: isMobileLayout ? "end stretch" : "center",
            padding: isMobileLayout ? "0" : "20px",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Mark worker away"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "82vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: isMobileLayout ? "22px 22px 0 0" : "20px",
              padding: "18px",
              display: "grid",
              gap: "14px",
              boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Mark Worker Away</h2>
                <p style={{ margin: "4px 0 0", color: "#5b6475", fontSize: "13px" }}>
                  Auto-fill scheduling will avoid this person on the selected day.
                </p>
              </div>
              <button onClick={() => setIsAvailabilityPanelOpen(false)} style={secondaryButtonStyle()}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span>Worker</span>
                <select
                  value={availabilityDraft.userId}
                  onChange={(event) => setAvailabilityDraft((current) => ({ ...current, userId: event.target.value }))}
                >
                  <option value="">Choose person</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span>Away Date</span>
                <input
                  type="date"
                  value={availabilityDraft.day}
                  onChange={(event) => setAvailabilityDraft((current) => ({ ...current, day: event.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span>Reason</span>
                <input
                  value={availabilityDraft.reason}
                  placeholder="Optional"
                  onChange={(event) => setAvailabilityDraft((current) => ({ ...current, reason: event.target.value }))}
                />
              </label>
              <button onClick={() => void handleMarkUnavailable()} disabled={markWorkerUnavailable.isPending} style={primaryButtonStyle()}>
                {markWorkerUnavailable.isPending ? "Saving..." : "Mark Away"}
              </button>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <strong>Days Off This Week</strong>
              {workerUnavailability.length === 0 ? (
                <div style={{ color: "#5b6475", fontSize: "13px" }}>No one is marked away this week.</div>
              ) : null}
              {workerUnavailability.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #e4e8f1",
                    borderRadius: "12px",
                    padding: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "13px" }}>
                      {userNamesById.get(entry.userId) ?? entry.userId.slice(0, 8)}
                    </strong>
                    <span style={{ color: "#5b6475", fontSize: "13px" }}>
                      {entry.day}{entry.reason ? ` · ${entry.reason}` : ""}
                    </span>
                  </div>
                  <button onClick={() => void handleRemoveUnavailable(entry.id)} disabled={removeWorkerUnavailability.isPending}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {canManageScheduling && isMobileLayout ? (
        <details style={cardStyle("#fff")}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Crew Days Off</summary>
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            <select
              value={availabilityDraft.userId}
              onChange={(event) => setAvailabilityDraft((current) => ({ ...current, userId: event.target.value }))}
            >
              <option value="">Choose person</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={availabilityDraft.day}
              onChange={(event) => setAvailabilityDraft((current) => ({ ...current, day: event.target.value }))}
            />
            <input
              value={availabilityDraft.reason}
              placeholder="Reason, optional"
              onChange={(event) => setAvailabilityDraft((current) => ({ ...current, reason: event.target.value }))}
            />
            <button onClick={() => void handleMarkUnavailable()} disabled={markWorkerUnavailable.isPending} style={secondaryButtonStyle()}>
              {markWorkerUnavailable.isPending ? "Saving..." : "Mark Unavailable"}
            </button>
            {workerUnavailability.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: "1px solid #e4e8f1",
                  borderRadius: "12px",
                  padding: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "13px" }}>
                    {userNamesById.get(entry.userId) ?? entry.userId.slice(0, 8)}
                  </strong>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>
                    {entry.day}{entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </div>
                <button onClick={() => void handleRemoveUnavailable(entry.id)} disabled={removeWorkerUnavailability.isPending}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: showPlanningSidebar ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr", gap: "20px", alignItems: "start" }}>
        {showPlanningSidebar ? (
        <aside style={{ display: "grid", gap: "16px" }}>
          <section style={cardStyle("#fff")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Unscheduled Jobs</h2>
              <span style={{ color: "#5b6475", fontSize: "13px" }}>{orderedUnscheduledJobs.length}</span>
            </div>

            {unscheduledJobsQuery.isLoading ? <p>Loading unscheduled jobs...</p> : null}
            {!unscheduledJobsQuery.isLoading && orderedUnscheduledJobs.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #d9dfeb",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "#fafcff",
                  color: "#5b6475",
                }}
              >
                Every active job already has upcoming work scheduled.
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "10px" }}>
              {orderedUnscheduledJobs.map((item) => (
                <article
                  key={item.job.id}
                  draggable={!pendingDropDay}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    handleDragStart({ kind: "unscheduled_job", jobId: item.job.id });
                  }}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...cardStyle("#fff"),
                    borderRadius: "16px",
                    padding: "14px",
                    opacity:
                      draggingPayload?.kind === "unscheduled_job" && draggingPayload.jobId === item.job.id ? 0.55 : 1,
                    cursor: pendingDropDay ? "default" : "grab",
                  }}
                >
                  <strong>{item.job.number}</strong>
                  <div style={{ fontWeight: 600, margin: "4px 0" }}>{item.job.title}</div>
                  <div style={{ color: "#5b6475", fontSize: "13px", marginBottom: "8px" }}>
                    {item.job.estimatedHours ? `${item.job.estimatedHours}h estimated` : "No estimate yet"}
                    {" · "}
                    {item.assignments.length > 0 ? `${item.assignments.length} assigned` : "No one assigned"}
                  </div>
                  <div style={{ color: "#5b6475", fontSize: "13px", marginBottom: "10px" }}>
                    {getCapacitySummaryLabel(item.job, item.assignments)}
                  </div>
                  <button onClick={() => openCreateForJob(item.job, weekDays[0]!)} style={primaryButtonStyle()}>Schedule</button>
                </article>
              ))}
            </div>
          </section>

          <section style={cardStyle("#fff")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <h2 style={{ margin: 0 }}>Crew Days Off</h2>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Auto-fill will work around these days.</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              <select
                value={availabilityDraft.userId}
                onChange={(event) => setAvailabilityDraft((current) => ({ ...current, userId: event.target.value }))}
              >
                <option value="">Choose person</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={availabilityDraft.day}
                onChange={(event) => setAvailabilityDraft((current) => ({ ...current, day: event.target.value }))}
              />
              <input
                value={availabilityDraft.reason}
                placeholder="Reason, optional"
                onChange={(event) => setAvailabilityDraft((current) => ({ ...current, reason: event.target.value }))}
              />
              <button onClick={() => void handleMarkUnavailable()} disabled={markWorkerUnavailable.isPending} style={secondaryButtonStyle()}>
                {markWorkerUnavailable.isPending ? "Saving..." : "Mark Unavailable"}
              </button>
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
              {workerUnavailability.length === 0 ? (
                <div style={{ color: "#5b6475", fontSize: "13px" }}>No days off marked for this week.</div>
              ) : null}
              {workerUnavailability.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #e4e8f1",
                    borderRadius: "12px",
                    padding: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "13px" }}>
                      {userNamesById.get(entry.userId) ?? entry.userId.slice(0, 8)}
                    </strong>
                    <span style={{ color: "#5b6475", fontSize: "13px" }}>
                      {entry.day}{entry.reason ? ` · ${entry.reason}` : ""}
                    </span>
                  </div>
                  <button onClick={() => void handleRemoveUnavailable(entry.id)} disabled={removeWorkerUnavailability.isPending}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

        </aside>
        ) : null}

        <section style={cardStyle("#fff")}>
          {planIssues.length > 0 ? (
            <div
              style={{
                border: "1px solid #f7c948",
                borderRadius: "14px",
                background: "#fff8db",
                padding: "12px",
                marginBottom: "14px",
                color: "#5f4400",
              }}
            >
              <strong>Availability conflict</strong>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>
                {planIssues.length} scheduled work block{planIssues.length === 1 ? "" : "s"} now conflict with crew days off. Use Recalculate schedule on the job to reflow around time off.
              </div>
            </div>
          ) : null}
          {canManageScheduling && isMobileLayout ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: "16px" }}>Week Schedule</strong>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>
                  Focus on scheduled work first, then add jobs into the day as needed.
                </span>
              </div>
              <button
                onClick={() => {
                  if (orderedUnscheduledJobs.length === 0) {
                    setFeedback({ tone: "error", text: "There are no unscheduled jobs available to add." });
                    return;
                  }
                  setMobileAddJobDay(weekDays[0] ?? new Date());
                }}
                style={primaryButtonStyle()}
              >
                Add Job
              </button>
            </div>
          ) : null}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {weekDays.map((day) => {
              const dayKey = toDateInputValue(day);
              const dayGroups = groupsByDay.get(dayKey) ?? [];
              const timedGroups = dayGroups.filter((g) => getScheduleTimeLabel(g.blocks[0]!));
              const untimedGroups = dayGroups.filter((g) => !getScheduleTimeLabel(g.blocks[0]!));
              const totalHours = dayGroups.reduce((sum, g) => sum + g.totalHoursThisDay, 0);
              const totalCrewDays = totalHours / 8;
              const workload = getWorkloadMeta(totalHours);
              const awayEntries = unavailableByDay.get(dayKey) ?? [];

              return (
                <section
                  key={dayKey}
                  onDragOver={(event) => {
                    if (!canManageScheduling || !draggingPayload || pendingDropDay) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (activeDropDay !== dayKey) {
                      setActiveDropDay(dayKey);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      return;
                    }
                    setActiveDropDay((current) => (current === dayKey ? null : current));
                  }}
                  onDrop={(event) => {
                    if (!canManageScheduling) {
                      return;
                    }
                    event.preventDefault();
                    void handleDropOnDay(day);
                  }}
                  style={{
                    border:
                      activeDropDay === dayKey
                        ? "2px dashed #1b4dff"
                        : pendingDropDay === dayKey
                          ? "2px solid #8fb1ff"
                          : "1px solid #e4e8f1",
                    borderRadius: "18px",
                    background: activeDropDay === dayKey ? "#eef4ff" : "#fbfcfd",
                    minHeight: "420px",
                    padding: "14px",
                    display: "grid",
                    alignContent: "start",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "start" }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: "block" }}>{getDayLabel(day)}</strong>
                      <small style={{ color: "#5b6475" }}>
                        {dayGroups.length} job{dayGroups.length === 1 ? "" : "s"}
                      </small>
                      <div style={{ marginTop: "8px" }}>
                        <div style={{ fontSize: "12px", color: workload.tone, marginBottom: "4px" }}>
                          {totalHours.toFixed(1)}h planned · {workload.label}
                        </div>
                        <div style={{ fontSize: "12px", color: "#5d6978", marginBottom: "6px" }}>
                          {totalCrewDays.toFixed(2)} crew-days
                        </div>
                        <div style={{ height: "6px", borderRadius: "999px", background: "#e6ebf5", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: workload.width, background: workload.tone }} />
                        </div>
                      </div>
                      {awayEntries.length > 0 ? (
                        <div
                          style={{
                            marginTop: "8px",
                            background: "#fff8e6",
                            border: "1px solid #f7c948",
                            borderRadius: "8px",
                            padding: "5px 8px",
                            fontSize: "12px",
                            color: "#92400e",
                          }}
                        >
                          Away: {awayEntries.map((e) => userNamesById.get(e.userId) ?? e.userId.slice(0, 8)).join(", ")}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      <button onClick={() => setSelectedDayDetail(day)}>Open Day</button>
                      {canManageScheduling ? (
                        <button
                          onClick={() => {
                            if (isMobileLayout) {
                              if (orderedUnscheduledJobs.length === 0) {
                                setFeedback({ tone: "error", text: "There are no unscheduled jobs available to add." });
                                return;
                              }

                              setMobileAddJobDay(day);
                              return;
                            }

                            const fallbackJob = orderedUnscheduledJobs[0]?.job ?? jobsForEditor[0];
                            if (!fallbackJob) {
                              setFeedback({ tone: "error", text: "There are no jobs available to schedule." });
                              return;
                            }

                            openCreateForJob(fallbackJob, day);
                          }}
                        >
                          {isMobileLayout ? "Add Job" : "Add Block"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {dayGroups.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed #d9dfeb",
                        borderRadius: "12px",
                        padding: "12px",
                        color: "#5b6475",
                        background: "#ffffff",
                      }}
                    >
                      Nothing planned yet.
                    </div>
                  ) : null}

                  {activeDropDay === dayKey && draggingPayload ? (
                    <div
                      style={{
                        border: "1px dashed #8fb1ff",
                        borderRadius: "12px",
                        padding: "10px",
                        background: "#ffffff",
                        color: "#163fcb",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      Drop here to schedule for {getDayLabel(day)}.
                    </div>
                  ) : null}

                  {timedGroups.length > 0 ? (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <strong style={{ fontSize: "13px", color: "#163fcb" }}>Timed Jobs</strong>
                      {timedGroups.map((group) => {
                        const firstBlock = group.blocks[0]!;
                        const isPending = pendingGroupAction?.groupKey === group.key;
                        return (
                        <article
                          key={group.key}
                          draggable={canManageScheduling && !pendingDropDay && !isPending}
                          onDragStart={(event) => {
                            if (!canManageScheduling) {
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            handleDragStart({ kind: "scheduled_group", groupKey: group.key });
                          }}
                          onDragEnd={handleDragEnd}
                          style={{
                            border: group.hasConflict
                              ? "2px solid #b42318"
                              : group.isNextForJob
                                ? "2px solid #1b4dff"
                                : "1px solid #c7d6ff",
                            borderRadius: "12px",
                            padding: "12px",
                            background: "#ffffff",
                            display: "grid",
                            gap: "8px",
                            opacity:
                              draggingPayload?.kind === "scheduled_group" && draggingPayload.groupKey === group.key
                                ? 0.55
                                : 1,
                            cursor: pendingDropDay || isPending ? "default" : "grab",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                            <strong>{group.job.number}</strong>
                            <small style={{ color: "#5b6475" }}>{group.totalHoursThisDay}h</small>
                          </div>
                          <div style={{ fontWeight: 600 }}>{group.job.title}</div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: "#163fcb", fontSize: "13px", fontWeight: 700 }}>
                              {getScheduleSummaryLabel(day, firstBlock)}
                            </span>
                            <span
                              style={{
                                borderRadius: "999px",
                                background: "#eef2ff",
                                color: "#163fcb",
                                fontSize: "12px",
                                padding: "3px 8px",
                                fontWeight: 700,
                              }}
                            >
                              Day {group.dayIndex} of {group.totalDays}
                            </span>
                          </div>
                          <div style={{ color: "#5b6475", fontSize: "13px" }}>
                            Crew: {getCrewLabel(group.scheduledUserIds, userNamesById)}
                          </div>
                          <div style={{ color: "#5b6475", fontSize: "13px" }}>
                            {getCapacitySummaryLabel(group.job, group.assignments)}
                          </div>
                          {group.unavailableWorkerIds.length > 0 ? (
                            <div style={{ color: "#b42318", fontSize: "13px", fontWeight: 700 }}>
                              Away: {group.unavailableWorkerIds.map((id) => userNamesById.get(id) ?? id.slice(0, 8)).join(", ")}
                            </div>
                          ) : null}
                          {group.hasConflict ? (
                            <div style={{ color: "#b42318", fontSize: "13px", fontWeight: 700 }}>
                              {group.isMissingRequiredCrew
                                ? "Full crew missing · Recalculation needed"
                                : "Worker off · Recalculation needed"}
                            </div>
                          ) : group.needsCrewRecalculation ? (
                            <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                              Crew assigned · Recalculate to assign workers
                            </div>
                          ) : group.isAutoFilled ? (
                            <div style={{ color: "#1f6b37", fontSize: "13px", fontWeight: 700 }}>Auto-filled</div>
                          ) : null}
                          {group.requiresFullCrewTogether ? (
                            <div style={{ color: "#445168", fontSize: "13px", fontWeight: 700 }}>
                              Full crew required
                            </div>
                          ) : null}
                          {group.isSplitDay ? (
                            <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                              Day split · {group.totalHoursThisDay}h scheduled
                            </div>
                          ) : null}
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button onClick={() => handleStartWork(group.job.id)}>Start Work</button>
                            {canManageScheduling ? (
                              <>
                                <button
                                  onClick={() => openEditForBlock(firstBlock)}
                                  disabled={isPending}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleMoveGroupToday(group)}
                                  disabled={isPending}
                                >
                                  {isPending && pendingGroupAction?.action === "today"
                                    ? "Moving..."
                                    : "Today"}
                                </button>
                                <button
                                  onClick={() => handleMoveGroupTomorrow(group)}
                                  disabled={isPending}
                                >
                                  {isPending && pendingGroupAction?.action === "tomorrow"
                                    ? "Moving..."
                                    : "Tomorrow"}
                                </button>
                                <button
                                  onClick={() => openCarryOverForGroup(group)}
                                  disabled={isPending}
                                >
                                  {isPending && pendingGroupAction?.action === "carryover"
                                    ? "Moving..."
                                    : "Carry Over"}
                                </button>
                                <button
                                  onClick={() => void handleRecalculateJobSchedule(group.job.id, group.day)}
                                  disabled={isPending || autoFillScheduleBlocks.isPending}
                                >
                                  {autoFillScheduleBlocks.isPending ? "Reflowing..." : "Recalculate"}
                                </button>
                                <button
                                  onClick={() => void unscheduleGroup(group)}
                                  disabled={isPending}
                                >
                                  {isPending && pendingGroupAction?.action === "unschedule"
                                    ? "Unscheduling..."
                                    : "Unschedule Day"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </article>
                      );})}
                    </div>
                  ) : null}

                  {untimedGroups.length > 0 ? (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <strong style={{ fontSize: "13px", color: "#5b6475" }}>Untimed Jobs</strong>
                      {untimedGroups.map((group) => {
                        const firstBlock = group.blocks[0]!;
                        const isPending = pendingGroupAction?.groupKey === group.key;
                        return (
                          <article
                            key={group.key}
                            draggable={canManageScheduling && !pendingDropDay && !isPending}
                            onDragStart={(event) => {
                              if (!canManageScheduling) {
                                return;
                              }
                              event.dataTransfer.effectAllowed = "move";
                              handleDragStart({ kind: "scheduled_group", groupKey: group.key });
                            }}
                            onDragEnd={handleDragEnd}
                            style={{
                              border: group.hasConflict
                                ? "2px solid #b42318"
                                : group.isNextForJob
                                  ? "2px solid #1b4dff"
                                  : "1px solid #d9dfeb",
                              borderRadius: "12px",
                              padding: "12px",
                              background: "#ffffff",
                              display: "grid",
                              gap: "8px",
                              opacity:
                                draggingPayload?.kind === "scheduled_group" && draggingPayload.groupKey === group.key
                                  ? 0.55
                                  : 1,
                              cursor: pendingDropDay || isPending ? "default" : "grab",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                              <strong>{group.job.number}</strong>
                              <small style={{ color: "#5b6475" }}>{group.totalHoursThisDay}h</small>
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, color: "#172033" }}>{group.job.title}</span>
                              <span
                                style={{
                                  borderRadius: "999px",
                                  background: "#eef2f8",
                                  color: "#445168",
                                  fontSize: "12px",
                                  padding: "4px 8px",
                                }}
                              >
                                {getTimeBucketLabel(group.timeBucket)}
                              </span>
                              <span
                                style={{
                                  borderRadius: "999px",
                                  background: "#eef2ff",
                                  color: "#163fcb",
                                  fontSize: "12px",
                                  padding: "4px 8px",
                                  fontWeight: 700,
                                }}
                              >
                                Day {group.dayIndex} of {group.totalDays}
                              </span>
                            </div>
                            <div style={{ color: "#5b6475", fontSize: "13px" }}>
                              Crew: {getCrewLabel(group.scheduledUserIds, userNamesById)}
                            </div>
                            <div style={{ color: "#5b6475", fontSize: "13px" }}>
                              {getCapacitySummaryLabel(group.job, group.assignments)}
                            </div>
                            {group.unavailableWorkerIds.length > 0 ? (
                              <div style={{ color: "#b42318", fontSize: "13px", fontWeight: 700 }}>
                                Away: {group.unavailableWorkerIds.map((id) => userNamesById.get(id) ?? id.slice(0, 8)).join(", ")}
                              </div>
                            ) : null}
                            {group.hasConflict ? (
                              <div style={{ color: "#b42318", fontSize: "13px", fontWeight: 700 }}>
                                {group.isMissingRequiredCrew
                                  ? "Full crew missing · Recalculation needed"
                                  : "Worker off · Recalculation needed"}
                              </div>
                            ) : group.needsCrewRecalculation ? (
                              <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                                Crew assigned · Recalculate to assign workers
                              </div>
                            ) : group.isAutoFilled ? (
                              <div style={{ color: "#1f6b37", fontSize: "13px", fontWeight: 700 }}>Auto-filled</div>
                            ) : null}
                            {group.requiresFullCrewTogether ? (
                              <div style={{ color: "#445168", fontSize: "13px", fontWeight: 700 }}>
                                Full crew required
                              </div>
                            ) : null}
                            {group.isSplitDay ? (
                              <div style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
                                Day split · {group.totalHoursThisDay}h scheduled
                              </div>
                            ) : null}
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button onClick={() => handleStartWork(group.job.id)}>Start Work</button>
                              {canManageScheduling ? (
                                <>
                                  <button
                                    onClick={() => openEditForBlock(firstBlock)}
                                    disabled={isPending}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleMoveGroupToday(group)}
                                    disabled={isPending}
                                  >
                                    {isPending && pendingGroupAction?.action === "today"
                                      ? "Moving..."
                                      : "Today"}
                                  </button>
                                  <button
                                    onClick={() => handleMoveGroupTomorrow(group)}
                                    disabled={isPending}
                                  >
                                    {isPending && pendingGroupAction?.action === "tomorrow"
                                      ? "Moving..."
                                      : "Tomorrow"}
                                  </button>
                                  <button
                                    onClick={() => openCarryOverForGroup(group)}
                                    disabled={isPending}
                                  >
                                    {isPending && pendingGroupAction?.action === "carryover"
                                      ? "Moving..."
                                      : "Carry Over"}
                                  </button>
                                  <button
                                    onClick={() => void handleRecalculateJobSchedule(group.job.id, group.day)}
                                    disabled={isPending || autoFillScheduleBlocks.isPending}
                                  >
                                    {autoFillScheduleBlocks.isPending ? "Reflowing..." : "Recalculate"}
                                  </button>
                                  <button
                                    onClick={() => void unscheduleGroup(group)}
                                    disabled={isPending}
                                  >
                                    {isPending && pendingGroupAction?.action === "unschedule"
                                      ? "Unscheduling..."
                                      : "Unschedule Day"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </article>
                        );})}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </section>

      {canManageScheduling ? (
        <ScheduleEditorPanel
          authenticatedUser={currentUser}
          availableJobs={jobsForEditor}
          assignmentsByJobId={assignmentsByJobId}
          scheduledJobIds={scheduledJobIds}
          assignableUsers={assignableUsers}
          initialDraft={editorDraft}
          isPending={isSaving}
          onSubmit={handleSubmit}
          onUpdateEstimatedHours={handleUpdateEstimatedHours}
          onUpdateFullCrewRule={handleUpdateFullCrewRule}
          onAutoFillDays={handleAutoFillDays}
          onAutoFillNextAvailable={handleAutoFillNextAvailable}
          onAssignUser={handleAssignUser}
          onRemoveAssignment={handleRemoveAssignment}
          {...(editorDraft?.scheduleBlockId ? { onDelete: handleDelete } : {})}
          onClose={() => setEditorDraft(null)}
        />
      ) : null}
      {canManageScheduling ? (
        <CarryOverPanel
          initialDraft={carryOverDraft}
          isPending={carryOverScheduleBlock.isPending}
          onSubmit={handleCarryOverSubmit}
          onClose={() => { setCarryOverDraft(null); setPendingGroupAction(null); }}
        />
      ) : null}
      {canManageScheduling && isMobileLayout && mobileAddJobDay ? (
        <div
          role="presentation"
          onClick={() => setMobileAddJobDay(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            zIndex: 24,
            display: "grid",
            alignItems: "end",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Add job to day"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "#ffffff",
              borderTopLeftRadius: "22px",
              borderTopRightRadius: "22px",
              padding: "18px",
              display: "grid",
              gap: "14px",
              boxShadow: "0 -18px 50px rgba(15, 23, 42, 0.18)",
              maxHeight: "78vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
              <div>
                <strong style={{ display: "block", fontSize: "17px" }}>Add Job</strong>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>
                  Choose an unscheduled job for {getDayLabel(mobileAddJobDay)}.
                </span>
              </div>
              <button onClick={() => setMobileAddJobDay(null)} style={secondaryButtonStyle()}>
                Close
              </button>
            </div>

            {orderedUnscheduledJobs.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #d9dfeb",
                  borderRadius: "14px",
                  padding: "14px",
                  color: "#5b6475",
                  background: "#fafcff",
                }}
              >
                There are no unscheduled jobs available right now.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {orderedUnscheduledJobs.map((item) => (
                  <button
                    key={item.job.id}
                    onClick={() => {
                      openCreateForJob(item.job, mobileAddJobDay);
                      setMobileAddJobDay(null);
                    }}
                    style={{
                      ...secondaryButtonStyle(),
                      textAlign: "left",
                      justifyContent: "flex-start",
                      display: "grid",
                      gap: "4px",
                      padding: "14px",
                      minHeight: "auto",
                    }}
                  >
                    <strong>{item.job.number}</strong>
                    <span style={{ fontWeight: 600, color: "#162033" }}>{item.job.title}</span>
                    <span style={{ color: "#5b6475", fontSize: "13px" }}>
                      {item.job.estimatedHours ? `${item.job.estimatedHours}h estimated` : "No estimate yet"}
                      {" · "}
                      {item.assignments.length > 0 ? `${item.assignments.length} assigned` : "No one assigned"}
                    </span>
                    <span style={{ color: "#5b6475", fontSize: "13px" }}>
                      {getCapacitySummaryLabel(item.job, item.assignments)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
      <DayDetailPanel
        day={selectedDayDetail}
        groups={selectedDayGroups}
        userNamesById={userNamesById}
        canManageSchedule={canManageScheduling}
        pendingGroupAction={pendingGroupAction}
        isRecalculating={autoFillScheduleBlocks.isPending}
        onClose={() => setSelectedDayDetail(null)}
        onStartWork={handleStartWork}
        onEdit={openEditForBlock}
        onMoveToday={handleMoveGroupToday}
        onMoveTomorrow={handleMoveGroupTomorrow}
        onCarryOver={openCarryOverForGroup}
        onUnschedule={(group) => void unscheduleGroup(group)}
        onRecalculate={(group) => void handleRecalculateJobSchedule(group.jobId, group.day)}
      />
    </main>
  );
}
