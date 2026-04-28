import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type { Lead } from "@/domain/leads/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import { LeadsService } from "@/services/leads/leads-service";

const LEADS_QUERY_KEY = ["leads"];

export function useLeadsSlice(
  authenticatedUser: AuthenticatedUser,
  options?: { status?: Lead["status"] | "all" },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);

  const service = useMemo(
    () =>
      new LeadsService(
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

  const canManageLeads =
    authenticatedUser.user.role === "owner" || authenticatedUser.user.role === "office";

  const leadsQuery = useQuery({
    queryKey: [...LEADS_QUERY_KEY, authenticatedUser.user.id, options?.status ?? "all"],
    queryFn: () =>
      service.listLeads({
        ...(options?.status && options.status !== "all" ? { status: options.status } : {}),
      }),
    enabled: canManageLeads,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: [...LEADS_QUERY_KEY, authenticatedUser.user.id] });
  };

  const createLead = useMutation({
    mutationFn: (input: Parameters<LeadsService["createLead"]>[0]) => service.createLead(input),
    onSuccess: invalidate,
  });

  const updateLead = useMutation({
    mutationFn: (input: { leadId: Lead["id"] } & Parameters<LeadsService["updateLead"]>[1]) =>
      service.updateLead(input.leadId, input),
    onSuccess: invalidate,
  });

  const archiveLead = useMutation({
    mutationFn: (leadId: Lead["id"]) => service.archiveLead(leadId),
    onSuccess: invalidate,
  });

  return {
    leadsQuery,
    createLead,
    updateLead,
    archiveLead,
  };
}
