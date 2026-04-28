import { createContext, useContext } from "react";

import type { AuthenticatedUser } from "@/domain/users/types";

export type AuthStatus = "loading" | "authenticated" | "unusable" | "anonymous" | "error";

export interface AuthContextValue {
  currentUser: AuthenticatedUser | null;
  authStatus: AuthStatus;
  isLoading: boolean;
  unusableReason: string | null;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider.");
  }

  return context;
}
