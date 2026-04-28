import { createContext, useContext } from "react";

export interface OrgContextValue {
  orgId: string | null;
  isLoading: boolean;
}

export const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrgContext(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrgContext must be used inside OrgProvider.");
  }

  return context;
}
