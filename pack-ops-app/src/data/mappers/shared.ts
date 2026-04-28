export interface RowToDomainMapper<TRow, TDomain> {
  toDomain(row: TRow): TDomain;
}

export interface DomainToWriteMapper<TCreate, TUpdate, TInsert, TPatch> {
  toInsert(input: TCreate): TInsert;
  toPatch(input: TUpdate): TPatch;
}

export interface RepositoryMapper<TRow, TDomain, TCreate, TUpdate, TInsert, TPatch>
  extends RowToDomainMapper<TRow, TDomain>,
    DomainToWriteMapper<TCreate, TUpdate, TInsert, TPatch> {}
