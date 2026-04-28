import type {
  Assembly,
  AssemblyItem,
  AssemblyItemInput,
  CreateAssemblyInput,
  UpdateAssemblyInput,
} from "@/domain/materials/types";

import type { Repository } from "@/data/repositories/base-repository";

export interface AssembliesRepository extends Repository<Assembly, CreateAssemblyInput, UpdateAssemblyInput, never> {}

export interface AssemblyItemsRepository {
  listByAssemblyIds(assemblyIds: string[]): Promise<AssemblyItem[]>;
  create(assemblyId: string, input: AssemblyItemInput): Promise<AssemblyItem>;
  update(itemId: string, input: AssemblyItemInput): Promise<AssemblyItem>;
  hardDelete(itemId: string): Promise<void>;
}
