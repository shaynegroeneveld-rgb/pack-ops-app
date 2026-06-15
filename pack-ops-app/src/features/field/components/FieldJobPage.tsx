import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { APP_ROUTES } from "@/app/router/routes";
import { useUiStore } from "@/app/store/ui-store";
import type { JobMaterialView } from "@/domain/jobs/types";
import type { CatalogItem } from "@/domain/materials/types";
import { MaterialSearchSelect } from "@/features/materials/components/MaterialSearchSelect";
import { useWorkbenchSlice } from "@/features/workbench/hooks/use-workbench-slice";
import { matchesCatalogItemSearch } from "@/services/materials/material-search";

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
  const [usedMaterialDraft, setUsedMaterialDraft] = useState({
    materialId: "",
    quantity: "1",
  });
  const [usedMaterialSearch, setUsedMaterialSearch] = useState("");
  const [neededMaterialDraft, setNeededMaterialDraft] = useState({
    materialId: "",
    quantity: "1",
    note: "",
  });
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const usedMaterialSearchRef = useRef<HTMLInputElement | null>(null);

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
  const crewNames = selectedJobCard
    ? selectedJobCard.assignments.map((assignment) => userNamesById.get(assignment.userId) ?? "Crew")
    : [];

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
  const catalogItemsById = useMemo(() => new Map(catalogItems.map((item) => [item.id, item])), [catalogItems]);
  const selectedQuickUsedMaterial = usedMaterialDraft.materialId
    ? catalogItemsById.get(usedMaterialDraft.materialId as CatalogItem["id"]) ?? null
    : null;
  const usedMaterialSearchResults = useMemo(
    () =>
      usedMaterialSearch.trim()
        ? catalogItems.filter((item) => matchesCatalogItemSearch(item, usedMaterialSearch)).slice(0, 8)
        : [],
    [catalogItems, usedMaterialSearch],
  );
  const recentUsedCatalogItems = useMemo(() => {
    const seen = new Set<string>();
    const recent: CatalogItem[] = [];
    for (const line of selectedUsedMaterials) {
      const item = catalogItemsById.get(line.catalogItemId);
      if (!item || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      recent.push(item);
      if (recent.length >= 6) {
        break;
      }
    }
    return recent;
  }, [catalogItemsById, selectedUsedMaterials]);

  useEffect(() => {
    storeRecentJobId(jobId);
  }, [jobId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

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

  async function handleAddUsedMaterial() {
    if (!selectedJobCard || !usedMaterialDraft.materialId) {
      return;
    }
    const quantity = Number(usedMaterialDraft.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const item = catalogItems.find((entry) => entry.id === usedMaterialDraft.materialId);
    await workbench.createJobMaterial.mutateAsync({
      jobId: selectedJobCard.job.id,
      catalogItemId: usedMaterialDraft.materialId,
      kind: "used",
      quantity,
      displayName: item?.name ?? null,
      skuSnapshot: item?.sku ?? null,
      unitSnapshot: item?.unit ?? null,
      unitCost: item?.costPrice ?? null,
      unitSell: item?.unitPrice ?? null,
      markupPercent: null,
    });
    setUsedMaterialDraft({ materialId: "", quantity: "1" });
    setUsedMaterialSearch("");
    window.requestAnimationFrame(() => {
      usedMaterialSearchRef.current?.focus();
    });
  }

  async function handleQuickAddUsedMaterial(item: CatalogItem, quantity: number) {
    setUsedMaterialDraft({
      materialId: item.id,
      quantity: String(quantity),
    });
    await workbench.createJobMaterial.mutateAsync({
      jobId: selectedJobCard!.job.id,
      catalogItemId: item.id,
      kind: "used",
      quantity,
      displayName: item.name,
      skuSnapshot: item.sku ?? null,
      unitSnapshot: item.unit ?? null,
      unitCost: item.costPrice ?? null,
      unitSell: item.unitPrice ?? null,
      markupPercent: null,
    });
    setUsedMaterialDraft({ materialId: "", quantity: "1" });
    setUsedMaterialSearch("");
    window.requestAnimationFrame(() => {
      usedMaterialSearchRef.current?.focus();
    });
  }

  async function handleChangeUsedMaterialQuantity(material: JobMaterialView, nextQuantity: number) {
    if (nextQuantity <= 0) {
      await workbench.deleteJobMaterial.mutateAsync(material.id);
      return;
    }

    await workbench.updateJobMaterial.mutateAsync({
      jobMaterialId: material.id,
      catalogItemId: material.catalogItemId,
      quantity: Math.round(nextQuantity * 100) / 100,
      note: material.note,
      displayName: material.displayName ?? material.materialName,
      skuSnapshot: material.skuSnapshot ?? material.materialSku,
      unitSnapshot: material.unitSnapshot ?? material.materialUnit,
      unitCost: material.unitCost ?? material.currentCatalogCost ?? null,
      unitSell: material.unitSell ?? material.currentCatalogUnitPrice ?? null,
      markupPercent: material.markupPercent,
      sectionName: material.sectionName,
    });
  }

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

  if (isJobLookupLoading) {
    return (
      <div
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
            <button
              type="button"
              style={actionButtonStyle()}
              onClick={() =>
                runningDraft?.jobId === selectedJobCard.job.id
                  ? void workbench.stopTimer()
                  : void workbench.startTimer(selectedJobCard.job.id)
              }
            >
              {runningDraft?.jobId === selectedJobCard.job.id ? "Stop Timer" : "Start Timer"}
            </button>
            {runningDraft?.jobId === selectedJobCard.job.id && elapsed ? (
              <div style={{ ...softCardStyle(), padding: "12px" }}>
                <div style={infoLabelStyle()}>Elapsed</div>
                <div style={{ color: fieldColors.goldBright, fontSize: "24px", fontWeight: 900 }}>{elapsed}</div>
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

            <div style={{ display: "grid", gap: "10px" }}>
              <strong style={{ color: fieldColors.white }}>Material Needed</strong>
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

            <div style={{ display: "grid", gap: "10px" }}>
              <strong style={{ color: fieldColors.white }}>Material Used</strong>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={infoLabelStyle()}>Quick Search</span>
                <input
                  ref={usedMaterialSearchRef}
                  type="text"
                  value={usedMaterialSearch}
                  onChange={(event) => setUsedMaterialSearch(event.target.value)}
                  placeholder="Search name, SKU, or nickname"
                  style={inputStyle()}
                />
              </label>
              {recentUsedCatalogItems.length > 0 && !usedMaterialSearch.trim() ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={infoLabelStyle()}>Recently Used</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {recentUsedCatalogItems.map((item) => (
                      <div key={`recent-${item.id}`} style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "8px" }}>
                        <div style={{ display: "grid", gap: "2px" }}>
                          <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{item.name}</strong>
                          <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                            {[item.sku, item.aliases[0]].filter(Boolean).join(" · ") || item.category || "Catalog item"}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                          <button type="button" style={actionButtonStyle("secondary")} onClick={() => void handleQuickAddUsedMaterial(item, 1)}>
                            +1
                          </button>
                          <button type="button" style={actionButtonStyle("secondary")} onClick={() => void handleQuickAddUsedMaterial(item, 5)}>
                            +5
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {usedMaterialSearch.trim() ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={infoLabelStyle()}>Search Results</div>
                  {usedMaterialSearchResults.length === 0 ? (
                    <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>
                      No materials matched that search.
                    </div>
                  ) : (
                    usedMaterialSearchResults.map((item) => (
                      <div key={item.id} style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "8px" }}>
                        <div style={{ display: "grid", gap: "2px" }}>
                          <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{item.name}</strong>
                          <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                            {[item.sku, item.aliases.join(", ")].filter(Boolean).join(" · ") || item.category || "Catalog item"}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                          <button type="button" style={actionButtonStyle("secondary")} onClick={() => void handleQuickAddUsedMaterial(item, 1)}>
                            +1
                          </button>
                          <button type="button" style={actionButtonStyle("secondary")} onClick={() => void handleQuickAddUsedMaterial(item, 5)}>
                            +5
                          </button>
                          <button
                            type="button"
                            style={actionButtonStyle("secondary")}
                            onClick={() => {
                              setUsedMaterialDraft({ materialId: item.id, quantity: "1" });
                            }}
                          >
                            Custom
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
              {selectedQuickUsedMaterial ? (
                <div style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "10px" }}>
                  <div style={{ display: "grid", gap: "2px" }}>
                    <strong style={{ color: fieldColors.white, overflowWrap: "anywhere" }}>{selectedQuickUsedMaterial.name}</strong>
                    <span style={{ color: fieldColors.whiteSoft, fontSize: "12px", overflowWrap: "anywhere" }}>
                      {[selectedQuickUsedMaterial.sku, selectedQuickUsedMaterial.aliases.join(", ")]
                        .filter(Boolean)
                        .join(" · ") || selectedQuickUsedMaterial.category || "Catalog item"}
                    </span>
                  </div>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={infoLabelStyle()}>Custom Quantity</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={usedMaterialDraft.quantity}
                      onChange={(event) => setUsedMaterialDraft((current) => ({ ...current, quantity: event.target.value }))}
                      style={inputStyle()}
                    />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                    <button
                      type="button"
                      style={actionButtonStyle()}
                      disabled={!usedMaterialDraft.materialId || workbench.createJobMaterial.isPending}
                      onClick={() => void handleAddUsedMaterial()}
                    >
                      Add Material Used
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle("secondary")}
                      onClick={() => setUsedMaterialDraft({ materialId: "", quantity: "1" })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedUsedMaterials.length === 0 ? (
                <div style={{ ...softCardStyle(), padding: "12px", color: fieldColors.whiteSoft }}>No used materials yet.</div>
              ) : (
                selectedUsedMaterials.map((material: JobMaterialView) => (
                  <div key={material.id} style={{ ...softCardStyle(), padding: "12px", display: "grid", gap: "8px" }}>
                    <div style={{ display: "grid", gap: "2px" }}>
                      <strong style={{ display: "block", color: fieldColors.white, overflowWrap: "anywhere" }}>
                        {material.displayName ?? material.materialName}
                      </strong>
                      <span style={{ color: fieldColors.green, fontSize: "13px", fontWeight: 800 }}>
                        {material.quantity} {material.unitSnapshot ?? material.materialUnit}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                      <button
                        type="button"
                        style={actionButtonStyle("secondary")}
                        onClick={() => void handleChangeUsedMaterialQuantity(material, material.quantity - 1)}
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        style={actionButtonStyle("secondary")}
                        onClick={() => void handleChangeUsedMaterialQuantity(material, material.quantity + 1)}
                      >
                        +1
                      </button>
                      <button type="button" style={actionButtonStyle("secondary")} onClick={() => void workbench.deleteJobMaterial.mutateAsync(material.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
        )}
      </div>
    </div>
  );
}
