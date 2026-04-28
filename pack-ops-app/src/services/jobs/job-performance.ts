import type {
  Job,
  JobEstimateMaterialSnapshot,
  JobMaterialEntry,
  JobPerformanceHealthStatus,
  JobPerformanceOverrunDriver,
  JobPerformancePaymentStatus,
  JobPerformanceSummary,
  JobPerformanceStatDisplay,
} from "@/domain/jobs/types";
import type { CatalogItem } from "@/domain/materials/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import { normalizeEstimateMaterialSnapshotLines } from "@/services/materials/part-material-lines";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const COST_WATCH_THRESHOLD_PCT = 2;
const COST_OVER_BUDGET_THRESHOLD_PCT = 10;
const BILLING_GAP_WATCH_THRESHOLD_PCT = 5;
const BILLING_GAP_UNDERBILLED_THRESHOLD_PCT = 10;
const UNPAID_OUTSTANDING_THRESHOLD_PCT = 25;
const DRIVER_DOMINANCE_THRESHOLD = 0.6;
const MIN_MEANINGFUL_MONEY = 50;

export interface JobPerformanceQuoteInputs {
  subtotal: number | null;
  total: number | null;
  laborCostRate: number | null;
  laborSellRate?: number | null;
}

export interface JobPerformanceInvoiceSellInputs {
  subtotal: number;
  total: number;
  laborRevenue: number | null;
  materialRevenue: number | null;
  count: number;
  collected: number;
  lastInvoiceDate: string | null;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentage(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }
  return roundPercent((numerator / denominator) * 100);
}

function moneyVariance(actual: number | null, estimated: number | null): number | null {
  return actual !== null && estimated !== null ? roundMoney(actual - estimated) : null;
}

function safeDivideMoney(numerator: number | null, denominator: number): number | null {
  if (numerator === null || denominator <= 0) {
    return null;
  }
  return roundMoney(numerator / denominator);
}

function formatPercentForSentence(value: number | null): string {
  return value === null ? "unknown" : `${Math.abs(value).toFixed(1)}%`;
}

function derivePaymentStatus(input: {
  hasInvoice: boolean;
  invoicedRevenue: number | null;
  collectedRevenue: number;
}): JobPerformancePaymentStatus {
  if (!input.hasInvoice) {
    return "not-invoiced";
  }
  if (!input.invoicedRevenue || input.invoicedRevenue <= 0) {
    return "not-collected";
  }
  if (input.collectedRevenue <= 0) {
    return "not-collected";
  }
  if (input.collectedRevenue + 0.005 < input.invoicedRevenue) {
    return "partially-collected";
  }
  if (input.collectedRevenue > input.invoicedRevenue + 0.005) {
    return "over-collected";
  }
  return "collected";
}

function deriveOverrunDriver(input: {
  labourVariance: number | null;
  materialVariance: number | null;
  billingGapPct: number | null;
  costVariancePct: number | null;
}): JobPerformanceOverrunDriver {
  const labourOver = Math.max(0, input.labourVariance ?? 0);
  const materialOver = Math.max(0, input.materialVariance ?? 0);
  const totalOver = labourOver + materialOver;
  const billingBehind =
    input.billingGapPct !== null && input.billingGapPct >= BILLING_GAP_UNDERBILLED_THRESHOLD_PCT;
  const costReasonable =
    input.costVariancePct === null || input.costVariancePct <= COST_WATCH_THRESHOLD_PCT;

  if (billingBehind && costReasonable) {
    return "billing";
  }
  if (totalOver <= MIN_MEANINGFUL_MONEY) {
    return billingBehind ? "billing" : "none";
  }

  const labourShare = labourOver / totalOver;
  const materialShare = materialOver / totalOver;
  if (labourShare >= DRIVER_DOMINANCE_THRESHOLD) return "labour";
  if (materialShare >= DRIVER_DOMINANCE_THRESHOLD) return "materials";
  return "mixed";
}

