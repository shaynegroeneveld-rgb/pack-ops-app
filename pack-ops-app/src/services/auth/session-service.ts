import type { AuthenticatedUser } from "@/domain/users/types";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export interface HydratedSessionResult {
  authenticatedUser: AuthenticatedUser | null;
  isUnusableProfile: boolean;
}

export interface SessionService {
  getCurrentSession(): Promise<Session | null>;
  hydrateSession(session: Session | null): Promise<HydratedSessionResult>;
  signInWithPassword(email: string, password: string): Promise<Session | null>;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(
    callback: (session: Session | null, event: AuthChangeEvent) => void,
  ): () => void;
}
