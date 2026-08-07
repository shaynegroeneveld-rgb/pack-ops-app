import type { SupabaseClient } from "@supabase/supabase-js";

import type { RepositoryContext } from "@/data/repositories/contracts";
import type { Database } from "@/data/supabase/types";
import type { User } from "@/domain/users/types";

function canViewBaseline(user: User): boolean {
  return user.role === "owner" || user.role === "office";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthKey(dateString: string): string {
  return dateString.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) {
    return key;
  }
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export interface BaselineMonthRevenue {
  month: string;
  label: string;
  invoicedRevenue: number;
  invoiceCount: number;
}

export interface BaselineCustomerRevenue {
  contactId: string;
  customerName: string;
  invoicedRevenue: number;
  invoiceCount: number;
  percentOfTotal: number;
}

export interface BaselineData {
  windowMonths: number;
  startDate: string;
  endDate: string;
  totalInvoicedRevenue: number;
  monthlyRevenue: BaselineMonthRevenue[];
  topCustomers: BaselineCustomerRevenue[];
  top10SharePct: number | null;
  customerCount: number;
  averageJobSize: number | null;
  jobsWithInvoicesCount: number;
  averageJobDurationDays: number | null;
  jobsWithDurationCount: number;
}

export class BaselineService {
  constructor(
    private readonly context: RepositoryContext,
    private readonly currentUser: User,
    private readonly client: SupabaseClient<Database>,
  ) {}

  private assertCanView() {
    if (!canViewBaseline(this.currentUser)) {
      throw new Error("You cannot view the financial baseline.");
    }
  }

  async getBaseline(options?: { windowMonths?: number }): Promise<BaselineData> {
    this.assertCanView();

    const windowMonths = options?.windowMonths ?? 12;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (windowMonths - 1), 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const [invoicesResponse, contactsResponse, jobsResponse] = await Promise.all([
      this.client
        .from("invoices")
        .select("id, contact_id, job_id, created_at, total")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null)
        .gte("created_at", startDate),
      this.client
        .from("contacts")
        .select("id, name, company_name")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null),
      this.client
        .from("jobs")
        .select("id, actual_start, actual_end")
        .eq("org_id", this.context.orgId)
        .is("deleted_at", null)
        .not("actual_start", "is", null)
        .not("actual_end", "is", null)
        .gte("actual_end", startDate),
    ]);

    if (invoicesResponse.error) {
      throw invoicesResponse.error;
    }
    if (contactsResponse.error) {
      throw contactsResponse.error;
    }
    if (jobsResponse.error) {
      throw jobsResponse.error;
    }

    const invoices = (invoicesResponse.data ?? []).filter((invoice) => {
      const bucketDate = invoice.created_at;
      return bucketDate >= startDate && bucketDate <= endDate;
    });
    const contactNameById = new Map(
      (contactsResponse.data ?? []).map((contact) => [
        String(contact.id),
        contact.company_name?.trim() || contact.name,
      ]),
    );

    const monthBuckets = new Map<string, { total: number; count: number }>();
    for (let offset = 0; offset < windowMonths; offset += 1) {
      const bucketDate = new Date(start.getFullYear(), start.getMonth() + offset, 1);
      const key = `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, "0")}`;
      monthBuckets.set(key, { total: 0, count: 0 });
    }

    const customerBuckets = new Map<string, { total: number; count: number }>();
    const jobRevenueById = new Map<string, number>();
    let totalInvoicedRevenue = 0;

    for (const invoice of invoices) {
      const bucketDate = invoice.created_at;
      const key = monthKey(bucketDate);
      const monthBucket = monthBuckets.get(key);
      if (monthBucket) {
        monthBucket.total = roundMoney(monthBucket.total + invoice.total);
        monthBucket.count += 1;
      }

      const contactId = String(invoice.contact_id);
      const customerBucket = customerBuckets.get(contactId) ?? { total: 0, count: 0 };
      customerBucket.total = roundMoney(customerBucket.total + invoice.total);
      customerBucket.count += 1;
      customerBuckets.set(contactId, customerBucket);

      if (invoice.job_id) {
        const jobId = String(invoice.job_id);
        jobRevenueById.set(jobId, roundMoney((jobRevenueById.get(jobId) ?? 0) + invoice.total));
      }

      totalInvoicedRevenue = roundMoney(totalInvoicedRevenue + invoice.total);
    }

    const monthlyRevenue: BaselineMonthRevenue[] = Array.from(monthBuckets.entries()).map(([key, bucket]) => ({
      month: key,
      label: monthLabel(key),
      invoicedRevenue: bucket.total,
      invoiceCount: bucket.count,
    }));

    const customerRevenue = Array.from(customerBuckets.entries())
      .map(([contactId, bucket]) => ({
        contactId,
        customerName: contactNameById.get(contactId) ?? "Unknown customer",
        invoicedRevenue: bucket.total,
        invoiceCount: bucket.count,
        percentOfTotal: totalInvoicedRevenue > 0 ? roundMoney((bucket.total / totalInvoicedRevenue) * 100) : 0,
      }))
      .sort((left, right) => right.invoicedRevenue - left.invoicedRevenue);

    const topCustomers = customerRevenue.slice(0, 10);
    const top10SharePct =
      totalInvoicedRevenue > 0
        ? roundMoney((topCustomers.reduce((sum, customer) => sum + customer.invoicedRevenue, 0) / totalInvoicedRevenue) * 100)
        : null;

    const jobRevenues = Array.from(jobRevenueById.values());
    const averageJobSize =
      jobRevenues.length > 0 ? roundMoney(jobRevenues.reduce((sum, value) => sum + value, 0) / jobRevenues.length) : null;

    const jobDurations = (jobsResponse.data ?? [])
      .map((job) => {
        const start = new Date(job.actual_start as string).getTime();
        const end = new Date(job.actual_end as string).getTime();
        return (end - start) / (24 * 60 * 60 * 1000);
      })
      .filter((days) => Number.isFinite(days) && days >= 0);
    const averageJobDurationDays =
      jobDurations.length > 0
        ? roundMoney(jobDurations.reduce((sum, days) => sum + days, 0) / jobDurations.length)
        : null;

    return {
      windowMonths,
      startDate,
      endDate,
      totalInvoicedRevenue,
      monthlyRevenue,
      topCustomers,
      top10SharePct,
      customerCount: customerRevenue.length,
      averageJobSize,
      jobsWithInvoicesCount: jobRevenues.length,
      averageJobDurationDays,
      jobsWithDurationCount: jobDurations.length,
    };
  }
}
