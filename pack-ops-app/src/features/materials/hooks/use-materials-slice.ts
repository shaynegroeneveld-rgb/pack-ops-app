import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "@/data/supabase/client";
import type {
  AssemblyView,
  CatalogCleanupPair,
  CatalogCleanupResolution,
  CatalogItem,
  MaterialImportRollbackPreview,
  MaterialReconciliationPreview,
  MaterialReconciliationResolution,
  PurchaseHistoryImportRow,
  SupplierInvoiceImportRow,
  SupplierInvoiceReviewPreview,
  SupplierInvoiceReviewResolution,
} from "@/domain/materials/types";
import type { AuthenticatedUser } from "@/domain/users/types";
import { MaterialsService } from "@/services/materials/materials-service";

const MATERIALS_QUERY_KEY = ["materials", "catalog"];
const ASSEMBLIES_QUERY_KEY = ["materials", "assemblies"];

export function useMaterialsSlice(authenticatedUser: AuthenticatedUser) {
  const queryClient = useQueryClient();
  const client = getSupabaseClient(import.meta.env);

  const service = useMemo(
    () =>
      new MaterialsService(
        {
          orgId: authenticatedUser.user.orgId,
          actorUserId: authenticatedUser.user.id,
        },
        authenticatedUser.user,
        client,
      ),
    [
      authenticatedUser.user.id,
      authenticatedUser.user.orgId,
      authenticatedUser.user.role,
      authenticatedUser.user.isForeman,
      authenticatedUser.user.canApproveTime,
      client,
    ],
  );

  const canManage =
    authenticatedUser.user.role === "owner" || authenticatedUser.user.role === "office";

  const catalogQuery = useQuery({
    queryKey: [...MATERIALS_QUERY_KEY, authenticatedUser.user.id],
    queryFn: () => service.listCatalogItems({ includeInactive: true }),
    enabled: canManage,
  });

  const assembliesQuery = useQuery({
    queryKey: [...ASSEMBLIES_QUERY_KEY, authenticatedUser.user.id],
    queryFn: () => service.listAssemblies(),
    enabled: canManage,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...MATERIALS_QUERY_KEY, authenticatedUser.user.id] }),
      queryClient.invalidateQueries({ queryKey: [...ASSEMBLIES_QUERY_KEY, authenticatedUser.user.id] }),
    ]);
  };

  const createCatalogItem = useMutation({
    mutationFn: (input: Parameters<MaterialsService["createCatalogItem"]>[0]) => service.createCatalogItem(input),
    onSuccess: invalidate,
  });

  const updateCatalogItem = useMutation({
    mutationFn: (input: { itemId: CatalogItem["id"] } & Parameters<MaterialsService["updateCatalogItem"]>[1]) =>
      service.updateCatalogItem(input.itemId, input),
    onSuccess: invalidate,
  });

  const archiveCatalogItem = useMutation({
    mutationFn: (itemId: CatalogItem["id"]) => service.archiveCatalogItem(itemId),
    onSuccess: invalidate,
  });

  const importCatalogCsv = useMutation({
    mutationFn: (
      rows: Array<{ name?: string | null; sku?: string | null; cost?: number | null }>,
    ) => service.importCatalogCsvRows(rows),
    onSuccess: invalidate,
  });

  const analyzePurchaseHistoryImport = useMutation({
    mutationFn: (rows: PurchaseHistoryImportRow[]) => service.analyzePurchaseHistoryRows(rows),
  });

  const applyPurchaseHistoryReconciliation = useMutation({
    mutationFn: (input: { preview: MaterialReconciliationPreview; resolutions: MaterialReconciliationResolution[] }) =>
      service.applyPurchaseHistoryReconciliation(input),
    onSuccess: invalidate,
  });

  const analyzeSupplierInvoiceImport = useMutation({
    mutationFn: (rows: SupplierInvoiceImportRow[]) => service.analyzeSupplierInvoiceRows(rows),
  });

  const applySupplierInvoiceReview = useMutation({
    mutationFn: (input: { preview: SupplierInvoiceReviewPreview; resolutions: SupplierInvoiceReviewResolution[] }) =>
      service.applySupplierInvoiceReview(input),
    onSuccess: invalidate,
  });

  const analyzeCatalogCleanup = useMutation({
    mutationFn: () => service.analyzeCatalogCleanup(),
  });

  const applyCatalogCleanup = useMutation({
    mutationFn: (resolutions: CatalogCleanupResolution[]) => service.applyCatalogCleanup(resolutions),
    onSuccess: invalidate,
  });

  const inspectImportedMaterialRollback = useMutation({
    mutationFn: () => service.inspectImportedMaterialRollback(),
  });

  const rollbackImportedMaterials = useMutation({
    mutationFn: () => service.rollbackImportedMaterials(),
    onSuccess: invalidate,
  });

  const createAssembly = useMutation({
    mutationFn: (input: Parameters<MaterialsService["createAssembly"]>[0]) => service.createAssembly(input),
    onSuccess: invalidate,
  });

  const updateAssembly = useMutation({
    mutationFn: (input: { assemblyId: AssemblyView["id"] } & Parameters<MaterialsService["updateAssembly"]>[1]) =>
      service.updateAssembly(input.assemblyId, input),
    onSuccess: invalidate,
  });

  const duplicateAssembly = useMutation({
    mutationFn: (input: { assemblyId: AssemblyView["id"]; name?: string | null }) =>
      service.duplicateAssembly(input.assemblyId, { name: input.name ?? null }),
    onSuccess: invalidate,
  });

  const archiveAssembly = useMutation({
    mutationFn: (assemblyId: AssemblyView["id"]) => service.archiveAssembly(assemblyId),
    onSuccess: invalidate,
  });

  return {
    catalogQuery,
    assembliesQuery,
    createCatalogItem,
    updateCatalogItem,
    archiveCatalogItem,
    importCatalogCsv,
    analyzePurchaseHistoryImport,
    applyPurchaseHistoryReconciliation,
    analyzeSupplierInvoiceImport,
    applySupplierInvoiceReview,
    analyzeCatalogCleanup,
    applyCatalogCleanup,
    inspectImportedMaterialRollback,
    rollbackImportedMaterials,
    createAssembly,
    updateAssembly,
    duplicateAssembly,
    archiveAssembly,
  };
}
