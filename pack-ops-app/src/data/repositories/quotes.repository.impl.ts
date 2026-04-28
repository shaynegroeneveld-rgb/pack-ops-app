import type { SupabaseClient } from "@supabase/supabase-js";

import { localDb } from "@/data/dexie/db";
import { quotesMapper } from "@/data/mappers/quotes.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { QuoteFilter, QuotesRepository } from "@/data/repositories/quotes.repo";
import type { Database } from "@/data/supabase/types";
import type {
  CreateQuoteRecordInput,
  Quote,
  UpdateQuoteRecordInput,
} from "@/domain/quotes/types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export class QuotesRepositoryImpl implements QuotesRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async list(options?: { filter?: QuoteFilter }): Promise<Quote[]> {
    let query = this.client
      .from("quotes")
      .select("*")
      .eq("org_id", this.context.orgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (options?.filter?.status) {
      query = query.eq("status", options.filter.status);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const quotes = (data ?? []).map((row) => quotesMapper.toDomain(row));
    await localDb.quotes.bulkPut(quotes);
    return quotes;
  }

  async getById(id: string): Promise<Quote | null> {
    const { data, error } = await this.client
      .from("quotes")
      .select("*")
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const quote = quotesMapper.toDomain(data);
    await localDb.quotes.put(quote);
    return quote;
  }

  async create(input: CreateQuoteRecordInput): Promise<Quote> {
    const now = new Date().toISOString();
    const insertPayload: Database["public"]["Tables"]["quotes"]["Insert"] = {
      org_id: this.context.orgId,
      created_by: this.context.actorUserId,
      updated_by: this.context.actorUserId,
      created_at: now,
      updated_at: now,
      contact_id: input.contactId,
      lead_id: input.leadId ?? null,
      number: input.number,
      title: input.title,
      status: input.status ?? "draft",
      internal_notes: input.internalNotes ?? null,
      labor_cost_rate: input.laborCostRate ?? 65,
      labor_sell_rate: input.laborSellRate ?? 95,
      labor_rate: input.laborSellRate ?? 95,
      customer_notes: input.customerNotes ?? null,
      subtotal: roundMoney(input.subtotal ?? 0),
      tax_rate: input.taxRate ?? 0,
      tax_amount: roundMoney((input.subtotal ?? 0) * (input.taxRate ?? 0)),
      total: roundMoney((input.subtotal ?? 0) + (input.subtotal ?? 0) * (input.taxRate ?? 0)),
      expires_at: input.expiresAt ?? null,
    };

    const { data, error } = await this.client
      .from("quotes")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const quote = quotesMapper.toDomain(data);
    await localDb.quotes.put(quote);
    return quote;
  }

  async update(id: string, input: UpdateQuoteRecordInput): Promise<Quote> {
    const { data, error } = await this.client
      .from("quotes")
      .update({
        updated_by: this.context.actorUserId,
        updated_at: new Date().toISOString(),
        ...quotesMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const quote = quotesMapper.toDomain(data);
    await localDb.quotes.put(quote);
    return quote;
  }

  async softDelete(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    const { error } = await (this.client as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>;
    }).rpc("fn_soft_delete_quote", {
      p_quote_id: id,
      p_deleted_at: deletedAt,
    });

    if (error) {
      throw error;
    }
  }
}
