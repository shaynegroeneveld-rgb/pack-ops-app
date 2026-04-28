import type { OrgId } from "@/domain/ids";

export interface OrgContextSnapshot {
  orgId: OrgId | null;
  isLoaded: boolean;
}

export interface OrgContextService {
  getSnapshot(): OrgContextSnapshot;
}
