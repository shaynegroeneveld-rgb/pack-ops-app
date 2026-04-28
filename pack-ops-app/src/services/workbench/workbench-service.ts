import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import type { SyncQueueEntry } from "@/data/dexie/outbox";
import { ActiveTimersRepositoryImpl } from "@/data/repositories/active-timers.repository.impl";
import { ActionItemsRepositoryImpl } from "@/data/repositories/action-items.repository.impl";
import { AssembliesRepositoryImpl, AssemblyItemsRepositoryImpl } from "@/data/repositories/assemblies.repository.impl";
import { ContactsRepositoryImpl } from "@/data/repositories/contacts.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import { DocumentsRepositoryImpl } from "@/data/repositories/documents.repository.impl";
import { JobAssignmentsRepositoryImpl } from "@/data/repositories/job-assignments.repository.impl";
import { JobMaterialsRepositoryImpl } from "@/data/repositories/job-materials.repository.impl";
import { JobsRepositoryImpl } from "@/data/repositories/jobs.repository.impl";
import { NotesRepositoryImpl } from "@/data/repositories/notes.repository.impl";
import { QuoteLineItemsRepositoryImpl } from "@/data/repositories/quote-line-items.repository.impl";
import { ScheduleBlocksRepositoryImpl } from "@/data/repositories/schedule-blocks.repository.impl";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import { SyncEngine } from "@/data/sync/engine";
import { PullSyncService } from "@/data/sync/pull";
import { PushSyncService } from "@/data/sync/push";
import { WorkbenchSyncGateway } from "@/data/sync/workbench-sync-gateway";
import type { Database } from "@/data/supabase/types";
import { SyncPushError, getInvalidJobStatusTransition } from "@/data/sync/errors";
import { deriveJobWorkflowFlags } from "@/domain/jobs/derived";
import { getAllowedNextJobStatuses } from "@/domain/jobs/status";
import type { ActionItem } from "@/domain/action-items/types";
import type { Job, JobActivityEntry, JobAssignment, JobMaterialView, JobWorkspaceData } from "@/domain/jobs/types";
import type { AssemblyView } from "@/domain/materials/types";
import {
  createDraftFromActiveTimer,
  deriveTimeEntryDraftHours,
  deriveTimeEntryDraftWorkDate,
  validateTimeEntryDraft,
  type TimeEntryDraft,
} from "@/domain/time-entries/draft";
import type { ActiveTimer, TimeEntry } from "@/domain/time-entries/types";
import type { User } from "@/domain/users/types";
import type { SavedInvoiceSummary } from "@/domain/invoices/types";
import { isWorkbenchEntityRef } from "@/lib/entity-ref/workbench-entity-ref";
import {
  canAssignCurrentUserToWorkbenchJob,
  canCreateWorkbenchActionItem,
  canCreateWorkbenchJob,
  canApproveWorkbenchTimeEntry,
  canDeleteWorkbenchTimeEntry,
  canEditWorkbenchTimeEntry,
  canCreateWorkbenchTimeEntry,
  canResolveWorkbenchActionItem,
  canViewWorkbenchJob,
} from "@/services/permissions/workbench-permissions";
import { computeJobPerformanceSummary } from "@/services/jobs/job-performance";
import { normalizeEstimateMaterialSnapshotLines, quoteLineItemsToEstimateMaterialSnapshot } from "@/services/materials/part-material-lines";
import { getNumberingConfig, readOrgBusinessSettings } from "@/services/settings/org-settings";

export interface WorkbenchContactOption {
  id: string;
  label: string;
  subtitle: string | null;
}

export interface WorkbenchAssignableUserOption {
  id: string;
  label: string;
  role: string;
}

export interface WorkbenchJobCard {
  job: Job;
  contactName: string | null;
  contactSubtitle: string | null;
  assignments: JobAssignment[];
  timeEntries: TimeEntry[];
  actionItems: ActionItem[];
  workflow: ReturnType<typeof deriveJobWorkflowFlags>;
  permissions: {
    canCreateTimeEntry: boolean;
    canEditTimeEntries: boolean;
    canDeleteTimeEntries: boolean;
    canManageAssignments: boolean;
    canAssignCurrentUser: boolean;
    canCreateActionItem: boolean;
  };
}

