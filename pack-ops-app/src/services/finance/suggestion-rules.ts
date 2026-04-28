import type {
  FinanceCategory,
  FinanceDocumentIntake,
  FinanceImportDocumentMatchSuggestion,
  FinanceSuggestionRule,
  ImportedTransaction,
} from "@/domain/finance/types";

export const FINANCE_SUGGESTION_RULES: FinanceSuggestionRule[] = [
  {
    id: "materials-suppliers",
    label: "Electrical suppliers",
    keywords: ["home depot", "gescan", "rexel", "lumen", "wire", "wholesale", "supplier"],
    categoryName: "Materials",
    receiptRequired: true,
  },
  {
    id: "fuel-vehicle",
    label: "Fuel and vehicle",
    keywords: ["shell", "chevron", "petro", "esso", "fuel", "gas", "parking"],
    categoryName: "Fuel and Vehicle",
    receiptRequired: true,
  },
  {
    id: "permit-fees",
    label: "Permits and fees",
    keywords: ["permit", "inspection", "city of", "municipal"],
    categoryName: "Permits and Fees",
    receiptRequired: false,
  },
  {
    id: "bank-transfer",
    label: "Account transfer",
    keywords: ["transfer", "payment thank you", "online banking transfer"],
    isTransfer: true,
    receiptRequired: false,
  },
];

export function normalizeRuleText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9#.-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function findRuleForText(value: string): FinanceSuggestionRule | null {
  const normalized = normalizeRuleText(value);
  return FINANCE_SUGGESTION_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(normalizeRuleText(keyword))),
  ) ?? null;
}

export function inferReceiptStatus(input: {
  amount: number;
  text: string;
  category: FinanceCategory | null;
}): ImportedTransaction["receiptStatus"] {
  if (input.amount >= 0) {
    return "not_required";
  }

  const rule = findRuleForText(`${input.text} ${input.category?.name ?? ""}`);
  if (rule?.receiptRequired === false) {
    return "not_required";
  }

  return "missing";
}

export function suggestImportDocumentMatches(input: {
  imports: ImportedTransaction[];
  documents: FinanceDocumentIntake[];
}): FinanceImportDocumentMatchSuggestion[] {
  const unmatchedDocuments = input.documents.filter((document) =>
    document.status !== "ignored" && !document.linkedImportedTransactionId,
  );

  return input.imports
    .filter((row) => row.amount < 0 && !row.linkedDocumentIntakeId && row.status !== "ignored" && row.status !== "duplicate")
    .flatMap((row) =>
      unmatchedDocuments.map((document) => {
        const reasons: string[] = [];
        let confidence = 0;
        const amountDelta = Math.abs(Math.abs(row.amount) - (document.extractedTotal ?? -1));
        if (document.extractedTotal != null && amountDelta <= 0.02) {
          confidence += 0.45;
          reasons.push("same amount");
        } else if (document.extractedTotal != null && amountDelta <= 2) {
          confidence += 0.25;
          reasons.push("near amount");
        }

        const rowDate = new Date(row.transactionDate).getTime();
        const documentDate = document.extractedDate ? new Date(document.extractedDate).getTime() : Number.NaN;
        if (Number.isFinite(rowDate) && Number.isFinite(documentDate)) {
          const dayDelta = Math.abs(rowDate - documentDate) / 86_400_000;
          if (dayDelta <= 1) {
            confidence += 0.3;
            reasons.push("same day");
          } else if (dayDelta <= 7) {
            confidence += 0.15;
            reasons.push("close date");
          }
        }

        const importText = normalizeRuleText(`${row.rawDescription} ${row.rawMemo ?? ""}`);
        const vendorText = normalizeRuleText(document.extractedVendor ?? document.fileName);
        if (vendorText && importText.includes(vendorText)) {
          confidence += 0.25;
          reasons.push("vendor match");
        }

        return {
          importedTransactionId: row.id,
          documentIntakeId: document.id,
          confidence: Math.min(1, confidence),
          reasons,
        };
      }),
    )
    .filter((match) => match.confidence >= 0.45)
    .sort((left, right) => right.confidence - left.confidence);
}
