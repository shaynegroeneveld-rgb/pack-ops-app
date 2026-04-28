import type { MutationMeta } from "@/domain/shared/dto";

export interface RepositoryContext {
  orgId: string;
  actorUserId: string | null;
  meta?: MutationMeta;
}

export interface RepositoryResult<TEntity> {
  entity: TEntity;
  source: "remote" | "local_cache";
}

export interface RepositoryWriteResult<TEntity> extends RepositoryResult<TEntity> {
  queuedForSync: boolean;
}
