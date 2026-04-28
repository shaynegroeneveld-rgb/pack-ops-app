import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type { AuthenticatedUser } from "@/domain/users/types";
import { PayrollAssistService } from "@/services/payroll/payroll-assist-service";

const PAYROLL_ASSIST_QUERY_KEY = ["payroll-assist"];

export function usePayrollAssist(
  authenticatedUser: AuthenticatedUser,
  period: { startDate: string; endDate: string },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);
  const service = useMemo(
    () =>
      new PayrollAssistService(
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

  const workspaceQuery = useQuery({
    queryKey: [...PAYROLL_ASSIST_QUERY_KEY, authenticatedUser.user.id, period],
    queryFn: () => service.getWorkspace(period),
  });

  const approvePayroll = useMutation({
    mutationFn: (input: Parameters<PayrollAssistService["approvePayroll"]>[0]) =>
      service.approvePayroll(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PAYROLL_ASSIST_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  return {
    workspaceQuery,
    approvePayroll,
  };
}
