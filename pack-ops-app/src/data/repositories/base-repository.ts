import type { PaginationInput } from "@/domain/shared/dto";

export interface RepositoryListOptions<TFilter> {
  pagination?: PaginationInput;
  filter?: TFilter;
}

export interface Repository<TEntity, TCreate, TUpdate, TFilter = Record<string, never>> {
  list(options?: RepositoryListOptions<TFilter>): Promise<TEntity[]>;
  getById(id: string): Promise<TEntity | null>;
  create(input: TCreate): Promise<TEntity>;
  update(id: string, input: TUpdate): Promise<TEntity>;
  softDelete(id: string): Promise<void>;
}
