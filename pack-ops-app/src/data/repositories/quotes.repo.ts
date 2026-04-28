import type {
  CreateQuoteRecordInput,
  Quote,
  UpdateQuoteRecordInput,
} from "@/domain/quotes/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface QuoteFilter {
  status?: Quote["status"];
}

export type QuotesRepository = Repository<
  Quote,
  CreateQuoteRecordInput,
  UpdateQuoteRecordInput,
  QuoteFilter
>;
