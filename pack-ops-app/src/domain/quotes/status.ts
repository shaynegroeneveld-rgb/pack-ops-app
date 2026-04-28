import type { QuoteStatus } from "@/domain/enums";

export interface QuoteStatusAction {
  label: string;
  nextStatus: QuoteStatus;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

export function isValidQuoteTransition(fromStatus: QuoteStatus, toStatus: QuoteStatus): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  switch (fromStatus) {
    case "draft":
      return toStatus === "sent";
    case "sent":
      return ["viewed", "accepted", "rejected", "expired"].includes(toStatus);
    case "viewed":
      return ["accepted", "rejected", "expired"].includes(toStatus);
    case "rejected":
    case "expired":
      return toStatus === "draft";
    case "accepted":
      return toStatus === "sent" || toStatus === "draft";
  }
}

export function getQuoteTransitionMessage(fromStatus: QuoteStatus, toStatus: QuoteStatus): string {
  if (toStatus === "accepted" && fromStatus !== "sent" && fromStatus !== "viewed") {
    return "Quotes must be marked Sent before they can be Accepted.";
  }

  if (toStatus === "rejected" && fromStatus !== "sent" && fromStatus !== "viewed") {
    return "Quotes must be marked Sent before they can be Rejected.";
  }

  if (toStatus === "sent" && fromStatus !== "draft" && fromStatus !== "accepted") {
    return "Only draft or accepted quotes can be marked Sent.";
  }

  if (toStatus === "draft" && !["accepted", "rejected", "expired"].includes(fromStatus)) {
    return "Only accepted, rejected, or expired quotes can be moved back to Draft.";
  }

  return `Quotes cannot move from ${fromStatus} to ${toStatus}.`;
}

export function getQuoteStatusActions(status: QuoteStatus): QuoteStatusAction[] {
  switch (status) {
    case "draft":
      return [
        { label: "Mark as Sent", nextStatus: "sent" },
        { label: "Mark as Accepted", nextStatus: "accepted" },
      ];
    case "sent":
    case "viewed":
      return [
        { label: "Mark as Accepted", nextStatus: "accepted" },
        { label: "Mark as Rejected", nextStatus: "rejected" },
      ];
    case "rejected":
    case "expired":
      return [{ label: "Move Back to Draft", nextStatus: "draft" }];
    case "accepted":
      return [
        {
          label: "Move Back to Sent",
          nextStatus: "sent",
          requiresConfirmation: true,
          confirmationMessage: "Move this accepted quote back to Sent?",
        },
        {
          label: "Move Back to Draft",
          nextStatus: "draft",
          requiresConfirmation: true,
          confirmationMessage: "Move this accepted quote back to Draft?",
        },
      ];
  }
}
