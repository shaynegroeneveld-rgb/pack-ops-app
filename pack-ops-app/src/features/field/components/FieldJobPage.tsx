import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { CatalogItem } from "@/domain/materials/types";
import {
  deriveTimeEntryDraftDateValue,
  deriveTimeEntryDraftHours,
  formatTimeEntryHoursInput,
  isTimeEntryDraftRunning,
  parseTimeEntryHoursInput,
  updateManualTimeEntryDraftDate,
  updateManualTimeEntryDraftHours,
  validateTimeEntryDraft,
} from "@/domain/time-entries/draft";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";

import {
  actionButtonStyle,
  fieldColors,
  formatElapsed,
  formatHours,
  formatMoney,
  infoLabelStyle,
  inputStyle,
  shellCardStyle,
  softCardStyle,
  storeRecentJobId,
  toggleButtonStyle,
} from "./field-mode-shared";
import { FieldMaterialsUsedPanel } from "./FieldMaterialsUsedPanel";

type JobAccordionKey = "info" | "timer" | "notes" | "attachments" | "materials";

interface FieldJobPageProps {
  jobId: string;
}

export function FieldJobPage({ jobId }: FieldJobPageProps) {
  const { currentUser } = useAuthContext();
  const setActiveRoute = useUiStore((state) => state.setActiveRoute);
  const [jobAccordions, setJobAccordions] = useState<Record<JobAccordionKey, boolean>>({
    info: false,
    timer: false,
    notes: false,
    attachments: false,
    materials: false,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [neededMaterialDraft, setNeededMaterialDraft] = useState({
    materialId: "",
    quantity: "1",
    note: "",
  });
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [manualHoursInput, setManualHoursInput] = useState("");
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!currentUser) {
    return null;
  }

  const workbench = useWorkbenchSlice(currentUser, {
    selectedJobId: jobId,
    activeTab: "actuals",
  });

  const jobCards = workbench.jobsQuery.data ?? [];
  const selectedJobCard = jobCards.find((card) => String(card.job.id) === String(jobId)) ?? null;
  const isJobLookupLoading = workbench.jobsQuery.isPending || (workbench.jobsQuery.isFetching && !selectedJobCard);
  const jobWorkspace = workbench.jobWorkspaceQuery.data ?? null;
  const assignableUsers = workbench.assignableUsersQuery.data ?? [];
  const userNamesById = useMemo(() => new Map(assignableUsers.map((user) => [user.id, user.label])), [assignableUsers]);

  const runningDraft = workbench.activeRunningTimerDraft;
  const elapsed = runningDraft?.startedAt ? formatElapsed(runningDraft.startedAt, clockNowMs) : null;
  const selectedNeededMaterials = jobWorkspace?.neededMaterials ?? [];
  const selectedUsedMaterials = jobWorkspace?.usedMaterials ?? [];
  const selectedTimeEntries = jobWorkspace?.timeEntries ?? [];
  const selectedFieldDraft = workbench.timeEntryDraft?.jobId === selectedJobCard?.job.id ? workbench.timeEntryDraft : null;
  const manualOrStoppedDraft =
    selectedFieldDraft && (!isTimeEntryDraftRunning(selectedFieldDraft) || selectedFieldDraft.source === "manual")
      ? selectedFieldDraft
      : null;
  const crewNames = selectedJobCard
    ? selectedJobCard.assignments.map((assignment) => userNamesById.get(assignment.userId) ?? "Crew")
    : [];
  const timerWorkerOptions = useMemo(() => {
    const options = selectedJobCard
      ? selectedJobCard.assignments.map((assignment) => ({
          id: String(assignment.userId),
          label: userNamesById.get(assignment.userId) ?? "Crew",
        }))
      : [];

    const currentUserOption = {
      id: String(currentUser.user.id),
      label: currentUser.user.fullName,
    };

    return options.some((option) => option.id === currentUserOption.id) ? options : [currentUserOption, ...options];
  }, [currentUser.user.fullName, currentUser.user.id, selectedJobCard, userNamesById]);

  const catalogItems = useMemo<CatalogItem[]>(
    () =>
      (jobWorkspace?.materialCatalogOptions ?? []).map((item) => ({
        id: item.id,
        orgId: currentUser.user.orgId,
        name: item.name,
        sku: item.sku,
        aliases: item.aliases,
        unit: item.unit,
        costPrice: item.costPrice,
        unitPrice: item.unitPrice,
        category: item.category,
        notes: item.notes,
        isActive: true,
        createdBy: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      })),
    [currentUser.user.orgId, jobWorkspace?.materialCatalogOptions],
  );

  useEffect(() => {
    storeRecentJobId(jobId);
  }, [jobId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!manualOrStoppedDraft) {
      setManualHoursInput("");
      return;
    }

    setManualHoursInput(formatTimeEntryHoursInput(deriveTimeEntryDraftHours(manualOrStoppedDraft)));
  }, [manualOrStoppedDraft]);

  function toggleJobAccordion(key: JobAccordionKey) {
    setJobAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  function renderSectionCard(key: JobAccordionKey, title: string, children: ReactNode) {
    const isOpen = jobAccordions[key];
    return (
      <div style={{ display: "grid", gap: "8px" }}>
        <button type="button" onClick={() => toggleJobAccordion(key)} style={toggleButtonStyle(isOpen)}>
          <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "20px" }}>
              {key === "info" ? "ℹ️" : key === "timer" ? "⏱️" : key === "notes" ? "📝" : key === "attachments" ? "📎" : "📦"}
            </span>
            <span>{title}</span>
          </span>
          <span style={{ color: fieldColors.goldBright, fontSize: "18px" }}>{isOpen ? "▾" : "▸"}</span>
        </button>
        {isOpen ? <div style={{ ...softCardStyle(), padding: "14px" }}>{children}</div> : null}
      </div>
    );
  }

  const parsedManualHours =
    manualOrStoppedDraft && manualHoursInput.trim().length > 0 ? parseTimeEntryHoursInput(manualHoursInput) : null;
  const manualHoursInvalid = Boolean(manualOrStoppedDraft && manualHoursInput.trim().length > 0 && parsedManualHours === null);

  async function handleAddNeededMaterial() {
    if (!selectedJobCard || !neededMaterialDraft.materialId) {
      return;
    }
    const quantity = Number(neededMaterialDraft.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const item = catalogItems.find((entry) => entry.id === neededMaterialDraft.materialId);
    await workbench.createJobMaterial.mutateAsync({
      jobId: selectedJobCard.job.id,
      catalogItemId: neededMaterialDraft.materialId,
      kind: "needed",
      quantity,
      note: neededMaterialDraft.note.trim() || null,
      displayName: item?.name ?? null,
      skuSnapshot: item?.sku ?? null,
      unitSnapshot: item?.unit ?? null,
      unitCost: item?.costPrice ?? null,
      unitSell: item?.unitPrice ?? null,
      markupPercent: null,
    });
    setNeededMaterialDraft({ materialId: "", quantity: "1", note: "" });
  }

  async function handleAddNote() {
    if (!selectedJobCard || !noteDraft.trim()) {
      return;
    }
    await workbench.addJobNote.mutateAsync({
      jobId: selectedJobCard.job.id,
      body: noteDraft.trim(),
    });
    setNoteDraft("");
  }

  async function handleUploadAttachment(file: File | null) {
    if (!selectedJobCard || !file) {
      return;
    }
    await workbench.uploadJobAttachment.mutateAsync({
      jobId: selectedJobCard.job.id,
      file,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function toDateTimeLocalValue(value: string): string {
    const date = new Date(value);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }

  function fromDateTimeLocalValue(value: string): string {
    return new Date(value).toISOString();
  }

  if (isJobLookupLoading) {
    return (
      <div
        data-theme="field"
        style={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: "100vw",
          boxSizing: "border-box",
          background: `linear-gradient(180deg, ${fieldColors.backgroundTop} 0%, ${fieldColors.backgroundMid} 48%, ${fieldColors.backgroundBottom} 100%)`,
          color: fieldColors.white,
          padding: "12px",
        }}
      >
        <div style={{ width: "min(100%, 760px)", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", margin: "0 auto", display: "grid", gap: "16px", minWidth: 0 }}>
          <button type="button" style={{ ...actionButtonStyle("secondary"), width: "auto", maxWidth: "100%", boxSizing: "border-box" }} onClick={() => setActiveRoute(APP_ROUTES.field)}>
            Back
          </button>
          <div style={{ ...shellCardStyle(), padding: "18px", display: "grid", gap: "8px" }}>
            <strong style={{ fontSize: "22px", color: fieldColors.white }}>Loading job…</strong>
            <span style={{ color: fieldColors.whiteSoft }}>Pulling the current job workspace into Field Mode.</span>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedJobCard) {
    return (
      <div
        data-theme="field"
        style={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: "100vw",
          boxSizing: "border-box",
          background: `linear-gradient(180deg, ${fieldColors.backgroundTop} 0%, ${fieldColors.backgroundMid} 48%, ${fieldColors.backgroundBottom} 100%)`,
          color: fieldColors.white,
          padding: "12px",
        }}
      >
        <div style={{ width: "min(100%, 760px)", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", margin: "0 auto", display: "grid", gap: "16px", minWidth: 0 }}>
          <button type="button" style={{ ...actionButtonStyle("secondary"), width: "auto", maxWidth: "100%", boxSizing: "border-box" }} onClick={() => setActiveRoute(APP_ROUTES.field)}>
            Back
          </button>
          <div style={{ ...shellCardStyle(), padding: "18px", display: "grid", gap: "8px" }}>
            <strong style={{ fontSize: "22px", color: fieldColors.white }}>Job not found</strong>
            <span style={{ color: fieldColors.whiteSoft }}>This field job could not be loaded. Go back to Field Mode and open it again.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme="field"
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        boxSizing: "border-box",
        background: `linear-gradient(180deg, ${fieldColors.backgroundTop} 0%, ${fieldColors.backgroundMid} 48%, ${fieldColors.backgroundBottom} 100%)`,
        color: fieldColors.white,
        padding: "10px 12px 32px",
        overflowX: "hidden",
      }}
    >
      <div style={{ width: "min(100%, 760px)", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", margin: "0 auto", display: "grid", gap: "14px", minWidth: 0 }}>
        <header style={{ ...shellCardStyle(), padding: "16px", display: "grid", gap: "10px", minWidth: 0 }}>
          <button
            type="button"
            style={{ ...actionButtonStyle("secondary"), width: "auto", justifySelf: "start", minWidth: "min(120px, 100%)", maxWidth: "100%", boxSizing: "border-box" }}
            onClick={() => setActiveRoute(APP_ROUTES.field)}
          >
            Back
          </button>
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ fontSize: "26px", lineHeight: 1.08, color: fieldColors.white, overflowWrap: "anywhere" }}>
              {selectedJobCard.job.title}
            </strong>
            {selectedJobCard.job.fieldName ? (
              <span style={{ color: fieldColors.goldBright, fontWeight: 800, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {selectedJobCard.job.fieldName}
              </span>
            ) : null}
            <span style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>
              {selectedJobCard.contactName ?? "No customer linked"}
            </span>
          </div>
          {selectedNeededMaterials.length > 0 ? (
            <div
              style={{
                borderRadius: "14px",
                background: fieldColors.warningBg,
                color: fieldColors.warningText,
                padding: "12px 14px",
                fontWeight: 900,
                fontSize: "15px",
              }}
            >
              Material is needed — don&apos;t forget!
            </div>
          ) : null}
        </header>

        {workbench.feedback ? (
          <div
            style={{
              ...softCardStyle(),
              padding: "12px 14px",
              color:
                workbench.feedback.tone === "error"
                  ? fieldColors.danger
                  : workbench.feedback.tone === "success"
                    ? fieldColors.goldBright
                    : fieldColors.white,
            }}
          >
            {workbench.feedback.text}
          </div>
        ) : null}

        {renderSectionCard(
          "info",
          "Info",
          <div style={{ display: "grid", gap: "12px" }}>
            <div>
              <div style={infoLabelStyle()}>Customer</div>
              <div style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{selectedJobCard.contactName ?? "No customer linked"}</div>
            </div>
            <div>
              <div style={infoLabelStyle()}>Contact</div>
              <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>{selectedJobCard.contactSubtitle ?? "No contact details"}</div>
            </div>
            <div>
              <div style={infoLabelStyle()}>Address</div>
              <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>
                {[
                  selectedJobCard.job.addressLine1,
                  selectedJobCard.job.addressLine2,
                  selectedJobCard.job.city,
                  selectedJobCard.job.region,
                  selectedJobCard.job.postalCode,
                ].filter(Boolean).join(", ") || "No address added"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
              <div style={{ ...softCardStyle(), padding: "12px", minWidth: 0 }}>
                <div style={infoLabelStyle()}>Assigned Crew</div>
                <div style={{ color: fieldColors.whiteSoft, overflowWrap: "anywhere" }}>{crewNames.join(", ") || "No crew assigned"}</div>
              </div>
              <div style={{ ...softCardStyle(), padding: "12px", minWidth: 0 }}>
                <div style={infoLabelStyle()}>Estimated Hours</div>
                <div style={{ color: fieldColors.white }}>{formatHours(selectedJobCard.job.estimatedHours)}</div>
              </div>
              <div style={{ ...softCardStyle(), padding: "12px", minWidth: 0 }}>
                <div style={infoLabelStyle()}>Actual Cost</div>
                <div style={{ color: fieldColors.white }}>{formatMoney(jobWorkspace?.performance?.totalActualCost ?? null)}</div>
              </div>
            </div>
          </div>,
        )}

        {renderSectionCard(
          "timer",
          "Timer",
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              <button
                type="button"
                style={actionButtonStyle()}
                disabled={!selectedJobCard.permissions.canCreateTimeEntry}
                onClick={() =>
                  runningDraft?.jobId === selectedJobCard.job.id
                    ? void workbench.stopTimer()
                    : void workbench.startTimer(selectedJobCard.job.id)
                }
              >
                {runningDraft?.jobId === selectedJobCard.job.id ? "Stop Timer" : "Start Timer"}
              </button>
              <button
                type="button"
                style={actionButtonStyle("secondary")}
                disabled={!selectedJobCard.permissions.canCreateTimeEntry}
                onClick={() => workbench.startManualEntry(selectedJobCard.job.id)}
              >
                Add Time
              </button>
            </div>
            {runningDraft?.jobId === selectedJobCard.job.id && elapsed ? (
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Elapsed</div>
                <div style={{ color: fieldColors.goldBright, fontSize: "24px", fontWeight: 900 }}>{elapsed}</div>
              </div>
            ) : null}
            {manualOrStoppedDraft ? (
              <div style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ color: fieldColors.white }}>
                    {manualOrStoppedDraft.source === "manual" ? "Manual Time Entry" : "Finish Time Entry"}
                  </strong>
                  <span style={{ color: fieldColors.goldBright, fontSize: "13px", fontWeight: 800 }}>
                    {deriveTimeEntryDraftHours(manualOrStoppedDraft).toFixed(2)}h
                  </span>
                </div>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Worked By</span>
                  <select
                    value={String(manualOrStoppedDraft.userId)}
                    onChange={(event) =>
                      workbench.updateTimeEntryDraft({
                        userId: event.target.value as typeof manualOrStoppedDraft.userId,
                      })
                    }
                    style={inputStyle()}
                  >
                    {timerWorkerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Work Date</span>
                  <input
                    type="date"
                    value={deriveTimeEntryDraftDateValue(manualOrStoppedDraft)}
                    onChange={(event) => {
                      const nextDraft = updateManualTimeEntryDraftDate(manualOrStoppedDraft, event.target.value);
                      workbench.updateTimeEntryDraft({
                        startedAt: nextDraft.startedAt,
                        endedAt: nextDraft.endedAt,
                      });
                    }}
                    style={inputStyle()}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Hours</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="1.5"
                    value={manualHoursInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setManualHoursInput(nextValue);
                      const parsedHours = parseTimeEntryHoursInput(nextValue);
                      if (parsedHours === null) {
                        return;
                      }
                      const nextDraft = updateManualTimeEntryDraftHours(manualOrStoppedDraft, parsedHours);
                      workbench.updateTimeEntryDraft({
                        startedAt: nextDraft.startedAt,
                        endedAt: nextDraft.endedAt,
                      });
                    }}
                    onBlur={() => {
                      if (!manualOrStoppedDraft) {
                        return;
                      }
                      const parsedHours = parseTimeEntryHoursInput(manualHoursInput);
                      if (parsedHours === null) {
                        setManualHoursInput(formatTimeEntryHoursInput(deriveTimeEntryDraftHours(manualOrStoppedDraft)));
                        return;
                      }
                      setManualHoursInput(formatTimeEntryHoursInput(parsedHours));
                    }}
                    style={inputStyle()}
                  />
                </label>
                {manualHoursInvalid ? (
                  <div style={{ color: fieldColors.danger, fontSize: "13px" }}>
                    Enter hours as a simple decimal like 1.5 or 2.25.
                  </div>
                ) : null}
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={infoLabelStyle()}>Note</span>
                  <textarea
                    rows={3}
                    value={manualOrStoppedDraft.description}
                    onChange={(event) => workbench.updateTimeEntryDraft({ description: event.target.value })}
                    style={inputStyle()}
                  />
                </label>
                {manualOrStoppedDraft.source === "timer" ? (
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span style={infoLabelStyle()}>Started At</span>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(manualOrStoppedDraft.startedAt)}
                      onChange={(event) =>
                        workbench.updateTimeEntryDraft({
                          startedAt: fromDateTimeLocalValue(event.target.value),
                        })
                      }
                      style={inputStyle()}
                    />
                  </div>
                ) : null}
                {validateTimeEntryDraft(manualOrStoppedDraft) ? (
                  <div style={{ color: fieldColors.danger, fontSize: "13px" }}>
                    {validateTimeEntryDraft(manualOrStoppedDraft)}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  <button
                    type="button"
                    style={actionButtonStyle()}
                    disabled={workbench.isSavingTimeEntryDraft || Boolean(validateTimeEntryDraft(manualOrStoppedDraft)) || manualHoursInvalid}
                    onClick={() => void workbench.saveTimeEntryDraft()}
                  >
                    {workbench.isSavingTimeEntryDraft ? "Saving..." : "Save Time"}
                  </button>
                  <button
                    type="button"
                    style={actionButtonStyle("secondary")}
                    disabled={workbench.isSavingTimeEntryDraft}
                    onClick={() => void workbench.discardTimeEntryDraft()}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {selectedTimeEntries.slice(0, 4).map((entry) => (
              <div key={entry.id} style={{ ...softCardStyle(), padding: "12px" }}>
                <strong style={{ display: "block", color: fieldColors.white }}>{formatHours(entry.hours)}</strong>
                <span style={{ color: fieldColors.whiteSoft, fontSize: "13px", overflowWrap: "anywhere" }}>
                  {entry.description ?? "Field labour"} · {entry.workDate}
                </span>
              </div>
            ))}
          </div>,
        )}

        {renderSectionCard(
          "notes",
          "Notes",
          <div style={{ display: "grid", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={infoLabelStyle()}>New Note</span>
              <textarea
                ref={noteInputRef}
                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                style={inputStyle()}
              />
            </label>
            <button type="button" style={actionButtonStyle()} onClick={() => void handleAddNote()} disabled={!noteDraft.trim()}>
              Save Note
            </button>
            {(jobWorkspace?.notes ?? []).slice(0, 8).map((note) => (
              <div key={note.id} style={{ ...softCardStyle(), padding: "12px" }}>
                <p style={{ margin: 0, color: fieldColors.white, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {note.body}
                </p>
                <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", marginTop: "6px" }}>
                  {new Date(note.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>,
        )}

        {renderSectionCard(
          "attachments",
          "Attachments",
          <div style={{ display: "grid", gap: "12px" }}>
            <input ref={fileInputRef} type="file" hidden onChange={(event) => void handleUploadAttachment(event.target.files?.[0] ?? null)} />
            <button type="button" style={actionButtonStyle()} onClick={() => fileInputRef.current?.click()}>
              Upload Attachment
            </button>
            {(jobWorkspace?.attachments ?? []).length === 0 ? (
              <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No attachments yet.</div>
            ) : (
              (jobWorkspace?.attachments ?? []).map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => void workbench.openAttachment(attachment.storagePath).then((url) => window.open(url, "_blank"))}
                  style={{ ...softCardStyle(), padding: "12px", textAlign: "left", color: fieldColors.white }}
                >
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{attachment.fileName}</strong>
                  <span style={{ color: fieldColors.whiteSoft, fontSize: "12px" }}>
                    {new Date(attachment.createdAt).toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>,
        )}

        {renderSectionCard(
          "materials",
          "Materials",
          <div style={{ display: "grid", gap: "16px" }}>
            {selectedNeededMaterials.length > 0 ? (
              <div
                style={{
                  borderRadius: "14px",
                  background: fieldColors.warningBg,
                  color: fieldColors.warningText,
                  padding: "12px 14px",
                  fontWeight: 900,
                  fontSize: "15px",
                }}
              >
                Material is needed — don&apos;t forget!
              </div>
            ) : null}

            <div style={{ ...softCardStyle(), padding: "14px", display: "grid", gap: "10px" }}>
              <strong style={{ color: fieldColors.white }}>Materials Needed</strong>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Search Material</span>
                <MaterialSearchSelect
                  catalogItems={catalogItems}
                  selectedMaterialId={neededMaterialDraft.materialId}
                  isPending={workbench.createJobMaterial.isPending}
                  placeholder="Search materials or nicknames"
                  onSelect={(materialId) => setNeededMaterialDraft((current) => ({ ...current, materialId }))}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Quantity</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={neededMaterialDraft.quantity}
                  onChange={(event) => setNeededMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
                  style={inputStyle()}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Note</span>
                <textarea
                  rows={2}
                  value={neededMaterialDraft.note}
                  onChange={(event) => setNeededMaterialDraft((current) => ({ ...current, note: event.target.value }))}
                  style={inputStyle()}
                />
              </label>
              <div style={{ display: "grid", gap: "10px" }}>
                <button
                  type="button"
                  style={actionButtonStyle()}
                  disabled={!neededMaterialDraft.materialId || workbench.createJobMaterial.isPending}
                  onClick={() => void handleAddNeededMaterial()}
                >
                  Add Material Needed
                </button>
                <button
                  type="button"
                  style={actionButtonStyle("secondary")}
                  disabled={selectedNeededMaterials.length === 0 || workbench.clearNeededMaterials.isPending}
                  onClick={() => void workbench.clearNeededMaterials.mutateAsync(selectedJobCard.job.id)}
                >
                  Mark all picked up
                </button>
              </div>
              {selectedNeededMaterials.length === 0 ? (
                <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No needed materials right now.</div>
              ) : (
                selectedNeededMaterials.map((material) => (
                  <div key={material.id} style={{ ...softCardStyle(), padding: "12px" }}>
                    <strong style={{ display: "block", color: fieldColors.white, overflowWrap: "anywhere" }}>
                      {material.displayName ?? material.materialName}
                    </strong>
                    <span style={{ color: fieldColors.goldBright, fontSize: "13px" }}>
                      {material.quantity} {material.unitSnapshot ?? material.materialUnit}
                    </span>
                    {material.note ? (
                      <div style={{ color: fieldColors.whiteSoft, fontSize: "12px", marginTop: "4px", overflowWrap: "anywhere" }}>
                        {material.note}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div style={{ ...softCardStyle(), padding: "14px", display: "grid", gap: "10px" }}>
              <FieldMaterialsUsedPanel
                jobId={selectedJobCard.job.id}
                catalogItems={catalogItems}
                assemblies={jobWorkspace?.assemblyOptions ?? []}
                usedMaterials={selectedUsedMaterials}
                onCreateUsedMaterial={(input) => workbench.createJobMaterial.mutateAsync(input)}
                onUpdateUsedMaterial={(input) => workbench.updateJobMaterial.mutateAsync(input)}
                onDeleteUsedMaterial={(jobMaterialId) => workbench.deleteJobMaterial.mutateAsync(jobMaterialId)}
              />
            </div>
          </div>,
        )}
      </div>
    </div>
  );
}