function deriveHealthStatus(input: {
  actualGrossProfit: number | null;
  actualMarginPct: number | null;
  costVariancePct: number | null;
  billingGapPct: number | null;
  invoicedRevenue: number | null;
  actualTotalCost: number | null;
  outstandingRevenue: number | null;
  paymentStatus: JobPerformancePaymentStatus;
}): JobPerformanceHealthStatus {
  const reasonablyBilled =
    input.invoicedRevenue !== null &&
    input.invoicedRevenue >= Math.max(MIN_MEANINGFUL_MONEY, (input.actualTotalCost ?? 0) * 0.25);
  if (input.actualGrossProfit !== null && input.actualGrossProfit < -MIN_MEANINGFUL_MONEY && reasonablyBilled) {
    return "loss";
  }
  if (
    input.billingGapPct !== null &&
    input.billingGapPct >= BILLING_GAP_UNDERBILLED_THRESHOLD_PCT &&
    ((input.costVariancePct !== null && input.costVariancePct >= -COST_WATCH_THRESHOLD_PCT) ||
      (input.actualTotalCost !== null && input.invoicedRevenue !== null && input.actualTotalCost > input.invoicedRevenue))
  ) {
    return "underbilled";
  }
  if (
    input.invoicedRevenue !== null &&
    input.outstandingRevenue !== null &&
    input.outstandingRevenue >= Math.max(MIN_MEANINGFUL_MONEY, input.invoicedRevenue * (UNPAID_OUTSTANDING_THRESHOLD_PCT / 100))
  ) {
    return "unpaid";
  }
  if (input.costVariancePct !== null && input.costVariancePct > COST_OVER_BUDGET_THRESHOLD_PCT) {
    return "over-budget";
  }
  if (
    (input.costVariancePct !== null && input.costVariancePct > COST_WATCH_THRESHOLD_PCT) ||
    (input.billingGapPct !== null && input.billingGapPct > BILLING_GAP_WATCH_THRESHOLD_PCT) ||
    (input.actualMarginPct !== null && input.actualMarginPct < 15)
  ) {
    return "watch";
  }
  return "healthy";
}

function buildHealthBadges(input: {
  healthStatus: JobPerformanceHealthStatus;
  overrunDriver: JobPerformanceOverrunDriver;
  paymentStatus: JobPerformancePaymentStatus;
  hasInvoice: boolean;
}): JobPerformanceStatDisplay[] {
  const toneByHealth: Record<JobPerformanceHealthStatus, JobPerformanceStatDisplay["tone"]> = {
    healthy: "good",
    watch: "watch",
    "over-budget": "bad",
    underbilled: "watch",
    unpaid: "watch",
    loss: "bad",
  };

  const badges: JobPerformanceStatDisplay[] = [
    { label: input.healthStatus.replace("-", " "), tone: toneByHealth[input.healthStatus] },
  ];

  if (input.overrunDriver !== "none") {
    badges.push({
      label: `driver: ${input.overrunDriver}`,
      tone: input.overrunDriver === "billing" ? "watch" : "bad",
    });
  }

  badges.push({
    label: input.paymentStatus.replaceAll("-", " "),
    tone:
      input.paymentStatus === "collected"
        ? "good"
        : input.paymentStatus === "not-invoiced"
          ? "neutral"
          : "watch",
  });

  if (!input.hasInvoice) {
    badges.push({ label: "not invoiced", tone: "neutral" });
  }

  return badges;
}

