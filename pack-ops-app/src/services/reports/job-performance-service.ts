import type { SupabaseClient } from "@supabase/supabase-js";

import { jobsMapper } from "@/data/mappers/jobs.mapper";
import type { TableRow } from "@/data/mappers/database-row-types";
import { CatalogItemsRepositoryImpl } from "@/data/repositories/catalog-items.repository.impl";
import type { RepositoryContext } from "@/data/repositories/contracts";
import { JobMaterialsRepositoryImpl } from "@/data/repositories/job-materials.repository.impl";
import { QuoteLineItemsRepositoryImpl } from "@/data/repositories/quote-line-items.repository.impl";
import { TimeEntriesRepositoryImpl } from "@/data/repositories/time-entries.repository.impl";
import type { Database } from "@/data/supabase/types";
import type { Job, JobPerformanceSummary } from "@/domain/jobs/types";
import type { User } from "@/domain/users/types";
import { computeJobPerformanceSummary } from "@/services/jobs/job-performance";
import { normalizeEstimateMaterialSnapshotLines, quoteLineItemsToEstimateMaterialSnapshot } from "@/services/materials/part-material-lines";
import { readOrgBusinessSettings } from "@/services/settings/org-settings";

type JobRow = TableRow<"jobs">;
type InvoiceRow = TableRow<"invoices">;
type InvoiceLineRow = TableRow<"invoice_line_items">;
type PaymentRow = TableRow<"payments">;

export interface JobPerformanceReportRow {
  jobId: string;
  jobNumber: string;
  title: string;
  status: Job["status"];
  isArchived: boolean;
  performance: JobPerformanceSummary | null;
}

export interface JobPerformanceReportData {
  rows: JobPerformanceReportRow[];
  statusOptions: Array<{ value: Job["status"]; label: string }>;
}

