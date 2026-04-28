import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useAuthContext } from "@/app/contexts/auth-context";
import { useUiStore } from "@/app/store/ui-store";
import { getSupabaseClient } from "@/data/supabase/client";
import { JOB_WAITING_REASONS, type JobStatus } from "@/domain/enums";
import type {
  ActualInvoiceControls,
  ActualsInvoicePreviewBase,
  EditableInvoiceDraftLine,
  InvoiceGenerationPreview,
  InvoiceGenerationSource,
  SavedInvoiceSummary,
} from "@/domain/invoices/types";
import type { Job, JobMaterialView } from "@/domain/jobs/types";
import type { TimeEntry } from "@/domain/time-entries/types";
import {
  getSelectableJobStatuses,
  getWorkbenchJobPhaseLabel,
  getWorkbenchWaitingReasonLabel,
} from "@/domain/jobs/status";
import { deriveTimeEntryDraftElapsedLabel } from "@/domain/time-entries/draft";
import { InvoiceGenerationPanel } from "@/features/invoices/components/InvoiceGenerationPanel";
import { SavedInvoicePreviewPanel } from "@/features/invoices/components/SavedInvoicePreviewPanel";
import { AssemblySearchSelect } from "@/features/quotes/components/AssemblySearchSelect";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import {
  badgeStyle,
  cardStyle as mobileCardStyle,
  feedbackStyle,
  floatingButtonStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import {
  buildInvoicePreviewFromActuals,
  buildInvoicePreviewFromDraft,
  createEditableInvoiceDraftLines,
  InvoiceGenerationService,
} from "@/services/invoices/invoice-generation-service";
import { CreateJobPanel } from "@/features/workbench/components/CreateJobPanel";
import { EditableTimeEntryItem } from "@/features/workbench/components/EditableTimeEntryItem";
import { TimeTrackerPanel } from "@/features/workbench/components/TimeTrackerPanel";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";

type JobScreen = "main" | "attachments" | "actuals";
type EditJobDraft = {
  title: string;
  contactId: string;
  description: string;
  estimatedHours: string;
  status: JobStatus;
  waitingReason: string;
};
type InvoicePreviewOptions = {
  showMaterials: boolean;
  showLabour: boolean;
  showItemPrices: boolean;
  descriptionOfWork: string;
};
type InvoiceDraftLinePatch = Partial<
  Pick<
    EditableInvoiceDraftLine,
    "description" | "quantity" | "unit" | "unitPrice" | "unitCost" | "markupPercent" | "sectionName" | "category" | "note"
  >
>;
type JobMaterialDraft = {
  materialId: string;
  quantity: string;
  note: string;
  displayName: string;
  unit: string;
  unitCost: string;
  markupPercent: string;
  unitSell: string;
  sectionName: string;
};
type AssemblyActualDraft = {
  assemblyId: string;
  multiplier: string;
  note: string;
  sectionName: string;
  workDate: string;
  workerUserId: string;
  addLabor: boolean;
  laborSellRate: string;
};
type ActualLaborDraft = {
  workerUserId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  hours: string;
  description: string;
  sectionName: string;
  hourlyRate: string;
};

const DEFAULT_ACTUAL_INVOICE_CONTROLS: ActualInvoiceControls = {
  materialMarkupPercent: 0,
  laborSellRate: 0,
  taxRate: 0,
  invoicePartName: null,
};
const DEFAULT_INVOICE_PREVIEW_OPTIONS: InvoicePreviewOptions = {
  showMaterials: true,
  showLabour: true,
  showItemPrices: true,
  descriptionOfWork: "",
};
const HIDDEN_JOB_STATUSES: JobStatus[] = ["work_complete", "ready_to_invoice", "invoiced", "closed", "cancelled"];

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNextScheduledLabel(startAt: string, endAt: string) {
  return `${formatDateTimeLabel(startAt)} - ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(endAt))}`;
}

function formatElapsedSince(startedAt: string, nowMs: number) {
  const elapsedMs = Math.max(0, nowMs - new Date(startedAt).getTime());
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function getJobStatusLabel(status: JobStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildMaterialSummary(
  items: Array<{
    catalogItemId: string | null;
    sku: string | null;
    description: string;
    unit: string;
    quantity: number;
    sectionName?: string | null;
  }>,
  options?: {
    separateBySection?: boolean;
  },
) {
  const summary = new Map<
    string,
    { key: string; description: string; sku: string | null; unit: string; quantity: number; sectionName: string | null }
  >();

  for (const item of items) {
    const normalizedSectionName = item.sectionName?.trim() || null;
    const key = options?.separateBySection
      ? `${normalizedSectionName ?? ""}::${item.catalogItemId ?? item.sku ?? item.description}::${item.unit}`
      : `${item.catalogItemId ?? item.sku ?? item.description}::${item.unit}`;
    const current = summary.get(key);
    if (current) {
      current.quantity += item.quantity;
      continue;
    }

    summary.set(key, {
      key,
      description: item.description,
      sku: item.sku,
      unit: item.unit,
      quantity: item.quantity,
      sectionName: normalizedSectionName,
    });
  }

  return Array.from(summary.values());
}

function buildCopyListText(
  items: Array<{
    catalogItemId: string | null;
    sku?: string | null;
    materialName: string;
    quantity: number;
  }>,
) {
  const grouped = new Map<string, { materialName: string; quantity: number }>();

  for (const item of items) {
    const key = item.catalogItemId ?? item.sku ?? item.materialName;
    const current = grouped.get(key);
    if (current) {
      current.quantity += item.quantity;
      continue;
    }

    grouped.set(key, {
      materialName: item.materialName,
      quantity: item.quantity,
    });
  }

  return Array.from(grouped.values())
    .map((item) => `${item.materialName} - ${item.quantity}`)
    .join("\n");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveMarginPercent(unitCost: number, unitSell: number): number | null {
  if (unitSell <= 0) {
    return null;
  }
  return roundMoney(((unitSell - unitCost) / unitSell) * 100);
}

function deriveHoursFromSlot(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) {
    return null;
  }

  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  if (
    startHours === undefined ||
    startMinutes === undefined ||
    endHours === undefined ||
    endMinutes === undefined
  ) {
    return null;
  }
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;

  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal) || endTotal <= startTotal) {
    return null;
  }

  return Math.round(((endTotal - startTotal) / 60) * 100) / 100;
}

function createEmptyJobMaterialDraft(): JobMaterialDraft {
  return {
    materialId: "",
    quantity: "1",
    note: "",
    displayName: "",
    unit: "",
    unitCost: "",
    markupPercent: "",
    unitSell: "",
    sectionName: "",
  };
}

function buildInvoicePreviewWithOptions(
  preview: InvoiceGenerationPreview | null,
  options: InvoicePreviewOptions,
): InvoiceGenerationPreview | null {
  if (!preview) {
    return null;
  }

  const lines = preview.lines.filter((line) => {
    if (line.category === "material" && !options.showMaterials) {
      return false;
    }
    if (line.category === "labor" && !options.showLabour) {
      return false;
    }
    return true;
  });
  const subtotal = lines.reduce((total, line) => total + line.subtotal, 0);
  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const roundedTaxAmount = Math.round(roundedSubtotal * preview.taxRate * 100) / 100;
  const roundedTotal = Math.round((roundedSubtotal + roundedTaxAmount) * 100) / 100;

  return {
    ...preview,
    lines,
    subtotal: roundedSubtotal,
    taxAmount: roundedTaxAmount,
    total: roundedTotal,
    customerNotes: options.descriptionOfWork.trim() || null,
  };
}

function createManualInvoiceDraftLine(): EditableInvoiceDraftLine {
  return {
    id: `manual:${crypto.randomUUID()}`,
    description: "",
    unit: "each",
    quantity: 1,
    unitPrice: 0,
    subtotal: 0,
    sectionName: null,
    category: "other",
    note: null,
    unitCost: null,
    markupPercent: null,
    sourceKind: "manual",
    generatedSourceId: null,
    origin: "manual",
    isEdited: true,
  };
}

function recalculateInvoiceDraftLine(line: EditableInvoiceDraftLine): EditableInvoiceDraftLine {
  const quantity = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
  const unitCost =
    typeof line.unitCost === "number" && Number.isFinite(line.unitCost) ? Math.max(0, line.unitCost) : null;
  const markupPercent =
    typeof line.markupPercent === "number" && Number.isFinite(line.markupPercent)
      ? Math.max(0, line.markupPercent)
      : null;
  const unitPrice =
    unitCost !== null && markupPercent !== null && line.category === "material"
      ? Math.round(unitCost * (1 + markupPercent / 100) * 100) / 100
      : Number.isFinite(line.unitPrice)
        ? Math.max(0, line.unitPrice)
        : 0;
  const subtotal = Math.round(quantity * unitPrice * 100) / 100;

  return {
    ...line,
    description: line.description,
    quantity: Math.round(quantity * 1000) / 1000,
    unit: line.unit || "each",
    unitCost,
    markupPercent,
    unitPrice: Math.round(unitPrice * 100) / 100,
    subtotal,
  };
}

function applyInvoiceDraftLinePatch(
  line: EditableInvoiceDraftLine,
  patch: InvoiceDraftLinePatch,
): EditableInvoiceDraftLine {
  const next = {
    ...line,
    ...patch,
    isEdited: true,
  };
  return recalculateInvoiceDraftLine(next);
}

function setInvoiceDraftLineTotal(
  line: EditableInvoiceDraftLine,
  nextLineTotal: number,
): EditableInvoiceDraftLine {
  const safeLineTotal = Number.isFinite(nextLineTotal) ? Math.max(0, nextLineTotal) : 0;
  const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
  const unitCost = typeof line.unitCost === "number" && Number.isFinite(line.unitCost) ? line.unitCost : null;
  return applyInvoiceDraftLinePatch(line, {
    unitPrice: Math.round((safeLineTotal / quantity) * 100) / 100,
    markupPercent:
      unitCost !== null && unitCost > 0
        ? Math.round((((safeLineTotal / quantity) - unitCost) / unitCost) * 1000) / 10
        : (line.markupPercent ?? null),
  });
}

function validateInvoiceDraftLines(lines: EditableInvoiceDraftLine[]): string[] {
  const issues: string[] = [];
  lines.forEach((line, index) => {
    if (!line.description.trim()) {
      issues.push(`Line ${index + 1}: description is required.`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      issues.push(`Line ${index + 1}: quantity cannot be negative.`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      issues.push(`Line ${index + 1}: sell price cannot be negative.`);
    }
    if (typeof line.unitCost === "number" && (!Number.isFinite(line.unitCost) || line.unitCost < 0)) {
      issues.push(`Line ${index + 1}: unit cost cannot be negative.`);
    }
  });
  return issues;
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function cardStyle(background = "#fff") {
  return {
    ...mobileCardStyle(background),
    border: "1px solid #d9dfeb",
    borderRadius: "16px",
    padding: "16px",
    background,
  } satisfies React.CSSProperties;
}

function sectionHeadingRow() {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  } satisfies React.CSSProperties;
}

interface ActualMaterialEditorCardProps {
  item: JobMaterialView;
  isSaving: boolean;
  isDeleting: boolean;
  isDuplicating: boolean;
  onSave: (input: {
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
  }) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function ActualMaterialEditorCard({
  item,
  isSaving,
  isDeleting,
  isDuplicating,
  onSave,
  onDelete,
  onDuplicate,
}: ActualMaterialEditorCardProps) {
  const [displayName, setDisplayName] = useState(item.displayName ?? item.materialName);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unitSnapshot ?? item.materialUnit);
  const [unitCost, setUnitCost] = useState(String(item.unitCost ?? item.currentCatalogCost ?? 0));
  const [note, setNote] = useState(item.note ?? "");
  const [sectionName, setSectionName] = useState(item.sectionName ?? "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDisplayName(item.displayName ?? item.materialName);
    setQuantity(String(item.quantity));
    setUnit(item.unitSnapshot ?? item.materialUnit);
    setUnitCost(String(item.unitCost ?? item.currentCatalogCost ?? 0));
    setNote(item.note ?? "");
    setSectionName(item.sectionName ?? "");
    setIsEditing(false);
  }, [
    item.currentCatalogCost,
    item.displayName,
    item.id,
    item.materialName,
    item.materialUnit,
    item.note,
    item.quantity,
    item.sectionName,
    item.unitCost,
    item.unitSnapshot,
  ]);

  const quantityNumber = Number(quantity) || 0;
  const unitCostNumber = Number(unitCost) || 0;
  const extendedCost = roundMoney(quantityNumber * unitCostNumber);

  return (
    <div style={{ ...cardStyle("#fafcff"), padding: "14px", display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <strong>{displayName || item.materialName}</strong>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>
            {item.materialSku ? `${item.materialSku} · ` : ""}
            {item.sectionName ? `${item.sectionName} · ` : ""}
            {item.sourceAssemblyName ? `From ${item.sourceAssemblyName}` : "Manual actual"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setIsEditing((current) => !current)} disabled={isSaving}>
            {isEditing ? "Collapse" : "Edit"}
          </button>
          <button type="button" onClick={onDuplicate} disabled={isDuplicating}>
            {isDuplicating ? "Duplicating..." : "Duplicate"}
          </button>
          <button type="button" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? "Removing..." : "Delete"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
        <div>
          <div style={{ color: "#5b6475", fontSize: "12px" }}>Quantity</div>
          <strong>{quantityNumber} {unit || item.materialUnit}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "12px" }}>Unit Cost</div>
          <strong>{formatMoney(unitCostNumber)}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "12px" }}>Extended Cost</div>
          <strong>{formatMoney(extendedCost)}</strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "12px" }}>Current Catalog</div>
          <strong>
            {formatMoney(item.currentCatalogCost)} / {item.materialUnit}
          </strong>
        </div>
        <div>
          <div style={{ color: "#5b6475", fontSize: "12px" }}>Sell Price</div>
          <strong>Generated in invoice</strong>
        </div>
      </div>

      {isEditing ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) repeat(3, minmax(92px, 1fr))", gap: "8px" }}>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Material name" />
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" placeholder="Qty" />
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Unit" />
            <input value={unitCost} onChange={(event) => setUnitCost(event.target.value)} inputMode="decimal" placeholder="Unit cost" />
          </div>

          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note / location / install detail" />
          <input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="Part: General, Service, Rough-in..." />

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                onSave({
                  jobMaterialId: String(item.id),
                  catalogItemId: String(item.catalogItemId),
                  quantity: quantityNumber,
                  note: note || null,
                  displayName: displayName || null,
                  skuSnapshot: item.skuSnapshot ?? item.materialSku,
                  unitSnapshot: unit || null,
                  unitCost: unitCost.trim() ? unitCostNumber : null,
                  unitSell: null,
                  markupPercent: null,
                  sectionName: sectionName.trim() || null,
                });
                setIsEditing(false);
              }}
              disabled={isSaving || !displayName.trim() || quantityNumber <= 0}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDisplayName(item.displayName ?? item.materialName);
                setQuantity(String(item.quantity));
                setUnit(item.unitSnapshot ?? item.materialUnit);
                setUnitCost(String(item.unitCost ?? item.currentCatalogCost ?? 0));
                setNote(item.note ?? "");
                setSectionName(item.sectionName ?? "");
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function WorkbenchPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobScreen, setJobScreen] = useState<JobScreen>("main");
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [showAssignPeople, setShowAssignPeople] = useState(false);
  const [showHiddenJobs, setShowHiddenJobs] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("pack-ops:show-hidden-jobs") === "true";
  });
  const [showEditJob, setShowEditJob] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  const [invoiceSource, setInvoiceSource] = useState<InvoiceGenerationSource>("quote");
  const [invoiceQuotePreview, setInvoiceQuotePreview] = useState<InvoiceGenerationPreview | null>(null);
  const [invoiceActualsBase, setInvoiceActualsBase] = useState<ActualsInvoicePreviewBase | null>(null);
  const [invoiceActualsControls, setInvoiceActualsControls] = useState<ActualInvoiceControls>(DEFAULT_ACTUAL_INVOICE_CONTROLS);
  const [invoicePreviewOptions, setInvoicePreviewOptions] = useState<InvoicePreviewOptions>(DEFAULT_INVOICE_PREVIEW_OPTIONS);
  const [invoiceDraftLines, setInvoiceDraftLines] = useState<EditableInvoiceDraftLine[]>([]);
  const [selectedSavedInvoice, setSelectedSavedInvoice] = useState<SavedInvoiceSummary | null>(null);
  const [editJobDraft, setEditJobDraft] = useState<EditJobDraft | null>(null);
  const [localFeedback, setLocalFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [actualPartNames, setActualPartNames] = useState<string[]>([]);
  const [newActualPartName, setNewActualPartName] = useState("");
  const [activityNoteDraft, setActivityNoteDraft] = useState("");
  const [neededMaterialDraft, setNeededMaterialDraft] = useState<JobMaterialDraft>(createEmptyJobMaterialDraft);
  const [usedMaterialDraft, setUsedMaterialDraft] = useState<JobMaterialDraft>(createEmptyJobMaterialDraft);
  const [assemblyActualDraft, setAssemblyActualDraft] = useState<AssemblyActualDraft>({
    assemblyId: "",
    multiplier: "1",
    note: "",
    sectionName: "",
    workDate: new Date().toISOString().slice(0, 10),
    workerUserId: "",
    addLabor: true,
    laborSellRate: "",
  });
  const [actualLaborDraft, setActualLaborDraft] = useState<ActualLaborDraft>({
    workerUserId: "",
    workDate: new Date().toISOString().slice(0, 10),
    startTime: "",
    endTime: "",
    hours: "1",
    description: "On-site work",
    sectionName: "",
    hourlyRate: "",
  });
  const [estimatedCopyFeedback, setEstimatedCopyFeedback] = useState("");
  const [neededCopyFeedback, setNeededCopyFeedback] = useState("");
  const [usedCopyFeedback, setUsedCopyFeedback] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const activityNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const neededMaterialSearchRef = useRef<{ focus: () => void; clear: () => void } | null>(null);
  const usedMaterialSearchRef = useRef<{ focus: () => void; clear: () => void } | null>(null);
  const assemblySearchRef = useRef<{ focus: () => void; clear: () => void } | null>(null);
  const { currentUser, signOut } = useAuthContext();
  const client = getSupabaseClient(import.meta.env);
  const selectedWorkbenchJobId = useUiStore((state) => state.selectedWorkbenchJobId);
  const setSelectedWorkbenchJobId = useUiStore((state) => state.setSelectedWorkbenchJobId);

  if (!currentUser) {
    return null;
  }
  const currentUserId = String(currentUser.user.id);

  const {
    capabilities,
    jobsQuery,
    queueQuery,
    contactsQuery,
    assignableUsersQuery,
    createJob,
    createQuickContact,
    assignCurrentUser,
    assignJob,
    removeJobAssignment,
    updateJob,
    updateJobStatus,
    archiveJob,
    approveTimeEntry,
    createActualTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    flushSync,
    refreshWorkbench,
    timeEntryDraft,
    activeRunningTimerDraft,
    isSavingTimeEntryDraft,
    startTimer,
    startManualEntry,
    updateTimeEntryDraft,
    updateActiveRunningTimerDraft,
    stopTimer,
    saveTimeEntryDraft,
    discardTimeEntryDraft,
    feedback,
    syncStatus,
    jobWorkspaceQuery,
    attachmentPreviewUrlsQuery,
    activeTimersQuery,
    addJobNote,
    uploadJobAttachment,
    deleteJobAttachment,
    createJobMaterial,
    updateJobMaterial,
    deleteJobMaterial,
    duplicateJobMaterial,
    addAssemblyToActuals,
    openAttachment,
  } = useWorkbenchSlice(currentUser, {
    selectedJobId,
    activeTab: jobScreen === "attachments" ? "attachments" : jobScreen === "actuals" ? "actuals" : "activity",
  });

  const jobs = jobsQuery.data ?? [];
  const activeJobs = jobs.filter((item) => !HIDDEN_JOB_STATUSES.includes(item.job.status));
  const hiddenJobs = jobs.filter((item) => HIDDEN_JOB_STATUSES.includes(item.job.status));
  const contacts = contactsQuery.data ?? [];
  const assignableUsers = assignableUsersQuery.data ?? [];
  const activeTimers = activeTimersQuery.data ?? [];
  const selectedJob = jobs.find((item) => item.job.id === selectedJobId) ?? null;
  const jobWorkspace = jobWorkspaceQuery.data ?? null;
  const queueCount = queueQuery.data ?? 0;
  const attachmentPreviewUrls = attachmentPreviewUrlsQuery.data ?? {};
  const invoiceService = useMemo(
    () =>
      new InvoiceGenerationService(
        {
          orgId: currentUser.user.orgId,
          actorUserId: currentUser.user.id,
        },
        currentUser.user,
        client,
      ),
    [client, currentUser.user],
  );
  const runningTimerJob = activeRunningTimerDraft
    ? jobs.find((item) => item.job.id === activeRunningTimerDraft.jobId) ?? null
    : null;
  const panelDraft = selectedJob
    ? activeRunningTimerDraft?.jobId === selectedJob.job.id
      ? activeRunningTimerDraft
      : timeEntryDraft?.jobId === selectedJob.job.id
        ? timeEntryDraft
        : null
    : null;
  const runningTimerElapsedLabel = useMemo(
    () =>
      activeRunningTimerDraft
        ? deriveTimeEntryDraftElapsedLabel(activeRunningTimerDraft, new Date(now))
        : null,
    [activeRunningTimerDraft, now],
  );
  const selectedJobActualHours = selectedJob?.timeEntries
    .filter((entry) => entry.status !== "rejected")
    .reduce((total, entry) => total + entry.hours, 0) ?? 0;
  const estimatedMaterialLines = jobWorkspace?.estimatedMaterials ?? selectedJob?.job.estimateSnapshot?.materials ?? [];
  const neededMaterialDisplayItems = useMemo<
    Array<{
      key: string;
      id: string | null;
      catalogItemId: string | null;
      materialName: string;
      materialSku: string | null;
      materialUnit: string;
      quantity: number;
      note: string | null;
      sectionName: string | null;
      isPersisted: boolean;
    }>
  >(() => {
    const persistedItems = (jobWorkspace?.neededMaterials ?? []).map((item) => ({
      key: item.id,
      id: String(item.id),
      catalogItemId: item.catalogItemId ? String(item.catalogItemId) : null,
      materialName: item.materialName,
      materialSku: item.materialSku,
      materialUnit: item.materialUnit,
      quantity: item.quantity,
      note: item.note ?? null,
      sectionName: item.sectionName ?? null,
      isPersisted: true,
    }));
    const existingKeys = new Set(
      persistedItems.map((item) =>
        `${item.sectionName?.trim() || ""}::${item.catalogItemId ?? item.materialSku ?? item.materialName}::${item.materialUnit}`,
      ),
    );
    const snapshotFallbackItems = estimatedMaterialLines
      .filter((item) => item.quantity > 0)
      .filter((item) => {
        const key = `${item.sectionName?.trim() || ""}::${item.catalogItemId ?? item.sku ?? item.description}::${item.unit}`;
        return !existingKeys.has(key);
      })
      .map((item, index) => ({
        key: `estimate:${index}:${item.sectionName ?? ""}:${item.catalogItemId ?? item.sku ?? item.description}`,
        id: null,
        catalogItemId: item.catalogItemId,
        materialName: item.description,
        materialSku: item.sku,
        materialUnit: item.unit,
        quantity: item.quantity,
        note: item.note,
        sectionName: item.sectionName ?? null,
        isPersisted: false,
      }));

    return [...persistedItems, ...snapshotFallbackItems];
  }, [estimatedMaterialLines, jobWorkspace?.neededMaterials]);
  const estimatedMaterialsSummary = buildMaterialSummary(
    estimatedMaterialLines.map((item) => ({
      catalogItemId: item.catalogItemId,
      sku: item.sku,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      sectionName: item.sectionName,
    })),
    { separateBySection: true },
  );
  const actualMaterialsSummary = buildMaterialSummary(
    (jobWorkspace?.usedMaterials ?? []).map((item) => ({
      catalogItemId: item.catalogItemId,
      sku: item.materialSku,
      description: item.materialName,
      unit: item.materialUnit,
      quantity: item.quantity,
    })),
  );
  const neededMaterialsSummary = buildMaterialSummary(
    neededMaterialDisplayItems.map((item) => ({
      catalogItemId: item.catalogItemId,
      sku: item.materialSku,
      description: item.materialName,
      unit: item.materialUnit,
      quantity: item.quantity,
      sectionName: item.sectionName,
    })),
    { separateBySection: true },
  );
  const currentInvoicePreview = useMemo(() => {
    if (invoiceSource === "actuals") {
      return invoiceActualsBase ? buildInvoicePreviewFromActuals(invoiceActualsBase, invoiceActualsControls) : null;
    }
    return invoiceQuotePreview;
  }, [invoiceActualsBase, invoiceActualsControls, invoiceQuotePreview, invoiceSource]);
  useEffect(() => {
    setInvoiceDraftLines(createEditableInvoiceDraftLines(currentInvoicePreview));
  }, [currentInvoicePreview]);
  const draftInvoicePreview = useMemo(
    () => buildInvoicePreviewFromDraft(currentInvoicePreview, invoiceDraftLines),
    [currentInvoicePreview, invoiceDraftLines],
  );
  const visibleInvoicePreview = buildInvoicePreviewWithOptions(draftInvoicePreview, invoicePreviewOptions);
  const invoiceDraftValidation = useMemo(() => validateInvoiceDraftLines(invoiceDraftLines), [invoiceDraftLines]);
  const actualPartOptions = useMemo(() => {
    const ordered = new Set<string>();
    for (const partName of actualPartNames) {
      if (partName.trim()) {
        ordered.add(partName.trim());
      }
    }
    for (const material of jobWorkspace?.usedMaterials ?? []) {
      if (material.sectionName?.trim()) {
        ordered.add(material.sectionName.trim());
      }
    }
    for (const entry of jobWorkspace?.timeEntries ?? []) {
      if (entry.sectionName?.trim()) {
        ordered.add(entry.sectionName.trim());
      }
    }
    if (
      ordered.size === 0 ||
      (jobWorkspace?.usedMaterials ?? []).some((item) => !item.sectionName?.trim()) ||
      (jobWorkspace?.timeEntries ?? []).some((entry) => !entry.sectionName?.trim())
    ) {
      return ["General", ...Array.from(ordered)];
    }
    return Array.from(ordered);
  }, [actualPartNames, jobWorkspace?.timeEntries, jobWorkspace?.usedMaterials]);
  const usedMaterialsByPart = useMemo(
    () =>
      actualPartOptions.map((partName) => ({
        name: partName,
        materials: (jobWorkspace?.usedMaterials ?? []).filter((item) => (item.sectionName?.trim() || "General") === partName),
      })),
    [actualPartOptions, jobWorkspace?.usedMaterials],
  );
  const labourByPart = useMemo(
    () =>
      actualPartOptions.map((partName) => ({
        name: partName,
        entries: (jobWorkspace?.timeEntries ?? []).filter((entry) => (entry.sectionName?.trim() || "General") === partName),
      })),
    [actualPartOptions, jobWorkspace?.timeEntries],
  );
  const selectedJobTimerIsRunning = activeRunningTimerDraft?.jobId === selectedJob?.job.id;
  const allowedSelectedJobStatusOptions = selectedJob ? getSelectableJobStatuses(selectedJob.job.status) : [];
  const userLabelsById = new Map(assignableUsers.map((user) => [user.id, user.label]));
  const materialCatalogById = new Map((jobWorkspace?.materialCatalogOptions ?? []).map((item) => [String(item.id), item]));
  const selectedAssembly = useMemo(
    () => (jobWorkspace?.assemblyOptions ?? []).find((item) => String(item.id) === assemblyActualDraft.assemblyId) ?? null,
    [assemblyActualDraft.assemblyId, jobWorkspace?.assemblyOptions],
  );
  const selectedAssemblyMultiplier = Number(assemblyActualDraft.multiplier || 1);
  const selectedAssemblyMaterialCost = selectedAssembly
    ? roundMoney(selectedAssembly.materialCostTotal * (Number.isFinite(selectedAssemblyMultiplier) ? selectedAssemblyMultiplier : 1))
    : 0;
  const selectedAssemblyLaborHours = selectedAssembly
    ? roundMoney(selectedAssembly.defaultLaborHours * (Number.isFinite(selectedAssemblyMultiplier) ? selectedAssemblyMultiplier : 1))
    : 0;
  const actualsWorkerOptions = useMemo(() => {
    const options = selectedJob
      ? selectedJob.assignments.map((assignment) => ({
          id: String(assignment.userId),
          label: userLabelsById.get(String(assignment.userId)) ?? "Unknown user",
        }))
      : [];
    const currentUserOption = { id: String(currentUser.user.id), label: currentUser.user.fullName };
    return options.some((option) => option.id === currentUserOption.id) ? options : [currentUserOption, ...options];
  }, [currentUser.user.fullName, currentUser.user.id, selectedJob, userLabelsById]);
  const actualLaborHoursFromSlot = deriveHoursFromSlot(actualLaborDraft.startTime, actualLaborDraft.endTime);
  const startWorkDisabled =
    !selectedJob?.permissions.canCreateTimeEntry ||
    (!!activeRunningTimerDraft && activeRunningTimerDraft.jobId !== selectedJob?.job.id);
  const canArchiveJobs = currentUser.user.role === "owner";
  const canManageAssignments = currentUser.user.role === "owner";
  const canGenerateInvoices = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const canUpdateJobStatus = currentUser.user.role === "owner" || currentUser.user.role === "office";
  const selectedAssignedUserIds = new Set(selectedJob?.assignments.map((assignment) => String(assignment.userId)) ?? []);
  const filteredAssignableUsers = assignableUsers.filter((user) =>
    user.label.toLowerCase().includes(assignmentSearch.trim().toLowerCase()),
  );
  const canUseQuoteInvoiceSource = Boolean(selectedJob?.job.quoteId);

  const previewInvoice = useMutation({
    mutationFn: (input: {
      jobId: string;
      source: InvoiceGenerationSource;
      actualControls?: ActualInvoiceControls;
    }) =>
      invoiceService.buildPreview(input.jobId, input.source, input.actualControls),
    onSuccess: (preview) => {
      setInvoiceQuotePreview(preview);
      setInvoicePreviewOptions((current) => ({
        ...current,
        descriptionOfWork: current.descriptionOfWork || preview.customerNotes || "",
      }));
      setLocalFeedback(null);
    },
    onError: (error) => {
      setLocalFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not build invoice preview.",
      });
    },
  });

  const loadActualsInvoiceBase = useMutation({
    mutationFn: (input: { jobId: string; actualControls?: ActualInvoiceControls }) =>
      invoiceService.getActualsPreviewBase(input.jobId, input.actualControls),
    onSuccess: ({ base, controls }) => {
      setInvoiceActualsBase(base);
      setInvoiceActualsControls(controls);
      setInvoicePreviewOptions((current) => ({
        ...current,
        descriptionOfWork: current.descriptionOfWork || base.customerNotes || "",
      }));
      setLocalFeedback(null);
    },
    onError: (error) => {
      setLocalFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not load actuals invoice data.",
      });
    },
  });

  const saveInvoice = useMutation({
    mutationFn: (preview: InvoiceGenerationPreview) => invoiceService.savePreview(preview),
    onSuccess: async (result) => {
      setShowInvoiceGenerator(false);
      setInvoiceQuotePreview(null);
      setInvoiceActualsBase(null);
      setInvoiceDraftLines([]);
      setLocalFeedback({ tone: "success", text: `Invoice ${result.invoiceNumber} created.` });
      await refreshWorkbench.mutateAsync();
      await jobWorkspaceQuery.refetch();
    },
    onError: (error) => {
      setLocalFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not save invoice.",
      });
    },
  });

  function updateInvoiceDraftLine(lineId: string, patch: InvoiceDraftLinePatch) {
    setInvoiceDraftLines((current) =>
      current.map((line) => (line.id === lineId ? applyInvoiceDraftLinePatch(line, patch) : line)),
    );
  }

  function updateInvoiceDraftLineTotal(lineId: string, lineTotal: number) {
    setInvoiceDraftLines((current) =>
      current.map((line) => (line.id === lineId ? setInvoiceDraftLineTotal(line, lineTotal) : line)),
    );
  }

  function removeInvoiceDraftLine(lineId: string) {
    setInvoiceDraftLines((current) => current.filter((line) => line.id !== lineId));
  }

  function addManualInvoiceDraftLine() {
    setInvoiceDraftLines((current) => [...current, createManualInvoiceDraftLine()]);
  }

  function moveInvoiceDraftLine(lineId: string, direction: "up" | "down") {
    setInvoiceDraftLines((current) => {
      const index = current.findIndex((line) => line.id === lineId);
      if (index < 0) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [line] = next.splice(index, 1);
      if (!line) {
        return current;
      }
      next.splice(targetIndex, 0, line);
      return next;
    });
  }

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: string) => invoiceService.deleteInvoice(invoiceId),
    onSuccess: async () => {
      setSelectedSavedInvoice(null);
      setLocalFeedback({ tone: "success", text: "Invoice deleted." });
      await refreshWorkbench.mutateAsync();
      await jobWorkspaceQuery.refetch();
    },
    onError: (error) => {
      setLocalFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not delete invoice.",
      });
    },
  });

  useEffect(() => {
    if (createJob.data?.id) {
      setSelectedJobId(createJob.data.id);
      setJobScreen("main");
      setShowCreateJob(false);
    }
  }, [createJob.data?.id]);

  useEffect(() => {
    if (selectedWorkbenchJobId) {
      setSelectedJobId(selectedWorkbenchJobId);
      setJobScreen("main");
      setSelectedWorkbenchJobId(null);
    }
  }, [selectedWorkbenchJobId, setSelectedWorkbenchJobId]);

  useEffect(() => {
    if (!activeRunningTimerDraft) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeRunningTimerDraft]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("pack-ops:show-hidden-jobs", showHiddenJobs ? "true" : "false");
  }, [showHiddenJobs]);

  useEffect(() => {
    setActivityNoteDraft("");
    setEstimatedCopyFeedback("");
    setNeededMaterialDraft(createEmptyJobMaterialDraft());
    setUsedMaterialDraft(createEmptyJobMaterialDraft());
    setAssemblyActualDraft({
      assemblyId: "",
      multiplier: "1",
      note: "",
      sectionName: "",
      workDate: new Date().toISOString().slice(0, 10),
      workerUserId: currentUserId,
      addLabor: true,
      laborSellRate: "",
    });
    setActualLaborDraft({
      workerUserId: currentUserId,
      workDate: new Date().toISOString().slice(0, 10),
      startTime: "",
      endTime: "",
      hours: "1",
      description: "On-site work",
      sectionName: "",
      hourlyRate: "",
    });
    setNeededCopyFeedback("");
    setUsedCopyFeedback("");
    setActualPartNames([]);
    setNewActualPartName("");
    setJobScreen("main");
    setShowAssignPeople(false);
    setShowEditJob(false);
    setShowInvoiceGenerator(false);
    setInvoiceQuotePreview(null);
    setInvoiceActualsBase(null);
    setInvoiceActualsControls(DEFAULT_ACTUAL_INVOICE_CONTROLS);
    setInvoicePreviewOptions(DEFAULT_INVOICE_PREVIEW_OPTIONS);
    setEditJobDraft(null);
    setInvoiceSource("quote");
    setAssignmentSearch("");
  }, [currentUserId, selectedJobId]);

  useEffect(() => {
    const defaultWorkerId = actualsWorkerOptions[0]?.id ?? String(currentUser.user.id);
    const defaultMaterialMarkup = jobWorkspace?.pricingDefaults.materialMarkupPercent ?? 0;

    setAssemblyActualDraft((current) => ({
      ...current,
      workerUserId: current.workerUserId || defaultWorkerId,
    }));

    setActualLaborDraft((current) => ({
      ...current,
      workerUserId: current.workerUserId || defaultWorkerId,
    }));

    setUsedMaterialDraft((current) => ({
      ...current,
      markupPercent: current.markupPercent || String(defaultMaterialMarkup),
    }));
  }, [actualsWorkerOptions, currentUser.user.id, jobWorkspace?.pricingDefaults.materialMarkupPercent]);

  async function handleOpenAttachment(storagePath: string) {
    const url = await openAttachment(storagePath);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSubmitActivityNote() {
    if (!selectedJob || !activityNoteDraft.trim()) {
      return;
    }

    await addJobNote.mutateAsync({
      jobId: selectedJob.job.id,
      body: activityNoteDraft,
    });
    setActivityNoteDraft("");
  }

  async function handleAttachmentSelection(fileList: FileList | null) {
    if (!selectedJob || !fileList || fileList.length === 0) {
      return;
    }

    for (const file of Array.from(fileList)) {
      await uploadJobAttachment.mutateAsync({
        jobId: selectedJob.job.id,
        file,
      });
    }
  }

  async function handleRemoveAttachment(attachment: {
    id: string;
    storagePath: string;
    fileName: string;
  }) {
    const confirmed = window.confirm(`Remove ${attachment.fileName} from this job?`);
    if (!confirmed) {
      return;
    }

    await deleteJobAttachment.mutateAsync({
      attachmentId: attachment.id,
      storagePath: attachment.storagePath,
      fileName: attachment.fileName,
    });
  }

  function addActualPart() {
    const normalized = newActualPartName.trim();
    if (!normalized) {
      return;
    }
    setActualPartNames((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setUsedMaterialDraft((current) => ({ ...current, sectionName: current.sectionName || normalized }));
    setAssemblyActualDraft((current) => ({ ...current, sectionName: current.sectionName || normalized }));
    setActualLaborDraft((current) => ({ ...current, sectionName: current.sectionName || normalized }));
    setNewActualPartName("");
  }

  function applyCatalogMaterialToDraft(
    materialId: string,
    setDraft: React.Dispatch<React.SetStateAction<JobMaterialDraft>>,
  ) {
    const material = materialCatalogById.get(materialId);
    const defaultMarkup = jobWorkspace?.pricingDefaults.materialMarkupPercent ?? 0;
    const unitCost = material?.costPrice ?? 0;

    setDraft((current) => ({
      ...current,
      materialId,
      displayName: material?.name ?? current.displayName,
      unit: material?.unit ?? current.unit,
      unitCost: unitCost ? String(unitCost) : current.unitCost,
      markupPercent: String(defaultMarkup),
      unitSell: "",
    }));
  }

  async function handleAddJobMaterial(kind: "used" | "needed") {
    if (!selectedJob) {
      return;
    }

    const draft = kind === "used" ? usedMaterialDraft : neededMaterialDraft;
    const quantity = Number(draft.quantity);
    await createJobMaterial.mutateAsync({
      jobId: selectedJob.job.id,
      catalogItemId: draft.materialId,
      kind,
      quantity,
      note: draft.note || null,
      displayName: draft.displayName || null,
      skuSnapshot: materialCatalogById.get(draft.materialId)?.sku ?? null,
      unitSnapshot: draft.unit || null,
      unitCost: draft.unitCost.trim() ? Number(draft.unitCost) : null,
      unitSell: null,
      markupPercent: null,
      sectionName: draft.sectionName || null,
    });

    if (kind === "used") {
      setUsedMaterialDraft(createEmptyJobMaterialDraft());
      usedMaterialSearchRef.current?.clear();
      usedMaterialSearchRef.current?.focus();
    } else {
      setNeededMaterialDraft(createEmptyJobMaterialDraft());
      neededMaterialSearchRef.current?.clear();
      neededMaterialSearchRef.current?.focus();
    }
  }

  async function handleDuplicateJobMaterial(jobMaterialId: string) {
    await duplicateJobMaterial.mutateAsync(jobMaterialId);
  }

  async function handleAddAssemblyToActuals() {
    if (!selectedJob || !assemblyActualDraft.assemblyId) {
      return;
    }

    await addAssemblyToActuals.mutateAsync({
      jobId: selectedJob.job.id,
      assemblyId: assemblyActualDraft.assemblyId,
      multiplier: Number(assemblyActualDraft.multiplier || 1),
      note: assemblyActualDraft.note || null,
      sectionName: assemblyActualDraft.sectionName || null,
      workDate: assemblyActualDraft.workDate,
      workerUserId: assemblyActualDraft.workerUserId || currentUserId,
      addLabor: assemblyActualDraft.addLabor,
      laborSellRate: null,
    });

    setAssemblyActualDraft((current) => ({
      ...current,
      assemblyId: "",
      multiplier: "1",
      note: "",
      sectionName: current.sectionName,
    }));
    assemblySearchRef.current?.clear();
  }

  async function handleAddActualLaborEntry() {
    if (!selectedJob) {
      return;
    }

    const derivedHours = deriveHoursFromSlot(actualLaborDraft.startTime, actualLaborDraft.endTime);
    const hours = Number(actualLaborDraft.hours || 0);
    const finalHours = derivedHours ?? hours;

    await createActualTimeEntry.mutateAsync({
      jobId: selectedJob.job.id,
      workedByUserId: actualLaborDraft.workerUserId || currentUserId,
      workDate: actualLaborDraft.workDate,
      startTime: actualLaborDraft.startTime || null,
      endTime: actualLaborDraft.endTime || null,
      hours: finalHours,
      description: actualLaborDraft.description,
      hourlyRate: null,
      sectionName: actualLaborDraft.sectionName || null,
    });

    setActualLaborDraft((current) => ({
      ...current,
      startTime: "",
      endTime: "",
      hours: "1",
      description: "On-site work",
    }));
  }

  async function handleRemoveJobMaterial(jobMaterialId: string, label: string) {
    const confirmed = window.confirm(`Remove ${label} from this job?`);
    if (!confirmed) {
      return;
    }

    await deleteJobMaterial.mutateAsync(jobMaterialId);
  }

  async function handleArchiveJob(jobId: string, label: string) {
    const confirmed = window.confirm(`Archive ${label}? It will disappear from the active jobs list.`);
    if (!confirmed) {
      return;
    }

    await archiveJob.mutateAsync(jobId);
    if (selectedJobId === jobId) {
      setSelectedJobId(null);
      setJobScreen("main");
    }
  }

  async function handleCopyJobMaterialList(
    kind: "estimated" | "used" | "needed",
    items: Array<{ catalogItemId: string | null; sku?: string | null; materialName: string; quantity: number }>,
  ) {
    const text = buildCopyListText(items);
    const setFeedback =
      kind === "estimated" ? setEstimatedCopyFeedback : kind === "used" ? setUsedCopyFeedback : setNeededCopyFeedback;

    if (!text) {
      setFeedback("Nothing to copy.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setFeedback("Copied");
        return;
      }
    } catch {
      // Fall through to the legacy copy path below.
    }

    try {
      const copied = fallbackCopyText(text);
      setFeedback(copied ? "Copied" : "Copy failed");
    } catch {
      setFeedback("Copy failed");
    }
  }

  function openSelectedJob(jobId: string) {
    setSelectedJobId(jobId);
    setJobScreen("main");
  }

  function getAssignmentNames(assignments: typeof jobs[number]["assignments"]) {
    if (assignments.length === 0) {
      return "Nobody";
    }

    return assignments
      .map((assignment) => assignableUsers.find((user) => user.id === assignment.userId)?.label ?? "Unknown user")
      .join(", ");
  }

  async function handleRemoveAssignment(assignmentId: string, userLabel: string) {
    const confirmed = window.confirm(`Remove ${userLabel} from this job?`);
    if (!confirmed) {
      return;
    }

    await removeJobAssignment.mutateAsync(assignmentId);
  }

  function openInvoiceGenerator(source: InvoiceGenerationSource) {
    setInvoiceSource(source);
    setInvoiceQuotePreview(null);
    setInvoiceActualsBase(null);
    setInvoicePreviewOptions((current) => ({
      ...DEFAULT_INVOICE_PREVIEW_OPTIONS,
      descriptionOfWork: current.descriptionOfWork,
    }));
    setShowInvoiceGenerator(true);

    if (source === "actuals" && selectedJob) {
      void loadActualsInvoiceBase.mutate({
        jobId: selectedJob.job.id,
      });
    }
  }

  function openEditJob() {
    if (!selectedJob) {
      return;
    }

    setEditJobDraft({
      title: selectedJob.job.title,
      contactId: selectedJob.job.contactId,
      description: selectedJob.job.description ?? "",
      estimatedHours:
        selectedJob.job.estimatedHours === null || selectedJob.job.estimatedHours === undefined
          ? ""
          : String(selectedJob.job.estimatedHours),
      status: selectedJob.job.status,
      waitingReason: selectedJob.job.waitingReason ?? "other",
    });
    setShowEditJob(true);
  }

  async function handleSaveJobEdits() {
    if (!selectedJob || !editJobDraft) {
      return;
    }

    const estimatedHoursValue = editJobDraft.estimatedHours.trim();
    const estimatedHours =
      estimatedHoursValue === ""
        ? null
        : Number.isFinite(Number(estimatedHoursValue))
          ? Number(estimatedHoursValue)
          : null;

    await updateJob.mutateAsync({
      jobId: selectedJob.job.id,
      title: editJobDraft.title.trim() || selectedJob.job.title,
      description: editJobDraft.description.trim(),
      contactId: editJobDraft.contactId,
      estimatedHours,
    });

    if (
      editJobDraft.status !== selectedJob.job.status ||
      (editJobDraft.status === "waiting" ? editJobDraft.waitingReason : null) !== (selectedJob.job.waitingReason ?? null)
    ) {
      await updateJobStatus.mutateAsync({
        jobId: selectedJob.job.id,
        status: editJobDraft.status,
        waitingReason: editJobDraft.status === "waiting" ? (editJobDraft.waitingReason as Job["waitingReason"]) : null,
      });
    }

    setShowEditJob(false);
  }

  const jobsListScreen = (
    <section style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "flex", gap: "16px", alignItems: "start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={titleStyle()}>Jobs</h1>
          <p style={subtitleStyle()}>
            Open a job and work from one clear screen. Attachments and actuals stay one tap away.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "999px",
              padding: "6px 10px",
              background: queueCount > 0 ? "#fff8e8" : "#f3f8f2",
              color: queueCount > 0 ? "#8a5a00" : "#1f6b37",
              fontSize: "13px",
            }}
          >
            {syncStatus}
          </span>
          {queueCount > 0 ? (
            <button onClick={() => flushSync.mutate()} disabled={flushSync.isPending} style={secondaryButtonStyle()}>
              {flushSync.isPending ? "Flushing..." : `Flush Sync (${queueCount})`}
            </button>
          ) : null}
          <button onClick={() => refreshWorkbench.mutate()} disabled={refreshWorkbench.isPending} style={secondaryButtonStyle()}>
            {refreshWorkbench.isPending ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={() => signOut()} style={secondaryButtonStyle()}>Sign Out</button>
        </div>
      </header>

      {localFeedback ? (
        <div style={feedbackStyle(localFeedback.tone)}>
          {localFeedback.text}
        </div>
      ) : null}

      {feedback ? (
        <div style={feedback.tone === "info" ? { ...feedbackStyle("success"), color: "#1f2b3d", background: "#f5f8ff", borderColor: "#c9d8f2" } : feedbackStyle(feedback.tone)}>
          {feedback.text}
        </div>
      ) : null}

      {activeRunningTimerDraft ? (
        <div
          style={{
            border: "1px solid #c9d8f2",
            borderRadius: "12px",
            padding: "12px 14px",
            background: "#f5f8ff",
            color: "#1f2b3d",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>
              Timer running on {runningTimerJob ? `${runningTimerJob.job.number} · ${runningTimerJob.job.title}` : "another job"}
            </strong>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>
              Elapsed {runningTimerElapsedLabel ?? "00:00:00"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  if (activeRunningTimerDraft.jobId) {
                    openSelectedJob(activeRunningTimerDraft.jobId);
                  }
                }}
                style={secondaryButtonStyle()}
              >
                Open Running Job
              </button>
            <button onClick={() => void stopTimer()} style={primaryButtonStyle()}>Stop Timer</button>
          </div>
        </div>
      ) : null}

      {capabilities.canViewAllActiveTimers ? (
        <section style={cardStyle("#fff")}>
          <div style={sectionHeadingRow()}>
            <div>
              <h2 style={{ margin: 0 }}>Team Timers</h2>
              <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                Owner view of all currently running timers.
              </p>
            </div>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>{activeTimers.length}</span>
          </div>
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            {activeTimers.length === 0 ? (
              <div style={{ color: "#5b6475" }}>No active timers right now.</div>
            ) : (
              activeTimers.map((timer) => (
                <div
                  key={timer.timerId}
                  style={{
                    border: "1px solid #e4e8f1",
                    borderRadius: "12px",
                    padding: "12px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <strong>{timer.userName}</strong>
                  <div style={{ fontWeight: 600, color: "#172033" }}>
                    {timer.jobNumber} · {timer.jobTitle}
                  </div>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>
                    Running for {formatElapsedSince(timer.startedAt, now)}
                  </div>
                  {timer.description ? (
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>{timer.description}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {showCreateJob ? (
        <div ref={createPanelRef}>
          <CreateJobPanel
            canCreateJob={capabilities.canCreateJob}
            contacts={contacts}
            defaultContactId={null}
            isPending={createJob.isPending}
            isCreatingContact={createQuickContact.isPending}
            onCreate={(input) => createJob.mutateAsync(input)}
            onCreateContact={(input) => createQuickContact.mutateAsync(input)}
          />
        </div>
      ) : null}

      {jobsQuery.isLoading ? <p>Loading your visible jobs...</p> : null}
      {!jobsQuery.isLoading && jobs.length === 0 ? (
        <div style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5b6475" }}>
          <strong style={{ display: "block", color: "#172033", marginBottom: "6px" }}>No jobs are showing yet.</strong>
          {capabilities.canCreateJob
            ? "Use the + button to create your first job."
            : "You will see jobs here once you are assigned to them."}
        </div>
      ) : null}

      {activeJobs.length > 0 ? (
        <section style={{ display: "grid", gap: "12px" }}>
          <div style={sectionHeadingRow()}>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Active Jobs</h2>
              <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                Current work stays visible by default.
              </p>
            </div>
            <span style={{ color: "#5b6475", fontSize: "13px" }}>{activeJobs.length}</span>
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            {activeJobs.map((item) => (
              <div key={item.job.id} style={{ ...cardStyle("#fff"), display: "grid", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => openSelectedJob(item.job.id)}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    textAlign: "left",
                    width: "100%",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                    <div>
                      <div style={{ color: "#5b6475", fontSize: "13px", fontWeight: 700 }}>{item.job.number}</div>
                      <strong style={{ fontSize: "18px" }}>{item.job.title}</strong>
                      {item.contactName ? (
                        <div style={{ color: "#172033", fontSize: "15px", fontWeight: 600, marginTop: "6px" }}>
                          {item.contactName}
                        </div>
                      ) : null}
                    </div>
                    <span style={badgeStyle("#f0f5f4", "#173b36")}>
                      {getWorkbenchJobPhaseLabel(item.job)}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {item.contactSubtitle ? (
                      <div style={{ color: "#5b6475", fontSize: "13px" }}>{item.contactSubtitle}</div>
                    ) : null}
                    {item.job.description ? (
                      <div style={{ color: "#5b6475", fontSize: "14px" }}>{item.job.description}</div>
                    ) : null}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : jobs.length > 0 ? (
        <section style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5b6475" }}>
          No active jobs right now.
        </section>
      ) : null}

      {hiddenJobs.length > 0 ? (
        <section style={{ display: "grid", gap: "12px" }}>
          <button
            type="button"
            onClick={() => setShowHiddenJobs((current) => !current)}
            style={{
              ...cardStyle("#fafcff"),
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
            }}
          >
            <span>
              <strong style={{ display: "block" }}>Completed / Hidden</strong>
              <span style={{ color: "#5b6475", fontSize: "14px" }}>
                {hiddenJobs.length} job{hiddenJobs.length === 1 ? "" : "s"}
              </span>
            </span>
            <span style={{ color: "#5b6475", fontWeight: 700 }}>{showHiddenJobs ? "Hide" : "Show"}</span>
          </button>

          {showHiddenJobs ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {hiddenJobs.map((item) => (
                <div key={item.job.id} style={{ ...cardStyle("#fff"), display: "grid", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => openSelectedJob(item.job.id)}
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      margin: 0,
                      textAlign: "left",
                      width: "100%",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                      <div>
                        <div style={{ color: "#5b6475", fontSize: "13px", fontWeight: 700 }}>{item.job.number}</div>
                        <strong style={{ fontSize: "18px" }}>{item.job.title}</strong>
                        {item.contactName ? (
                          <div style={{ color: "#172033", fontSize: "15px", fontWeight: 600, marginTop: "6px" }}>
                            {item.contactName}
                          </div>
                        ) : null}
                      </div>
                      <span style={badgeStyle("#f5f1ef", "#5f4332")}>
                        {getJobStatusLabel(item.job.status)}
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: "4px" }}>
                      {item.contactSubtitle ? (
                        <div style={{ color: "#5b6475", fontSize: "13px" }}>{item.contactSubtitle}</div>
                      ) : null}
                      {item.job.description ? (
                        <div style={{ color: "#5b6475", fontSize: "14px" }}>{item.job.description}</div>
                      ) : null}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {capabilities.canCreateJob ? (
        <button
          type="button"
          onClick={() => {
            setShowCreateJob((current) => !current);
            window.setTimeout(() => {
              createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 0);
          }}
          style={floatingButtonStyle()}
          aria-label="Create job"
        >
          +
        </button>
      ) : null}
    </section>
  );

  const attachmentsScreen = selectedJob ? (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={sectionHeadingRow()}>
        <div>
          <h3 style={{ margin: 0 }}>Attachments</h3>
          <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
            Photos and documents for this job.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setJobScreen("main")}>Back to Job</button>
          <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={uploadJobAttachment.isPending}>
            {uploadJobAttachment.isPending ? "Uploading..." : "Upload Attachment"}
          </button>
        </div>
      </div>

      {jobWorkspaceQuery.isLoading ? <p style={{ color: "#5b6475" }}>Loading attachments…</p> : null}
      {!jobWorkspaceQuery.isLoading && (jobWorkspace?.attachments.length ?? 0) === 0 ? (
        <div style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5b6475" }}>
          No attachments yet. Photos, PDFs, load calcs, and docs will show here.
        </div>
      ) : null}

      {(jobWorkspace?.attachments ?? []).length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {(jobWorkspace?.attachments ?? []).map((attachment) => {
            const isPhoto = attachment.mimeType.startsWith("image/");
            const previewUrl = attachmentPreviewUrls[attachment.storagePath];

            return (
              <div
                key={attachment.id}
                style={{
                  ...cardStyle("#fff"),
                  display: "grid",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleOpenAttachment(attachment.storagePath)}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    textAlign: "left",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  {isPhoto ? (
                    previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={attachment.fileName}
                        style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "12px", background: "#eef3fb" }}
                      />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: "12px", background: "#eef3fb", display: "grid", placeItems: "center", color: "#5b6475" }}>
                        Loading photo…
                      </div>
                    )
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: "12px", background: "#f8fafc", display: "grid", placeItems: "center", color: "#5b6475", fontWeight: 700 }}>
                      {attachment.mimeType.includes("pdf") ? "PDF" : attachment.mimeType.includes("html") ? "HTML" : "FILE"}
                    </div>
                  )}
                  <div>
                    <strong style={{ display: "block" }}>{attachment.fileName}</strong>
                    <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>
                      {attachment.sizeBytes > 0 ? `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · ` : ""}
                      {formatDateTimeLabel(attachment.createdAt)}
                    </div>
                  </div>
                </button>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => void handleRemoveAttachment(attachment)}
                    disabled={deleteJobAttachment.isPending}
                  >
                    {deleteJobAttachment.isPending ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  ) : null;

  const actualsScreen = selectedJob ? (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={sectionHeadingRow()}>
        <div>
          <h3 style={{ margin: 0 }}>Actuals</h3>
          <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
            Enter real materials, labour, and assemblies so job costing stays trustworthy.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {canGenerateInvoices ? (
            <button
              type="button"
              onClick={() => openInvoiceGenerator("actuals")}
              style={primaryButtonStyle()}
            >
              Generate Invoice
            </button>
          ) : null}
          <button type="button" onClick={() => setJobScreen("main")}>Back to Job</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <div style={cardStyle("#fafcff")}>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Estimated Materials</div>
          <strong style={{ fontSize: "22px" }}>{estimatedMaterialsSummary.length}</strong>
        </div>
        <div style={cardStyle("#fafcff")}>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Materials Needed</div>
          <strong style={{ fontSize: "22px" }}>{neededMaterialsSummary.length}</strong>
        </div>
        <div style={cardStyle("#fafcff")}>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Actual Material Lines</div>
          <strong style={{ fontSize: "22px" }}>{(jobWorkspace?.usedMaterials ?? []).length}</strong>
        </div>
        <div style={cardStyle("#fafcff")}>
          <div style={{ color: "#5b6475", fontSize: "13px" }}>Actual Labour Entries</div>
          <strong style={{ fontSize: "22px" }}>{(jobWorkspace?.timeEntries ?? []).length}</strong>
        </div>
      </div>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Saved Invoices</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Generated invoices stay attached to this job so you can open the saved snapshot again.
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
          {(jobWorkspace?.invoices ?? []).length === 0 ? (
            <p style={{ color: "#5b6475", margin: 0 }}>No invoices saved for this job yet.</p>
          ) : (
            (jobWorkspace?.invoices ?? []).map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={() => setSelectedSavedInvoice(invoice)}
                style={{
                  border: "1px solid #d9dfeb",
                  borderRadius: "14px",
                  padding: "12px",
                  background: "#fff",
                  color: "inherit",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  cursor: "pointer",
                }}
              >
                <span>
                  <strong style={{ display: "block" }}>{invoice.number}</strong>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>
                    {new Date(invoice.createdAt).toLocaleDateString()} · {invoice.lines.length} line{invoice.lines.length === 1 ? "" : "s"} · {invoice.status.replaceAll("_", " ")}
                  </span>
                </span>
                <strong>{formatMoney(invoice.total)}</strong>
              </button>
            ))
          )}
        </div>
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Actual Parts</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Group actual materials and labour by the part of the job they belong to, then invoice one part or all parts.
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "12px", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>New Part</span>
            <input
              value={newActualPartName}
              onChange={(event) => setNewActualPartName(event.target.value)}
              placeholder="Service, Rough-in, Finish..."
            />
          </label>
          <button type="button" onClick={addActualPart} disabled={!newActualPartName.trim()}>
            Add Part
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          {actualPartOptions.map((partName) => (
            <span key={partName} style={badgeStyle("#eef2ff", "#163fcb")}>{partName}</span>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
        <div style={cardStyle("#fff")}>
          <div style={sectionHeadingRow()}>
            <h3 style={{ margin: 0 }}>Estimated Materials</h3>
            <button
              type="button"
              onClick={() =>
                void handleCopyJobMaterialList(
                  "estimated",
                  estimatedMaterialLines.map((item) => ({
                    catalogItemId: item.catalogItemId,
                    sku: item.sku,
                    materialName: item.description,
                    quantity: item.quantity,
                  })),
                )
              }
            >
              Copy List
            </button>
          </div>
          {estimatedCopyFeedback ? <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "8px" }}>{estimatedCopyFeedback}</div> : null}
          <div style={{ marginTop: "12px" }}>
            {estimatedMaterialsSummary.length === 0 ? (
              <p style={{ color: "#5b6475", margin: 0 }}>No quoted material estimate was carried onto this job.</p>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {estimatedMaterialsSummary.map((item) => (
                  <div key={`estimated-${item.key}`} style={{ display: "grid", gap: "2px" }}>
                    <strong>{item.description}</strong>
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>
                      {item.sectionName ? `${item.sectionName} · ` : ""}
                      {item.sku ? `${item.sku} · ` : ""}
                      {item.quantity} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle("#fff")}>
          <div style={sectionHeadingRow()}>
            <h3 style={{ margin: 0 }}>Materials Needed</h3>
            <button
              type="button"
              onClick={() =>
                void handleCopyJobMaterialList(
                  "needed",
                  neededMaterialDisplayItems.map((item) => ({
                    catalogItemId: item.catalogItemId,
                    sku: item.materialSku,
                    materialName: item.materialName,
                    quantity: item.quantity,
                  })),
                )
              }
            >
              Copy List
            </button>
          </div>
          {neededCopyFeedback ? <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "8px" }}>{neededCopyFeedback}</div> : null}
          <div style={{ marginTop: "12px" }}>
            {neededMaterialsSummary.length === 0 ? (
              <p style={{ color: "#5b6475", margin: 0 }}>No operational materials list yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {neededMaterialsSummary.map((item) => (
                  <div key={`needed-${item.key}`} style={{ display: "grid", gap: "2px" }}>
                    <strong>{item.description}</strong>
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>
                      {item.sectionName ? `${item.sectionName} · ` : ""}
                      {item.sku ? `${item.sku} · ` : ""}
                      {item.quantity} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Assemblies</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Add repeatable bundles like rough-ins and fixture installs without losing the ability to edit the real material lines afterward.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
          <AssemblySearchSelect
            ref={assemblySearchRef}
            assemblies={jobWorkspace?.assemblyOptions ?? []}
            selectedAssemblyId={assemblyActualDraft.assemblyId}
            isPending={addAssemblyToActuals.isPending}
            onSelect={(assemblyId) => setAssemblyActualDraft((current) => ({ ...current, assemblyId }))}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
            <select
              value={assemblyActualDraft.sectionName}
              onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, sectionName: event.target.value }))}
            >
              {actualPartOptions.map((partName) => (
                <option key={partName} value={partName === "General" ? "" : partName}>
                  {partName}
                </option>
              ))}
            </select>
            <input
              value={assemblyActualDraft.multiplier}
              onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, multiplier: event.target.value }))}
              inputMode="decimal"
              placeholder="Count / multiplier"
            />
            <select
              value={assemblyActualDraft.workerUserId}
              onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, workerUserId: event.target.value }))}
            >
              {actualsWorkerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={assemblyActualDraft.workDate}
              onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, workDate: event.target.value }))}
            />
          </div>

          <label style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="checkbox"
              checked={assemblyActualDraft.addLabor}
              onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, addLabor: event.target.checked }))}
            />
            <span>Also add the assembly labour hours as an actual labour entry</span>
          </label>

          <input
            value={assemblyActualDraft.note}
            onChange={(event) => setAssemblyActualDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder="Optional install note"
          />

          {selectedAssembly ? (
            <div style={{ ...cardStyle("#fafcff"), padding: "14px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <strong>{selectedAssembly.name}</strong>
                  <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>
                    {selectedAssembly.items.length} materials · {selectedAssembly.defaultLaborHours.toFixed(2)} labour hrs each
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#5b6475", fontSize: "13px" }}>At current multiplier</div>
                  <strong>{formatMoney(selectedAssemblyMaterialCost)} materials · {selectedAssemblyLaborHours.toFixed(2)} labour hrs</strong>
                </div>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {selectedAssembly.items.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <span>{item.materialName}</span>
                    <span style={{ color: "#5b6475" }}>
                      {roundMoney(item.quantity * (Number.isFinite(selectedAssemblyMultiplier) ? selectedAssemblyMultiplier : 1))} {item.materialUnit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => void handleAddAssemblyToActuals()}
              disabled={addAssemblyToActuals.isPending || !assemblyActualDraft.assemblyId}
            >
              {addAssemblyToActuals.isPending ? "Adding Assembly..." : "Add Assembly to Actuals"}
            </button>
          </div>
        </div>
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Materials Used</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Enter real material usage with visible cost now. Sell-side pricing gets set later in Generate Invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void handleCopyJobMaterialList(
                "used",
                (jobWorkspace?.usedMaterials ?? []).map((item) => ({
                  catalogItemId: item.catalogItemId,
                  sku: item.materialSku,
                  materialName: item.displayName ?? item.materialName,
                  quantity: item.quantity,
                })),
              )
            }
          >
            Copy List
          </button>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
          {usedCopyFeedback ? <div style={{ color: "#5b6475", fontSize: "13px" }}>{usedCopyFeedback}</div> : null}
          <MaterialSearchSelect
            ref={usedMaterialSearchRef}
            catalogItems={(jobWorkspace?.materialCatalogOptions ?? []).map((item) => ({
              id: item.id,
              orgId: selectedJob.job.orgId,
              name: item.name,
              sku: item.sku,
              unit: item.unit,
              costPrice: item.costPrice,
              unitPrice: item.unitPrice,
              category: null,
              notes: null,
              isActive: true,
              createdBy: null,
              createdAt: "",
              updatedAt: "",
              deletedAt: null,
            }))}
            selectedMaterialId={usedMaterialDraft.materialId}
            isPending={createJobMaterial.isPending}
            onSelect={(materialId) => applyCatalogMaterialToDraft(materialId, setUsedMaterialDraft)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(180px, 2fr) repeat(3, minmax(92px, 1fr))", gap: "8px" }}>
            <select
              value={usedMaterialDraft.sectionName}
              onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, sectionName: event.target.value }))}
            >
              {actualPartOptions.map((partName) => (
                <option key={partName} value={partName === "General" ? "" : partName}>
                  {partName}
                </option>
              ))}
            </select>
            <input
              value={usedMaterialDraft.displayName}
              onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="Material name"
            />
            <input
              value={usedMaterialDraft.quantity}
              onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
              inputMode="decimal"
              placeholder="Qty"
            />
            <input
              value={usedMaterialDraft.unit}
              onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, unit: event.target.value }))}
              placeholder="Unit"
            />
            <input
              value={usedMaterialDraft.unitCost}
              onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, unitCost: event.target.value }))}
              inputMode="decimal"
              placeholder="Unit cost"
            />
          </div>

          <input
            value={usedMaterialDraft.note}
            onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder="Install note / room / panel / circuit detail"
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            <div style={{ ...cardStyle("#fafcff"), padding: "12px" }}>
              <div style={{ color: "#5b6475", fontSize: "12px" }}>Extended Cost</div>
              <strong>
                {formatMoney(roundMoney((Number(usedMaterialDraft.quantity) || 0) * (Number(usedMaterialDraft.unitCost) || 0)))}
              </strong>
            </div>
            <div style={{ ...cardStyle("#fafcff"), padding: "12px" }}>
              <div style={{ color: "#5b6475", fontSize: "12px" }}>Sell Price</div>
              <strong>Generate in invoice</strong>
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled={createJobMaterial.isPending || !usedMaterialDraft.materialId || !usedMaterialDraft.displayName.trim() || Number(usedMaterialDraft.quantity) <= 0}
              onClick={() => void handleAddJobMaterial("used")}
            >
              {createJobMaterial.isPending ? "Adding..." : "Add Material Actual"}
            </button>
          </div>

          {(jobWorkspace?.usedMaterials ?? []).length === 0 ? (
            <p style={{ color: "#5b6475", margin: 0 }}>No actual materials logged yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {usedMaterialsByPart.map((section) =>
                section.materials.length === 0 ? null : (
                  <div key={section.name} style={{ display: "grid", gap: "10px", border: "1px solid #d9dfeb", borderRadius: "14px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <strong>{section.name}</strong>
                      <strong>{formatMoney(section.materials.reduce((total, item) => total + roundMoney(item.quantity * (item.unitCost ?? item.currentCatalogCost ?? 0)), 0))}</strong>
                    </div>
                    {section.materials.map((item) => (
                      <ActualMaterialEditorCard
                        key={item.id}
                        item={item}
                        isSaving={updateJobMaterial.isPending}
                        isDeleting={deleteJobMaterial.isPending}
                        isDuplicating={duplicateJobMaterial.isPending}
                        onSave={(input) => updateJobMaterial.mutate(input)}
                        onDelete={() => void handleRemoveJobMaterial(item.id, item.displayName ?? item.materialName)}
                        onDuplicate={() => void handleDuplicateJobMaterial(item.id)}
                      />
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Labour Actuals</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Add real labour slots directly from Actuals so hours and cost are captured here. Sell-side labour billing is set in Generate Invoice.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
            <select
              value={actualLaborDraft.sectionName}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, sectionName: event.target.value }))}
            >
              {actualPartOptions.map((partName) => (
                <option key={partName} value={partName === "General" ? "" : partName}>
                  {partName}
                </option>
              ))}
            </select>
            <select
              value={actualLaborDraft.workerUserId}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, workerUserId: event.target.value }))}
            >
              {actualsWorkerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={actualLaborDraft.workDate}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, workDate: event.target.value }))}
            />
            <input
              type="time"
              value={actualLaborDraft.startTime}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, startTime: event.target.value }))}
            />
            <input
              type="time"
              value={actualLaborDraft.endTime}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, endTime: event.target.value }))}
            />
            <input
              value={actualLaborDraft.hours}
              onChange={(event) => setActualLaborDraft((current) => ({ ...current, hours: event.target.value }))}
              inputMode="decimal"
              placeholder="Hours"
            />
          </div>

          <input
            value={actualLaborDraft.description}
            onChange={(event) => setActualLaborDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description of work"
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            <div style={{ ...cardStyle("#fafcff"), padding: "12px" }}>
              <div style={{ color: "#5b6475", fontSize: "12px" }}>Hours Used</div>
              <strong>{((actualLaborHoursFromSlot ?? Number(actualLaborDraft.hours)) || 0).toFixed(2)}h</strong>
            </div>
            <div style={{ ...cardStyle("#fafcff"), padding: "12px" }}>
              <div style={{ color: "#5b6475", fontSize: "12px" }}>Sell Price</div>
              <strong>Generate in invoice</strong>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => void handleAddActualLaborEntry()}
              disabled={createActualTimeEntry.isPending || !(actualLaborHoursFromSlot ?? Number(actualLaborDraft.hours)) || !actualLaborDraft.description.trim()}
            >
              {createActualTimeEntry.isPending ? "Adding Labour..." : "Add Labour Entry"}
            </button>
          </div>

          {(jobWorkspace?.timeEntries ?? []).length === 0 ? (
            <p style={{ color: "#5b6475", margin: 0 }}>No labour entries logged yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {labourByPart.map((section) =>
                section.entries.length === 0 ? null : (
                  <div key={section.name} style={{ display: "grid", gap: "10px", border: "1px solid #d9dfeb", borderRadius: "14px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <strong>{section.name}</strong>
                      <strong>{section.entries.reduce((total, entry) => total + entry.hours, 0).toFixed(2)}h</strong>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                      {section.entries.map((entry) => (
                        <EditableTimeEntryItem
                          key={entry.id}
                          entry={entry}
                          workedByLabel={userLabelsById.get(String(entry.userId)) ?? "Unknown user"}
                          enteredByLabel={userLabelsById.get(String(entry.createdBy)) ?? userLabelsById.get(String(entry.userId)) ?? "Unknown user"}
                          canApprove={selectedJob.permissions.canEditTimeEntries}
                          canEdit={selectedJob.permissions.canEditTimeEntries}
                          canDelete={selectedJob.permissions.canDeleteTimeEntries}
                          isApproving={approveTimeEntry.isPending}
                          isSaving={updateTimeEntry.isPending}
                          isDeleting={deleteTimeEntry.isPending}
                          onApprove={() => approveTimeEntry.mutate(entry)}
                          onSave={async (input) => {
                            await updateTimeEntry.mutateAsync({
                              entryId: entry.id,
                              ...input,
                            });
                          }}
                          onDelete={() => deleteTimeEntry.mutate(entry)}
                        />
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  ) : null;

  const mainJobScreen = selectedJob ? (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          position: "sticky",
          top: "12px",
          zIndex: 10,
          ...cardStyle("#fff"),
          boxShadow: "0 10px 24px rgba(23, 32, 51, 0.06)",
          display: "grid",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <button type="button" onClick={() => setSelectedJobId(null)} style={{ justifySelf: "start" }}>
              Back to Jobs
            </button>
            <div style={{ color: "#5b6475", fontSize: "13px", fontWeight: 700 }}>{selectedJob.job.number}</div>
            <h1 style={{ margin: 0, fontSize: "28px" }}>{selectedJob.job.title}</h1>
            {selectedJob.contactName ? (
              <div style={{ color: "#172033", fontSize: "16px", fontWeight: 600 }}>
                {selectedJob.contactName}
              </div>
            ) : null}
            {selectedJob.contactSubtitle ? (
              <div style={{ color: "#5b6475", fontSize: "13px" }}>{selectedJob.contactSubtitle}</div>
            ) : null}
          </div>
          <div
            style={{
              border: "1px solid #d9dfeb",
              borderRadius: "999px",
              padding: "8px 12px",
              background: "#f8fafc",
              fontWeight: 700,
            }}
          >
            {getWorkbenchJobPhaseLabel(selectedJob.job)}
            {selectedJob.job.waitingReason ? ` · ${getWorkbenchWaitingReasonLabel(selectedJob.job.waitingReason)}` : ""}
          </div>
        </div>

        {canUpdateJobStatus ? (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ color: "#5b6475", fontSize: "13px" }}>Job Status</span>
              <select
                value={selectedJob.job.status}
                onChange={(event) =>
                  void updateJobStatus.mutateAsync({
                    jobId: selectedJob.job.id,
                    status: event.target.value as JobStatus,
                    waitingReason: event.target.value === "waiting" ? (selectedJob.job.waitingReason ?? "other") : null,
                  })
                }
                disabled={updateJobStatus.isPending}
                style={{ minHeight: "44px", borderRadius: "12px", padding: "10px 12px" }}
              >
                {allowedSelectedJobStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {getJobStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            {selectedJob.job.status === "waiting" ? (
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Waiting Reason</span>
                <select
                  value={selectedJob.job.waitingReason ?? "other"}
                  onChange={(event) =>
                    void updateJobStatus.mutateAsync({
                      jobId: selectedJob.job.id,
                      status: "waiting",
                      waitingReason: event.target.value as (typeof JOB_WAITING_REASONS)[number],
                    })
                  }
                  disabled={updateJobStatus.isPending}
                  style={{ minHeight: "44px", borderRadius: "12px", padding: "10px 12px" }}
                >
                  {JOB_WAITING_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {getWorkbenchWaitingReasonLabel(reason)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              if (selectedJobTimerIsRunning) {
                void stopTimer();
              } else {
                void startTimer(selectedJob.job.id);
              }
            }}
            disabled={!selectedJobTimerIsRunning && startWorkDisabled}
            style={{ padding: "14px 16px", fontWeight: 700 }}
          >
            {selectedJobTimerIsRunning ? "Stop Timer" : "Start Work"}
          </button>
          <button
            type="button"
            onClick={() => {
              window.setTimeout(() => {
                activityNoteRef.current?.focus();
                activityNoteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 0);
            }}
            style={{ padding: "14px 16px", fontWeight: 700 }}
          >
            Add Note
          </button>
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            style={{ padding: "14px 16px", fontWeight: 700 }}
          >
            Add Attachment
          </button>
          {canArchiveJobs ? (
            <button
              type="button"
              onClick={openEditJob}
              style={{ padding: "14px 16px", fontWeight: 700 }}
            >
              Edit Job
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setJobScreen("attachments")}>Attachments</button>
          <button type="button" onClick={() => setJobScreen("actuals")}>Actuals</button>
        </div>
      </div>

      <section style={cardStyle("#fafcff")}>
        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Overview</h3>
        <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
          <div style={sectionHeadingRow()}>
            <div>
              <div style={{ color: "#5b6475", fontSize: "13px" }}>Assigned Crew</div>
              <strong>{selectedJob.assignments.length > 0 ? getAssignmentNames(selectedJob.assignments) : "Nobody assigned yet"}</strong>
            </div>
            {canManageAssignments ? (
              <button type="button" onClick={() => setShowAssignPeople(true)} style={secondaryButtonStyle()}>
                + Add Person
              </button>
            ) : null}
          </div>
          {selectedJob.assignments.length > 0 ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {selectedJob.assignments.map((assignment) => {
                const userLabel =
                  assignableUsers.find((user) => user.id === assignment.userId)?.label ?? "Unknown user";

                return (
                  <span
                    key={assignment.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "999px",
                      background: "#ffffff",
                      border: "1px solid #d9dfeb",
                      fontSize: "14px",
                    }}
                  >
                    <span>{userLabel}</span>
                    {canManageAssignments ? (
                      <button
                        type="button"
                        onClick={() => void handleRemoveAssignment(assignment.id, userLabel)}
                        disabled={removeJobAssignment.isPending}
                        aria-label={`Remove ${userLabel}`}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          color: "#7a2430",
                          fontWeight: 700,
                          fontSize: "16px",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#5b6475" }}>Nobody assigned yet.</div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Customer / Contact</div>
            <strong>{jobWorkspace?.contactName ?? "No contact linked"}</strong>
            {jobWorkspace?.contactSubtitle ? <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>{jobWorkspace.contactSubtitle}</div> : null}
          </div>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Linked Quote</div>
            <strong>{jobWorkspace?.linkedQuote ? jobWorkspace.linkedQuote.number : "No linked quote"}</strong>
          </div>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Next Scheduled Work</div>
            <strong>
              {jobWorkspace?.nextScheduledWork
                ? formatNextScheduledLabel(jobWorkspace.nextScheduledWork.startAt, jobWorkspace.nextScheduledWork.endAt)
                : "Nothing scheduled"}
            </strong>
          </div>
          <div>
            <div style={{ color: "#5b6475", fontSize: "13px" }}>Estimated Hours</div>
            <strong>{selectedJob.job.estimatedHours ? `${selectedJob.job.estimatedHours.toFixed(2)}h` : "Not set"}</strong>
          </div>
        </div>
        {selectedJob.job.description ? (
          <div style={{ marginTop: "12px", color: "#445168" }}>{selectedJob.job.description}</div>
        ) : null}
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Activity</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Notes and uploads build the working history for this job.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
          <textarea
            ref={activityNoteRef}
            value={activityNoteDraft}
            onChange={(event) => setActivityNoteDraft(event.target.value)}
            rows={4}
            placeholder="Add a field note, customer update, or job reminder"
            style={{ width: "100%", resize: "vertical" }}
          />
          <div>
            <button type="button" onClick={() => void handleSubmitActivityNote()} disabled={addJobNote.isPending || !activityNoteDraft.trim()}>
              {addJobNote.isPending ? "Saving Note..." : "Add Note"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
          {jobWorkspaceQuery.isLoading ? <p style={{ color: "#5b6475" }}>Loading activity…</p> : null}
          {!jobWorkspaceQuery.isLoading && (jobWorkspace?.activity.length ?? 0) === 0 ? (
            <div style={{ ...cardStyle("#fafcff"), borderStyle: "dashed", color: "#5b6475" }}>
              No activity yet. Notes and uploads will start building the job history here.
            </div>
          ) : null}
          {(jobWorkspace?.activity ?? []).map((entry) => (
            <div key={entry.id} style={{ ...cardStyle("#fafcff"), padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <strong>{entry.title}</strong>
                  <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>{formatDateTimeLabel(entry.createdAt)}</div>
                </div>
                <span style={{ color: "#5b6475", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {entry.type.replace("_", " ")}
                </span>
              </div>
              {entry.body ? <div style={{ marginTop: "10px", color: "#445168", whiteSpace: "pre-wrap" }}>{entry.body}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Materials Needed</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Keep the grab list current without mixing it into actuals.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void handleCopyJobMaterialList(
                "needed",
                neededMaterialDisplayItems.map((item) => ({
                  catalogItemId: item.catalogItemId,
                  materialName: item.materialName,
                  quantity: item.quantity,
                })),
              )
            }
          >
            Copy List
          </button>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
          {neededCopyFeedback ? <div style={{ color: "#5b6475", fontSize: "13px" }}>{neededCopyFeedback}</div> : null}
          <MaterialSearchSelect
            ref={neededMaterialSearchRef}
            catalogItems={(jobWorkspace?.materialCatalogOptions ?? []).map((item) => ({
              id: item.id,
              orgId: selectedJob.job.orgId,
              name: item.name,
              sku: item.sku,
              unit: item.unit,
              costPrice: item.costPrice,
              unitPrice: item.unitPrice,
              category: null,
              notes: null,
              isActive: true,
              createdBy: null,
              createdAt: "",
              updatedAt: "",
              deletedAt: null,
            }))}
            selectedMaterialId={neededMaterialDraft.materialId}
            isPending={createJobMaterial.isPending}
            onSelect={(materialId) => applyCatalogMaterialToDraft(materialId, setNeededMaterialDraft)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: "8px", alignItems: "start" }}>
            <input
              value={neededMaterialDraft.quantity}
              onChange={(event) => setNeededMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
              inputMode="decimal"
              placeholder="Qty"
            />
            <input
              value={neededMaterialDraft.note}
              onChange={(event) => setNeededMaterialDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="Optional note"
            />
            <button
              type="button"
              disabled={createJobMaterial.isPending || !neededMaterialDraft.materialId || !neededMaterialDraft.quantity}
              onClick={() => void handleAddJobMaterial("needed")}
            >
              Add
            </button>
          </div>

          {neededMaterialDisplayItems.length === 0 ? (
            <p style={{ color: "#5b6475", margin: 0 }}>No materials needed listed yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {neededMaterialDisplayItems.map((item) => (
                <div key={item.key} style={{ ...cardStyle("#fafcff"), padding: "12px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                    <div>
                      <strong>{item.materialName}</strong>
                      <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>
                        {item.sectionName ? `${item.sectionName} · ` : ""}
                        {item.materialSku ? `${item.materialSku} · ` : ""}
                        {item.quantity} {item.materialUnit}
                      </div>
                      {!item.isPersisted ? (
                        <div style={{ color: "#5b6475", fontSize: "12px", marginTop: "4px" }}>
                          From quote estimate
                        </div>
                      ) : null}
                    </div>
                    {item.isPersisted && item.id ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void handleRemoveJobMaterial(item.id as string, item.materialName)}
                        disabled={deleteJobMaterial.isPending}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {item.isPersisted && item.id ? (
                    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: "8px" }}>
                      <input
                        defaultValue={String(item.quantity)}
                        inputMode="decimal"
                        onBlur={(event) => {
                          const nextQuantity = Number(event.target.value);
                          if (
                            item.catalogItemId &&
                            Number.isFinite(nextQuantity) &&
                            nextQuantity > 0 &&
                            nextQuantity !== item.quantity
                          ) {
                            updateJobMaterial.mutate({
                              jobMaterialId: item.id as string,
                              catalogItemId: item.catalogItemId,
                              quantity: nextQuantity,
                              note: item.note,
                            });
                          }
                        }}
                      />
                      <input
                        defaultValue={item.note ?? ""}
                        placeholder="Optional note"
                        onBlur={(event) => {
                          if (item.catalogItemId && (event.target.value || "") !== (item.note ?? "")) {
                            updateJobMaterial.mutate({
                              jobMaterialId: item.id as string,
                              catalogItemId: item.catalogItemId,
                              quantity: item.quantity,
                              note: event.target.value || null,
                            });
                          }
                        }}
                      />
                      <span style={{ color: "#5b6475", fontSize: "13px", alignSelf: "center" }}>{item.materialUnit}</span>
                    </div>
                  ) : item.note ? (
                    <div style={{ color: "#5b6475", fontSize: "13px" }}>{item.note}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={cardStyle("#fff")}>
        <div style={sectionHeadingRow()}>
          <div>
            <h3 style={{ margin: 0 }}>Timer Info</h3>
            <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
              Running timer and recent time entries stay close without taking over the whole screen.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "16px", marginTop: "12px" }}>
          <TimeTrackerPanel
            selectedJobId={selectedJob.job.id}
            canCreateTimeEntry={selectedJob.permissions.canCreateTimeEntry}
            availableJobs={jobs.map((item) => ({
              id: item.job.id,
              label: `${item.job.number} · ${item.job.title}`,
              canTrack: item.permissions.canCreateTimeEntry,
            }))}
            availableWorkers={(() => {
              const options = selectedJob.assignments.map((assignment) => ({
                id: String(assignment.userId),
                label: userLabelsById.get(String(assignment.userId)) ?? "Unknown user",
              }));

              const currentUserOption = {
                id: String(currentUser.user.id),
                label: currentUser.user.fullName,
              };

              return options.some((option) => option.id === currentUserOption.id)
                ? options
                : [currentUserOption, ...options];
            })()}
            draft={panelDraft}
            activeRunningTimerDraft={activeRunningTimerDraft}
            isSaving={isSavingTimeEntryDraft}
            runningJobLabel={runningTimerJob ? `${runningTimerJob.job.number} · ${runningTimerJob.job.title}` : null}
            onStart={startTimer}
            onStartManual={startManualEntry}
            onUpdateDraft={
              panelDraft?.activeTimerId && activeRunningTimerDraft?.jobId === selectedJob.job.id
                ? updateActiveRunningTimerDraft
                : updateTimeEntryDraft
            }
            onStop={stopTimer}
            onSave={saveTimeEntryDraft}
            onDiscard={discardTimeEntryDraft}
            onGoToRunningJob={() => {
              if (activeRunningTimerDraft?.jobId) {
                openSelectedJob(activeRunningTimerDraft.jobId);
              }
            }}
          />

          <div style={{ display: "grid", gap: "10px" }}>
            <h4 style={{ margin: 0 }}>Recent Entries</h4>
            {selectedJob.timeEntries.length === 0 ? (
              <p style={{ color: "#5b6475", margin: 0 }}>No time entries yet.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {selectedJob.timeEntries.slice(0, 5).map((entry) => (
                  <EditableTimeEntryItem
                    key={entry.id}
                    entry={entry}
                    workedByLabel={userLabelsById.get(String(entry.userId)) ?? "Unknown user"}
                    enteredByLabel={userLabelsById.get(String(entry.createdBy)) ?? userLabelsById.get(String(entry.userId)) ?? "Unknown user"}
                    canApprove={selectedJob.permissions.canEditTimeEntries}
                    canEdit={selectedJob.permissions.canEditTimeEntries}
                    canDelete={selectedJob.permissions.canDeleteTimeEntries}
                    isApproving={approveTimeEntry.isPending}
                    isSaving={updateTimeEntry.isPending}
                    isDeleting={deleteTimeEntry.isPending}
                    onApprove={() => approveTimeEntry.mutate(entry)}
                    onSave={async (input) => {
                      await updateTimeEntry.mutateAsync({
                        entryId: entry.id,
                        ...input,
                      });
                    }}
                    onDelete={() => deleteTimeEntry.mutate(entry)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {showAssignPeople && canManageAssignments ? (
        <div
          onClick={() => setShowAssignPeople(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(23, 32, 51, 0.42)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "480px",
              maxHeight: "75vh",
              overflow: "auto",
              borderRadius: "20px",
              background: "#fff",
              border: "1px solid #d9dfeb",
              boxShadow: "0 18px 48px rgba(23, 32, 51, 0.18)",
              padding: "16px",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={sectionHeadingRow()}>
              <div>
                <h3 style={{ margin: 0 }}>Add Person</h3>
                <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                  Assign more people to this job.
                </p>
              </div>
              <button type="button" onClick={() => setShowAssignPeople(false)} style={secondaryButtonStyle()}>
                Close
              </button>
            </div>

            <input
              value={assignmentSearch}
              onChange={(event) => setAssignmentSearch(event.target.value)}
              placeholder="Search by name"
              style={{ fontSize: "16px" }}
            />

            <div style={{ display: "grid", gap: "8px" }}>
              {filteredAssignableUsers.length === 0 ? (
                <div style={{ color: "#5b6475" }}>No matching users.</div>
              ) : (
                filteredAssignableUsers.map((user) => {
                  const alreadyAssigned = selectedAssignedUserIds.has(user.id);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        if (alreadyAssigned || !selectedJob) {
                          return;
                        }

                        void assignJob.mutateAsync({ jobId: selectedJob.job.id, userId: user.id }).then(() => {
                          setShowAssignPeople(false);
                          setAssignmentSearch("");
                        });
                      }}
                      disabled={alreadyAssigned || assignJob.isPending}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        width: "100%",
                        padding: "14px 12px",
                        borderRadius: "14px",
                        border: "1px solid #d9dfeb",
                        background: alreadyAssigned ? "#f6f8fb" : "#fff",
                        color: alreadyAssigned ? "#8a93a5" : "#172033",
                        textAlign: "left",
                      }}
                    >
                      <span>{user.label}</span>
                      <span style={{ fontSize: "13px", color: alreadyAssigned ? "#8a93a5" : "#5b6475" }}>
                        {alreadyAssigned ? "Already assigned" : "Add"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showEditJob && selectedJob && editJobDraft ? (
        <div
          onClick={() => setShowEditJob(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(23, 32, 51, 0.42)",
            zIndex: 45,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflow: "auto",
              borderRadius: "20px",
              background: "#fff",
              border: "1px solid #d9dfeb",
              boxShadow: "0 18px 48px rgba(23, 32, 51, 0.18)",
              padding: "16px",
              display: "grid",
              gap: "14px",
            }}
          >
            <div style={sectionHeadingRow()}>
              <div>
                <h3 style={{ margin: 0 }}>Edit Job</h3>
                <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                  Update the practical job details without leaving the work screen.
                </p>
              </div>
              <button type="button" onClick={() => setShowEditJob(false)} style={secondaryButtonStyle()}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Job Title</span>
                <input
                  value={editJobDraft.title}
                  onChange={(event) => setEditJobDraft((current) => current ? { ...current, title: event.target.value } : current)}
                  style={{ fontSize: "16px" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Customer / Contact</span>
                <select
                  value={editJobDraft.contactId}
                  onChange={(event) => setEditJobDraft((current) => current ? { ...current, contactId: event.target.value } : current)}
                  style={{ minHeight: "44px", borderRadius: "12px", padding: "10px 12px", fontSize: "16px" }}
                >
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.label}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>Estimated Hours</span>
                  <input
                    value={editJobDraft.estimatedHours}
                    onChange={(event) => setEditJobDraft((current) => current ? { ...current, estimatedHours: event.target.value } : current)}
                    inputMode="decimal"
                    placeholder="Not set"
                    style={{ fontSize: "16px" }}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>Status</span>
                  <select
                    value={editJobDraft.status}
                    onChange={(event) =>
                      setEditJobDraft((current) =>
                        current
                          ? {
                              ...current,
                              status: event.target.value as JobStatus,
                              waitingReason:
                                event.target.value === "waiting"
                                  ? current.waitingReason || "other"
                                  : "",
                            }
                          : current,
                      )
                    }
                    style={{ minHeight: "44px", borderRadius: "12px", padding: "10px 12px", fontSize: "16px" }}
                  >
                    {getSelectableJobStatuses(selectedJob.job.status).map((status) => (
                      <option key={status} value={status}>
                        {getJobStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {editJobDraft.status === "waiting" ? (
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ color: "#5b6475", fontSize: "13px" }}>Waiting Reason</span>
                  <select
                    value={editJobDraft.waitingReason}
                    onChange={(event) => setEditJobDraft((current) => current ? { ...current, waitingReason: event.target.value } : current)}
                    style={{ minHeight: "44px", borderRadius: "12px", padding: "10px 12px", fontSize: "16px" }}
                  >
                    {JOB_WAITING_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {getWorkbenchWaitingReasonLabel(reason)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ color: "#5b6475", fontSize: "13px" }}>Description / Scope</span>
                <textarea
                  value={editJobDraft.description}
                  onChange={(event) => setEditJobDraft((current) => current ? { ...current, description: event.target.value } : current)}
                  rows={4}
                  style={{ width: "100%", resize: "vertical", fontSize: "16px" }}
                />
              </label>
            </div>

            <section style={{ ...cardStyle("#fafcff"), padding: "14px" }}>
              <div style={sectionHeadingRow()}>
                <div>
                  <strong>Assigned Crew</strong>
                  <div style={{ color: "#5b6475", fontSize: "13px", marginTop: "4px" }}>
                    Manage who is currently assigned to this job.
                  </div>
                </div>
                {canManageAssignments ? (
                  <button type="button" onClick={() => setShowAssignPeople(true)} style={secondaryButtonStyle()}>
                    + Add Person
                  </button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                {selectedJob.assignments.length === 0 ? (
                  <span style={{ color: "#5b6475" }}>Nobody assigned yet.</span>
                ) : (
                  selectedJob.assignments.map((assignment) => {
                    const userLabel =
                      assignableUsers.find((user) => user.id === assignment.userId)?.label ?? "Unknown user";

                    return (
                      <span
                        key={assignment.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 12px",
                          borderRadius: "999px",
                          background: "#ffffff",
                          border: "1px solid #d9dfeb",
                          fontSize: "14px",
                        }}
                      >
                        <span>{userLabel}</span>
                        {canManageAssignments ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveAssignment(assignment.id, userLabel)}
                            disabled={removeJobAssignment.isPending}
                            aria-label={`Remove ${userLabel}`}
                            style={{
                              border: 0,
                              background: "transparent",
                              padding: 0,
                              color: "#7a2430",
                              fontWeight: 700,
                              fontSize: "16px",
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    );
                  })
                )}
              </div>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setShowEditJob(false)} style={secondaryButtonStyle()}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveJobEdits()}
                disabled={updateJob.isPending || updateJobStatus.isPending}
                style={primaryButtonStyle()}
              >
                {updateJob.isPending || updateJobStatus.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {canArchiveJobs ? (
              <section
                style={{
                  borderTop: "1px solid #e7d2d6",
                  paddingTop: "14px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div>
                  <strong style={{ color: "#7a2430" }}>Danger Zone</strong>
                  <p style={{ margin: "4px 0 0", color: "#5b6475" }}>
                    Archiving hides this job from the active jobs list without changing old records.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => void handleArchiveJob(selectedJob.job.id, selectedJob.job.title)}
                    disabled={archiveJob.isPending}
                  >
                    {archiveJob.isPending ? "Archiving..." : "Archive Job"}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <main style={pageStyle()}>
      {selectedJob ? (
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={async (event) => {
            await handleAttachmentSelection(event.target.files);
            event.target.value = "";
          }}
        />
      ) : null}
      {!selectedJob ? jobsListScreen : jobScreen === "attachments" ? attachmentsScreen : jobScreen === "actuals" ? actualsScreen : mainJobScreen}
      {showInvoiceGenerator && selectedJob ? (
        <InvoiceGenerationPanel
          preview={visibleInvoicePreview}
          draftLines={invoiceDraftLines}
          draftValidation={invoiceDraftValidation}
          selectedSource={invoiceSource}
          canUseQuoteSource={canUseQuoteInvoiceSource}
          isPreviewPending={previewInvoice.isPending || loadActualsInvoiceBase.isPending}
          isSavePending={saveInvoice.isPending}
          onSelectSource={(source) => {
            setInvoiceSource(source);
            setInvoiceQuotePreview(null);
            setInvoiceActualsBase(null);
            if (source === "actuals") {
              void loadActualsInvoiceBase.mutate({
                jobId: selectedJob.job.id,
              });
            }
          }}
          onGeneratePreview={() =>
            void (
              invoiceSource === "actuals"
                ? loadActualsInvoiceBase.mutate({
                    jobId: selectedJob.job.id,
                    actualControls: invoiceActualsControls,
                  })
                : previewInvoice.mutate({
                    jobId: selectedJob.job.id,
                    source: invoiceSource,
                  })
            )
          }
          onSave={() => {
            if (!visibleInvoicePreview || invoiceDraftValidation.length > 0) {
              return;
            }
            void saveInvoice.mutate(visibleInvoicePreview);
          }}
          onDraftLineChange={updateInvoiceDraftLine}
          onDraftLineTotalChange={updateInvoiceDraftLineTotal}
          onAddManualLine={addManualInvoiceDraftLine}
          onRemoveLine={removeInvoiceDraftLine}
          onMoveLine={moveInvoiceDraftLine}
          actualInvoiceControls={invoiceActualsControls}
          actualPartOptions={actualPartOptions}
          onActualInvoiceControlsChange={(controls) => {
            setInvoiceActualsControls(controls);
          }}
          previewOptions={invoicePreviewOptions}
          onPreviewOptionsChange={setInvoicePreviewOptions}
          onClose={() => {
            setShowInvoiceGenerator(false);
            setInvoiceQuotePreview(null);
            setInvoiceActualsBase(null);
            setInvoiceDraftLines([]);
          }}
        />
      ) : null}
      {selectedJob ? (
        <SavedInvoicePreviewPanel
          invoice={selectedSavedInvoice}
          customerName={jobWorkspace?.contactName ?? selectedJob.contactName}
          jobReference={`${selectedJob.job.number} · ${selectedJob.job.title}`}
          canDelete={canGenerateInvoices}
          isDeleting={deleteInvoice.isPending}
          onDelete={(invoice) => {
            if (!window.confirm(`Delete invoice ${invoice.number}? This removes the saved invoice snapshot from this job.`)) {
              return;
            }
            void deleteInvoice.mutate(invoice.id);
          }}
          onClose={() => setSelectedSavedInvoice(null)}
        />
      ) : null}
    </main>
  );
}
