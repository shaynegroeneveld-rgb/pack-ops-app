import type { JobAssignmentRole, JobStatus, JobWaitingReason } from "@/domain/enums";
import type { CatalogItemId, ContactId, JobAssignmentId, JobId, OrgId, QuoteId, UserId } from "@/domain/ids";
import type { AuditedEntity } from "@/domain/shared/base";
import type { Document } from "@/domain/documents/types";
import type { Note } from "@/domain/notes/types";
import type { ScheduleBlock } from "@/domain/scheduling/types";
import type { AssemblyView } from "@/domain/materials/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import type { SavedInvoiceSummary } from "@/domain/invoices/types";

export interface JobEstimateMaterialSnapshot {
  catalogItemId: string | null;
  sku: string | null;
  description: string;
  unit: string;
  quantity: number;
  note: string | null;
  sectionName: string | null;
  unitCost: number | null;
  unitSell: number | null;
  markupPercent: number | null;
}

export interface JobMaterialEntry extends AuditedEntity {
  id: string;
  orgId: OrgId;
  jobId: JobId;
  catalogItemId: CatalogItemId;
  kind: "used" | "needed";
  quantity: number;
  note: string | null;
  displayName: string | null;
  skuSnapshot: string | null;
  unitSnapshot: string | null;
  unitCost: number | null;
  unitSell: number | null;
  markupPercent: number | null;
  sectionName: string | null;
  sourceAssemblyId: string | null;
  sourceAssemblyName: string | null;
  sourceAssemblyMultiplier: number | null;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}

export interface JobMaterialView extends JobMaterialEntry {
  materialName: string;
  materialSku: string | null;
  materialUnit: string;
  currentCatalogCost: number | null;
  currentCatalogUnitPrice: number | null;
}

export interface JobEstimateSnapshot {
  sourceQuoteId: QuoteId | null;
  sourceQuoteNumber: string | null;
  generatedAt: string;
  laborHours: number;
  materials: JobEstimateMaterialSnapshot[];
}

export interface Job extends AuditedEntity {
  id: JobId;
  orgId: OrgId;
  contactId: ContactId;
  quoteId: QuoteId | null;
  number: string;
  status: JobStatus;
  waitingReason: JobWaitingReason | null;
  title: string;
  description: string | null;
  internalNotes: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  tags: string[];
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  estimatedHours: number | null;
  estimatedCost: number | null;
  estimateSnapshot: JobEstimateSnapshot | null;
  requiresFullCrewTogether: boolean;
  createdBy: UserId | null;
  updatedBy: UserId | null;
}

export interface JobAssignment extends AuditedEntity {
  id: JobAssignmentId;
  orgId: OrgId;
  jobId: JobId;
  userId: UserId;
  assignmentRole: JobAssignmentRole;
  assignedAt: string;
  assignedBy: UserId | null;
}

export interface JobDerivedInputs {
  assignmentCount: number;
  unapprovedTimeEntryCount: number;
  hasInvoiceDraft: boolean;
  lastActivityAt: string | null;
  now: Date;
}

export interface JobLinkedQuoteSummary {
  id: QuoteId;
  number: string;
  status: string;
}

export type JobPerformanceOverrunDriver = "labour" | "materials" | "billing" | "mixed" | "none";
export type JobPerformanceHealthStatus = "healthy" | "watch" | "over-budget" | "underbilled" | "unpaid" | "loss";
export type JobPerformancePaymentStatus = "not-invoiced" | "not-collected" | "partially-collected" | "collected" | "over-collected";

export interface JobPerformanceStatDisplay {
  label: string;
  tone: "neutral" | "good" | "watch" | "bad";
}

export interface JobPerformanceCoreMoneyStats {
  quotedValue: number | null;
  invoicedRevenue: number | null;
  collectedRevenue: number;
  outstandingRevenue: number | null;
  actualTotalCost: number | null;
  actualGrossProfit: number | null;
  actualMarginPct: number | null;
  projectedGrossProfit: number | null;
  projectedMarginPct: number | null;
  revenuePerHour: number | null;
  grossProfitPerHour: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
}

export interface JobPerformanceEstimateAccuracyStats {
  estimatedTotalCost: number | null;
  costVariance: number | null;
  costVariancePct: number | null;
  estimatedGrossProfit: number | null;
  grossProfitDelta: number | null;
  estimatedHours: number | null;
  actualHours: number;
  hourVariance: number | null;
  estimatedLabourCost: number | null;
  actualLabourCost: number | null;
  labourVariance: number | null;
  estimatedMaterialCost: number | null;
  actualMaterialCost: number;
  materialVariance: number | null;
}

export interface JobPerformanceBillingHealthStats {
  hasInvoice: boolean;
  invoiceCount: number;
  billingGap: number | null;
  percentBilledVsQuote: number | null;
  percentCollectedVsInvoiced: number | null;
  lastInvoiceDate: string | null;
  paymentStatus: JobPerformancePaymentStatus;
}

export interface JobPerformanceDiagnosticStats {
  labourCostSharePct: number | null;
  materialCostSharePct: number | null;
  overrunDriver: JobPerformanceOverrunDriver;
  healthStatus: JobPerformanceHealthStatus;
  summarySentence: string;
  healthBadges: JobPerformanceStatDisplay[];
}

export interface JobPerformanceSummary {
  coreMoney: JobPerformanceCoreMoneyStats;
  estimateAccuracy: JobPerformanceEstimateAccuracyStats;
  billingHealth: JobPerformanceBillingHealthStats;
  diagnostics: JobPerformanceDiagnosticStats;
  estimatedHours: number | null;
  actualHours: number;
  estimatedLaborCost: number | null;
  actualLaborCost: number | null;
  estimatedMaterialCost: number | null;
  actualMaterialCost: number;
  estimatedSellTotal: number | null;
  actualLaborRevenue: number | null;
  actualMaterialRevenue: number | null;
  actualSellValue: number | null;
  savedInvoiceCount: number;
  savedInvoiceTotal: number | null;
  totalActualCost: number | null;
  currentGrossProfitEstimate: number | null;
  grossMarginPercent: number | null;
  hoursVariance: number | null;
  laborCostVariance: number | null;
  materialCostVariance: number | null;
}

export interface JobActivityEntry {
  id: string;
  type: "note" | "upload" | "job_event" | "time_entry";
  title: string;
  body: string | null;
  createdAt: string;
}

export interface JobWorkspaceData {
  contactName: string | null;
  contactSubtitle: string | null;
  linkedQuote: JobLinkedQuoteSummary | null;
  nextScheduledWork: ScheduleBlock | null;
  notes: Note[];
  attachments: Document[];
  invoices: SavedInvoiceSummary[];
  activity: JobActivityEntry[];
  materialCatalogOptions: Array<{
    id: CatalogItemId;
    name: string;
    sku: string | null;
    unit: string;
    costPrice: number | null;
    unitPrice: number | null;
  }>;
  assemblyOptions: AssemblyView[];
  estimatedMaterials: JobEstimateMaterialSnapshot[];
  usedMaterials: JobMaterialView[];
  neededMaterials: JobMaterialView[];
  timeEntries: TimeEntry[];
  pricingDefaults: {
    laborCostRate: number;
    laborSellRate: number;
    materialMarkupPercent: number;
  };
  performance: JobPerformanceSummary | null;
}
