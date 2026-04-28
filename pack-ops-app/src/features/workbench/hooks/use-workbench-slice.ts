import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import { getSyncErrorMessage } from "@/data/sync/errors";
import type { Job } from "@/domain/jobs/types";
import {
  createManualTimeEntryDraft,
  stopTimeEntryDraft,
  type TimeEntryDraft,
} from "@/domain/time-entries/draft";
import type { AuthenticatedUser } from "@/domain/users/types";
import { WorkbenchService } from "@/services/workbench/workbench-service";

const WORKBENCH_QUERY_KEY = ["workbench", "jobs"];
const JOB_WORKSPACE_QUERY_KEY = ["workbench", "job-workspace"];

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  return getSyncErrorMessage(error, fallback);
}

function getRunningTimerPersistKey(draft: TimeEntryDraft | null): string | null {
  if (!draft || draft.endedAt !== null || !draft.activeTimerId) {
    return null;
  }

  return JSON.stringify({
    activeTimerId: draft.activeTimerId,
    jobId: draft.jobId,
    startedAt: draft.startedAt,
    description: draft.description,
  });
}

export function useWorkbenchSlice(
  authenticatedUser: AuthenticatedUser,
  options?: { selectedJobId?: string | null; activeTab?: "overview" | "activity" | "attachments" | "actuals" },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);
  const [timeEntryDraft, setTimeEntryDraft] = useState<TimeEntryDraft | null>(null);
  const [activeRunningTimerDraft, setActiveRunningTimerDraft] = useState<TimeEntryDraft | null>(null);
  const [isSavingTimeEntryDraft, setIsSavingTimeEntryDraft] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const activeTimerPersistTimeoutRef = useRef<number | null>(null);
  const lastPersistedRunningDraftRef = useRef<string | null>(null);
  const service = useMemo(
    () =>
      new WorkbenchService(
        {
          orgId: authenticatedUser.user.orgId,
          actorUserId: authenticatedUser.user.id,
        },
        authenticatedUser.user,
        client,
      ),
    [
      authenticatedUser.user.id,
      authenticatedUser.user.orgId,
      authenticatedUser.user.role,
      authenticatedUser.user.isForeman,
      authenticatedUser.user.canApproveTime,
      client,
    ],
  );
  const capabilities = service.getWorkbenchCapabilities();

  const jobsQuery = useQuery({
    queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id],
    queryFn: async () => {
      const result = await service.listJobCards();
      console.info("[useWorkbenchSlice] jobsQuery result", {
        count: result.length,
        ids: result.map((item) => item.job.id),
        titles: result.map((item) => item.job.title),
      });
      return result;
    },
  });

  const queueQuery = useQuery({
    queryKey: ["workbench", "queue", authenticatedUser.user.id],
    queryFn: () => service.getQueueCount(),
  });

  const activeTimersQuery = useQuery({
    queryKey: ["workbench", "active-timers", authenticatedUser.user.id],
    queryFn: () => service.listActiveTimerOverviews(),
    enabled: capabilities.canViewAllActiveTimers,
  });

  const contactsQuery = useQuery({
    queryKey: ["workbench", "contacts", authenticatedUser.user.id],
    queryFn: () => service.listContactOptions(),
    enabled: capabilities.canCreateJob,
  });

  const assignableUsersQuery = useQuery({
    queryKey: ["workbench", "assignable-users", authenticatedUser.user.id],
    queryFn: () => service.listAssignableUsers(),
    enabled: true,
  });

  const jobWorkspaceQuery = useQuery({
    queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id, options?.selectedJobId ?? null],
    enabled: Boolean(options?.selectedJobId),
    queryFn: async () => {
      const selectedJob = jobsQuery.data?.find((item) => item.job.id === options?.selectedJobId)?.job;
      if (!selectedJob) {
        throw new Error("Select a job to load its activity and attachments.");
      }

      return service.getJobWorkspace(selectedJob);
    },
  });

  const attachmentPreviewUrlsQuery = useQuery({
    queryKey: [
      ...JOB_WORKSPACE_QUERY_KEY,
      "attachment-previews",
      authenticatedUser.user.id,
      options?.selectedJobId ?? null,
      (jobWorkspaceQuery.data?.attachments ?? []).map((attachment) => attachment.storagePath).join("|"),
    ],
    enabled:
      options?.activeTab === "attachments" &&
      Boolean(options?.selectedJobId) &&
      (jobWorkspaceQuery.data?.attachments ?? []).some((attachment) => attachment.mimeType.startsWith("image/")),
    queryFn: () =>
      service.getAttachmentPreviewUrls(
        (jobWorkspaceQuery.data?.attachments ?? [])
          .filter((attachment) => attachment.mimeType.startsWith("image/"))
          .map((attachment) => attachment.storagePath),
      ),
  });

  async function revalidateActiveTimer(options?: { silent?: boolean; reason?: string }) {
    try {
      const draft = await service.restoreActiveTimerDraft();
      const persistKey = getRunningTimerPersistKey(draft);

      setActiveRunningTimerDraft(draft);
      lastPersistedRunningDraftRef.current = persistKey;

      if (!options?.silent) {
        console.info("[useWorkbenchSlice] revalidated active timer", {
          reason: options?.reason ?? "unknown",
          activeTimerId: draft?.activeTimerId ?? null,
          jobId: draft?.jobId ?? null,
        });
      } else if (!draft) {
        console.info("[useWorkbenchSlice] cleared active timer after authoritative revalidate", {
          reason: options?.reason ?? "unknown",
        });
      }

      return draft;
    } catch (error) {
      console.error("[useWorkbenchSlice] revalidateActiveTimer error", error);
      throw error;
    }
  }

  useEffect(() => {
    let isMounted = true;

    void revalidateActiveTimer({ silent: true, reason: "mount" })
      .then(() => {
        if (!isMounted) {
          return;
        }
      })
      .catch(() => {
        // Error already logged by revalidateActiveTimer.
      });

    return () => {
      isMounted = false;
      if (activeTimerPersistTimeoutRef.current) {
        window.clearTimeout(activeTimerPersistTimeoutRef.current);
      }
    };
  }, [authenticatedUser.user.id, service]);

  useEffect(() => {
    if (!activeRunningTimerDraft || activeRunningTimerDraft.endedAt !== null || !activeRunningTimerDraft.activeTimerId) {
      return;
    }

    const persistKey = getRunningTimerPersistKey(activeRunningTimerDraft);

    if (persistKey === lastPersistedRunningDraftRef.current) {
      return;
    }

    if (activeTimerPersistTimeoutRef.current) {
      window.clearTimeout(activeTimerPersistTimeoutRef.current);
    }

    activeTimerPersistTimeoutRef.current = window.setTimeout(() => {
      void service.persistActiveTimerDraft(activeRunningTimerDraft)
        .then(() => {
          lastPersistedRunningDraftRef.current = persistKey;
          void queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
        })
        .catch((error) => {
          console.error("[useWorkbenchSlice] persistActiveTimerDraft error", error);
          setFeedback({
            tone: "error",
            text: getFriendlyErrorMessage(error, "Could not persist the running timer."),
          });
        });
    }, 400);

    return () => {
      if (activeTimerPersistTimeoutRef.current) {
        window.clearTimeout(activeTimerPersistTimeoutRef.current);
      }
    };
  }, [activeRunningTimerDraft, authenticatedUser.user.id, queryClient, service]);

  useEffect(() => {
    function handleFocus() {
      void revalidateActiveTimer({ silent: true, reason: "focus" });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void revalidateActiveTimer({ silent: true, reason: "visibility" });
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void revalidateActiveTimer({ silent: true, reason: "poll" });
      }
    }, 30000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [service]);

  const createJob = useMutation({
    mutationFn: (input: { title: string; description: string; contactId: string; estimatedHours?: number | null }) => {
      console.info("[useWorkbenchSlice] createJob input", input);
      return service.createJob(input);
    },
    onSuccess: async (job) => {
      console.info("[useWorkbenchSlice] createJob insert result", job);
      const beforeInvalidate = queryClient.getQueryData([...WORKBENCH_QUERY_KEY, authenticatedUser.user.id]);
      console.info("[useWorkbenchSlice] jobsQuery cache before invalidation", beforeInvalidate);
      setFeedback({ tone: "success", text: "Job created." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "active-timers", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] createJob error", error);
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not create the job. Check the console for the full sync error."),
      });
    },
  });

  const createQuickContact = useMutation({
    mutationFn: (input: { displayName: string; email?: string; phone?: string }) => {
      console.info("[useWorkbenchSlice] createQuickContact input", input);
      return service.createQuickContact(input);
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Contact created and ready to attach." });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "contacts", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] createQuickContact error", error);
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not create the contact. Check the console for the full Supabase error."),
      });
    },
  });

  const updateJob = useMutation({
    mutationFn: (input: {
      jobId: string;
      title: string;
      description: string;
      contactId: string;
      estimatedHours?: number | null;
    }) => {
      console.info("[useWorkbenchSlice] updateJob input", input);
      return service.updateJobBasics(input);
    },
    onSuccess: async (job) => {
      console.info("[useWorkbenchSlice] updateJob result", job);
      setFeedback({ tone: "success", text: "Job updated." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "active-timers", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] updateJob error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not update the job.") });
    },
  });

  const archiveJob = useMutation({
    mutationFn: (jobId: string) => {
      console.info("[useWorkbenchSlice] archiveJob input", { jobId });
      return service.archiveJob(jobId);
    },
    onSuccess: async () => {
      console.info("[useWorkbenchSlice] archiveJob result");
      setFeedback({ tone: "success", text: "Job archived. It is now hidden from the default Workbench list." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] archiveJob error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not archive the job.") });
    },
  });

  const updateJobStatus = useMutation({
    mutationFn: (input: { jobId: string; status: Job["status"]; waitingReason?: Job["waitingReason"] | null }) => {
      console.info("[useWorkbenchSlice] updateJobStatus input", input);
      return service.updateJobStatus(input);
    },
    onSuccess: async (job) => {
      console.info("[useWorkbenchSlice] updateJobStatus result", job);
      setFeedback({ tone: "success", text: "Job status updated." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] updateJobStatus error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not update job status in jobs sync.") });
    },
  });

  const assignCurrentUser = useMutation({
    mutationFn: (jobId: string) => {
      console.info("[useWorkbenchSlice] assignCurrentUser input", { jobId });
      return service.assignCurrentUserToJob(jobId);
    },
    onSuccess: async (assignment) => {
      console.info("[useWorkbenchSlice] assignCurrentUser result", assignment);
      setFeedback({ tone: "success", text: "You are now assigned to this job." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] assignCurrentUser error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Assignment failed.") });
    },
  });

  const assignJob = useMutation({
    mutationFn: (input: { jobId: string; userId: string }) => {
      console.info("[useWorkbenchSlice] assignJob input", input);
      return service.assignJobToUser(input.jobId, input.userId);
    },
    onSuccess: async (assignment) => {
      console.info("[useWorkbenchSlice] assignJob result", assignment);
      setFeedback({ tone: "success", text: "User added to job." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] assignJob error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Assignment failed.") });
    },
  });

  const removeJobAssignment = useMutation({
    mutationFn: (assignmentId: string) => {
      console.info("[useWorkbenchSlice] removeJobAssignment input", { assignmentId });
      return service.removeJobAssignment(assignmentId);
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "User removed from job." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] removeJobAssignment error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not remove the assignment.") });
    },
  });

  const resolveActionItem = useMutation({
    mutationFn: (item: Parameters<WorkbenchService["resolveActionItem"]>[0]) => {
      console.info("[useWorkbenchSlice] resolveActionItem input", item);
      return service.resolveActionItem(item);
    },
    onSuccess: async (updatedItem) => {
      console.info("[useWorkbenchSlice] resolveActionItem result", updatedItem);
      setFeedback({ tone: "success", text: "Action item resolved." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] resolveActionItem error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not resolve action item.") });
    },
  });

  const approveTimeEntry = useMutation({
    mutationFn: (entry: Parameters<WorkbenchService["approveTimeEntry"]>[0]) => {
      console.info("[useWorkbenchSlice] approveTimeEntry input", entry);
      return service.approveTimeEntry(entry);
    },
    onSuccess: async (updatedEntry) => {
      console.info("[useWorkbenchSlice] approveTimeEntry result", updatedEntry);
      setFeedback({ tone: "success", text: "Time entry approved." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] approveTimeEntry error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not approve time entry.") });
    },
  });

  const createActualTimeEntry = useMutation({
    mutationFn: (input: {
      jobId: string;
      hours: number;
      description: string;
      workedByUserId: string;
      workDate: string;
      startTime?: string | null;
      endTime?: string | null;
      hourlyRate?: number | null;
      sectionName?: string | null;
    }) =>
      service.createTimeEntry(
        input.jobId,
        input.hours,
        input.description,
        input.workedByUserId,
        input.workDate,
        input.startTime ?? null,
        input.endTime ?? null,
        input.hourlyRate ?? null,
        input.sectionName ?? null,
      ),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Actual labour entry added." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not add the labour entry.") });
    },
  });

  const updateTimeEntry = useMutation({
    mutationFn: (input: {
      entryId: import("@/domain/time-entries/types").TimeEntry["id"];
      workDate: string;
      startTime?: string | null;
      endTime?: string | null;
      hours: number;
      description: string | null;
      hourlyRate?: number | null;
      sectionName?: string | null;
    }) => {
      console.info("[useWorkbenchSlice] updateTimeEntry input", input);
      return service.updateTimeEntry(input);
    },
    onSuccess: async (updatedEntry) => {
      console.info("[useWorkbenchSlice] updateTimeEntry result", updatedEntry);
      setFeedback({ tone: "success", text: "Time entry updated." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] updateTimeEntry error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not update the time entry.") });
    },
  });

  const deleteTimeEntry = useMutation({
    mutationFn: (entry: import("@/domain/time-entries/types").TimeEntry) => {
      console.info("[useWorkbenchSlice] deleteTimeEntry input", entry);
      return service.deleteTimeEntry(entry);
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Time entry deleted." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] deleteTimeEntry error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not delete the time entry.") });
    },
  });

  const flushSync = useMutation({
    mutationFn: () => service.flushSyncQueue(),
    onSuccess: async (attemptedCount) => {
      setFeedback({ tone: "success", text: attemptedCount > 0 ? `Flushed ${attemptedCount} queued change${attemptedCount === 1 ? "" : "s"}.` : "Nothing was waiting to flush." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] flushSync error", error);
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not flush queued changes."),
      });
    },
  });

  const createActionItem = useMutation({
    mutationFn: (input: { jobId: string; title: string; description: string }) => {
      console.info("[useWorkbenchSlice] createActionItem input", input);
      return service.createActionItemForJob(input);
    },
    onSuccess: async (item) => {
      console.info("[useWorkbenchSlice] createActionItem result", item);
      setFeedback({ tone: "success", text: "Action item added." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    },
    onError: (error) => {
      console.error("[useWorkbenchSlice] createActionItem error", error);
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not add action item.") });
    },
  });

  const refreshWorkbench = useMutation({
    mutationFn: async () => {
      await service.sync.refreshWorkbench();
      return true;
    },
    onSuccess: async () => {
      setFeedback({ tone: "info", text: "Workbench refreshed from the backend." });
      await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Refresh failed." });
    },
  });

  const addJobNote = useMutation({
    mutationFn: (input: { jobId: string; body: string }) => service.createJobNote(input.jobId, input.body),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Note added to job activity." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not add the note.") });
    },
  });

  const uploadJobAttachment = useMutation({
    mutationFn: (input: { jobId: string; file: File }) => service.uploadJobAttachment(input.jobId, input.file),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Attachment uploaded and added to activity." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not upload the attachment.") });
    },
  });

  const deleteJobAttachment = useMutation({
    mutationFn: (input: { attachmentId: string; storagePath: string; fileName: string }) =>
      service.deleteJobAttachment(input),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Attachment removed." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not remove the attachment.") });
    },
  });

  const createJobMaterial = useMutation({
    mutationFn: (input: {
      jobId: string;
      catalogItemId: string;
      kind: "used" | "needed";
      quantity: number;
      note?: string | null;
      displayName?: string | null;
      skuSnapshot?: string | null;
      unitSnapshot?: string | null;
      unitCost?: number | null;
      unitSell?: number | null;
      markupPercent?: number | null;
      sectionName?: string | null;
      sourceAssemblyId?: string | null;
      sourceAssemblyName?: string | null;
      sourceAssemblyMultiplier?: number | null;
    }) => service.createJobMaterial(input),
    onSuccess: async (_, input) => {
      setFeedback({
        tone: "success",
        text: input.kind === "used" ? "Actual material added." : "Material needed added.",
      });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not save the material entry.") });
    },
  });

  const updateJobMaterial = useMutation({
    mutationFn: (input: {
      jobMaterialId: string;
      catalogItemId: string;
      quantity: number;
      note?: string | null;
      displayName?: string | null;
      skuSnapshot?: string | null;
      unitSnapshot?: string | null;
      unitCost?: number | null;
      unitSell?: number | null;
      markupPercent?: number | null;
      sectionName?: string | null;
    }) => service.updateJobMaterial(input),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Material entry updated." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not update the material entry.") });
    },
  });

  const deleteJobMaterial = useMutation({
    mutationFn: (jobMaterialId: string) => service.deleteJobMaterial(jobMaterialId),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Material entry removed." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not remove the job_materials entry from the database."),
      });
    },
  });

  const duplicateJobMaterial = useMutation({
    mutationFn: (jobMaterialId: string) => service.duplicateJobMaterial(jobMaterialId),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Material entry duplicated." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not duplicate the material entry.") });
    },
  });

  const addAssemblyToActuals = useMutation({
    mutationFn: (input: {
      jobId: string;
      assemblyId: string;
      multiplier: number;
      note?: string | null;
      workDate?: string;
      workerUserId?: string | null;
      addLabor?: boolean;
      laborSellRate?: number | null;
      sectionName?: string | null;
    }) => service.addAssemblyToJobActuals(input),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Assembly added to actuals." });
      await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: getFriendlyErrorMessage(error, "Could not add the assembly to actuals.") });
    },
  });

  async function startTimer(jobId: string) {
    try {
      const existingDraft = activeRunningTimerDraft;
      if (existingDraft?.activeTimerId) {
        setFeedback({ tone: "info", text: "A timer is already running. You can edit it below." });
        return;
      }

      const draft = await service.startActiveTimer(jobId, "On-site work");
      console.info("[useWorkbenchSlice] startTimer draft", draft);
      lastPersistedRunningDraftRef.current = getRunningTimerPersistKey(draft);
      setActiveRunningTimerDraft(draft);
      const authoritativeDraft = await revalidateActiveTimer({ silent: true, reason: "post-start" });
      console.info("[useWorkbenchSlice] startTimer authoritative result", {
        startedActiveTimerId: draft.activeTimerId,
        authoritativeActiveTimerId: authoritativeDraft?.activeTimerId ?? null,
        authoritativeJobId: authoritativeDraft?.jobId ?? null,
      });
      setFeedback({ tone: "info", text: "Timer started. You can edit the note, start time, or job while it runs." });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
    } catch (error) {
      console.error("[useWorkbenchSlice] startTimer error", error);
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not start the timer."),
      });
    }
  }

  function startManualEntry(jobId: string) {
    const existingRunningDraft = activeRunningTimerDraft;

    if (existingRunningDraft) {
      setActiveRunningTimerDraft(existingRunningDraft);
    }

    const draft = createManualTimeEntryDraft(
      jobId as TimeEntryDraft["jobId"],
      authenticatedUser.user.id as TimeEntryDraft["userId"],
    );
    console.info("[useWorkbenchSlice] startManualEntry draft", draft);
    setTimeEntryDraft(draft);
    setFeedback({
      tone: "info",
      text: existingRunningDraft
        ? "Add Time is ready. Your active timer is still running separately."
        : "Add Time is ready. Enter the date, hours, and note, then save.",
    });
  }

  function updateTimeEntryDraft(
    patch: Partial<Pick<TimeEntryDraft, "jobId" | "startedAt" | "endedAt" | "description">>,
  ) {
    setTimeEntryDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextDraft: TimeEntryDraft = {
        ...currentDraft,
        ...patch,
      };

      console.info("[useWorkbenchSlice] updateTimeEntryDraft", {
        before: currentDraft,
        patch,
        after: nextDraft,
      });

      return nextDraft;
    });
  }

  function updateActiveRunningTimerDraft(
    patch: Partial<Pick<TimeEntryDraft, "jobId" | "startedAt" | "endedAt" | "description">>,
  ) {
    setActiveRunningTimerDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextDraft: TimeEntryDraft = {
        ...currentDraft,
        ...patch,
      };

      console.info("[useWorkbenchSlice] updateActiveRunningTimerDraft", {
        before: currentDraft,
        patch,
        after: nextDraft,
      });

      return nextDraft;
    });
  }

  async function stopTimer() {
    const runningDraft = activeRunningTimerDraft;

    if (!runningDraft) {
      return;
    }

    try {
      if (activeTimerPersistTimeoutRef.current) {
        window.clearTimeout(activeTimerPersistTimeoutRef.current);
      }

      if (runningDraft.activeTimerId) {
        await service.stopActiveTimer(runningDraft.activeTimerId);
        await revalidateActiveTimer({ silent: true });
        await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
      }

      const stoppedDraft = stopTimeEntryDraft(runningDraft);
      console.info("[useWorkbenchSlice] stopTimer draft", stoppedDraft);
      lastPersistedRunningDraftRef.current = null;
      setActiveRunningTimerDraft(null);

      if (timeEntryDraft?.source === "manual") {
        setFeedback({ tone: "info", text: "Existing timer stopped. Your Add Time entry is still open." });
      } else {
        setTimeEntryDraft(stoppedDraft);
        setFeedback({ tone: "info", text: "Timer stopped. Make any final adjustments, then save the entry." });
      }
    } catch (error) {
      console.error("[useWorkbenchSlice] stopTimer error", error);
      setFeedback({
        tone: "error",
        text: getFriendlyErrorMessage(error, "Could not stop the timer."),
      });
    }
  }

  async function discardTimeEntryDraft() {
    setTimeEntryDraft(null);
    setFeedback({ tone: "info", text: "Time entry draft cleared." });
  }

  return {
    capabilities,
    jobsQuery,
    queueQuery,
    activeTimersQuery,
    createJob,
    assignCurrentUser,
    assignJob,
    removeJobAssignment,
    resolveActionItem,
    approveTimeEntry,
    createActualTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    flushSync,
    createActionItem,
    refreshWorkbench,
    timeEntryDraft,
    activeRunningTimerDraft,
    isSavingTimeEntryDraft,
    startTimer,
    startManualEntry,
    updateTimeEntryDraft,
    updateActiveRunningTimerDraft,
    stopTimer,
    discardTimeEntryDraft,
    saveTimeEntryDraft: async () => {
      if (!timeEntryDraft) {
        return;
      }

      try {
        setIsSavingTimeEntryDraft(true);
        const savedEntry = await service.saveTimeEntryDraft(timeEntryDraft);
        console.info("[useWorkbenchSlice] saveTimeEntryDraft result", {
          draft: timeEntryDraft,
          savedEntry,
        });
        setTimeEntryDraft(null);
        setFeedback({
          tone: "success",
          text: activeRunningTimerDraft
            ? "Time entry saved. Your other active timer is still running until you stop it."
            : "Time entry saved.",
        });
        await queryClient.invalidateQueries({ queryKey: [...WORKBENCH_QUERY_KEY, authenticatedUser.user.id] });
        await queryClient.invalidateQueries({ queryKey: [...JOB_WORKSPACE_QUERY_KEY, authenticatedUser.user.id] });
        await queryClient.invalidateQueries({ queryKey: ["workbench", "queue", authenticatedUser.user.id] });
      } catch (error) {
        console.error("[useWorkbenchSlice] saveTimeEntryDraft error", error);
        setFeedback({
          tone: "error",
          text: getFriendlyErrorMessage(error, "Could not save the time entry."),
        });
      } finally {
        setIsSavingTimeEntryDraft(false);
      }
    },
    contactsQuery,
    assignableUsersQuery,
    jobWorkspaceQuery,
    attachmentPreviewUrlsQuery,
    createQuickContact,
    updateJob,
    updateJobStatus,
    archiveJob,
    addJobNote,
    uploadJobAttachment,
    deleteJobAttachment,
    createJobMaterial,
    updateJobMaterial,
    deleteJobMaterial,
    duplicateJobMaterial,
    addAssemblyToActuals,
    openAttachment: (storagePath: string) => service.getAttachmentAccessUrl(storagePath),
    feedback,
    syncStatus: flushSync.isPending
      ? "Flushing queued changes…"
      : refreshWorkbench.isPending
        ? "Refreshing from backend…"
        : (queueQuery.data ?? 0) > 0
          ? `${queueQuery.data} queued change${queueQuery.data === 1 ? "" : "s"}`
          : "Synced",
  };
}
