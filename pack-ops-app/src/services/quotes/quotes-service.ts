import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AssembliesRepositoryImpl,
  AssemblyItemsRepositoryImpl,
} from "@/data/repositories/assemblies.repository.impl";
import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import { ContactsRepositoryImpl } from "@/data/repositories/contacts.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { DocumentsRepositoryImpl } from "@/data/repositories/documents.repository.impl";
import { JobsRepositoryImpl } from "@/data/repositories/jobs.repository.impl";
import { JobMaterialsRepositoryImpl } from "@/data/repositories/job-materials.repository.impl";
import { LeadsRepositoryImpl } from "@/data/repositories/leads.repository.impl";
import { QuoteLineItemsRepositoryImpl } from "@/data/repositories/quote-line-items.repository.impl";
import { QuotesRepositoryImpl } from "@/data/repositories/quotes.repository.impl";
import { SyncEngine } from "@/data/sync/engine";
import { getSyncErrorMessage } from "@/data/sync/errors";
import { PullSyncService } from "@/data/sync/pull";
import { PushSyncService } from "@/data/sync/push";
import { WorkbenchSyncGateway } from "@/data/sync/workbench-sync-gateway";
import type { Database } from "@/data/supabase/types";
import type { Contact } from "@/domain/contacts/types";
import type { CatalogItemId } from "@/domain/ids";
import type { LeadRecord } from "@/domain/leads/types";
import type { Job, JobEstimateMaterialSnapshot, JobEstimateSnapshot } from "@/domain/jobs/types";
import type { Assembly, AssemblyView, CatalogItem } from "@/domain/materials/types";
import type {
  CreateQuoteRecordInput,
  CustomerQuotePreview,
  Quote,
  QuoteLineItem,
  QuoteLineItemInput,
  QuoteView,
  UpdateQuoteRecordInput,
} from "@/domain/quotes/types";
import { getQuoteTransitionMessage, isValidQuoteTransition } from "@/domain/quotes/status";
import type { User } from "@/domain/users/types";
import {
  buildPartAwareMaterialLineKey,
  normalizeEstimateMaterialSnapshotLines,
  quoteLineItemsToEstimateMaterialSnapshot,
} from "@/services/materials/part-material-lines";
import { getNumberingConfig, readOrgBusinessSettings } from "@/services/settings/org-settings";
import { normalizePersistenceError } from "@/services/shared/persistence-errors";

function canManageQuotes(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toDateInputValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Choose a valid expiry date.");
  }

  return date.toISOString();
}

function normalizeMoneyInput(value: number | null | undefined, label: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label} must be 0 or greater.`);
  }
  return roundMoney(normalized);
}

function normalizeQuantityInput(value: number | null | undefined): number {
  const normalized = Number(value ?? 1);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("Line quantity must be greater than 0.");
  }
  return roundQuantity(normalized);
}

function normalizeQuoteUpdateError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(getSyncErrorMessage(error, "Quote save failed."));
  }

  if (error.message.includes("Invalid quote status transition")) {
    const match = error.message.match(/Invalid quote status transition: (\w+) .+ (\w+)\.?/);
    if (match) {
      return new Error(getQuoteTransitionMessage(match[1] as Quote["status"], match[2] as Quote["status"]));
    }
    return new Error("Quote status change is not allowed.");
  }

  if (error.message.includes("tied to an invoice")) {
    return new Error("This quote is tied to an invoice. Editing is locked to avoid inconsistencies.");
  }

  return error;
}

function buildLogoDataUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  return `data:image/png;base64,${trimmed}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveScopeLines(quote: QuoteView): string[] {
  const customerNotes = quote.customerNotes?.trim() ?? "";
  if (customerNotes) {
    return customerNotes
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of quote.lineItems) {
    const normalized = line.description.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    lines.push(normalized);
  }
  return lines.slice(0, 8);
}

function deriveSuppliedItems(lineItems: QuoteLineItem[]): string[] {
  const grouped = new Map<string, { description: string; quantity: number; unit: string }>();

  for (const line of lineItems) {
    if (line.lineKind === "labor") {
      continue;
    }

    const description = line.description.trim();
    if (!description) {
      continue;
    }

    const unit = line.unit?.trim() || "each";
    const key = `${line.catalogItemId ?? ""}::${line.sku?.trim().toLowerCase() ?? ""}::${description.toLowerCase()}::${unit.toLowerCase()}`;
    const current = grouped.get(key) ?? {
      description,
      quantity: 0,
      unit,
    };
    current.quantity = roundQuantity(current.quantity + (line.quantity ?? 0));
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.description.localeCompare(right.description))
    .map((item) => `${item.description} — ${item.quantity} ${item.unit}`);
}

function mapQuoteView(quote: Quote, contact: Contact | null): QuoteView {
  const customerName = contact?.companyName?.trim() || contact?.displayName?.trim() || "Unnamed customer";
  const contactName = contact?.displayName?.trim() || customerName;
  const siteAddress = contact?.addressLine1?.trim() || null;

  return {
    ...quote,
    customerName,
    companyName: contact?.companyName?.trim() || null,
    contactName,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    siteAddress,
    linkedLeadLabel: null,
    linkedJobId: null,
    hasLinkedInvoice: false,
    attachments: [],
    lineItems: [],
    materialCostTotal: 0,
    laborHoursTotal: 0,
    laborCostTotal: 0,
    sellSubtotal: quote.subtotal,
  };
}

interface QuoteLineTotals {
  materialCostTotal: number;
  laborHoursTotal: number;
  laborCostTotal: number;
  sellSubtotal: number;
}

