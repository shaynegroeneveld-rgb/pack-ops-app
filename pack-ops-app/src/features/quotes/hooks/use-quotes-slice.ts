import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type { Lead } from "@/domain/leads/types";
import type { QuoteView } from "@/domain/quotes/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import { QuotesService } from "@/services/quotes/quotes-service";

const QUOTES_QUERY_KEY = ["quotes"];
const QUOTE_BUILDER_QUERY_KEY = ["quote-builder"];

export function useQuotesSlice(
  authenticatedUser: AuthenticatedUser,
  options?: { status?: QuoteView["status"] | "all" },
) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);

  const service = useMemo(
    () =>
      new QuotesService(
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

  const canManageQuotes =
    authenticatedUser.user.role === "owner" || authenticatedUser.user.role === "office";

  const quotesQuery = useQuery({
    queryKey: [...QUOTES_QUERY_KEY, authenticatedUser.user.id, options?.status ?? "all"],
    queryFn: () =>
      service.listQuotes({
        ...(options?.status && options.status !== "all" ? { status: options.status } : {}),
      }),
    enabled: canManageQuotes,
  });

  const builderResourcesQuery = useQuery({
    queryKey: [...QUOTE_BUILDER_QUERY_KEY, authenticatedUser.user.id],
    queryFn: () => service.getQuoteBuilderResources(),
    enabled: canManageQuotes,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: [...QUOTES_QUERY_KEY, authenticatedUser.user.id] });
  };

  const invalidateQuotesAndBuilder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...QUOTES_QUERY_KEY, authenticatedUser.user.id] }),
      queryClient.invalidateQueries({ queryKey: [...QUOTE_BUILDER_QUERY_KEY, authenticatedUser.user.id] }),
    ]);
  };

  const createQuoteFromLead = useMutation({
    mutationFn: (leadId: Lead["id"]) => service.createQuoteFromLead(leadId),
    onSuccess: invalidate,
  });

  const createQuote = useMutation({
    mutationFn: (input: Parameters<QuotesService["createStandaloneQuote"]>[0]) =>
      service.createStandaloneQuote(input),
    onSuccess: invalidate,
  });

  const createAssemblyFromQuote = useMutation({
    mutationFn: (input: Parameters<QuotesService["createAssemblyFromQuoteLines"]>[0]) =>
      service.createAssemblyFromQuoteLines(input),
    onSuccess: invalidateQuotesAndBuilder,
  });

  const previewCustomerQuote = useMutation({
    mutationFn: (quoteId: QuoteView["id"]) => service.getCustomerQuotePreview(quoteId),
  });

  const updateQuote = useMutation({
    mutationFn: (input: { quoteId: QuoteView["id"] } & Parameters<QuotesService["updateQuote"]>[1]) =>
      service.updateQuote(input.quoteId, input),
    onSuccess: invalidate,
  });

  const acceptQuote = useMutation({
    mutationFn: (input: { quoteId: QuoteView["id"] } & Parameters<QuotesService["acceptQuote"]>[1]) =>
      service.acceptQuote(input.quoteId, input),
    onSuccess: invalidate,
  });

  const createJobFromQuote = useMutation({
    mutationFn: (quoteId: QuoteView["id"]) => service.createJobFromQuote(quoteId),
    onSuccess: invalidate,
  });

  const archiveQuote = useMutation({
    mutationFn: (quoteId: QuoteView["id"]) => service.archiveQuote(quoteId),
    onSuccess: invalidate,
  });

  const uploadQuoteAttachment = useMutation({
    mutationFn: (input: { quoteId: QuoteView["id"]; file: File }) =>
      service.uploadQuoteAttachment(input.quoteId, input.file),
    onSuccess: invalidate,
  });

  const deleteQuoteAttachment = useMutation({
    mutationFn: (input: { attachmentId: string; storagePath: string; fileName: string }) =>
      service.deleteQuoteAttachment(input),
    onSuccess: invalidate,
  });

  const openQuoteAttachment = async (storagePath: string) => {
    const signedUrl = await service.getQuoteAttachmentAccessUrl(storagePath);
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  };

  return {
    quotesQuery,
    builderResourcesQuery,
    createQuote,
    createAssemblyFromQuote,
    createQuoteFromLead,
    previewCustomerQuote,
    acceptQuote,
    createJobFromQuote,
    updateQuote,
    archiveQuote,
    uploadQuoteAttachment,
    deleteQuoteAttachment,
    openQuoteAttachment,
  };
}
