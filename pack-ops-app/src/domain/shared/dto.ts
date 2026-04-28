export interface PaginationInput {
  limit?: number;
  cursor?: string;
}

export interface SortInput<TField extends string> {
  field: TField;
  direction: "asc" | "desc";
}

export interface DateRangeInput {
  from?: string;
  to?: string;
}

export interface MutationMeta {
  requestId?: string;
  source?: "ui" | "sync" | "automation" | "system";
}
