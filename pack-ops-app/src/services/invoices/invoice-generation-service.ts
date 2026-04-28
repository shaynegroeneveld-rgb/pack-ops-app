import type { SupabaseClient } from "@supabase/supabase-js";

import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import { ContactsRepositoryImpl } from "@/data/repositories/contacts.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { JobMaterialsRepositoryImpl } from "@/data/repositories/job-materials.repository.impl";
import { JobsRepositoryImpl } from "@/data/repositories/jobs.repository.impl";
import { QuoteLineItemsRepositoryImpl } from "@/data/repositories/quote-line-items.repository.impl";
import { QuotesRepositoryImpl } from "@/data/repositories/quotes.repository.impl";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import type { Database } from "@/data/supabase/types";
import type {
  ActualInvoiceControls,
  ActualsInvoicePreviewBase,
  EditableInvoiceDraftLine,
  InvoiceGenerationPreview,
  InvoiceGenerationSource,
  InvoicePreviewLine,
} from "@/domain/invoices/types";
import type { QuoteLineItem } from "@/domain/quotes/types";
import type { User } from "@/domain/users/types";
import { readOrgBusinessSettings } from "@/services/settings/org-settings";

function canGenerateInvoices(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildLogoDataUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image/")) {
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

function formatIssueDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

function buildNextInvoiceNumberPreview(lastValue: number | null) {
  return `INV-${String((lastValue ?? 0) + 1).padStart(3, "0")}`;
}

function deriveMaterialMarkupPercent(lines: QuoteLineItem[], fallbackMarkup: number): number {
  const materialLines = lines.filter((line) => line.lineKind !== "labor" && (line.unitCost ?? 0) > 0);
  if (materialLines.length === 0) {
    return fallbackMarkup;
  }

  const totalCost = materialLines.reduce((total, line) => total + line.unitCost * line.quantity, 0);
  const totalSell = materialLines.reduce((total, line) => total + line.unitSell * line.quantity, 0);

  if (totalCost <= 0) {
    return fallbackMarkup;
  }

  return ((totalSell - totalCost) / totalCost) * 100;
}

function groupActualMaterialLines(
  lines: Array<{
    catalogItemId: string | null;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number | null;
    markupPercent?: number | null;
    generatedSourceId?: string | null;
    note?: string | null;
    sectionName?: string | null;
  }>,
): InvoicePreviewLine[] {
  const grouped = new Map<string, InvoicePreviewLine>();

  for (const line of lines) {
    const key = `${line.sectionName ?? ""}::${line.catalogItemId ?? line.description}::${line.unit}::${line.unitPrice}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity = roundQuantity(current.quantity + line.quantity);
      current.subtotal = roundMoney(current.quantity * current.unitPrice);
      continue;
    }

    grouped.set(key, {
      id: key,
      description: line.description,
      unit: line.unit,
      quantity: roundQuantity(line.quantity),
      unitPrice: roundMoney(line.unitPrice),
      subtotal: roundMoney(line.quantity * line.unitPrice),
      sectionName: line.sectionName ?? null,
      unitCost: line.unitCost ?? null,
      markupPercent: line.markupPercent ?? null,
      sourceKind: "actual-material",
      generatedSourceId: line.generatedSourceId ?? null,
      origin: "generated",
      isEdited: false,
    });
  }

  return Array.from(grouped.values());
}

function collapseLaborLines(lines: InvoicePreviewLine[], sectionName: string | null = null): InvoicePreviewLine[] {
  const nonLaborLines = lines.filter((line) => line.category !== "labor");
  const laborLines = lines.filter((line) => line.category === "labor");
  if (laborLines.length === 0) {
    return nonLaborLines;
  }

  const quantity = roundQuantity(laborLines.reduce((total, line) => total + line.quantity, 0));
  const subtotal = roundMoney(laborLines.reduce((total, line) => total + line.subtotal, 0));

  return [
    ...nonLaborLines,
    {
      id: "labor:summary",
      description: "Labour",
      unit: "hours",
      quantity,
      unitPrice: quantity > 0 ? roundMoney(subtotal / quantity) : 0,
      subtotal,
      sectionName,
      category: "labor",
      note: null,
      sourceKind: "actual-labor",
      generatedSourceId: "labor:summary",
      origin: "generated",
      isEdited: false,
    },
  ];
}

export function createEditableInvoiceDraftLines(preview: InvoiceGenerationPreview | null): EditableInvoiceDraftLine[] {
  if (!preview) {
    return [];
  }

  return preview.lines.map((line) => ({
    ...line,
    origin: line.origin ?? "generated",
    isEdited: Boolean(line.isEdited),
  }));
}

export function buildInvoicePreviewFromDraft(
  preview: InvoiceGenerationPreview | null,
  draftLines: EditableInvoiceDraftLine[],
): InvoiceGenerationPreview | null {
  if (!preview) {
    return null;
  }

  const lines = draftLines
    .filter((line) => line.quantity > 0)
    .map<InvoicePreviewLine>((line) => ({
      ...line,
      quantity: roundQuantity(Math.max(0, line.quantity)),
      unitPrice: roundMoney(Math.max(0, line.unitPrice)),
      subtotal: roundMoney(Math.max(0, line.quantity) * Math.max(0, line.unitPrice)),
    }));

  const subtotal = roundMoney(lines.reduce((total, line) => total + line.subtotal, 0));
  const taxAmount = roundMoney(subtotal * preview.taxRate);
  const total = roundMoney(subtotal + taxAmount);

  return {
    ...preview,
    lines,
    subtotal,
    taxAmount,
    total,
  };
}

export function buildInvoicePreviewFromActuals(
  base: ActualsInvoicePreviewBase,
  controls: ActualInvoiceControls,
): InvoiceGenerationPreview {
  const materialMarkupPercent = Math.max(0, Number(controls.materialMarkupPercent || 0));
  const laborSellRate = Math.max(0, Number(controls.laborSellRate || 0));
  const taxRate = Math.max(0, Number(controls.taxRate || 0));
  const selectedPartName = controls.invoicePartName?.trim() || null;
  const selectedPartMatches = (sectionName: string | null | undefined) =>
    !selectedPartName || (sectionName?.trim() || "General") === selectedPartName;

  const rawLaborLines: InvoicePreviewLine[] = base.labor
    .filter((entry) => entry.hours > 0)
    .filter((entry) => selectedPartMatches(entry.sectionName))
    .map((entry) => ({
      id: `labor:${entry.id}`,
      description: entry.description,
      unit: "hours",
      quantity: roundQuantity(entry.hours),
      unitPrice: roundMoney(laborSellRate),
      subtotal: roundMoney(entry.hours * laborSellRate),
      sectionName: entry.sectionName ?? null,
      category: "labor",
      note: entry.note,
      unitCost: null,
      markupPercent: null,
      sourceKind: "actual-labor",
      generatedSourceId: String(entry.id),
      origin: "generated",
      isEdited: false,
    }));

  const materialLines = base.materials
    .filter((entry) => entry.quantity > 0)
    .filter((entry) => selectedPartMatches(entry.sectionName))
    .map((entry) => ({
      catalogItemId: entry.catalogItemId,
      description: entry.description,
      unit: entry.unit,
      quantity: entry.quantity,
      unitPrice: roundMoney(entry.unitCost * (1 + materialMarkupPercent / 100)),
      unitCost: roundMoney(entry.unitCost),
      markupPercent: roundMoney(materialMarkupPercent),
      generatedSourceId: String(entry.id),
      note: entry.note,
      sectionName: entry.sectionName ?? null,
    }));

  const lines = collapseLaborLines([
    ...groupActualMaterialLines(materialLines).map((line, index) => ({
      ...line,
      id: `material:${index}:${line.id}`,
      category: "material" as const,
      note: materialLines.find((item) => `${item.sectionName ?? ""}::${item.catalogItemId ?? item.description}::${item.unit}::${item.unitPrice}` === line.id)?.note ?? null,
      unitCost: materialLines.find((item) => `${item.sectionName ?? ""}::${item.catalogItemId ?? item.description}::${item.unit}::${item.unitPrice}` === line.id)?.unitCost ?? null,
      markupPercent: materialLines.find((item) => `${item.sectionName ?? ""}::${item.catalogItemId ?? item.description}::${item.unit}::${item.unitPrice}` === line.id)?.markupPercent ?? null,
      sourceKind: "actual-material" as const,
      origin: "generated" as const,
      isEdited: false,
    })),
    ...rawLaborLines,
  ], selectedPartName);

  const subtotal = roundMoney(lines.reduce((total, line) => total + line.subtotal, 0));
  const taxAmount = roundMoney(subtotal * taxRate);
  const total = roundMoney(subtotal + taxAmount);

  return {
    source: "actuals",
    jobId: base.jobId,
    contactId: base.contactId,
    company: base.company,
    customer: base.customer,
    invoiceNumberPreview: base.invoiceNumberPreview,
    issueDate: base.issueDate,
    jobReference: base.jobReference,
    lines,
    subtotal,
    taxRate,
    taxAmount,
    total,
    customerNotes: base.customerNotes,
    internalNotes: base.internalNotes,
    actualInvoiceControls: {
      materialMarkupPercent: roundMoney(materialMarkupPercent),
      laborSellRate: roundMoney(laborSellRate),
      taxRate: roundMoney(taxRate),
      invoicePartName: selectedPartName,
    },
  };
}

export class InvoiceGenerationService {
  readonly jobs;
  readonly contacts;
  readonly quotes;
  readonly quoteLineItems;
  readonly catalogItems;
  readonly jobMaterials;
  readonly timeEntries;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.jobs = new JobsRepositoryImpl(context, client);
    this.contacts = new ContactsRepositoryImpl(context, client);
    this.quotes = new QuotesRepositoryImpl(context, client);
    this.quoteLineItems = new QuoteLineItemsRepositoryImpl(context, client);
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
    this.jobMaterials = new JobMaterialsRepositoryImpl(context, client);
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
  }

  private assertCanGenerateInvoices() {
    if (!canGenerateInvoices(this.currentUser)) {
      throw new Error("You cannot generate invoices.");
    }
  }

  private async getAuthoringContext(jobId: string) {
    const job = await this.jobs.getById(jobId);
    if (!job) {
      throw new Error("Job not found.");
    }

    const [contact, quote, quoteLines, catalogItems, jobMaterials, timeEntries, orgResponse, appSettingsResponse, counterResponse] =
      await Promise.all([
        this.contacts.getById(job.contactId),
        job.quoteId ? this.quotes.getById(job.quoteId) : Promise.resolve(null),
        job.quoteId ? this.quoteLineItems.listByQuoteIds([job.quoteId]) : Promise.resolve([]),
        this.catalogItems.list({ filter: { includeInactive: true } }),
        this.jobMaterials.list({ filter: { jobId: job.id } }),
        this.timeEntries.list({ filter: { jobId: job.id } }),
        this.client.from("orgs").select("name, settings").eq("id", this.context.orgId).single(),
        this.client.from("app_settings").select("logo_b64").maybeSingle(),
        this.client
          .from("org_counters")
          .select("last_value")
          .eq("org_id", this.context.orgId)
          .eq("counter_type", "invoice")
          .maybeSingle(),
      ]);

    if (orgResponse.error) {
      throw orgResponse.error;
    }
    if (!contact) {
      throw new Error("Job contact could not be found.");
    }

    return {
      job,
      contact,
      quote,
      quoteLines,
      catalogItems,
      jobMaterials,
      timeEntries,
      org: orgResponse.data,
      logoDataUrl: buildLogoDataUrl(appSettingsResponse.data?.logo_b64 ?? null),
      nextInvoiceNumberPreview: buildNextInvoiceNumberPreview(counterResponse.data?.last_value ?? null),
      settings: readOrgBusinessSettings(orgResponse.data.settings),
    };
  }

  async getActualsPreviewBase(
    jobId: string,
    actualControls?: Partial<ActualInvoiceControls>,
  ): Promise<{ base: ActualsInvoicePreviewBase; controls: ActualInvoiceControls }> {
    this.assertCanGenerateInvoices();

    const context = await this.getAuthoringContext(jobId);
    const issueDate = formatIssueDate(new Date());
    const orgSettings = asRecord(context.org.settings);
    const addressLines = [
      (asString(orgSettings?.addressLine1) ?? context.settings.companyAddressLine1) || null,
      (asString(orgSettings?.addressLine2) ?? context.settings.companyAddressLine2) || null,
      [
        (asString(orgSettings?.city) ?? context.settings.companyCity) || null,
        (asString(orgSettings?.region) ?? context.settings.companyRegion) || null,
        (asString(orgSettings?.postalCode) ?? context.settings.companyPostalCode) || null,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    ].filter((line): line is string => Boolean(line));

    const company = {
      name: context.org.name,
      email: (asString(orgSettings?.email) ?? context.settings.companyEmail) || null,
      phone: (asString(orgSettings?.phone) ?? context.settings.companyPhone) || null,
      website: asString(orgSettings?.website),
      addressLines,
      logoDataUrl: context.logoDataUrl,
    };

    const customer = {
      customerName: context.contact.companyName?.trim() || context.contact.displayName,
      contactName: context.contact.displayName ?? null,
      phone: context.contact.phone ?? null,
      email: context.contact.email ?? null,
    };

    const baseMarkupPercent = deriveMaterialMarkupPercent(context.quoteLines, context.settings.defaultMaterialMarkup);
    const controls: ActualInvoiceControls = {
      materialMarkupPercent: roundMoney(
        Number.isFinite(actualControls?.materialMarkupPercent)
          ? Math.max(0, Number(actualControls?.materialMarkupPercent))
          : baseMarkupPercent,
      ),
      laborSellRate: roundMoney(
        Number.isFinite(actualControls?.laborSellRate)
          ? Math.max(0, Number(actualControls?.laborSellRate))
          : context.quote?.laborSellRate ?? context.settings.defaultLaborSellRate,
      ),
      taxRate: roundMoney(
        Number.isFinite(actualControls?.taxRate)
          ? Math.max(0, Number(actualControls?.taxRate))
          : context.quote?.taxRate ?? context.settings.defaultTaxRate,
      ),
      invoicePartName: actualControls?.invoicePartName?.trim() || null,
    };

    const catalogById = new Map(context.catalogItems.map((item) => [item.id, item]));
    const base: ActualsInvoicePreviewBase = {
      source: "actuals",
      jobId: context.job.id,
      contactId: context.contact.id,
      company,
      customer,
      invoiceNumberPreview: context.nextInvoiceNumberPreview,
      issueDate,
      jobReference: `${context.job.number} · ${context.job.title}`,
      customerNotes: context.job.description ?? context.quote?.customerNotes ?? null,
      internalNotes: `Generated from actual job time and materials used on ${context.job.number}.`,
      materials: context.jobMaterials
        .filter((entry) => entry.kind === "used")
        .map((entry) => {
          const material = catalogById.get(entry.catalogItemId);
          return {
            id: String(entry.id),
            catalogItemId: material?.id ?? null,
            description: entry.displayName ?? material?.name ?? "Material",
            unit: entry.unitSnapshot ?? material?.unit ?? "each",
            quantity: entry.quantity,
            unitCost: entry.unitCost ?? material?.costPrice ?? 0,
            note: [entry.skuSnapshot ?? material?.sku ?? null, entry.note ?? null].filter(Boolean).join(" · ") || null,
            sectionName: entry.sectionName ?? null,
          };
        }),
      labor: context.timeEntries
        .filter((entry) => entry.hours > 0)
        .map((entry) => ({
          id: String(entry.id),
          description: entry.description?.trim() || "Labour",
          hours: entry.hours,
          note: entry.workDate,
          sectionName: entry.sectionName ?? null,
        })),
    };

    return { base, controls };
  }

  async buildPreview(
    jobId: string,
    source: InvoiceGenerationSource,
    actualControls?: Partial<ActualInvoiceControls>,
  ): Promise<InvoiceGenerationPreview> {
    this.assertCanGenerateInvoices();

    const context = await this.getAuthoringContext(jobId);
    const issueDate = formatIssueDate(new Date());
    const orgSettings = asRecord(context.org.settings);
    const addressLines = [
      (asString(orgSettings?.addressLine1) ?? context.settings.companyAddressLine1) || null,
      (asString(orgSettings?.addressLine2) ?? context.settings.companyAddressLine2) || null,
      [
        (asString(orgSettings?.city) ?? context.settings.companyCity) || null,
        (asString(orgSettings?.region) ?? context.settings.companyRegion) || null,
        (asString(orgSettings?.postalCode) ?? context.settings.companyPostalCode) || null,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    ].filter((line): line is string => Boolean(line));

    const company = {
      name: context.org.name,
      email: (asString(orgSettings?.email) ?? context.settings.companyEmail) || null,
      phone: (asString(orgSettings?.phone) ?? context.settings.companyPhone) || null,
      website: asString(orgSettings?.website),
      addressLines,
      logoDataUrl: context.logoDataUrl,
    };

    const customer = {
      customerName: context.contact.companyName?.trim() || context.contact.displayName,
      contactName: context.contact.displayName ?? null,
      phone: context.contact.phone ?? null,
      email: context.contact.email ?? null,
    };

    let lines: InvoicePreviewLine[] = [];
    let customerNotes: string | null = null;
    let internalNotes: string | null = null;
    let taxRate = context.quote?.taxRate ?? context.settings.defaultTaxRate;
    let resolvedActualControls: ActualInvoiceControls | null = null;

    if (source === "quote") {
      if (!context.quote || context.quoteLines.length === 0) {
        throw new Error("This job does not have linked quote lines to invoice from.");
      }

      lines = collapseLaborLines(context.quoteLines.map((line) => ({
        id: String(line.id),
        description: line.description,
        unit: line.unit,
        quantity: roundQuantity(line.quantity),
        unitPrice: roundMoney(line.unitSell),
        subtotal: roundMoney(line.lineTotalSell),
        sectionName: line.sectionName ?? null,
        category: line.lineKind === "labor" ? "labor" : "material",
        note: line.note ?? null,
        unitCost: roundMoney(line.unitCost),
        markupPercent:
          line.lineKind === "labor" || line.unitCost <= 0
            ? null
            : roundMoney(((line.unitSell - line.unitCost) / line.unitCost) * 100),
        sourceKind: "quote-line",
        generatedSourceId: String(line.id),
        origin: "generated",
        isEdited: false,
      })));
      customerNotes = context.quote.customerNotes ?? context.job.description ?? null;
      internalNotes = `Generated from quote ${context.quote.number}.`;
      taxRate = context.quote.taxRate;
    } else {
      const { base, controls } = await this.getActualsPreviewBase(jobId, actualControls);
      const preview = buildInvoicePreviewFromActuals(base, controls);
      return preview;
    }

    if (lines.length === 0) {
      throw new Error("There are no invoiceable lines in the selected source.");
    }

    const subtotal = roundMoney(lines.reduce((total, line) => total + line.subtotal, 0));
    const taxAmount = roundMoney(subtotal * taxRate);
    const total = roundMoney(subtotal + taxAmount);

    return {
      source,
      jobId: context.job.id,
      contactId: context.contact.id,
      company,
      customer,
      invoiceNumberPreview: context.nextInvoiceNumberPreview,
      issueDate,
      jobReference: `${context.job.number} · ${context.job.title}`,
      lines,
      subtotal,
      taxRate,
      taxAmount,
      total,
      customerNotes,
      internalNotes,
      actualInvoiceControls: resolvedActualControls,
    };
  }

  async savePreview(preview: InvoiceGenerationPreview): Promise<{ invoiceId: string; invoiceNumber: string }> {
    this.assertCanGenerateInvoices();

    if (preview.lines.length === 0) {
      throw new Error("There are no invoice lines to save.");
    }

    const { data: invoiceNumber, error: numberError } = await this.client.rpc("fn_next_org_number", {
      p_org_id: this.context.orgId,
      p_type: "invoice",
      p_prefix: "INV",
    });

    if (numberError || !invoiceNumber) {
      throw new Error(numberError?.message ?? "Could not generate an invoice number.");
    }

    const { data: invoiceId, error } = await this.client.rpc("fn_create_invoice_from_snapshot", {
      p_org_id: this.context.orgId,
      p_job_id: preview.jobId,
      p_contact_id: preview.contactId,
      p_number: invoiceNumber,
      p_tax_rate: preview.taxRate,
      p_subtotal: preview.subtotal,
      p_tax_amount: preview.taxAmount,
      p_total: preview.total,
      p_due_date: null,
      p_customer_notes: preview.customerNotes ?? null,
      p_internal_notes: preview.internalNotes ?? null,
      p_lines: preview.lines.map((line, index) => ({
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        sectionName: line.sectionName ?? null,
        sortOrder: index,
      })),
    });

    if (error || !invoiceId) {
      throw new Error(error?.message ?? "Could not save the invoice.");
    }

    return {
      invoiceId: String(invoiceId),
      invoiceNumber: String(invoiceNumber),
    };
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    this.assertCanGenerateInvoices();

    const { data: invoice, error: invoiceLoadError } = await this.client
      .from("invoices")
      .select("id, number")
      .eq("org_id", this.context.orgId)
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (invoiceLoadError) {
      throw invoiceLoadError;
    }

    if (!invoice) {
      throw new Error("Invoice not found or already deleted.");
    }

    const { error } = await this.client.rpc("fn_delete_invoice_snapshot", {
      p_invoice_id: invoiceId,
    });

    if (error) {
      if (error.message.includes("Could not find the function")) {
        throw new Error(
          "Invoice delete migration is not applied yet. Run the latest Supabase migration, then try deleting again.",
        );
      }
      throw new Error(`Could not delete invoice ${invoice.number}: ${error.message}`);
    }
  }
}
