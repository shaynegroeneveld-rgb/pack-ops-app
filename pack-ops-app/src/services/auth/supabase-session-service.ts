import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

import { usersMapper } from "@/data/mappers/users.mapper";
import type { Database } from "@/data/supabase/types";
import type { SessionService, HydratedSessionResult } from "@/services/auth/session-service";

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
      return {
        authenticatedUser: null,
        isUnusableProfile: true,
      };
    }

    return {
      authenticatedUser: {
        user: usersMapper.toDomain(data),
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
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw error;
    }
  }

  onAuthStateChange(
    callback: (session: Session | null, event: AuthChangeEvent) => void,
  ): () => void {
    const subscription = this.client.auth.onAuthStateChange((event, session) => {
      callback(session, event);
    });

    return () => {
      subscription.data.subscription.unsubscribe();
    };
  }
}