function canViewJobPerformance(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function statusLabel(status: Job["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isLaborInvoiceLine(line: Pick<InvoiceLineRow, "description" | "unit">): boolean {
  const unit = line.unit.trim().toLowerCase();
  const description = line.description.trim().toLowerCase();
  return unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours" || description.includes("labour") || description.includes("labor");
}

export class JobPerformanceService {
  readonly catalogItems;
  readonly jobMaterials;
  readonly quoteLineItems;
  readonly timeEntries;

  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {
    this.catalogItems = new CatalogItemsRepositoryImpl(context, client);
    this.jobMaterials = new JobMaterialsRepositoryImpl(context, client);
    this.quoteLineItems = new QuoteLineItemsRepositoryImpl(context, client);
    this.timeEntries = new TimeEntriesRepositoryImpl(context, client);
  }

  private assertCanViewJobPerformance() {
    if (!canViewJobPerformance(this.currentUser)) {
      throw new Error("You cannot view job performance.");
    }
  }

  async getJobPerformanceReport(filters?: {
    archiveScope?: "active" | "archived" | "all";
    status?: Job["status"] | null;
  }): Promise<JobPerformanceReportData> {
    this.assertCanViewJobPerformance();

    let jobsQuery = this.client
      .from("jobs")
      .select("*")
      .eq("org_id", this.context.orgId)
      .order("updated_at", { ascending: false });

    if (filters?.archiveScope === "active" || !filters?.archiveScope) {
      jobsQuery = jobsQuery.is("deleted_at", null);
    } else if (filters.archiveScope === "archived") {
      jobsQuery = jobsQuery.not("deleted_at", "is", null);
    }

    if (filters?.status) {
      jobsQuery = jobsQuery.eq("status", filters.status);
    }

    const [{ data: jobsData, error: jobsError }, catalogItems, jobMaterials, timeEntries, orgResponse] = await Promise.all([
      jobsQuery,
      this.catalogItems.list({ filter: { includeInactive: true } }),
      this.jobMaterials.list(),
      this.timeEntries.list(),
      this.client.from("orgs").select("settings").eq("id", this.context.orgId).single(),
    ]);

    if (jobsError) {
      throw jobsError;
    }
    if (orgResponse.error) {
      throw orgResponse.error;
    }
    const settings = readOrgBusinessSettings(orgResponse.data.settings);

    const jobs = (jobsData ?? []).map((row) => jobsMapper.toDomain(row as JobRow));
    const jobIds = jobs.map((job) => String(job.id));
    const quoteIds = jobs
      .map((job) => job.quoteId)
      .filter((quoteId): quoteId is NonNullable<Job["quoteId"]> => Boolean(quoteId));

    const quotesResponse = quoteIds.length
      ? await this.client
          .from("quotes")
          .select("id, subtotal, total, labor_cost_rate, labor_sell_rate")
          .eq("org_id", this.context.orgId)
          .in("id", quoteIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    if (quotesResponse.error) {
      throw quotesResponse.error;
    }
    const quoteLineItems = quoteIds.length ? await this.quoteLineItems.listByQuoteIds(quoteIds) : [];

    const invoicesResponse = jobIds.length
      ? await this.client
          .from("invoices")
          .select("*")
          .eq("org_id", this.context.orgId)
          .in("job_id", jobIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    if (invoicesResponse.error) {
      throw invoicesResponse.error;
    }

    const invoiceRows = (invoicesResponse.data ?? []) as InvoiceRow[];
    const invoiceIds = invoiceRows.map((invoice) => invoice.id);
    const [invoiceLinesResponse, paymentsResponse] = await Promise.all([
      invoiceIds.length
        ? this.client
            .from("invoice_line_items")
            .select("*")
            .eq("org_id", this.context.orgId)
            .in("invoice_id", invoiceIds)
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

    const invoiceJobByInvoiceId = new Map(invoiceRows.map((invoice) => [invoice.id, invoice.job_id]));
    const paymentsByInvoiceId = new Map<string, number>();
    for (const payment of (paymentsResponse.data ?? []) as PaymentRow[]) {
      paymentsByInvoiceId.set(
        payment.invoice_id,
        roundMoney((paymentsByInvoiceId.get(payment.invoice_id) ?? 0) + payment.amount),
      );
    }
    const invoiceSellByJobId = new Map<string, {
      subtotal: number;
      total: number;
      laborRevenue: number | null;
      materialRevenue: number | null;
      count: number;
      collected: number;
      lastInvoiceDate: string | null;
    }>();

    for (const invoice of invoiceRows) {
      const current = invoiceSellByJobId.get(invoice.job_id) ?? {
        subtotal: 0,
        total: 0,
        laborRevenue: 0,
        materialRevenue: null,
        count: 0,
        collected: 0,
        lastInvoiceDate: null,
      };
      current.subtotal = roundMoney(current.subtotal + invoice.subtotal);
      current.total = roundMoney(current.total + invoice.total);
      current.count += 1;
      current.collected = roundMoney(current.collected + Math.max(invoice.amount_paid ?? 0, paymentsByInvoiceId.get(invoice.id) ?? 0));
      current.lastInvoiceDate =
        current.lastInvoiceDate && current.lastInvoiceDate.localeCompare(invoice.created_at) > 0
          ? current.lastInvoiceDate
          : invoice.created_at;
      invoiceSellByJobId.set(invoice.job_id, current);
    }

    for (const line of (invoiceLinesResponse.data ?? []) as InvoiceLineRow[]) {
      const jobId = invoiceJobByInvoiceId.get(line.invoice_id);
      if (!jobId) {
        continue;
      }
      const current = invoiceSellByJobId.get(jobId);
      if (!current) {
        continue;
      }
      if (isLaborInvoiceLine(line)) {
        current.laborRevenue = roundMoney((current.laborRevenue ?? 0) + line.subtotal);
      }
    }

    for (const current of invoiceSellByJobId.values()) {
      const laborRevenue = current.laborRevenue ?? 0;
      current.laborRevenue = roundMoney(laborRevenue);
      current.materialRevenue = roundMoney(current.subtotal - laborRevenue);
    }

    const quotesById = new Map(
      (quotesResponse.data ?? []).map((quote) => [
        String(quote.id),
        {
          subtotal: quote.subtotal,
          total: quote.total,
          laborCostRate: quote.labor_cost_rate,
          laborSellRate: quote.labor_sell_rate,
        },
      ]),
    );
    const quoteLineItemsByQuoteId = new Map<string, typeof quoteLineItems>();
    for (const line of quoteLineItems) {
      const current = quoteLineItemsByQuoteId.get(String(line.quoteId)) ?? [];
      current.push(line);
      quoteLineItemsByQuoteId.set(String(line.quoteId), current);
    }

    const rows = jobs.map((job) => ({
      jobId: String(job.id),
      jobNumber: job.number,
      title: job.title,
      status: job.status,
      isArchived: Boolean(job.deletedAt),
      performance: computeJobPerformanceSummary({
        job,
        estimatedMaterialLines:
          job.quoteId && quoteLineItemsByQuoteId.has(String(job.quoteId))
            ? quoteLineItemsToEstimateMaterialSnapshot(quoteLineItemsByQuoteId.get(String(job.quoteId)) ?? [])
            : normalizeEstimateMaterialSnapshotLines(job.estimateSnapshot?.materials ?? []),
        linkedQuote: job.quoteId ? quotesById.get(String(job.quoteId)) ?? null : null,
        savedInvoiceSell: invoiceSellByJobId.get(String(job.id)) ?? null,
        settingsDefaults: {
          laborCostRate: settings.defaultLaborCostRate,
          laborSellRate: settings.defaultLaborSellRate,
          materialMarkupPercent: settings.defaultMaterialMarkup,
        },
        catalogItems,
        jobMaterials: jobMaterials.filter((entry) => String(entry.jobId) === String(job.id)),
        timeEntries: timeEntries.filter((entry) => String(entry.jobId) === String(job.id)),
        canViewFinancials: true,
      }),
    }));

    return {
      rows,
      statusOptions: Array.from(new Set(rows.map((row) => row.status)))
        .sort()
        .map((value) => ({ value, label: statusLabel(value) })),
    };
  }
}
