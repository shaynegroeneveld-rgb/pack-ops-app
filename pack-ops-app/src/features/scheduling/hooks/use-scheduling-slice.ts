import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type { Job } from "@/domain/jobs/types";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import type { UserId } from "@/domain/ids";
import { SchedulingService } from "@/services/scheduling/scheduling-service";

const SCHEDULING_QUERY_KEY = ["scheduling"];

export function useSchedulingSlice(
  authenticatedUser: AuthenticatedUser,
  options: { weekStartIso: string; weekEndIso: string },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);

  const service = useMemo(
    () =>
      new SchedulingService(
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

  const upcomingBlocksQuery = useQuery({
    queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id, options.weekStartIso, options.weekEndIso],
    queryFn: () =>
      service.getUpcomingScheduleBlocks({
        from: options.weekStartIso,
        to: options.weekEndIso,
      }),
  });

  const unscheduledJobsQuery = useQuery({
    queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id],
    queryFn: () => service.getUnscheduledJobs({ from: new Date().toISOString() }),
  });

  const assignableUsersQuery = useQuery({
    queryKey: [...SCHEDULING_QUERY_KEY, "assignable-users", authenticatedUser.user.id],
    queryFn: () => service.listAssignableUsers(),
    enabled: authenticatedUser.user.role === "owner" || authenticatedUser.user.role === "office",
  });

  const workerUnavailabilityQuery = useQuery({
    queryKey: [
      ...SCHEDULING_QUERY_KEY,
      "worker-unavailability",
      authenticatedUser.user.id,
      options.weekStartIso,
      options.weekEndIso,
    ],
    queryFn: () =>
      service.listWorkerUnavailability({
        from: options.weekStartIso.slice(0, 10),
        to: options.weekEndIso.slice(0, 10),
      }),
  });

  const planIssuesQuery = useQuery({
    queryKey: [
      ...SCHEDULING_QUERY_KEY,
      "plan-issues",
      authenticatedUser.user.id,
      options.weekStartIso,
      options.weekEndIso,
    ],
    queryFn: () =>
      service.getPlanIssues({
        from: options.weekStartIso.slice(0, 10),
        to: options.weekEndIso.slice(0, 10),
      }),
  });

  const createScheduleBlock = useMutation({
    mutationFn: (input: Parameters<SchedulingService["createScheduleBlock"]>[0]) =>
      service.createScheduleBlock(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  const updateScheduleBlock = useMutation({
    mutationFn: (input: Parameters<SchedulingService["updateScheduleBlock"]>[0]) =>
      service.updateScheduleBlock(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  const autoFillScheduleBlocks = useMutation({
    mutationFn: (input: Parameters<SchedulingService["autoFillScheduleBlocks"]>[0]) =>
      service.autoFillScheduleBlocks(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  const updateJobEstimatedHours = useMutation({
    mutationFn: (input: Parameters<SchedulingService["updateJobEstimatedHours"]>[0]) =>
      service.updateJobEstimatedHours(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const updateJobFullCrewRule = useMutation({
    mutationFn: (input: Parameters<SchedulingService["updateJobFullCrewRule"]>[0]) =>
      service.updateJobFullCrewRule(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const assignJobToUser = useMutation({
    mutationFn: (input: { jobId: Job["id"]; userId: UserId }) =>
      service.assignJobToUser(input.jobId, input.userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const removeJobAssignment = useMutation({
    mutationFn: (assignmentId: Parameters<SchedulingService["removeJobAssignment"]>[0]) =>
      service.removeJobAssignment(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const markWorkerUnavailable = useMutation({
    mutationFn: (input: Parameters<SchedulingService["markWorkerUnavailable"]>[0]) =>
      service.markWorkerUnavailable(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const removeWorkerUnavailability = useMutation({
    mutationFn: (id: Parameters<SchedulingService["removeWorkerUnavailability"]>[0]) =>
      service.removeWorkerUnavailability(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULING_QUERY_KEY });
    },
  });

  const deleteScheduleBlock = useMutation({
    mutationFn: (scheduleBlockId: ScheduleBlock["id"]) => service.deleteScheduleBlock(scheduleBlockId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  const carryOverScheduleBlock = useMutation({
    mutationFn: (input: Parameters<SchedulingService["carryOverScheduleBlock"]>[0]) =>
      service.carryOverScheduleBlock(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  const refreshScheduling = useMutation({
    mutationFn: () => service.sync.refreshScheduling(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "upcoming", authenticatedUser.user.id] });
      await queryClient.invalidateQueries({ queryKey: [...SCHEDULING_QUERY_KEY, "unscheduled", authenticatedUser.user.id] });
    },
  });

  return {
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
  };
}
