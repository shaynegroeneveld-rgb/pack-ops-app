import { forwardRef, useMemo } from 'react';
import type { AssemblyView } from '@/domain/materials/types';
import { MaterialSearchSelect, type MaterialSearchSelectHandle } from '@/features/materials/components/MaterialSearchSelect';
export type AssemblySearchSelectHandle = MaterialSearchSelectHandle;
interface Props { assemblies: AssemblyView[]; selectedAssemblyId: string; isPending: boolean; placeholder?: string; onSelect: (id: string) => void; }
export const AssemblySearchSelect = forwardRef<AssemblySearchSelectHandle, Props>(function AssemblySearchSelect({ assemblies, selectedAssemblyId, isPending, placeholder = 'Search assembly or a material inside it…', onSelect }, ref) {
  const options = useMemo(() => assemblies.map(assembly => ({
    id: assembly.id, name: assembly.name, notes: assembly.description,
    aliases: assembly.items.flatMap(item => [item.materialName, item.materialSku ?? '']).filter(Boolean),
    searchCodes: assembly.items.map(item => item.materialSku ?? "").filter(Boolean),
    secondaryLabel: `${assembly.items.length} materials · ${assembly.defaultLaborHours} labour hrs`,
  })), [assemblies]);
  return <MaterialSearchSelect ref={ref} catalogItems={options} selectedMaterialId={selectedAssemblyId} isPending={isPending} placeholder={placeholder} onSelect={onSelect} label="Search assemblies" />;
});