export interface QuoteBuilderResources {
  catalogItems: CatalogItem[];
  assemblies: AssemblyView[];
  defaultMaterialMarkup: number;
  defaultLaborCostRate: number;
  defaultLaborSellRate: number;
  defaultTaxRate: number;
  leadOptions: Array<{ id: LeadRecord["id"]; label: string }>;
}

export interface CreateQuoteInput {
  contactId: Quote["contactId"];
  leadId?: Quote["leadId"] | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  subtotal?: number;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  status?: Quote["status"];
  expiresAt?: string | null;
}

export interface UpdateQuoteInput {
  leadId?: Quote["leadId"] | null;
  customerName?: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  siteAddress?: string | null;
  title?: string;
  description?: string | null;
  notes?: string | null;
  subtotal?: number;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  status?: Quote["status"];
  expiresAt?: string | null;
  lineItems?: QuoteLineItemInput[];
}

export interface AcceptQuoteInput {
  title?: string;
  description?: string | null;
  notes?: string | null;
  subtotal?: number;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  expiresAt?: string | null;
  lineItems?: QuoteLineItemInput[];
}

export interface CreateStandaloneQuoteInput {
  customerName: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  siteAddress?: string | null;
  leadId?: Quote["leadId"] | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  laborCostRate?: number;
  laborSellRate?: number;
  taxRate?: number;
  status?: Quote["status"];
  expiresAt?: string | null;
  lineItems?: QuoteLineItemInput[];
}

