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

    const { data, error } = await this.client
      .from("quote_line_items")
      .select("*")
      .eq("org_id", this.context.orgId)
      .in("quote_id", quoteIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => quoteLineItemsMapper.toDomain(row));
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
