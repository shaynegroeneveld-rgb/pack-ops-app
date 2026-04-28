import { OrgContext } from "@/app/contexts/org-context";
import { useAuthContext } from "@/app/contexts/auth-context";

export interface OrgProviderProps {
  children: React.ReactNode;
}

export function OrgProvider({ children }: OrgProviderProps) {
  const { currentUser, isLoading } = useAuthContext();

  return (
    <OrgContext.Provider
      value={{
        orgId: currentUser?.user.orgId ?? null,
        isLoading,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