export class QuotesService {
  readonly contacts;
  readonly leads;
  readonly quotes;
  readonly quoteLineItems;
  readonly jobs;
  readonly jobMaterials;
  readonly documents;
  readonly catalogItems;
  readonly assemblies;
  readonly assemblyItems;
  readonly sync;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    const gateway = new WorkbenchSyncGateway(client);
    this.contacts = new ContactsRepositoryImpl(context, client);
    this.leads = new LeadsRepositoryImpl(context, client);
    this.quotes = new QuotesRepositoryImpl(context, client);
    this.quoteLineItems = new QuoteLineItemsRepositoryImpl(context, client);
    this.jobs = new JobsRepositoryImpl(context, client);
    this.jobMaterials = new JobMaterialsRepositoryImpl(context, client);
    this.documents = new DocumentsRepositoryImpl(context, client);
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
    this.assemblies = new AssembliesRepositoryImpl(context, client);
    this.assemblyItems = new AssemblyItemsRepositoryImpl(context, client);
    this.sync = new SyncEngine({
      push: new PushSyncService(gateway),
      pull: new PullSyncService(gateway),
    });
  }

  private assertCanManageQuotes() {
    if (!canManageQuotes(this.currentUser)) {
      throw new Error("You cannot manage quotes.");
    }
  }

  private validateTitle(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error("Project / site is required.");
    }
    return normalized;
  }

  private validateCustomerName(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error("Customer name is required.");
    }
    return normalized;
  }

  private async buildLeadOptions(): Promise<Array<{ id: LeadRecord["id"]; label: string }>> {
    const [leadRecords, contacts] = await Promise.all([this.leads.list(), this.contacts.list()]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

    return leadRecords
      .map((lead) => {
        const contact = contactsById.get(lead.contactId) ?? null;
        const customerName =
          contact?.companyName?.trim() || contact?.displayName?.trim() || "Unnamed customer";
        const projectSite = lead.projectSite.trim() || "Untitled lead";
        return {
          id: lead.id,
          label: `${customerName} — ${projectSite}`,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  private async buildAssemblyViews(): Promise<AssemblyView[]> {
    const assemblies = await this.assemblies.list();
    if (assemblies.length === 0) {
      return [];
    }

    const [items, catalogItems] = await Promise.all([
      this.assemblyItems.listByAssemblyIds(assemblies.map((assembly) => assembly.id)),
      this.catalogItems.list({ filter: { includeInactive: true } }),
    ]);

    const materialsById = new Map(catalogItems.map((item) => [item.id, item]));
    const itemsByAssemblyId = new Map<string, typeof items>();

    for (const item of items) {
      const current = itemsByAssemblyId.get(item.assemblyId) ?? [];
      current.push(item);
      itemsByAssemblyId.set(item.assemblyId, current);
    }

    return assemblies.map((assembly) => {
      const viewItems = (itemsByAssemblyId.get(assembly.id) ?? []).map((item) => {
        const material = materialsById.get(item.catalogItemId);
        const lineMaterialCost = (material?.costPrice ?? 0) * item.quantity;

        return {
          ...item,
          materialName: material?.name ?? "Unknown material",
          materialSku: material?.sku ?? null,
          materialUnit: material?.unit ?? "each",
          materialCostPrice: material?.costPrice ?? null,
          lineMaterialCost: roundMoney(lineMaterialCost),
        };
      });

      return {
        ...assembly,
        items: viewItems,
        materialCostTotal: roundMoney(
          viewItems.reduce((total, item) => total + item.lineMaterialCost, 0),
        ),
      };
    });
  }

  async getQuoteBuilderResources(): Promise<QuoteBuilderResources> {
    this.assertCanManageQuotes();
    const [catalogItems, assemblies, leadOptions, orgResponse] = await Promise.all([
      this.catalogItems.list({ filter: { includeInactive: false } }),
      this.buildAssemblyViews(),
      this.buildLeadOptions(),
      this.client.from("orgs").select("settings").eq("id", this.context.orgId).single(),
    ]);
    if (orgResponse.error) {
      throw orgResponse.error;
    }
    const settings = readOrgBusinessSettings(orgResponse.data.settings);
    return {
      catalogItems,
      assemblies,
      defaultMaterialMarkup: settings.defaultMaterialMarkup,
      defaultLaborCostRate: settings.defaultLaborCostRate,
      defaultLaborSellRate: settings.defaultLaborSellRate,
      defaultTaxRate: settings.defaultTaxRate,
      leadOptions,
    };
  }

  private async getOrgBusinessSettings() {
    const { data, error } = await this.client
      .from("orgs")
      .select("settings")
      .eq("id", this.context.orgId)
      .single();

    if (error) {
      throw error;
    }

    return readOrgBusinessSettings(data.settings);
  }

  private async getCustomerQuotePreviewData(quoteId: Quote["id"]): Promise<CustomerQuotePreview> {
    this.assertCanManageQuotes();

    const quote = await this.quotes.getById(quoteId);
    if (!quote) {
      throw new Error("Quote not found.");
    }

    const [contact, lineItems, orgResponse, appSettingsResponse] = await Promise.all([
      this.contacts.getById(quote.contactId),
      this.quoteLineItems.listByQuoteIds([quote.id]),
      this.client.from("orgs").select("name, settings").eq("id", this.context.orgId).single(),
      this.client.from("app_settings").select("logo_b64").maybeSingle(),
    ]);

    if (orgResponse.error) {
      throw normalizePersistenceError(orgResponse.error, {
        entityLabel: "Quote preview",
        operation: "load",
        table: "orgs",
      });
    }

    if (!contact) {
      throw new Error("Quote contact could not be found.");
    }

    const view: QuoteView = {
      ...mapQuoteView(quote, contact),
      lineItems,
      linkedJobId: (await this.findJobByQuoteId(quote.id))?.id ?? null,
      ...this.computeQuoteLineTotals(lineItems),
    };

    const orgSettings = asRecord(orgResponse.data.settings);
    const addressLines = [
      asString(orgSettings?.addressLine1),
      asString(orgSettings?.addressLine2),
      [asString(orgSettings?.city), asString(orgSettings?.region), asString(orgSettings?.postalCode)]
        .filter(Boolean)
        .join(", ")
        .trim() || null,
    ].filter((line): line is string => Boolean(line));

    const termsLines = [
      quote.expiresAt ? `Pricing valid until ${toDateInputValue(quote.expiresAt)}.` : null,
      asString(orgSettings?.quoteTerms),
    ].filter((line): line is string => Boolean(line));

    return {
      company: {
        name: orgResponse.data.name,
        email: asString(orgSettings?.email),
        phone: asString(orgSettings?.phone),
        website: asString(orgSettings?.website),
        addressLines,
        logoDataUrl: buildLogoDataUrl(appSettingsResponse.data?.logo_b64 ?? null),
      },
      quote: {
        ...view,
        materialCostTotal: this.computeQuoteLineTotals(lineItems).materialCostTotal,
        laborHoursTotal: this.computeQuoteLineTotals(lineItems).laborHoursTotal,
        laborCostTotal: this.computeQuoteLineTotals(lineItems).laborCostTotal,
        sellSubtotal: this.computeQuoteLineTotals(lineItems).sellSubtotal,
      },
      issueDate: toDateInputValue(quote.createdAt) ?? new Date().toISOString().slice(0, 10),
      projectSite: quote.title,
      scopeLines: deriveScopeLines(view),
      suppliedItems: deriveSuppliedItems(lineItems),
      termsLines,
    };
  }

  async getCustomerQuotePreview(quoteId: Quote["id"]): Promise<CustomerQuotePreview> {
    return this.getCustomerQuotePreviewData(quoteId);
  }

  private normalizeQuoteLineItems(inputs: QuoteLineItemInput[] | undefined): QuoteLineItemInput[] {
    return (inputs ?? []).map((item, index) => {
      const description = item.description.trim();
      if (!description) {
        throw new Error("Each quote line needs a description.");
      }

      return {
        ...(item.id ? { id: item.id } : {}),
        ...(item.catalogItemId !== undefined ? { catalogItemId: item.catalogItemId ?? null } : {}),
        sortOrder: item.sortOrder ?? index,
        description,
        sku: item.sku?.trim() || null,
        note: item.note?.trim() || null,
        sectionName: item.sectionName?.trim() || null,
        sourceType: item.sourceType,
        lineKind: item.lineKind ?? "item",
        quantity: normalizeQuantityInput(item.quantity),
        unit: item.unit?.trim() || "each",
        unitCost: normalizeMoneyInput(item.unitCost, "Unit cost"),
        unitSell: normalizeMoneyInput(item.unitSell, "Unit sell"),
      };
    });
  }

  private computeQuoteLineTotals(lineItems: QuoteLineItemInput[] | QuoteLineItem[]): QuoteLineTotals {
    return lineItems.reduce<QuoteLineTotals>(
      (totals, line) => {
        const quantity = normalizeQuantityInput(line.quantity);
        const unitCost = normalizeMoneyInput(line.unitCost, "Unit cost");
        const unitSell = normalizeMoneyInput(line.unitSell, "Unit sell");
        const lineTotalCost = roundMoney(unitCost * quantity);
        const lineTotalSell = roundMoney(unitSell * quantity);

        if ((line.lineKind ?? "item") === "labor") {
          totals.laborHoursTotal = roundQuantity(totals.laborHoursTotal + quantity);
          totals.laborCostTotal = roundMoney(totals.laborCostTotal + lineTotalCost);
        } else {
          totals.materialCostTotal = roundMoney(totals.materialCostTotal + lineTotalCost);
        }

        totals.sellSubtotal = roundMoney(totals.sellSubtotal + lineTotalSell);
        return totals;
      },
      {
        materialCostTotal: 0,
        laborHoursTotal: 0,
        laborCostTotal: 0,
        sellSubtotal: 0,
      },
    );
  }

  private async syncQuoteLineItems(quoteId: Quote["id"], inputs: QuoteLineItemInput[] | undefined): Promise<QuoteLineItem[]> {
    if (inputs === undefined) {
      try {
        return await this.quoteLineItems.listByQuoteIds([quoteId]);
      } catch (error) {
        throw normalizePersistenceError(error, {
          entityLabel: "Quote line items",
          operation: "load",
          table: "quote_line_items",
          migrationHint: "0027_quote_estimating_line_items.sql",
        });
      }
    }

    const normalizedItems = this.normalizeQuoteLineItems(inputs);
    let existingItems: QuoteLineItem[];
    try {
      existingItems = await this.quoteLineItems.listByQuoteIds([quoteId]);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote line items",
        operation: "load",
        table: "quote_line_items",
        migrationHint: "0027_quote_estimating_line_items.sql",
      });
    }
    const existingById = new Map(existingItems.map((item) => [item.id, item]));
    const keptIds = new Set<string>();

    try {
      for (const item of normalizedItems) {
        if (item.id && existingById.has(item.id)) {
          keptIds.add(item.id);
          await this.quoteLineItems.update(item.id, item);
        } else {
          await this.quoteLineItems.create(quoteId, item);
        }
      }

      for (const item of existingItems) {
        if (!keptIds.has(item.id) && !normalizedItems.some((nextItem) => nextItem.id === item.id)) {
          await this.quoteLineItems.hardDelete(item.id);
        }
      }
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote line items",
        operation: "save",
        table: "quote_line_items",
        migrationHint: "0027_quote_estimating_line_items.sql",
      });
    }

    try {
      return await this.quoteLineItems.listByQuoteIds([quoteId]);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote line items",
        operation: "load",
        table: "quote_line_items",
        migrationHint: "0027_quote_estimating_line_items.sql",
      });
    }
  }

  private async nextQuoteNumber(): Promise<string> {
    const settings = await this.getOrgBusinessSettings();
    const numbering = getNumberingConfig("quote", settings);
    const { data, error } = await this.client.rpc("fn_next_org_number", {
      p_org_id: this.context.orgId,
      p_type: numbering.counterType,
      p_prefix: numbering.prefix,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Could not generate a quote number.");
    }

    return data;
  }

  private async nextJobNumber(): Promise<string> {
    const settings = await this.getOrgBusinessSettings();
    const numbering = getNumberingConfig("job", settings);
    const { data, error } = await this.client.rpc("fn_next_org_number", {
      p_org_id: this.context.orgId,
      p_type: numbering.counterType,
      p_prefix: numbering.prefix,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Could not generate a job number.");
    }

    return data;
  }

  private async loadQuoteViews(quotes: Quote[]): Promise<QuoteView[]> {
    const [contacts, jobs, lineItems, leads, documents] = await Promise.all([
      this.contacts.list(),
      this.jobs.list(),
      this.quoteLineItems.listByQuoteIds(quotes.map((quote) => quote.id)),
      this.leads.list(),
      this.documents.list({ entityType: "quotes" }),
    ]);
    const jobIds = jobs.map((job) => String(job.id));
    const invoicesByJobId = new Set<string>();

    if (jobIds.length > 0) {
      const { data } = await this.client
        .from("invoices")
        .select("job_id")
        .in("job_id", jobIds)
        .is("deleted_at", null);

      for (const row of data ?? []) {
        const jobId = typeof row.job_id === "string" ? row.job_id : null;
        if (jobId) {
          invoicesByJobId.add(jobId);
        }
      }
    }

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
    const jobsByQuoteId = new Map(
      jobs
        .filter((job) => job.quoteId)
        .map((job) => [job.quoteId as Quote["id"], job]),
    );
    const lineItemsByQuoteId = new Map<string, QuoteLineItem[]>();
    const documentsByQuoteId = new Map<string, typeof documents>();

    for (const lineItem of lineItems) {
      const current = lineItemsByQuoteId.get(lineItem.quoteId) ?? [];
      current.push(lineItem);
      lineItemsByQuoteId.set(lineItem.quoteId, current);
    }

    for (const document of documents) {
      const current = documentsByQuoteId.get(String(document.entityId)) ?? [];
      current.push(document);
      documentsByQuoteId.set(String(document.entityId), current);
    }

    return quotes.map((quote) => {
      const quoteLineItems = lineItemsByQuoteId.get(quote.id) ?? [];
      const totals = this.computeQuoteLineTotals(quoteLineItems);
      const linkedLead = quote.leadId ? leadsById.get(quote.leadId) ?? null : null;
      const linkedLeadContact = linkedLead ? contactsById.get(linkedLead.contactId) ?? null : null;
      return {
        ...mapQuoteView(quote, contactsById.get(quote.contactId) ?? null),
        linkedLeadLabel: linkedLead
          ? `${
              linkedLeadContact?.companyName?.trim()
                || linkedLeadContact?.displayName?.trim()
                || "Unnamed customer"
            } — ${linkedLead.projectSite}`
          : null,
        linkedJobId: jobsByQuoteId.get(quote.id)?.id ?? null,
        hasLinkedInvoice: invoicesByJobId.has(String(jobsByQuoteId.get(quote.id)?.id ?? "")),
        attachments: documentsByQuoteId.get(String(quote.id)) ?? [],
        lineItems: quoteLineItems,
        materialCostTotal: totals.materialCostTotal,
        laborHoursTotal: totals.laborHoursTotal,
        laborCostTotal: totals.laborCostTotal,
        sellSubtotal: totals.sellSubtotal,
      };
    });
  }

  async listQuotes(options?: { status?: Quote["status"] }): Promise<QuoteView[]> {
    this.assertCanManageQuotes();

    const quotes = await this.quotes.list(options?.status ? { filter: { status: options.status } } : undefined);
    return this.loadQuoteViews(quotes);
  }

  async createQuote(input: CreateQuoteInput): Promise<QuoteView> {
    this.assertCanManageQuotes();

    const settings = await this.getOrgBusinessSettings();
    const number = await this.nextQuoteNumber();
    let quote: Quote;
    try {
      quote = await this.quotes.create({
        contactId: input.contactId,
        leadId: input.leadId ?? null,
        number,
        title: this.validateTitle(input.title),
        customerNotes: input.description?.trim() || null,
        internalNotes: input.notes?.trim() || null,
        subtotal: roundMoney(input.subtotal ?? 0),
        laborCostRate: normalizeMoneyInput(
          input.laborCostRate ?? settings.defaultLaborCostRate,
          "Labor cost rate",
        ),
        laborSellRate: normalizeMoneyInput(
          input.laborSellRate ?? settings.defaultLaborSellRate,
          "Labor sell rate",
        ),
        taxRate: input.taxRate ?? settings.defaultTaxRate,
        status: input.status ?? "draft",
        expiresAt: normalizeDateInput(input.expiresAt),
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote",
        operation: "save",
        table: "quotes",
        migrationHint: "0029_quote_labor_rate_defaults.sql",
      });
    }

    const contact = await this.contacts.getById(input.contactId);
    return {
      ...mapQuoteView(quote, contact),
      linkedLeadLabel: null,
      linkedJobId: null,
      hasLinkedInvoice: false,
    };
  }

  async createStandaloneQuote(input: CreateStandaloneQuoteInput): Promise<QuoteView> {
    this.assertCanManageQuotes();

    const customerName = this.validateCustomerName(input.customerName);
    const contactName = input.contactName?.trim() || customerName;
    const companyName = input.companyName?.trim() || null;
    const siteAddress = input.siteAddress?.trim() || null;

    let contact: Contact;
    try {
      contact = await this.contacts.create({
        type: "company",
        displayName: contactName,
        companyName,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        addressLine1: siteAddress,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote contact",
        operation: "save",
        table: "contacts",
      });
    }

    const createdQuote = await this.createQuote({
      contactId: contact.id,
      leadId: input.leadId ?? null,
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.laborCostRate !== undefined ? { laborCostRate: input.laborCostRate } : {}),
      ...(input.laborSellRate !== undefined ? { laborSellRate: input.laborSellRate } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    });

    if (!input.lineItems?.length) {
      const [view] = await this.loadQuoteViews([createdQuote]);
      if (!view) {
        throw new Error("Quote could not be loaded.");
      }
      return view;
    }

    return this.updateQuote(createdQuote.id, {
      lineItems: input.lineItems,
    });
  }

  async createQuoteFromLead(leadId: LeadRecord["id"]): Promise<QuoteView> {
    this.assertCanManageQuotes();

    const lead = await this.leads.getById(leadId);
    if (!lead) {
      throw new Error("Lead not found.");
    }

    const contact = await this.contacts.getById(lead.contactId);
    if (!contact) {
      throw new Error("Lead contact could not be found.");
    }

    const settings = await this.getOrgBusinessSettings();
    const number = await this.nextQuoteNumber();
    let quote: Quote;
    try {
      quote = await this.quotes.create({
        contactId: lead.contactId,
        leadId: lead.id,
        number,
        title: this.validateTitle(lead.projectSite),
        customerNotes: lead.description ?? null,
        internalNotes: lead.notes ?? null,
        subtotal: 0,
        laborCostRate: settings.defaultLaborCostRate,
        laborSellRate: settings.defaultLaborSellRate,
        taxRate: settings.defaultTaxRate,
        status: "draft",
        expiresAt: toDateInputValue(lead.followUpAt) ? normalizeDateInput(toDateInputValue(lead.followUpAt)) : null,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote",
        operation: "save",
        table: "quotes",
        migrationHint: "0029_quote_labor_rate_defaults.sql",
      });
    }

    return {
      ...mapQuoteView(quote, contact),
      linkedLeadLabel: `${contact.companyName?.trim() || contact.displayName.trim()} — ${lead.projectSite}`,
      linkedJobId: null,
      hasLinkedInvoice: false,
    };
  }

  async createAssemblyFromQuoteLines(input: {
    name: string;
    description?: string | null;
    lineItems: QuoteLineItemInput[];
  }): Promise<AssemblyView> {
    this.assertCanManageQuotes();

    const materialLines = input.lineItems.filter(
      (line) => (line.lineKind ?? "item") !== "labor" && line.catalogItemId,
    );
    if (materialLines.length === 0) {
      throw new Error("Add at least one catalog-backed material line before creating an assembly.");
    }

    const groupedMaterials = new Map<
      string,
      {
        catalogItemId: NonNullable<QuoteLineItemInput["catalogItemId"]>;
        quantity: number;
        sectionName: string | null;
        notes: Set<string>;
        firstSortOrder: number;
      }
    >();

    materialLines.forEach((line, index) => {
      if (!line.catalogItemId) {
        return;
      }

      const sectionName = line.sectionName?.trim() || null;
      const key = `${sectionName ?? ""}::${line.catalogItemId}`;
      const current = groupedMaterials.get(key) ?? {
        catalogItemId: line.catalogItemId,
        quantity: 0,
        sectionName,
        notes: new Set<string>(),
        firstSortOrder: line.sortOrder ?? index,
      };
      current.quantity = roundQuantity(current.quantity + normalizeQuantityInput(line.quantity));
      if (line.note?.trim()) {
        current.notes.add(line.note.trim());
      }
      groupedMaterials.set(key, current);
    });

    const defaultLaborHours = roundQuantity(
      input.lineItems
        .filter((line) => (line.lineKind ?? "item") === "labor")
        .reduce((total, line) => total + normalizeQuantityInput(line.quantity), 0),
    );

    const assemblyName = input.name.trim();
    if (!assemblyName) {
      throw new Error("Assembly name is required.");
    }

    let assembly: Assembly;
    try {
      assembly = await this.assemblies.create({
        name: assemblyName,
        description: input.description?.trim() || null,
        defaultLaborHours,
        isActive: true,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly",
        operation: "save",
        table: "assemblies",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }

    const items = Array.from(groupedMaterials.values()).sort(
      (left, right) => left.firstSortOrder - right.firstSortOrder,
    );

    try {
      for (const [index, item] of items.entries()) {
        await this.assemblyItems.create(assembly.id, {
          catalogItemId: item.catalogItemId as CatalogItemId,
          quantity: item.quantity,
          note: Array.from(item.notes).join(" · ") || null,
          sectionName: item.sectionName,
          sortOrder: index,
        });
      }
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Assembly items",
        operation: "save",
        table: "assembly_items",
        migrationHint: "0026_materials_and_assemblies_foundation.sql",
      });
    }

    const view = (await this.buildAssemblyViews()).find((item) => item.id === assembly.id);
    if (!view) {
      throw new Error("Assembly could not be loaded after save.");
    }
    return view;
  }

  async uploadQuoteAttachment(quoteId: Quote["id"], file: File) {
    this.assertCanManageQuotes();

    const quote = await this.quotes.getById(quoteId);
    if (!quote) {
      throw new Error("Quote not found.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${this.context.orgId}/quotes/${quoteId}/${Date.now()}-${safeName}`;
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
      entityType: "quotes",
      entityId: quoteId,
      category: this.inferDocumentCategory(file),
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: Number.isFinite(file.size) ? file.size : null,
    });
  }

  async deleteQuoteAttachment(input: { attachmentId: string; storagePath: string; fileName: string }) {
    this.assertCanManageQuotes();

    const { error: storageDeleteError } = await this.client.storage
      .from("job-attachments")
      .remove([input.storagePath]);

    if (storageDeleteError) {
      throw new Error(
        `Quote attachment delete failed in storage for ${input.fileName}: ${storageDeleteError.message}`,
      );
    }

    try {
      await this.documents.softDelete(input.attachmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown documents delete error.";
      throw new Error(
        `Quote attachment file was removed, but documents metadata delete failed for ${input.fileName}: ${message}`,
      );
    }
  }

  async getQuoteAttachmentAccessUrl(storagePath: string): Promise<string> {
    this.assertCanManageQuotes();

    const { data, error } = await this.client.storage
      .from("job-attachments")
      .createSignedUrl(storagePath, 60 * 15);

    if (error) {
      throw error;
    }

    return data.signedUrl;
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

  async updateQuote(quoteId: Quote["id"], input: UpdateQuoteInput): Promise<QuoteView> {
    this.assertCanManageQuotes();

    const existing = await this.quotes.getById(quoteId);
    if (!existing) {
      throw new Error("Quote not found.");
    }

    if (
      input.status !== undefined &&
      input.status !== existing.status &&
      !isValidQuoteTransition(existing.status, input.status)
    ) {
      throw new Error(getQuoteTransitionMessage(existing.status, input.status));
    }

    const linkedJob = await this.findJobByQuoteId(existing.id);
    if (linkedJob) {
      const { count, error } = await this.client
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("job_id", linkedJob.id)
        .is("deleted_at", null);

      if (error) {
        throw new Error(error.message);
      }

      if ((count ?? 0) > 0) {
        throw new Error("This quote is tied to an invoice. Editing is locked to avoid inconsistencies.");
      }
    }

    const currentContact = await this.contacts.getById(existing.contactId);
    if (!currentContact) {
      throw new Error("Quote contact could not be found.");
    }

    const normalizedLineItems =
      input.lineItems !== undefined ? this.normalizeQuoteLineItems(input.lineItems) : undefined;
    const existingLineItems =
      normalizedLineItems === undefined ? await this.quoteLineItems.listByQuoteIds([quoteId]) : [];
    const totalSource = normalizedLineItems ?? existingLineItems;
    const computedTotals = this.computeQuoteLineTotals(totalSource);
    const totals = {
      ...computedTotals,
      sellSubtotal:
        totalSource.length === 0
          ? roundMoney(input.subtotal ?? existing.subtotal)
          : computedTotals.sellSubtotal,
    };
    const lineItems = await this.syncQuoteLineItems(quoteId, normalizedLineItems);
    const nextCompanyName =
      input.companyName !== undefined ? input.companyName?.trim() || null : currentContact.companyName;
    const nextCustomerName =
      input.customerName !== undefined
        ? this.validateCustomerName(input.customerName)
        : nextCompanyName?.trim() || currentContact.displayName.trim();
    const nextContactName =
      input.contactName !== undefined
        ? input.contactName?.trim() || nextCustomerName
        : nextCompanyName?.trim()
          ? currentContact.displayName.trim()
          : nextCustomerName;
    let updatedContact = currentContact;
    if (
      input.customerName !== undefined ||
      input.companyName !== undefined ||
      input.contactName !== undefined ||
      input.phone !== undefined ||
      input.email !== undefined ||
      input.siteAddress !== undefined
    ) {
      try {
        updatedContact = await this.contacts.update(currentContact.id, {
          type: "company",
          displayName: nextContactName,
          companyName: nextCompanyName,
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
          ...(input.siteAddress !== undefined ? { addressLine1: input.siteAddress?.trim() || null } : {}),
        });
      } catch (error) {
        throw normalizePersistenceError(error, {
          entityLabel: "Quote contact",
          operation: "save",
          table: "contacts",
        });
      }
    }
    let updated: Quote;
    try {
      updated = await this.quotes.update(quoteId, {
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
        ...(input.title !== undefined ? { title: this.validateTitle(input.title) } : {}),
        ...(input.description !== undefined ? { customerNotes: input.description?.trim() || null } : {}),
        ...(input.notes !== undefined ? { internalNotes: input.notes?.trim() || null } : {}),
        subtotal: totals.sellSubtotal,
        ...(input.laborCostRate !== undefined
          ? { laborCostRate: normalizeMoneyInput(input.laborCostRate, "Labor cost rate") }
          : {}),
        ...(input.laborSellRate !== undefined
          ? { laborSellRate: normalizeMoneyInput(input.laborSellRate, "Labor sell rate") }
          : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: normalizeDateInput(input.expiresAt) } : {}),
      });
    } catch (error) {
      throw normalizePersistenceError(normalizeQuoteUpdateError(error), {
        entityLabel: "Quote",
        operation: "save",
        table: "quotes",
        migrationHint: "0029_quote_labor_rate_defaults.sql",
      });
    }

    const effectiveLeadId = input.leadId !== undefined ? input.leadId : existing.leadId;
    const linkedLead = effectiveLeadId ? await this.leads.getById(effectiveLeadId) : null;
    const linkedLeadContact = linkedLead ? await this.contacts.getById(linkedLead.contactId) : null;
    return {
      ...mapQuoteView(updated, updatedContact),
      linkedLeadLabel: linkedLead
        ? `${
            linkedLeadContact?.companyName?.trim()
              || linkedLeadContact?.displayName?.trim()
              || "Unnamed customer"
          } — ${linkedLead.projectSite}`
        : null,
      linkedJobId: linkedJob?.id ?? null,
      hasLinkedInvoice: false,
      lineItems,
      materialCostTotal: totals.materialCostTotal,
      laborHoursTotal: totals.laborHoursTotal,
      laborCostTotal: totals.laborCostTotal,
      sellSubtotal: totals.sellSubtotal,
    };
  }

  async acceptQuote(quoteId: Quote["id"], input: AcceptQuoteInput = {}): Promise<QuoteView> {
    this.assertCanManageQuotes();

    const existing = await this.quotes.getById(quoteId);
    if (!existing) {
      throw new Error("Quote not found.");
    }

    if (existing.status === "accepted") {
      const [view] = await this.loadQuoteViews([existing]);
      if (!view) {
        throw new Error("Quote not found.");
      }
      return view;
    }

    const normalizedLineItems =
      input.lineItems !== undefined ? this.normalizeQuoteLineItems(input.lineItems) : undefined;
    const existingLineItems =
      normalizedLineItems === undefined ? await this.quoteLineItems.listByQuoteIds([quoteId]) : [];
    const totalSource = normalizedLineItems ?? existingLineItems;
    const computedTotals = this.computeQuoteLineTotals(totalSource);
    const totals = {
      ...computedTotals,
      sellSubtotal:
        totalSource.length === 0
          ? roundMoney(input.subtotal ?? existing.subtotal)
          : computedTotals.sellSubtotal,
    };

    const basePatch = {
      ...(input.title !== undefined ? { title: this.validateTitle(input.title) } : {}),
      ...(input.description !== undefined ? { customerNotes: input.description?.trim() || null } : {}),
      ...(input.notes !== undefined ? { internalNotes: input.notes?.trim() || null } : {}),
      subtotal: totals.sellSubtotal,
      ...(input.laborCostRate !== undefined
        ? { laborCostRate: normalizeMoneyInput(input.laborCostRate, "Labor cost rate") }
        : {}),
      ...(input.laborSellRate !== undefined
        ? { laborSellRate: normalizeMoneyInput(input.laborSellRate, "Labor sell rate") }
        : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: normalizeDateInput(input.expiresAt) } : {}),
    } satisfies UpdateQuoteRecordInput;

    const lineItems = await this.syncQuoteLineItems(quoteId, normalizedLineItems);
    let updated: Quote;

    try {
      if (existing.status === "draft") {
        const sentQuote = await this.quotes.update(quoteId, {
          ...basePatch,
          status: "sent",
        });
        updated = await this.quotes.update(quoteId, {
          status: "accepted",
        });
        if (!sentQuote) {
          throw new Error("Quote could not be marked as sent.");
        }
      } else if (existing.status === "sent" || existing.status === "viewed") {
        updated = await this.quotes.update(quoteId, {
          ...basePatch,
          status: "accepted",
        });
      } else {
        throw new Error(getQuoteTransitionMessage(existing.status, "accepted"));
      }
    } catch (error) {
      throw normalizePersistenceError(normalizeQuoteUpdateError(error), {
        entityLabel: "Quote",
        operation: "save",
        table: "quotes",
        migrationHint: "0029_quote_labor_rate_defaults.sql",
      });
    }

    const contact = await this.contacts.getById(existing.contactId);
    return {
      ...mapQuoteView(updated, contact),
      linkedJobId: (await this.findJobByQuoteId(updated.id))?.id ?? null,
      hasLinkedInvoice: false,
      lineItems,
      materialCostTotal: totals.materialCostTotal,
      laborHoursTotal: totals.laborHoursTotal,
      laborCostTotal: totals.laborCostTotal,
      sellSubtotal: totals.sellSubtotal,
    };
  }

  private async findJobByQuoteId(quoteId: Quote["id"]): Promise<Job | null> {
    const jobs = await this.jobs.list();
    return jobs.find((job) => job.quoteId === quoteId) ?? null;
  }

  private async seedNeededMaterialsFromEstimate(
    jobId: Job["id"],
    materials: JobEstimateMaterialSnapshot[],
  ): Promise<void> {
    const existingNeeded = await this.jobMaterials.list({ filter: { jobId, kind: "needed" } });
    const existingNeededKeys = new Set(
      existingNeeded.map((item) =>
        buildPartAwareMaterialLineKey({
          catalogItemId: item.catalogItemId ? String(item.catalogItemId) : null,
          sku: item.skuSnapshot,
          description: item.displayName ?? "",
          unit: item.unitSnapshot ?? "each",
          sectionName: item.sectionName,
          unitCost: item.unitCost,
          unitSell: item.unitSell,
        }),
      ),
    );

    for (const material of normalizeEstimateMaterialSnapshotLines(materials)) {
      if (!material.catalogItemId) {
        continue;
      }

      const key = buildPartAwareMaterialLineKey(material);
      if (existingNeededKeys.has(key)) {
        continue;
      }

      await this.jobMaterials.create({
        jobId,
        catalogItemId: material.catalogItemId,
        kind: "needed",
        quantity: material.quantity,
        note: material.note,
        displayName: material.description,
        skuSnapshot: material.sku,
        unitSnapshot: material.unit,
        unitCost: material.unitCost,
        unitSell: material.unitSell,
        markupPercent: material.markupPercent,
        sectionName: material.sectionName,
      });
      existingNeededKeys.add(key);
    }
  }

  async createJobFromQuote(quoteId: Quote["id"]): Promise<{ job: Job; alreadyExisted: boolean }> {
    this.assertCanManageQuotes();

    const quote = await this.quotes.getById(quoteId);
    if (!quote) {
      throw new Error("Quote not found.");
    }

    if (quote.status !== "accepted") {
      throw new Error("Only accepted quotes can be converted into jobs right now.");
    }

    const existingJob = await this.findJobByQuoteId(quote.id);
    if (existingJob) {
      const currentQuoteLineItems = await this.quoteLineItems.listByQuoteIds([quote.id]);
      const currentEstimateMaterials = quoteLineItemsToEstimateMaterialSnapshot(currentQuoteLineItems);
      if (currentEstimateMaterials.length > 0) {
        try {
          await this.seedNeededMaterialsFromEstimate(existingJob.id, currentEstimateMaterials);
        } catch (error) {
          throw normalizePersistenceError(error, {
            entityLabel: "Quote -> Job carryover",
            operation: "save",
            table: "job_materials",
            migrationHint: "0032_job_materials_actuals.sql",
          });
        }
      }
      return { job: existingJob, alreadyExisted: true };
    }

    const lineItems = await this.quoteLineItems.listByQuoteIds([quote.id]);
    const laborHours = roundQuantity(
      lineItems
        .filter((line) => line.lineKind === "labor")
        .reduce((total, line) => total + (line.quantity ?? 0), 0),
    );
    const estimateSnapshot: JobEstimateSnapshot = {
      sourceQuoteId: quote.id,
      sourceQuoteNumber: quote.number,
      generatedAt: new Date().toISOString(),
      laborHours,
      materials: quoteLineItemsToEstimateMaterialSnapshot(lineItems),
    };

    const number = await this.nextJobNumber();
    let createdJob: Job;
    try {
      createdJob = await this.jobs.create({
        number,
        contactId: quote.contactId,
        quoteId: quote.id,
        title: quote.title,
        description: quote.customerNotes ?? null,
        internalNotes: quote.internalNotes ?? null,
        estimatedHours: laborHours > 0 ? laborHours : null,
        estimateSnapshot,
      });
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Job",
        operation: "create",
        table: "jobs",
      });
    }

    try {
      await this.sync.flushPendingQueue();
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Job",
        operation: "create",
        table: "jobs",
      });
    }

    try {
      await this.seedNeededMaterialsFromEstimate(createdJob.id, estimateSnapshot.materials);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote -> Job carryover",
        operation: "save",
        table: "job_materials",
        migrationHint: "0032_job_materials_actuals.sql",
      });
    }

    return { job: createdJob, alreadyExisted: false };
  }

  async archiveQuote(quoteId: Quote["id"]): Promise<void> {
    this.assertCanManageQuotes();
    try {
      await this.quotes.softDelete(quoteId);
    } catch (error) {
      throw normalizePersistenceError(error, {
        entityLabel: "Quote",
        operation: "archive",
        table: "quotes",
        migrationHint: "0028_business_entity_soft_delete_rpcs.sql",
      });
    }
  }
}
