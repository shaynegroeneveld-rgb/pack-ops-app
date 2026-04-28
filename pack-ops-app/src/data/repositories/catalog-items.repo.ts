import type { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "@/domain/materials/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface CatalogItemFilter {
  includeInactive?: boolean;
}

export type CatalogItemsRepository = Repository<
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  CatalogItemFilter
>;