function buildSummarySentence(input: {
  costVariancePct: number | null;
  overrunDriver: JobPerformanceOverrunDriver;
  billingGapPct: number | null;
  healthStatus: JobPerformanceHealthStatus;
  hasInvoice: boolean;
  actualGrossProfit: number | null;
}): string {
  if (input.healthStatus === "loss") {
    return "Job is currently operating at a loss based on invoiced revenue.";
  }
  if (!input.hasInvoice) {
    return input.costVariancePct !== null && input.costVariancePct > COST_OVER_BUDGET_THRESHOLD_PCT
      ? `Job is ${formatPercentForSentence(input.costVariancePct)} over estimated cost, but no invoice has been generated yet.`
      : "No invoice has been generated yet, so actual revenue and actual profit are not available.";
  }
  if (input.healthStatus === "underbilled") {
    const costText =
      input.costVariancePct === null || Math.abs(input.costVariancePct) <= COST_WATCH_THRESHOLD_PCT
        ? "Costs are tracking close to estimate"
        : `Costs are ${formatPercentForSentence(input.costVariancePct)} ${input.costVariancePct > 0 ? "over" : "under"} estimate`;
    return `${costText}, but billing is currently ${formatPercentForSentence(input.billingGapPct)} behind the quoted value.`;
  }
  if (input.healthStatus === "over-budget") {
    return `Job is ${formatPercentForSentence(input.costVariancePct)} over estimated cost, primarily driven by ${input.overrunDriver === "none" ? "mixed cost movement" : input.overrunDriver}.`;
  }
  if (input.healthStatus === "unpaid") {
    return "Job has invoiced revenue, but a meaningful amount is still outstanding.";
  }

  const costText =
    input.costVariancePct === null
      ? "Cost estimate accuracy is not available yet"
      : Math.abs(input.costVariancePct) < 0.05
        ? "This job is on estimated cost"
        : `This job is ${formatPercentForSentence(input.costVariancePct)} ${input.costVariancePct > 0 ? "over" : "under"} estimated cost`;
  const driverText =
    input.overrunDriver === "none"
      ? "with no clear overrun driver"
      : `mainly driven by ${input.overrunDriver}`;
  const billingText =
    input.billingGapPct === null
      ? "billing has not been benchmarked against the quote"
      : input.billingGapPct > 0.05
        ? `billing is still ${input.billingGapPct.toFixed(1)}% behind quote`
        : "billing is caught up to the quote";

  return `${costText}, ${driverText}, and ${billingText}.`;
}

