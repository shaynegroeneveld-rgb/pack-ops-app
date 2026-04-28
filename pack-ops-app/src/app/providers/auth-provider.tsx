import { useEffect, useMemo, useRef, useState } from "react";

import { AuthContext, type AuthStatus } from "@/app/contexts/auth-context";
import { getSupabaseClient } from "@/data/supabase/client";
import type { AuthenticatedUser } from "@/domain/users/types";
import { SupabaseSessionService } from "@/services/auth/supabase-session-service";
import type { HydratedSessionResult } from "@/services/auth/session-service";
import type { Session } from "@supabase/supabase-js";

export interface AuthProviderProps {
  children: React.ReactNode;
}

interface AuthProviderState {
  currentUser: AuthenticatedUser | null;
  authStatus: AuthStatus;
  unusableReason: string | null;
  authError: string | null;
}

const AUTH_BOOT_TIMEOUT_MS = 8000;

function createAuthState(
  authStatus: AuthStatus,
  overrides?: Partial<Omit<AuthProviderState, "authStatus">>,
): AuthProviderState {
  return {
    currentUser: null,
    authStatus,
    unusableReason: null,
    authError: null,
    ...overrides,
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthProviderState>(() => createAuthState("loading"));
  const client = getSupabaseClient(import.meta.env);
  const sessionService = useMemo(() => new SupabaseSessionService(client), [client]);
  const latestHydrationIdRef = useRef(0);

  function log(message: string, details?: unknown) {
    if (details === undefined) {
      console.info(`[AuthProvider] ${message}`);
      return;
    }

    console.info(`[AuthProvider] ${message}`, details);
  }

  function applyFinalState(nextState: AuthProviderState) {
    setAuthState(nextState);
    log("final auth state", {
      authStatus: nextState.authStatus,
      userId: nextState.currentUser?.user.id ?? null,
      orgId: nextState.currentUser?.user.orgId ?? null,
      unusableReason: nextState.unusableReason,
      authError: nextState.authError,
    });
  }

  async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${AUTH_BOOT_TIMEOUT_MS}ms.`));
      }, AUTH_BOOT_TIMEOUT_MS);

      promise.then(
        (value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }

  async function resolveSession(
    session: Session | null,
    reason: string,
    hydrationId: number,
  ): Promise<void> {
    log("profile hydration start", {
      reason,
      hydrationId,
      sessionUserId: session?.user?.id ?? null,
      sessionEmail: session?.user?.email ?? null,
    });

    try {
      const hydrated = await withTimeout(
        sessionService.hydrateSession(session),
        `Auth hydration (${reason})`,
      );

      if (latestHydrationIdRef.current !== hydrationId) {
        log("skipping stale auth hydration result", { reason, hydrationId });
        return;
      }

      log("profile hydration success", {
        reason,
        hydrationId,
        isUnusableProfile: hydrated.isUnusableProfile,
        userId: hydrated.authenticatedUser?.user.id ?? null,
      });

      applyHydratedState(hydrated, session);
    } catch (error) {
      if (latestHydrationIdRef.current !== hydrationId) {
        log("ignoring stale auth hydration failure", { reason, hydrationId });
        return;
      }

      log("profile hydration failure", {
        reason,
        hydrationId,
        error: error instanceof Error ? error.message : String(error),
      });

      applyFinalState(
        createAuthState("error", {
          authError: error instanceof Error ? error.message : "Could not initialize auth session.",
        }),
      );
    }
  }

  function applyHydratedState(hydrated: HydratedSessionResult, session: Session | null) {
    if (!session?.user) {
      applyFinalState(createAuthState("anonymous"));
      return;
    }

    if (hydrated.authenticatedUser) {
      applyFinalState(
        createAuthState("authenticated", {
          currentUser: hydrated.authenticatedUser,
        }),
      );
      return;
    }

    if (hydrated.isUnusableProfile) {
      applyFinalState(
        createAuthState("unusable", {
          unusableReason:
            "This account is authenticated, but it does not have an active Pack Ops user profile yet.",
        }),
      );
      return;
    }

    applyFinalState(createAuthState("anonymous"));
  }

  useEffect(() => {
    let isMounted = true;
    log("auth provider mount");
    setAuthState(createAuthState("loading"));

    const bootstrapHydrationId = ++latestHydrationIdRef.current;

    void withTimeout(sessionService.getCurrentSession(), "Initial auth session lookup")
      .then((session) => {
        log("getSession result", {
          hasSession: Boolean(session),
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
        });

        if (!isMounted) {
          return;
        }

        return resolveSession(session, "initial_get_session", bootstrapHydrationId);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        log("getSession failure", {
          error: error instanceof Error ? error.message : String(error),
        });
        applyFinalState(
          createAuthState("error", {
            authError: error instanceof Error ? error.message : "Could not load the current auth session.",
          }),
        );
      });

    const unsubscribe = sessionService.onAuthStateChange((session, event) => {
      log("onAuthStateChange event", {
        event,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      });

      if (!isMounted) {
        return;
      }

      const hydrationId = ++latestHydrationIdRef.current;
      void resolveSession(session, `auth_event:${event}`, hydrationId);
    });

    return () => {
      isMounted = false;
      log("auth provider unmount");
      unsubscribe();
    };
  }, [sessionService]);

  return (
    <AuthContext.Provider
      value={{
        currentUser: authState.currentUser,
        authStatus: authState.authStatus,
        isLoading: authState.authStatus === "loading",
        unusableReason: authState.unusableReason,
        authError: authState.authError,
        signInWithPassword: async (email, password) => {
          applyFinalState(createAuthState("loading"));
          try {
            const session = await withTimeout(
              sessionService.signInWithPassword(email, password),
              "Password sign-in",
            );
            log("getSession result", {
              source: "signInWithPassword",
              hasSession: Boolean(session),
              userId: session?.user?.id ?? null,
              email: session?.user?.email ?? null,
            });
            const hydrationId = ++latestHydrationIdRef.current;
            await resolveSession(session, "password_sign_in", hydrationId);
          } catch (error) {
            applyFinalState(
              createAuthState("error", {
                authError: error instanceof Error ? error.message : "Sign-in failed.",
              }),
            );
            throw error;
          }
        },
        sendMagicLink: async (email) => {
          await sessionService.sendMagicLink(email);
        },
        signOut: async () => {
          await sessionService.signOut();
          applyFinalState(createAuthState("anonymous"));
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
