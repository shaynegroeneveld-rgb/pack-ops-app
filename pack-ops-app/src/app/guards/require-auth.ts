import type { AuthContextValue } from "@/app/contexts/auth-context";

export function requiresAuth(auth: AuthContextValue): boolean {
  return auth.currentUser !== null;
}