export function computeJobPerformanceSummary(input: {
  job: Pick<Job, "estimatedHours" | "estimateSnapshot" | "status">;
  estimatedMaterialLines?: JobEstimateMaterialSnapshot[] | null;
  linkedQuote: JobPerformanceQuoteInputs | null;
  settingsDefaults?: {
    laborCostRate: number;
    laborSellRate: number;
    materialMarkupPercent: number;
  };
  savedInvoiceSell?: JobPerformanceInvoiceSellInputs | null;
  catalogItems: CatalogItem[];
  jobMaterials: Array<
    Pick<JobMaterialEntry, "catalogItemId" | "kind" | "quantity" | "unitCost" | "unitSell" | "markupPercent">
  >;
  timeEntries: Array<Pick<TimeEntry, "status" | "hours" | "hourlyRate">>;
  canViewFinancials: boolean;
}): JobPerformanceSummary | null {
  if (!input.canViewFinancials) {
    return null;
  }

  const catalogById = new Map(input.catalogItems.map((item) => [String(item.id), item]));
  const usedMaterials = input.jobMaterials.filter((entry) => entry.kind === "used");

  const actualHours = roundMoney(
    input.timeEntries
      .filter((entry) => entry.status !== "rejected")
      .reduce((total, entry) => total + entry.hours, 0),
  );

  const estimatedHours = input.job.estimateSnapshot?.laborHours ?? input.job.estimatedHours ?? null;
  const estimatedMaterialLines = normalizeEstimateMaterialSnapshotLines(
    input.estimatedMaterialLines ?? input.job.estimateSnapshot?.materials ?? [],
  );
  const laborCostRate =
    typeof input.linkedQuote?.laborCostRate === "number"
      ? input.linkedQuote.laborCostRate
      : input.settingsDefaults?.laborCostRate ?? null;
  const estimatedLaborCost =
    estimatedHours !== null && laborCostRate !== null ? roundMoney(estimatedHours * laborCostRate) : null;
  const actualLaborCost =
    laborCostRate !== null ? roundMoney(actualHours * laborCostRate) : null;

  const estimatedMaterialCost = estimatedMaterialLines.length > 0
    ? roundMoney(
        estimatedMaterialLines.reduce((total, item) => {
          const catalogItem = item.catalogItemId ? catalogById.get(String(item.catalogItemId)) : null;
          const unitCost =
            typeof item.unitCost === "number"
              ? item.unitCost
              : catalogItem?.costPrice ?? 0;
          return total + unitCost * item.quantity;
        }, 0),
      )
    : null;

  const actualMaterialCost = roundMoney(
    usedMaterials.reduce((total, item) => {
      const catalogItem = catalogById.get(String(item.catalogItemId));
      const unitCost =
        typeof item.unitCost === "number"
          ? item.unitCost
          : catalogItem?.costPrice ?? 0;
      return total + unitCost * item.quantity;
    }, 0),
  );
  const actualMaterialRevenue = input.savedInvoiceSell?.materialRevenue ?? null;
  const actualLaborRevenue = input.savedInvoiceSell?.laborRevenue ?? null;

  const estimatedSellTotal =
    typeof input.linkedQuote?.subtotal === "number"
      ? input.linkedQuote.subtotal
      : typeof input.linkedQuote?.total === "number"
        ? input.linkedQuote.total
        : null;

  const actualSellValue = input.savedInvoiceSell ? roundMoney(input.savedInvoiceSell.subtotal) : null;
  const totalActualCost =
    actualLaborCost !== null ? roundMoney(actualLaborCost + actualMaterialCost) : null;
  const estimatedTotalCost =
    estimatedLaborCost !== null && estimatedMaterialCost !== null
      ? roundMoney(estimatedLaborCost + estimatedMaterialCost)
      : null;
  const actualGrossProfit =
    actualSellValue !== null && totalActualCost !== null
      ? roundMoney(actualSellValue - totalActualCost)
      : null;
  const actualMarginPct =
    actualGrossProfit !== null && actualSellValue && actualSellValue > 0
      ? roundPercent((actualGrossProfit / actualSellValue) * 100)
      : null;
  const quotedValue = estimatedSellTotal;
  const projectedGrossProfit =
    quotedValue !== null && totalActualCost !== null ? roundMoney(quotedValue - totalActualCost) : null;
  const projectedMarginPct =
    projectedGrossProfit !== null && quotedValue !== null && quotedValue > 0
      ? roundPercent((projectedGrossProfit / quotedValue) * 100)
      : null;
  const invoicedRevenue = input.savedInvoiceSell ? roundMoney(input.savedInvoiceSell.subtotal) : null;
  const collectedRevenue = roundMoney(input.savedInvoiceSell?.collected ?? 0);
  const outstandingRevenue =
    invoicedRevenue !== null ? roundMoney(Math.max(0, invoicedRevenue - collectedRevenue)) : null;
  const costVariance = moneyVariance(totalActualCost, estimatedTotalCost);
  const costVariancePct = percentage(costVariance, estimatedTotalCost);
  const estimatedGrossProfit =
    quotedValue !== null && estimatedTotalCost !== null ? roundMoney(quotedValue - estimatedTotalCost) : null;
  const grossProfitDelta =
    projectedGrossProfit !== null && estimatedGrossProfit !== null
      ? roundMoney(projectedGrossProfit - estimatedGrossProfit)
      : null;
  const hourVariance = estimatedHours !== null ? roundMoney(actualHours - estimatedHours) : null;
  const labourVariance = moneyVariance(actualLaborCost, estimatedLaborCost);
  const materialVariance =
    estimatedMaterialCost !== null ? roundMoney(actualMaterialCost - estimatedMaterialCost) : null;
  const hasInvoice = Boolean(input.savedInvoiceSell && input.savedInvoiceSell.count > 0);
  const billingGap = quotedValue !== null && invoicedRevenue !== null ? roundMoney(quotedValue - invoicedRevenue) : null;
  const percentBilledVsQuote = percentage(invoicedRevenue, quotedValue);
  const percentCollectedVsInvoiced = percentage(collectedRevenue, invoicedRevenue);
  const paymentStatus = derivePaymentStatus({ hasInvoice, invoicedRevenue, collectedRevenue });
  const labourCostSharePct = percentage(actualLaborCost, totalActualCost);
  const materialCostSharePct = percentage(actualMaterialCost, totalActualCost);
  const billingGapPct = percentage(billingGap, quotedValue);
  const revenuePerHour = safeDivideMoney(invoicedRevenue, actualHours);
  const grossProfitPerHour = safeDivideMoney(actualGrossProfit, actualHours);
  const overrunDriver = deriveOverrunDriver({ labourVariance, materialVariance, billingGapPct, costVariancePct });
  const healthStatus = deriveHealthStatus({
    actualGrossProfit,
    actualMarginPct,
    costVariancePct,
    billingGapPct,
    invoicedRevenue,
    actualTotalCost: totalActualCost,
    outstandingRevenue,
    paymentStatus,
  });
  const healthBadges = buildHealthBadges({ healthStatus, overrunDriver, paymentStatus, hasInvoice });
  const summarySentence = buildSummarySentence({
    costVariancePct,
    overrunDriver,
    billingGapPct,
    healthStatus,
    hasInvoice,
    actualGrossProfit,
  });

  const coreMoney = {
    quotedValue,
    invoicedRevenue,
    collectedRevenue,
    outstandingRevenue,
    actualTotalCost: totalActualCost,
    actualGrossProfit,
    actualMarginPct,
    projectedGrossProfit,
    projectedMarginPct,
    revenuePerHour,
    grossProfitPerHour,
    grossProfit: actualGrossProfit,
    grossMarginPct: actualMarginPct,
  };
  const estimateAccuracy = {
    estimatedTotalCost,
    costVariance,
    costVariancePct,
    estimatedGrossProfit,
    grossProfitDelta,
    estimatedHours,
    actualHours,
    hourVariance,
    estimatedLabourCost: estimatedLaborCost,
    actualLabourCost: actualLaborCost,
    labourVariance,
    estimatedMaterialCost,
    actualMaterialCost,
    materialVariance,
  };
  const billingHealth = {
    hasInvoice,
    invoiceCount: input.savedInvoiceSell?.count ?? 0,
    billingGap,
    percentBilledVsQuote,
    percentCollectedVsInvoiced,
    lastInvoiceDate: input.savedInvoiceSell?.lastInvoiceDate ?? null,
    paymentStatus,
  };
  const diagnostics = {
    labourCostSharePct,
    materialCostSharePct,
    overrunDriver,
    healthStatus,
    summarySentence,
    healthBadges,
  };

  return {
    coreMoney,
    estimateAccuracy,
    billingHealth,
    diagnostics,
    estimatedHours,
    actualHours,
    estimatedLaborCost,
    actualLaborCost,
    estimatedMaterialCost,
    actualMaterialCost,
    estimatedSellTotal,
    actualLaborRevenue,
    actualMaterialRevenue,
    actualSellValue,
    savedInvoiceCount: billingHealth.invoiceCount,
    savedInvoiceTotal: input.savedInvoiceSell ? roundMoney(input.savedInvoiceSell.total) : null,
    totalActualCost,
    currentGrossProfitEstimate: actualGrossProfit,
    grossMarginPercent: actualMarginPct,
    hoursVariance: hourVariance,
    laborCostVariance: labourVariance,
    materialCostVariance: materialVariance,
  };
}
