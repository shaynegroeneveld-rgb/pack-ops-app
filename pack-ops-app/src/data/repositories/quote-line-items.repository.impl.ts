import type { SupabaseClient } from "@supabase/supabase-js";

import { quoteLineItemsMapper } from "@/data/mappers/quote-line-items.mapper";
import type { RepositoryContext } from "@/data/repositories/contracts";
import type { QuoteLineItemsRepository } from "@/data/repositories/quote-line-items.repo";
import type { Database } from "@/data/supabase/types";
import type { QuoteLineItem, QuoteLineItemInput } from "@/domain/quotes/types";

export class QuoteLineItemsRepositoryImpl implements QuoteLineItemsRepository {
  constructor(
    private readonly context: RepositoryContext,
    private readonly client: SupabaseClient<Database>,
  ) {}

  async listByQuoteIds(quoteIds: string[]): Promise<QuoteLineItem[]> {
    if (quoteIds.length === 0) {
      return [];
    }

    const rows: Database["public"]["Tables"]["quote_line_items"]["Row"][] = [];
    let total: number | null = null;
    while (true) {
      const {data, error, count} = await this.client.from("quote_line_items")
        .select("*", rows.length === 0 ? {count: "exact"} : {})
        .eq("org_id", this.context.orgId).in("quote_id", quoteIds)
        .order("sort_order", {ascending: true}).order("created_at", {ascending: true}).order("id", {ascending: true})
        .range(rows.length, rows.length + 499);
      if (error) throw error;
      if (rows.length === 0) total = count;
      const page = data ?? [];
      if (!page.length) {
        if (total !== null && rows.length < total) throw new Error("Quote lines changed while loading. Please retry.");
        break;
      }
      rows.push(...page);
      if (total !== null ? rows.length >= total : page.length < 500) break;
    }
    return rows.map(row => quoteLineItemsMapper.toDomain(row));
  }

  async create(quoteId: string, input: QuoteLineItemInput): Promise<QuoteLineItem> {
    const now = new Date().toISOString();
    const mappedInsert = quoteLineItemsMapper.toInsert(
      input,
    ) as Database["public"]["Tables"]["quote_line_items"]["Insert"];
    const insertPayload: Database["public"]["Tables"]["quote_line_items"]["Insert"] = {
      ...mappedInsert,
      org_id: this.context.orgId,
      quote_id: quoteId,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await this.client
      .from("quote_line_items")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return quoteLineItemsMapper.toDomain(data);
  }

  async update(itemId: string, input: QuoteLineItemInput): Promise<QuoteLineItem> {
    const { data, error } = await this.client
      .from("quote_line_items")
      .update({
        updated_at: new Date().toISOString(),
        ...quoteLineItemsMapper.toPatch(input),
      })
      .eq("org_id", this.context.orgId)
      .eq("id", itemId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return quoteLineItemsMapper.toDomain(data);
  }

  async hardDelete(itemId: string): Promise<void> {
    const { error } = await this.client
      .from("quote_line_items")
      .delete()
      .eq("org_id", this.context.orgId)
      .eq("id", itemId);

    if (error) {
      throw error;
    }
  }
}
