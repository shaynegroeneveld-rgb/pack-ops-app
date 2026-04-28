import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/data/supabase/types";
import type { FinanceDocumentIntake, FinanceDocumentType } from "@/domain/finance/types";
import type { User } from "@/domain/users/types";

export interface FinanceDocumentExtractionReviewInput {
  documentType: FinanceDocumentType;
  extractedVendor: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedSubtotal: number | null;
  extractedTax: number | null;
  extractedTotal: number | null;
}

function canReviewExtraction(user: User): boolean {
  return user.role === "owner" || user.role === "office" || user.role === "bookkeeper";
}

function requireAccess(user: User) {
  if (!canReviewExtraction(user)) {
    throw new Error("You cannot review finance document extraction.");
  }
}

function normalizeMoney(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  if (value < 0) {
    throw new Error("Extracted amounts cannot be negative.");
  }
  return Math.round(value * 100) / 100;
}

export class FinanceDocumentExtractionReviewService {
  constructor(
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async saveReview(
    documentId: FinanceDocumentIntake["id"],
    status: "approved" | "rejected",
    input: FinanceDocumentExtractionReviewInput,
  ): Promise<void> {
    requireAccess(this.currentUser);

    const payload = {
      document_type: input.documentType,
      extraction_status: status,
      extracted_vendor: input.extractedVendor?.trim() || null,
      extracted_invoice_number: input.extractedInvoiceNumber?.trim() || null,
      extracted_date: input.extractedDate || null,
      extracted_subtotal: normalizeMoney(input.extractedSubtotal),
      extracted_tax: normalizeMoney(input.extractedTax),
      extracted_total: normalizeMoney(input.extractedTotal),
      extraction_reviewed_by: this.currentUser.id,
      extraction_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await (this.client as any)
      .from("finance_document_intake")
      .update(payload)
      .eq("org_id", this.currentUser.orgId)
      .eq("id", documentId);

    if (error) {
      throw error;
    }
  }
}
