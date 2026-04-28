import type { QuoteLineItem, QuoteLineItemInput } from "@/domain/quotes/types";

export interface QuoteLineItemsRepository {
  listByQuoteIds(quoteIds: string[]): Promise<QuoteLineItem[]>;
  create(quoteId: string, input: QuoteLineItemInput): Promise<QuoteLineItem>;
  update(itemId: string, input: QuoteLineItemInput): Promise<QuoteLineItem>;
  hardDelete(itemId: string): Promise<void>;
}