export type WorkbenchJobDetail = WorkbenchJobCard;
type InvoiceLineRow = Database["public"]["Tables"]["invoice_line_items"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export interface WorkbenchActiveTimerOverview {
  timerId: string;
  userId: string;
  userName: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  startedAt: string;
  description: string | null;
}

export interface WorkbenchFailedSyncItem {
  id: string;
  entityType: SyncQueueEntry["entityType"];
  entityId: string;
  operation: SyncQueueEntry["operation"];
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isLaborInvoiceLine(line: { description: string; unit: string }): boolean {
  const unit = line.unit.trim().toLowerCase();
  const description = line.description.trim().toLowerCase();
  return unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours" || description.includes("labour") || description.includes("labor");
}

export class WorkbenchService {
  readonly jobs;
  readonly contacts;
  readonly catalogItems;
  readonly documents;
  readonly jobAssignments;
  readonly jobMaterials;
  readonly notes;
  readonly quoteLineItems;
  readonly scheduleBlocks;
  readonly timeEntries;
  readonly actionItems;
  readonly activeTimers;
  readonly assemblies;
  readonly assemblyItems;
  readonly sync;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    const gateway = new WorkbenchSyncGateway(client);

    this.jobs = new JobsRepositoryImpl(context, client);
    this.contacts = new ContactsRepositoryImpl(context, client);
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
    this.assemblies = new AssembliesRepositoryImpl(context, client);
    this.assemblyItems = new AssemblyItemsRepositoryImpl(context, client);
    this.documents = new DocumentsRepositoryImpl(context, client);
    this.jobAssignments = new JobAssignmentsRepositoryImpl(context, client);
    this.jobMaterials = new JobMaterialsRepositoryImpl(context, client);
    this.notes = new NotesRepositoryImpl(context, client);
    this.quoteLineItems = new QuoteLineItemsRepositoryImpl(context, client);
    this.scheduleBlocks = new ScheduleBlocksRepositoryImpl(context, client);
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
    this.actionItems = new ActionItemsRepositoryImpl(context, client);
    this.activeTimers = new ActiveTimersRepositoryImpl(context, client);
    this.sync = new SyncEngine({
      push: new PushSyncService(gateway),
      pull: new PullSyncService(gateway),
    });
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private normalizeClockValue(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
      throw new Error("Time values must use HH:MM.");
    }

    return trimmed;
  }

  private deriveHoursFromTimeSlot(startTime: string | null, endTime: string | null): number | null {
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
      throw new Error("End time must be after start time.");
    }

    return this.roundQuantity((endTotal - startTotal) / 60);
  }

  private async buildAssemblyViews(): Promise<AssemblyView[]> {
    const [assemblies, items, catalogItems] = await Promise.all([
      this.assemblies.list(),
      this.assemblyItems.listByAssemblyIds([]),
      this.catalogItems.list({ filter: { includeInactive: true } }),
    ]);

    const activeAssemblies = assemblies.filter((assembly) => assembly.isActive);
    if (activeAssemblies.length === 0) {
      return [];
    }

    const assemblyIds = activeAssemblies.map((assembly) => assembly.id);
    const assemblyItems = await this.assemblyItems.listByAssemblyIds(assemblyIds);
    const itemsByAssemblyId = new Map<string, typeof assemblyItems>();
    for (const item of assemblyItems) {
      const current = itemsByAssemblyId.get(String(item.assemblyId)) ?? [];
      current.push(item);
      itemsByAssemblyId.set(String(item.assemblyId), current);
    }

    const materialsById = new Map(catalogItems.map((item) => [String(item.id), item]));
    return activeAssemblies.map((assembly) => {
      const viewItems = (itemsByAssemblyId.get(String(assembly.id)) ?? []).map((item) => {
        const material = materialsById.get(String(item.catalogItemId));
        const lineMaterialCost = (material?.costPrice ?? 0) * item.quantity;

        return {
          ...item,
          materialName: material?.name ?? "Unknown material",
          materialSku: material?.sku ?? null,
          materialUnit: material?.unit ?? "each",
          materialCostPrice: material?.costPrice ?? null,
          lineMaterialCost: this.roundMoney(lineMaterialCost),
        };
      });

      return {
        ...assembly,
        items: viewItems,
        materialCostTotal: this.roundMoney(viewItems.reduce((total, item) => total + item.lineMaterialCost, 0)),
      };
    });
  }

  private async flushAndRefreshWorkbench(options?: { force?: boolean; reason?: string }) {
    if (options?.force) {
      await this.sync.flushPendingQueue({ force: true });
    } else {
      await this.sync.flushPendingQueue();
    }
    await this.sync.refreshWorkbench();
    console.info("[WorkbenchService] flushAndRefreshWorkbench complete", {
      reason: options?.reason ?? "unknown",
      queueCount: await localDb.syncQueue.count(),
    });
  }

  private async confirmAuthoritativeJobState(
    jobId: string,
    assertState: (job: Job) => boolean,
    failureMessage: string,
  ): Promise<Job> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const authoritativeJob = await this.jobs.getById(jobId);
      if (authoritativeJob && assertState(authoritativeJob)) {
        return authoritativeJob;
      }

      if (attempt < 2) {
        await this.sleep(200);
      }
    }

    throw new Error(failureMessage);
  }

  private async discardInvalidQueuedJobStatusUpdate(error: unknown): Promise<{ discarded: boolean; message: string | null }> {
    if (!(error instanceof SyncPushError) || error.entry.entityType !== "jobs" || error.entry.operation !== "upsert") {
      return { discarded: false, message: null };
    }

    const transition = getInvalidJobStatusTransition(error);
    if (!transition) {
      return { discarded: false, message: null };
    }

    await localDb.syncQueue.delete(error.entry.id);
    await this.sync.refreshWorkbench();

    return {
      discarded: true,
      message: `Discarded invalid queued job status update for job ${error.entry.entityId}: ${transition.fromStatus} -> ${transition.toStatus}. Refreshed from backend state.`,
    };
  }

  async listJobCards(): Promise<WorkbenchJobCard[]> {
    await this.sync.refreshWorkbench();

    const [jobs, assignments, timeEntries, actionItems, contacts] = await Promise.all([
      this.jobs.list(),
      this.jobAssignments.list(),
      this.timeEntries.list(),
      this.actionItems.list(),
      this.contacts.list(),
    ]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

    console.info("[WorkbenchService] listJobCards fetched", {
      jobs: jobs.map((job) => ({ id: job.id, title: job.title, orgId: job.orgId, status: job.status })),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        jobId: assignment.jobId,
        userId: assignment.userId,
      })),
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });

    return jobs
      .filter((job) => {
        const visible = canViewWorkbenchJob(this.currentUser, job, assignments);
        console.info("[WorkbenchService] job visibility check", {
          jobId: job.id,
          title: job.title,
          visible,
          assignmentUserIds: assignments
            .filter((assignment) => assignment.jobId === job.id)
            .map((assignment) => assignment.userId),
          currentUserId: this.currentUser.id,
          currentUserRole: this.currentUser.role,
        });
        return visible;
      })
      .map((job) => {
        const jobAssignments = assignments.filter((assignment) => assignment.jobId === job.id);
        const jobTimeEntries = timeEntries.filter((entry) => entry.jobId === job.id);
        const jobTimeEntryIds = new Set(jobTimeEntries.map((entry) => entry.id));
        const jobActionItems = actionItems.filter((item) => {
          if (!isWorkbenchEntityRef(item)) {
            return false;
          }

          if (item.entityType === "jobs") {
            return item.entityId === job.id;
          }

          if (item.entityType === "time_entries") {
            return jobTimeEntryIds.has(item.entityId as TimeEntry["id"]);
          }

          return false;
        });
        const lastActivityAt = [job.updatedAt, ...jobTimeEntries.map((entry) => entry.updatedAt), ...jobActionItems.map((item) => item.updatedAt)]
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;

        const permissions = {
          canCreateTimeEntry: canCreateWorkbenchTimeEntry(
            this.currentUser,
            job,
            jobAssignments,
          ),
          canEditTimeEntries:
            this.currentUser.role === "owner" ||
            this.currentUser.role === "office" ||
            this.currentUser.canApproveTime,
          canDeleteTimeEntries:
            this.currentUser.role === "owner" ||
            this.currentUser.role === "office" ||
            this.currentUser.canApproveTime,
          canManageAssignments:
            this.currentUser.role === "owner" || this.currentUser.role === "office",
          canAssignCurrentUser:
            canAssignCurrentUserToWorkbenchJob(this.currentUser) &&
            !jobAssignments.some((assignment) => assignment.userId === this.currentUser.id),
          canCreateActionItem: canCreateWorkbenchActionItem(this.currentUser),
        };

        return {
          job,
          contactName:
            contactsById.get(job.contactId)?.companyName ??
            contactsById.get(job.contactId)?.displayName ??
            null,
          contactSubtitle: [contactsById.get(job.contactId)?.displayName, contactsById.get(job.contactId)?.phone]
            .filter(Boolean)
            .join(" · ") || null,
          assignments: jobAssignments,
          timeEntries: jobTimeEntries,
          actionItems: jobActionItems,
          permissions,
          workflow: deriveJobWorkflowFlags({
            job,
            assignmentCount: jobAssignments.length,
            unapprovedTimeEntryCount: jobTimeEntries.filter((entry) => entry.status === "pending").length,
            hasInvoiceDraft: false,
            lastActivityAt,
            now: new Date(),
          }),
        };
      });
  }

  async getJobDetail(jobId: string): Promise<WorkbenchJobDetail | null> {
    const cards = await this.listJobCards();
    const card = cards.find((item) => item.job.id === jobId);
    if (!card) {
      return null;
    }

    return {
      ...card,
      permissions: card.permissions,
    };
  }

  async listActiveTimerOverviews(): Promise<WorkbenchActiveTimerOverview[]> {
    if (!(this.currentUser.role === "owner" || this.currentUser.role === "office")) {
      return [];
    }

    const [timers, jobs, usersResponse] = await Promise.all([
      this.activeTimers.list(),
      this.jobs.list(),
      this.client
        .from("users")
        .select("id, full_name")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null),
    ]);

    if (usersResponse.error) {
      throw usersResponse.error;
    }

    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const usersById = new Map((usersResponse.data ?? []).map((user) => [user.id, user.full_name]));

    return timers
      .flatMap((timer) => {
        const job = jobsById.get(timer.jobId);
        if (!job) {
          return [];
        }

        return [{
          timerId: String(timer.id),
          userId: String(timer.userId),
          userName: usersById.get(timer.userId) ?? "Unknown user",
          jobId: String(timer.jobId),
          jobNumber: job.number,
          jobTitle: job.title,
          startedAt: timer.startedAt,
          description: timer.description,
        }];
      })
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }

  getWorkbenchCapabilities() {
    return {
      canCreateJob: canCreateWorkbenchJob(this.currentUser),
      canCreateActionItem: canCreateWorkbenchActionItem(this.currentUser),
      canAssignCurrentUser: canAssignCurrentUserToWorkbenchJob(this.currentUser),
      canManageAssignments: this.currentUser.role === "owner" || this.currentUser.role === "office",
      canCreateContact: canCreateWorkbenchJob(this.currentUser),
      canViewAllActiveTimers: this.currentUser.role === "owner" || this.currentUser.role === "office",
    };
  }

  async listAssignableUsers(): Promise<WorkbenchAssignableUserOption[]> {
    if (!["owner", "office", "field"].includes(this.currentUser.role)) {
      throw new Error("You cannot view job assignments.");
    }

    const { data, error } = await this.client
      .from("users")
      .select("id, full_name, role")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .in("role", ["owner", "office", "field"])
      .order("full_name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((user) => ({
      id: String(user.id),
      label: user.full_name,
      role: String(user.role),
    }));
  }

  async listContactOptions(search?: string): Promise<WorkbenchContactOption[]> {
    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot access job contact options.");
    }

    const contacts = search
      ? await this.contacts.list({ filter: { search } })
      : await this.contacts.list();

    return contacts.map((contact) => ({
      id: contact.id,
      label: contact.displayName,
      subtitle: [contact.companyName, contact.email, contact.phone].filter(Boolean).join(" · ") || null,
    }));
  }

  async createQuickContact(input: {
    displayName: string;
    email?: string;
    phone?: string;
  }): Promise<WorkbenchContactOption> {
    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot create contacts.");
    }

    console.info("[WorkbenchService] createQuickContact input", {
      input,
      context: {
        orgId: this.context.orgId,
        actorUserId: this.context.actorUserId,
      },
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });

    const contact = await this.contacts.create({
      type: "person",
      displayName: input.displayName,
      email: input.email ?? null,
      phone: input.phone ?? null,
    });

    return {
      id: contact.id,
      label: contact.displayName,
      subtitle: [contact.email, contact.phone].filter(Boolean).join(" · ") || null,
    };
  }

  async createJob(input: { title: string; description: string; contactId: string; estimatedHours?: number | null }): Promise<Job> {
    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot create jobs.");
    }

    console.info("[WorkbenchService] createJob input", {
      input,
      context: this.context,
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });
    const { data: org, error: orgError } = await this.client
      .from("orgs")
      .select("settings")
      .eq("id", this.context.orgId)
      .single();

    if (orgError) {
      throw orgError;
    }

    const numbering = getNumberingConfig("job", readOrgBusinessSettings(org.settings));

    const { data, error } = await this.client
      .rpc("fn_next_org_number", {
        p_org_id: this.context.orgId,
        p_type: numbering.counterType,
        p_prefix: numbering.prefix,
      });

    if (error) {
      throw error;
    }

    const estimatedHours =
      input.estimatedHours == null
        ? null
        : Number.isFinite(input.estimatedHours) && input.estimatedHours > 0
          ? Number(input.estimatedHours)
          : (() => {
              throw new Error("Estimated hours must be greater than 0.");
            })();

    const createdJob = await this.jobs.create({
      number: data,
      contactId: input.contactId as Job["contactId"],
      title: input.title,
      description: input.description,
      estimatedHours,
    });

    console.info("[WorkbenchService] createJob local result", createdJob);

    const pendingQueueCountBeforeFlush = await localDb.syncQueue.count();
    console.info("[WorkbenchService] createJob queue before flush", {
      pendingQueueCountBeforeFlush,
    });

    await this.flushAndRefreshWorkbench({ force: true, reason: "createJob" });

    const pendingQueueCountAfterFlush = await localDb.syncQueue.count();
    console.info("[WorkbenchService] createJob queue after flush", {
      pendingQueueCountAfterFlush,
    });

    return createdJob;
  }

  async updateJobBasics(input: {
    jobId: string;
    title: string;
    description: string;
    contactId: string;
    estimatedHours?: number | null;
  }): Promise<Job> {
    console.info("[WorkbenchService] updateJobBasics input", {
      input,
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });

    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot edit jobs.");
    }

    const estimatedHours =
      input.estimatedHours == null
        ? null
        : Number.isFinite(input.estimatedHours) && input.estimatedHours > 0
          ? Number(input.estimatedHours)
          : (() => {
              throw new Error("Estimated hours must be greater than 0.");
            })();

    const updatedJob = await this.jobs.update(input.jobId, {
      title: input.title.trim(),
      description: input.description.trim() || null,
      contactId: input.contactId as Job["contactId"],
      estimatedHours,
    });

    console.info("[WorkbenchService] updateJobBasics local result", updatedJob);
    await this.flushAndRefreshWorkbench({ force: true, reason: "updateJobBasics" });
    return this.confirmAuthoritativeJobState(
      input.jobId,
      (job) =>
        job.title === updatedJob.title &&
        (job.description ?? null) === (updatedJob.description ?? null) &&
        job.contactId === updatedJob.contactId &&
        (job.estimatedHours ?? null) === (updatedJob.estimatedHours ?? null),
      "Job update was queued locally, but the authoritative job record did not match after sync.",
    );
  }

  async updateJobStatus(input: {
    jobId: string;
    status: Job["status"];
    waitingReason?: Job["waitingReason"] | null;
  }): Promise<Job> {
    console.info("[WorkbenchService] updateJobStatus input", {
      input,
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });

    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot update job status.");
    }

    const currentJob = await this.jobs.getById(input.jobId);
    if (!currentJob) {
      throw new Error("Job not found.");
    }
    if (
      currentJob.status === input.status &&
      (currentJob.waitingReason ?? null) === (input.status === "waiting" ? (input.waitingReason ?? "other") : null)
    ) {
      return currentJob;
    }

    const allowedStatuses = getAllowedNextJobStatuses(currentJob.status);
    if (!allowedStatuses.includes(input.status)) {
      throw new Error(`Invalid job status transition: ${currentJob.status} -> ${input.status}.`);
    }

    const updatedJob = await this.jobs.update(input.jobId, {
      status: input.status,
      waitingReason: input.status === "waiting" ? (input.waitingReason ?? "other") : null,
    });

    console.info("[WorkbenchService] updateJobStatus local result", updatedJob);
    try {
      await this.flushAndRefreshWorkbench({ force: true, reason: "updateJobStatus" });
    } catch (error) {
      const recovery = await this.discardInvalidQueuedJobStatusUpdate(error);
      if (recovery.discarded) {
        throw new Error(recovery.message ?? "Invalid queued job status update was discarded.");
      }
      throw error;
    }
    return this.confirmAuthoritativeJobState(
      input.jobId,
      (job) =>
        job.status === updatedJob.status &&
        (job.waitingReason ?? null) === (updatedJob.waitingReason ?? null),
      "Job status update did not match the authoritative backend state after sync.",
    );
  }

  async archiveJob(jobId: string): Promise<void> {
    console.info("[WorkbenchService] archiveJob input", {
      jobId,
      currentUser: {
        id: this.currentUser.id,
        role: this.currentUser.role,
      },
    });

    if (!canCreateWorkbenchJob(this.currentUser)) {
      throw new Error("You cannot archive jobs.");
    }

    await this.jobs.softDelete(jobId);
    await this.flushAndRefreshWorkbench({ force: true, reason: "archiveJob" });
  }

  async getJobWorkspace(job: Job): Promise<JobWorkspaceData> {
    const now = new Date().toISOString();
    const [contact, notes, attachments, scheduleBlocks, linkedQuote, linkedQuoteLineItems, jobEvents, catalogItems, jobMaterials, timeEntries, assignableUsers, assemblyOptions, orgResponse, invoicesResponse] = await Promise.all([
      this.contacts.getById(job.contactId),
      this.notes.list({ entityType: "jobs", entityId: job.id }),
      this.documents.list({ entityType: "jobs", entityId: job.id }),
      this.scheduleBlocks.list({ filter: { jobId: job.id, from: now } }),
      job.quoteId
        ? this.client
            .from("quotes")
            .select("id, number, status, subtotal, total, labor_cost_rate, labor_sell_rate")
            .eq("org_id", this.context.orgId)
            .eq("id", job.quoteId)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      job.quoteId ? this.quoteLineItems.listByQuoteIds([job.quoteId]) : Promise.resolve([]),
      this.client
        .from("entity_events")
        .select("*")
        .eq("org_id", this.context.orgId)
        .eq("entity_type", "jobs")
        .eq("entity_id", job.id)
        .order("emitted_at", { ascending: false })
        .limit(25),
      this.catalogItems.list({ filter: { includeInactive: false } }),
      this.jobMaterials.list({ filter: { jobId: job.id } }),
      this.timeEntries.list({ filter: { jobId: job.id } }),
      this.listAssignableUsers().catch(() => []),
      this.buildAssemblyViews().catch(() => []),
      this.client.from("orgs").select("settings").eq("id", this.context.orgId).single(),
      this.client
        .from("invoices")
        .select("*")
        .eq("org_id", this.context.orgId)
        .eq("job_id", job.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (linkedQuote.error) {
      throw linkedQuote.error;
    }

    if (jobEvents.error) {
      const message = String(jobEvents.error.message ?? "");
      if (!message.toLowerCase().includes("row-level security")) {
        throw jobEvents.error;
      }
    }
    if (orgResponse.error) {
      throw orgResponse.error;
    }
    if (invoicesResponse.error) {
      throw invoicesResponse.error;
    }

    const invoiceIds = (invoicesResponse.data ?? []).map((invoice) => invoice.id);
    const [invoiceLinesResponse, paymentsResponse] = await Promise.all([
      invoiceIds.length
        ? this.client
            .from("invoice_line_items")
            .select("*")
            .eq("org_id", this.context.orgId)
            .in("invoice_id", invoiceIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? this.client
            .from("payments")
            .select("*")
            .eq("org_id", this.context.orgId)
            .in("invoice_id", invoiceIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (invoiceLinesResponse.error) {
      throw invoiceLinesResponse.error;
    }
    if (paymentsResponse.error) {
      throw paymentsResponse.error;
    }

    const settings = readOrgBusinessSettings(orgResponse.data.settings);
    const paymentsByInvoiceId = new Map<string, number>();
    for (const payment of (paymentsResponse.data ?? []) as PaymentRow[]) {
      paymentsByInvoiceId.set(
        payment.invoice_id,
        roundMoney((paymentsByInvoiceId.get(payment.invoice_id) ?? 0) + payment.amount),
      );
    }
    const invoiceLinesByInvoiceId = new Map<string, InvoiceLineRow[]>();
    for (const line of (invoiceLinesResponse.data ?? []) as InvoiceLineRow[]) {
      const current = invoiceLinesByInvoiceId.get(line.invoice_id) ?? [];
      current.push(line);
      invoiceLinesByInvoiceId.set(line.invoice_id, current);
    }
    const invoices: SavedInvoiceSummary[] = (invoicesResponse.data ?? []).map((invoice) => ({
      id: invoice.id as SavedInvoiceSummary["id"],
      jobId: invoice.job_id as SavedInvoiceSummary["jobId"],
      contactId: invoice.contact_id as SavedInvoiceSummary["contactId"],
      number: invoice.number,
      status: invoice.status,
      createdAt: invoice.created_at,
      dueDate: invoice.due_date,
      subtotal: invoice.subtotal,
      taxRate: invoice.tax_rate,
      taxAmount: invoice.tax_amount,
      total: invoice.total,
      customerNotes: invoice.customer_notes,
      internalNotes: invoice.internal_notes,
      lines: (invoiceLinesByInvoiceId.get(invoice.id) ?? []).map((line) => ({
        id: line.id as SavedInvoiceSummary["lines"][number]["id"],
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        subtotal: line.subtotal,
        sectionName: line.section_name,
        sortOrder: line.sort_order,
      })),
    }));
    const invoiceSubtotal = roundMoney(invoices.reduce((total, invoice) => total + invoice.subtotal, 0));
    const invoiceTotal = roundMoney(invoices.reduce((total, invoice) => total + invoice.total, 0));
    const invoiceCollected = roundMoney(
      (invoicesResponse.data ?? []).reduce(
        (total, invoice) => total + Math.max(invoice.amount_paid ?? 0, paymentsByInvoiceId.get(invoice.id) ?? 0),
        0,
      ),
    );
    const lastInvoiceDate =
      invoices.length > 0
        ? invoices
            .map((invoice) => invoice.createdAt)
            .sort((left, right) => right.localeCompare(left))[0] ?? null
        : null;
    const invoiceLaborRevenue = roundMoney(
      invoices.reduce(
        (total, invoice) =>
          total + invoice.lines.filter(isLaborInvoiceLine).reduce((lineTotal, line) => lineTotal + line.subtotal, 0),
        0,
      ),
    );
    const savedInvoiceSell =
      invoices.length > 0
        ? {
            subtotal: invoiceSubtotal,
            total: invoiceTotal,
            laborRevenue: invoiceLaborRevenue,
            materialRevenue: roundMoney(invoiceSubtotal - invoiceLaborRevenue),
            count: invoices.length,
            collected: invoiceCollected,
            lastInvoiceDate,
          }
        : null;

    const nextScheduledWork =
      scheduleBlocks
        .filter((block) => block.endAt >= now)
        .sort((left, right) => left.startAt.localeCompare(right.startAt))[0] ?? null;

    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const toMaterialView = (entry: typeof jobMaterials[number]): JobMaterialView | null => {
      const catalogItem = catalogById.get(entry.catalogItemId);
      if (!catalogItem) {
        return null;
      }

      return {
        ...entry,
        materialName: entry.displayName ?? catalogItem.name,
        materialSku: entry.skuSnapshot ?? catalogItem.sku,
        materialUnit: entry.unitSnapshot ?? catalogItem.unit,
        currentCatalogCost: catalogItem.costPrice,
        currentCatalogUnitPrice: catalogItem.unitPrice,
      };
    };

    const materialCatalogOptions = catalogItems.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      costPrice: item.costPrice,
      unitPrice: item.unitPrice,
    }));
    const usedMaterials = jobMaterials
      .filter((entry) => entry.kind === "used")
      .map(toMaterialView)
      .filter((entry): entry is JobMaterialView => Boolean(entry));
    const neededMaterials = jobMaterials
      .filter((entry) => entry.kind === "needed")
      .map(toMaterialView)
      .filter((entry): entry is JobMaterialView => Boolean(entry));
    const estimatedMaterials =
      linkedQuoteLineItems.length > 0
        ? quoteLineItemsToEstimateMaterialSnapshot(linkedQuoteLineItems)
        : normalizeEstimateMaterialSnapshotLines(job.estimateSnapshot?.materials ?? []);

    const performance = computeJobPerformanceSummary({
      job,
      estimatedMaterialLines: estimatedMaterials,
      linkedQuote: linkedQuote.data
        ? {
            subtotal: linkedQuote.data.subtotal,
            total: linkedQuote.data.total,
            laborCostRate: linkedQuote.data.labor_cost_rate,
            laborSellRate: linkedQuote.data.labor_sell_rate,
          }
        : null,
      settingsDefaults: {
        laborCostRate: settings.defaultLaborCostRate,
        laborSellRate: settings.defaultLaborSellRate,
        materialMarkupPercent: settings.defaultMaterialMarkup,
      },
      savedInvoiceSell,
      catalogItems,
      jobMaterials,
      timeEntries,
      canViewFinancials: this.currentUser.role !== "field",
    });

    const userNamesById = new Map(assignableUsers.map((user) => [user.id, user.label]));

    const activity: JobActivityEntry[] = [
      ...notes.map((note) => ({
        id: `note:${note.id}`,
        type: "note" as const,
        title: "Note added",
        body: note.body,
        createdAt: note.createdAt,
      })),
      ...attachments.map((attachment) => ({
        id: `upload:${attachment.id}`,
        type: "upload" as const,
        title: "Attachment uploaded",
        body: attachment.fileName,
        createdAt: attachment.createdAt,
      })),
      ...timeEntries.map((entry) => {
        const workedBy = userNamesById.get(String(entry.userId)) ?? "Unknown worker";
        const enteredBy = userNamesById.get(String(entry.createdBy)) ?? workedBy;
        const actorText = entry.createdBy && entry.createdBy !== entry.userId ? ` by ${enteredBy}` : ` by ${workedBy}`;

        return {
          id: `time:${entry.id}`,
          type: "time_entry" as const,
          title: `${entry.hours.toFixed(2)}h added for ${workedBy}${actorText}`,
          body: entry.description ?? null,
          createdAt: entry.createdAt,
        };
      }),
      ...((jobEvents.data ?? []).map((event) => this.toJobActivityEntry(event)) ?? []),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      contactName: contact?.displayName ?? null,
      contactSubtitle: contact ? [contact.companyName, contact.phone, contact.email].filter(Boolean).join(" · ") || null : null,
      linkedQuote: linkedQuote.data
        ? {
            id: linkedQuote.data.id as NonNullable<JobWorkspaceData["linkedQuote"]>["id"],
            number: linkedQuote.data.number,
            status: linkedQuote.data.status,
          }
        : null,
      nextScheduledWork,
      notes,
      attachments,
      invoices,
      activity,
      materialCatalogOptions,
      assemblyOptions,
      estimatedMaterials,
      usedMaterials,
      neededMaterials,
      timeEntries,
      pricingDefaults: {
        laborCostRate: settings.defaultLaborCostRate,
        laborSellRate: settings.defaultLaborSellRate,
        materialMarkupPercent: settings.defaultMaterialMarkup,
      },
      performance,
    };
  }

  async createJobNote(jobId: string, body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error("Add a note before saving.");
    }

    return this.notes.create({
      entityType: "jobs",
      entityId: jobId,
      body: trimmedBody,
      isInternal: true,
    });
  }

  async uploadJobAttachment(jobId: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${this.context.orgId}/jobs/${jobId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await this.client.storage
      .from("job-attachments")
      .upload(storagePath, file, {
        ...(file.type ? { contentType: file.type } : {}),
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    return this.documents.create({
      entityType: "jobs",
      entityId: jobId,
      category: this.inferDocumentCategory(file),
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: Number.isFinite(file.size) ? file.size : null,
    });
  }

  async deleteJobAttachment(input: { attachmentId: string; storagePath: string; fileName: string }) {
    const { error: storageDeleteError } = await this.client.storage
      .from("job-attachments")
      .remove([input.storagePath]);

    if (storageDeleteError) {
      throw new Error(
        `Attachment delete failed in storage for ${input.fileName}: ${storageDeleteError.message}`,
      );
    }

    try {
      await this.documents.softDelete(input.attachmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown documents delete error.";
      throw new Error(
        `Attachment file was removed, but documents metadata delete failed for ${input.fileName}: ${message}`,
      );
    }
  }

  async getAttachmentAccessUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from("job-attachments")
      .createSignedUrl(storagePath, 60 * 15);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  async getAttachmentPreviewUrls(storagePaths: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(
      storagePaths.map(async (storagePath) => {
        const signedUrl = await this.getAttachmentAccessUrl(storagePath);
        return [storagePath, signedUrl] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  async createJobMaterial(input: {
    jobId: string;
    catalogItemId: string;
    kind: "used" | "needed";
    quantity: number;
    note?: string | null;
    displayName?: string | null;
    skuSnapshot?: string | null;
    unitSnapshot?: string | null;
    unitCost?: number | null;
    unitSell?: number | null;
    markupPercent?: number | null;
    sectionName?: string | null;
    sourceAssemblyId?: string | null;
    sourceAssemblyName?: string | null;
    sourceAssemblyMultiplier?: number | null;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error("Material quantity must be greater than 0.");
    }

    return this.jobMaterials.create({
      jobId: input.jobId,
      catalogItemId: input.catalogItemId,
      kind: input.kind,
      quantity: Math.round(input.quantity * 100) / 100,
      note: input.note?.trim() || null,
      displayName: input.displayName?.trim() || null,
      skuSnapshot: input.skuSnapshot?.trim() || null,
      unitSnapshot: input.unitSnapshot?.trim() || null,
      unitCost: input.unitCost ?? null,
      unitSell: input.unitSell ?? null,
      markupPercent: input.markupPercent ?? null,
      sectionName: input.sectionName?.trim() || null,
      sourceAssemblyId: input.sourceAssemblyId ?? null,
      sourceAssemblyName: input.sourceAssemblyName?.trim() || null,
      sourceAssemblyMultiplier: input.sourceAssemblyMultiplier ?? null,
    });
  }

  async updateJobMaterial(input: {
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
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error("Material quantity must be greater than 0.");
    }

    return this.jobMaterials.update(input.jobMaterialId, {
      catalogItemId: input.catalogItemId,
      quantity: Math.round(input.quantity * 100) / 100,
      note: input.note?.trim() || null,
      displayName: input.displayName?.trim() || null,
      skuSnapshot: input.skuSnapshot?.trim() || null,
      unitSnapshot: input.unitSnapshot?.trim() || null,
      unitCost: input.unitCost ?? null,
      unitSell: input.unitSell ?? null,
      markupPercent: input.markupPercent ?? null,
      sectionName: input.sectionName?.trim() || null,
    });
  }

  async duplicateJobMaterial(jobMaterialId: string) {
    const existing = (await this.jobMaterials.list()).find((item) => item.id === jobMaterialId);
    if (!existing) {
      throw new Error("Material entry not found.");
    }

    return this.createJobMaterial({
      jobId: String(existing.jobId),
      catalogItemId: String(existing.catalogItemId),
      kind: existing.kind,
      quantity: existing.quantity,
      note: existing.note,
      displayName: existing.displayName,
      skuSnapshot: existing.skuSnapshot,
      unitSnapshot: existing.unitSnapshot,
      unitCost: existing.unitCost,
      unitSell: existing.unitSell,
      markupPercent: existing.markupPercent,
      sectionName: existing.sectionName,
      sourceAssemblyId: existing.sourceAssemblyId,
      sourceAssemblyName: existing.sourceAssemblyName,
      sourceAssemblyMultiplier: existing.sourceAssemblyMultiplier,
    });
  }

  async deleteJobMaterial(jobMaterialId: string) {
    await this.jobMaterials.softDelete(jobMaterialId);
  }

  async addAssemblyToJobActuals(input: {
    jobId: string;
    assemblyId: string;
    multiplier: number;
    note?: string | null;
    workDate?: string;
    workerUserId?: string | null;
    addLabor?: boolean;
    laborSellRate?: number | null;
    sectionName?: string | null;
  }) {
    if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) {
      throw new Error("Assembly multiplier must be greater than 0.");
    }

    const [assembly] = (await this.buildAssemblyViews()).filter((item) => String(item.id) === input.assemblyId);
    if (!assembly) {
      throw new Error("Assembly not found.");
    }

    for (const item of assembly.items) {
      const unitCost = item.materialCostPrice ?? 0;
      await this.createJobMaterial({
        jobId: input.jobId,
        catalogItemId: String(item.catalogItemId),
        kind: "used",
        quantity: this.roundQuantity(item.quantity * input.multiplier),
        note: [assembly.name, item.note, input.note].filter(Boolean).join(" · ") || null,
        displayName: item.materialName,
        skuSnapshot: item.materialSku,
        unitSnapshot: item.materialUnit,
        unitCost,
        unitSell: null,
        markupPercent: null,
        sectionName: input.sectionName?.trim() || item.sectionName?.trim() || null,
        sourceAssemblyId: String(assembly.id),
        sourceAssemblyName: assembly.name,
        sourceAssemblyMultiplier: input.multiplier,
      });
    }

    if (input.addLabor !== false && assembly.defaultLaborHours > 0) {
      await this.createTimeEntry(
        input.jobId,
        this.roundQuantity(assembly.defaultLaborHours * input.multiplier),
        [assembly.name, input.note].filter(Boolean).join(" · ") || "Assembly labour",
        input.workerUserId ?? this.currentUser.id,
        input.workDate ?? new Date().toISOString().slice(0, 10),
        null,
        null,
        null,
        input.sectionName?.trim() || null,
      );
    }
  }

  private inferDocumentCategory(file: File) {
    const mime = file.type.toLowerCase();
    const lowerName = file.name.toLowerCase();

    if (mime.startsWith("image/")) {
      return "photo" as const;
    }

    if (mime.includes("pdf") || mime.includes("html") || lowerName.endsWith(".pdf") || lowerName.endsWith(".html")) {
      return "report" as const;
    }

    return "other" as const;
  }

  private toJobActivityEntry(event: Database["public"]["Tables"]["entity_events"]["Row"]): JobActivityEntry {
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (event.event_type === "jobs.status_changed") {
      const fromStatus = typeof payload.from_status === "string" ? payload.from_status.replaceAll("_", " ") : null;
      const toStatus = typeof payload.to_status === "string" ? payload.to_status.replaceAll("_", " ") : "updated";

      return {
        id: `event:${event.id}`,
        type: "job_event",
        title: "Job status changed",
        body: fromStatus ? `${fromStatus} → ${toStatus}` : toStatus,
        createdAt: event.emitted_at,
      };
    }

    if (event.event_type === "jobs.created") {
      return {
        id: `event:${event.id}`,
        type: "job_event",
        title: "Job created",
        body: null,
        createdAt: event.emitted_at,
      };
    }

    return {
      id: `event:${event.id}`,
      type: "job_event",
      title: event.event_type.replace("jobs.", "").replaceAll("_", " "),
      body: null,
      createdAt: event.emitted_at,
    };
  }

  async assignCurrentUserToJob(jobId: string): Promise<JobAssignment> {
    console.info("[WorkbenchService] assignCurrentUserToJob input", {
      jobId,
      currentUserId: this.currentUser.id,
      currentUserRole: this.currentUser.role,
      orgId: this.context.orgId,
    });

    const existingAssignments = await this.jobAssignments.list({
      filter: { jobId: jobId as JobAssignment["jobId"] },
    });
    const existingAssignment = existingAssignments.find(
      (assignment) => assignment.userId === this.currentUser.id && assignment.deletedAt === null,
    );

    console.info("[WorkbenchService] assignCurrentUserToJob existing assignments", {
      jobId,
      existingAssignmentIds: existingAssignments.map((assignment) => assignment.id),
      currentUserAlreadyAssigned: Boolean(existingAssignment),
    });

    if (existingAssignment) {
      return existingAssignment;
    }

    const assignment = await this.jobAssignments.create({
      jobId: jobId as JobAssignment["jobId"],
      userId: this.currentUser.id,
      assignmentRole: this.currentUser.isForeman ? "lead" : "technician",
      assignedBy: this.currentUser.id,
    });

    console.info("[WorkbenchService] assignCurrentUserToJob local result", assignment);
    await this.sync.flushPendingQueue();
    console.info("[WorkbenchService] assignCurrentUserToJob push result", {
      queueCount: await localDb.syncQueue.count(),
    });

    return assignment;
  }

  async assignJobToUser(jobId: string, userId: string): Promise<JobAssignment> {
    if (!(this.currentUser.role === "owner" || this.currentUser.role === "office")) {
      throw new Error("You cannot manage job assignments.");
    }

    const [existingAssignments, assignableUsers] = await Promise.all([
      this.jobAssignments.list({
        filter: { jobId: jobId as JobAssignment["jobId"] },
      }),
      this.listAssignableUsers(),
    ]);

    const selectedUser = assignableUsers.find((user) => user.id === userId);
    if (!selectedUser) {
      throw new Error("Assigned user could not be found.");
    }

    const existingAssignment = existingAssignments.find(
      (assignment) => assignment.userId === userId && assignment.deletedAt === null,
    );

    if (existingAssignment) {
      return existingAssignment;
    }

    const assignment = await this.jobAssignments.create({
      jobId: jobId as JobAssignment["jobId"],
      userId: userId as JobAssignment["userId"],
      assignmentRole: selectedUser.role === "field" ? "technician" : "lead",
      assignedBy: this.currentUser.id,
    });

    await this.sync.flushPendingQueue();
    return assignment;
  }

  async removeJobAssignment(assignmentId: string): Promise<void> {
    if (!(this.currentUser.role === "owner" || this.currentUser.role === "office")) {
      throw new Error("You cannot manage job assignments.");
    }

    await this.jobAssignments.softDelete(assignmentId);
    await this.sync.flushPendingQueue();
  }

  async createTimeEntry(
    jobId: string,
    hours: number,
    description: string,
    workedByUserId: string = this.currentUser.id,
    workDate = new Date().toISOString().slice(0, 10),
    startTime: string | null = null,
    endTime: string | null = null,
    hourlyRate: number | null = null,
    sectionName: string | null = null,
  ): Promise<TimeEntry> {
    console.info("[WorkbenchService] createTimeEntry input", {
      jobId,
      hours,
      description,
      workedByUserId,
      workDate,
      startTime,
      endTime,
      hourlyRate,
      sectionName,
      currentUserId: this.currentUser.id,
      orgId: this.context.orgId,
    });

    const entry = await this.timeEntries.create({
      jobId: jobId as TimeEntry["jobId"],
      userId: workedByUserId as TimeEntry["userId"],
      workDate,
      startTime,
      endTime,
      hours,
      description,
      sectionName: sectionName?.trim() || null,
      hourlyRate,
      createdBy: this.currentUser.id,
    });

    console.info("[WorkbenchService] createTimeEntry local result", entry);
    await this.sync.flushPendingQueue();
    console.info("[WorkbenchService] createTimeEntry push result", {
      queueCount: await localDb.syncQueue.count(),
    });

    return entry;
  }

  async restoreActiveTimerDraft(): Promise<TimeEntryDraft | null> {
    await this.sync.refreshWorkbench();
    const activeTimer = await this.activeTimers.getCurrentForUser(this.currentUser.id);
    if (!activeTimer) {
      await this.activeTimers.clearLocalForUser(this.currentUser.id);
      return null;
    }
    return activeTimer ? createDraftFromActiveTimer(activeTimer) : null;
  }

  async startActiveTimer(jobId: string, description: string): Promise<TimeEntryDraft> {
    const existingTimer = await this.activeTimers.getCurrentForUser(this.currentUser.id);
    if (existingTimer) {
      return createDraftFromActiveTimer(existingTimer);
    }

    await this.activeTimers.deleteRemoteForUser(this.currentUser.id);
    await this.activeTimers.clearLocalForUser(this.currentUser.id);

    const timer = await this.activeTimers.create({
      jobId: jobId as ActiveTimer["jobId"],
      userId: this.currentUser.id,
      startedAt: new Date().toISOString(),
      description,
      createdBy: this.currentUser.id,
    });

    await this.sync.flushPendingQueue();
    const authoritativeTimer = await this.activeTimers.getCurrentForUser(this.currentUser.id);
    console.info("[WorkbenchService] startActiveTimer post-create state", {
      createdActiveTimerId: timer.id,
      authoritativeActiveTimerId: authoritativeTimer?.id ?? null,
      authoritativeJobId: authoritativeTimer?.jobId ?? null,
    });

    if (!authoritativeTimer) {
      throw new Error("Active timer start did not persist. The active_timers row could not be confirmed.");
    }

    return createDraftFromActiveTimer(authoritativeTimer);
  }

  async persistActiveTimerDraft(draft: TimeEntryDraft): Promise<ActiveTimer | null> {
    if (!draft.activeTimerId || draft.endedAt !== null) {
      return null;
    }

    const timer = await this.activeTimers.update(draft.activeTimerId, {
      jobId: draft.jobId as ActiveTimer["jobId"],
      startedAt: draft.startedAt,
      description: draft.description.trim(),
      updatedBy: this.currentUser.id,
    });

    void this.sync.flushPendingQueue().catch((error) => {
      console.error("[WorkbenchService] persistActiveTimerDraft background flush error", error);
    });

    return timer;
  }

  async stopActiveTimer(activeTimerId: string): Promise<void> {
    console.info("[WorkbenchService] stopActiveTimer requested", {
      requestedActiveTimerId: activeTimerId,
      currentUserId: this.currentUser.id,
      orgId: this.context.orgId,
    });

    const authoritativeTimer = await this.activeTimers.getCurrentForUser(this.currentUser.id);
    const timerIdToStop = authoritativeTimer?.id ?? activeTimerId;

    console.info("[WorkbenchService] stopActiveTimer resolved timer identity", {
      requestedActiveTimerId: activeTimerId,
      authoritativeActiveTimerId: authoritativeTimer?.id ?? null,
      timerIdToStop,
      authoritativeJobId: authoritativeTimer?.jobId ?? null,
    });

    await this.activeTimers.softDelete(timerIdToStop);
    await this.sync.flushPendingQueue();

    const remainingTimer = await this.activeTimers.getCurrentForUser(this.currentUser.id);
    console.info("[WorkbenchService] stopActiveTimer post-delete state", {
      timerIdToStop,
      remainingActiveTimerId: remainingTimer?.id ?? null,
      remainingJobId: remainingTimer?.jobId ?? null,
    });

    if (remainingTimer) {
      throw new Error("Active timer stop did not persist. The active_timers row is still present.");
    }

    await this.activeTimers.clearLocalForUser(this.currentUser.id);
  }

  async saveTimeEntryDraft(draft: TimeEntryDraft): Promise<TimeEntry> {
    console.info("[WorkbenchService] saveTimeEntryDraft input", {
      draft,
      currentUserId: this.currentUser.id,
      orgId: this.context.orgId,
    });

    const hours = deriveTimeEntryDraftHours(draft);
    const workDate = deriveTimeEntryDraftWorkDate(draft);
    const validationError = validateTimeEntryDraft(draft);

    console.info("[WorkbenchService] saveTimeEntryDraft derived values", {
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      workDate,
      hours,
      validationError,
    });

    if (validationError) {
      throw new Error(validationError);
    }

    const [job, assignments] = await Promise.all([
      this.jobs.getById(draft.jobId),
      this.jobAssignments.list({ filter: { jobId: draft.jobId } }),
    ]);

    if (!job) {
      throw new Error("The selected job could not be found.");
    }

    if (!canCreateWorkbenchTimeEntry(this.currentUser, job, assignments)) {
      throw new Error("You cannot log time on this job.");
    }

    return this.createTimeEntry(job.id, hours, draft.description.trim(), String(draft.userId), workDate);
  }

  async createActionItemForJob(input: {
    jobId: string;
    title: string;
    description: string;
  }): Promise<ActionItem> {
    console.info("[WorkbenchService] createActionItemForJob input", {
      ...input,
      currentUserId: this.currentUser.id,
      orgId: this.context.orgId,
    });

    const item = await this.actionItems.create({
      entityType: "jobs",
      entityId: input.jobId,
      category: "follow_up",
      title: input.title,
      description: input.description,
      assignedTo: this.currentUser.id,
      createdBy: this.currentUser.id,
      priority: "normal",
    });

    console.info("[WorkbenchService] createActionItemForJob local result", item);
    await this.sync.flushPendingQueue();
    console.info("[WorkbenchService] createActionItemForJob push result", {
      queueCount: await localDb.syncQueue.count(),
    });

    return item;
  }

  async approveTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
    console.info("[WorkbenchService] approveTimeEntry input", {
      entryId: entry.id,
      jobId: entry.jobId,
      status: entry.status,
      currentUserId: this.currentUser.id,
      currentUserRole: this.currentUser.role,
    });

    const assignments = await this.jobAssignments.list({ filter: { jobId: entry.jobId } });
    if (!canApproveWorkbenchTimeEntry(this.currentUser, entry, assignments)) {
      throw new Error("Current user cannot approve this time entry.");
    }

    const updatedEntry = await this.timeEntries.update(entry.id, {
      status: "approved",
      approvedBy: this.currentUser.id,
      approvedAt: new Date().toISOString(),
      updatedBy: this.currentUser.id,
    });

    console.info("[WorkbenchService] approveTimeEntry local result", updatedEntry);
    await this.sync.flushPendingQueue();
    console.info("[WorkbenchService] approveTimeEntry push result", {
      queueCount: await localDb.syncQueue.count(),
    });

    return updatedEntry;
  }

  canEditTimeEntry(entry: TimeEntry): Promise<boolean> | boolean {
    return this.jobAssignments
      .list({ filter: { jobId: entry.jobId } })
      .then((assignments) => canEditWorkbenchTimeEntry(this.currentUser, entry, assignments));
  }

  async updateTimeEntry(input: {
    entryId: TimeEntry["id"];
    workDate: TimeEntry["workDate"];
    startTime?: TimeEntry["startTime"];
    endTime?: TimeEntry["endTime"];
    hours: TimeEntry["hours"];
    description: TimeEntry["description"];
    hourlyRate?: TimeEntry["hourlyRate"];
    sectionName?: TimeEntry["sectionName"];
  }): Promise<TimeEntry> {
    if (!input.workDate) {
      throw new Error("A work date is required.");
    }

    if (!Number.isFinite(input.hours) || input.hours <= 0) {
      throw new Error("Hours must be greater than 0.");
    }

    const existing = await this.timeEntries.getById(input.entryId);
    if (!existing) {
      throw new Error("Time entry not found.");
    }

    const assignments = await this.jobAssignments.list({ filter: { jobId: existing.jobId } });
    if (!canEditWorkbenchTimeEntry(this.currentUser, existing, assignments)) {
      throw new Error("You cannot edit this time entry.");
    }

    const updatedEntry = await this.timeEntries.update(existing.id, {
      workDate: input.workDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      hours: input.hours,
      description: input.description,
      sectionName: input.sectionName?.trim() || null,
      hourlyRate: input.hourlyRate ?? null,
      updatedBy: this.currentUser.id,
    });

    await this.sync.flushPendingQueue();
    return updatedEntry;
  }

  async deleteTimeEntry(entry: TimeEntry): Promise<void> {
    const assignments = await this.jobAssignments.list({ filter: { jobId: entry.jobId } });
    if (!canDeleteWorkbenchTimeEntry(this.currentUser, entry, assignments)) {
      throw new Error("You cannot delete this time entry.");
    }

    await this.timeEntries.softDelete(entry.id);
    await this.sync.flushPendingQueue();
  }

  async resolveActionItem(item: ActionItem): Promise<ActionItem> {
    console.info("[WorkbenchService] resolveActionItem input", {
      itemId: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      status: item.status,
      currentUserId: this.currentUser.id,
      currentUserRole: this.currentUser.role,
    });

    if (!canResolveWorkbenchActionItem(this.currentUser, item)) {
      throw new Error("Current user cannot resolve this action item.");
    }

    const updatedItem = await this.actionItems.update(item.id, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: this.currentUser.id,
    });

    console.info("[WorkbenchService] resolveActionItem local result", updatedItem);
    await this.sync.flushPendingQueue();
    console.info("[WorkbenchService] resolveActionItem push result", {
      queueCount: await localDb.syncQueue.count(),
    });

    return updatedItem;
  }

  async flushSyncQueue(): Promise<number> {
    const before = await localDb.syncQueue.count();
    try {
      await this.sync.flushPendingQueue({ force: true });
      await this.sync.refreshAll();
      console.info("[WorkbenchService] manual flush complete", {
        attempted: before,
        queueCount: await localDb.syncQueue.count(),
      });
    } catch (error) {
      const recovery = await this.discardInvalidQueuedJobStatusUpdate(error);
      if (recovery.discarded) {
        throw new Error(recovery.message ?? "Invalid queued job status update was discarded during flush.");
      }
      throw error;
    }
    return before;
  }

  async getQueueCount(): Promise<number> {
    return localDb.syncQueue.count();
  }

  async listFailedSyncItems(): Promise<WorkbenchFailedSyncItem[]> {
    const entries = await localDb.syncQueue
      .where("status")
      .equals("failed")
      .sortBy("createdAt");

    return entries
      .slice()
      .reverse()
      .map((entry) => ({
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        operation: entry.operation,
        createdAt: entry.createdAt,
        retryCount: entry.retryCount,
        lastError: entry.lastError,
      }));
  }

  async retrySyncItem(outboxId: string): Promise<void> {
    const entry = await localDb.syncQueue.get(outboxId);
    if (!entry) {
      throw new Error("That sync item no longer exists.");
    }

    await localDb.syncQueue.put({
      ...entry,
      status: "pending",
      nextRetryAt: null,
      lastError: null,
    });

    await this.sync.flushPendingQueue({ force: true });
    await this.sync.refreshAll();
  }

  async discardSyncItem(outboxId: string): Promise<void> {
    const existing = await localDb.syncQueue.get(outboxId);
    if (!existing) {
      return;
    }

    await localDb.syncQueue.delete(outboxId);
    await this.sync.refreshAll();
  }
}
