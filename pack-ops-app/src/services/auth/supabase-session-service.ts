import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

import { usersMapper } from "@/data/mappers/users.mapper";
import { isOffline } from "@/data/offline/cache";
import type { User } from "@/domain/users/types";

import type { Database } from "@/data/supabase/types";
import type { SessionService, HydratedSessionResult } from "@/services/auth/session-service";

const PROFILE_KEY = "pack-ops:offline-profile";

export class SupabaseSessionService implements SessionService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async loadUser(session: Session) {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async getCurrentSession(): Promise<Session | null> {
    if (isOffline()) {
      const url = import.meta.env.VITE_SUPABASE_URL;
      if (!url) return null;
      const ref = new URL(url).hostname.split(".")[0];
      try {
        const session = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? "null") as Session | null;
        return session?.user?.id && session.access_token ? session : null;
      } catch { return null; }
    }
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      throw error;
    }

    return data.session;
  }

  async hydrateSession(session: Session | null): Promise<HydratedSessionResult> {
    if (!session?.user) {
      return {
        authenticatedUser: null,
        isUnusableProfile: false,
      };
    }

    if (isOffline()) {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as { user: User; savedAt: number } | null;
      if (!saved || saved.user.id !== session.user.id || saved.user.deletedAt || Date.now() - saved.savedAt > 7 * 24 * 60 * 60 * 1000) {
        throw new Error("Connect and sign in once to enable offline access on this device.");
      }
      return { authenticatedUser: { user: saved.user, accessToken: session.access_token }, isUnusableProfile: false };
    }

    let data = await this.loadUser(session);

    if (!data) {
      const { data: claimed, error } = await this.client.rpc("fn_claim_pending_user_invite");
      if (error) {
        throw error;
      }

      if (claimed) {
        data = await this.loadUser(session);
      }
    }

    if (!data) {
      localStorage.removeItem(PROFILE_KEY);
      return {
        authenticatedUser: null,
        isUnusableProfile: true,
      };
    }

    const user = usersMapper.toDomain(data);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ user, savedAt: Date.now() }));
    return {
      authenticatedUser: {
        user,
        accessToken: session.access_token,
      },
      isUnusableProfile: false,
    };
  }

  async signInWithPassword(email: string, password: string): Promise<Session | null> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    return data.session;
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(PROFILE_KEY);
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw error;
    }
  }

  onAuthStateChange(
    callback: (session: Session | null, event: AuthChangeEvent) => void,
  ): () => void {
    let active = true;
    const subscription = this.client.auth.onAuthStateChange((event, session) => {
      // Run profile requests after Supabase releases its auth lock.
      setTimeout(() => {
        if (!active) return;
        if (event === "SIGNED_OUT") localStorage.removeItem(PROFILE_KEY);
        callback(session, event);
      }, 0);
    });

    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }
}
