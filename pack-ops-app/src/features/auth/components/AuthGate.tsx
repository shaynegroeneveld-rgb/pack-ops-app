import { useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import { AppShell } from "@/features/shell/components/AppShell";

export function AuthGate() {
  const {
    currentUser,
    isLoading,
    authStatus,
    authError,
    unusableReason,
    signInWithPassword,
    sendMagicLink,
    signOut,
  } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) {
    return <main style={{ padding: "24px", fontFamily: "ui-sans-serif, system-ui" }}>Loading session…</main>;
  }

  if (currentUser) {
    return <AppShell />;
  }

  if (authStatus === "unusable") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", fontFamily: "ui-sans-serif, system-ui" }}>
        <section style={{ width: "100%", maxWidth: "480px", border: "1px solid #f0c36d", borderRadius: "18px", padding: "24px", background: "#fffaf0" }}>
          <h1 style={{ marginTop: 0 }}>Account Not Ready</h1>
          <p style={{ color: "#5b6475" }}>
            {unusableReason ?? "Your account signed in successfully, but Pack Ops could not find an active user profile for it."}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => signOut()}>Sign Out</button>
          </div>
        </section>
      </main>
    );
  }

  if (authStatus === "error") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", fontFamily: "ui-sans-serif, system-ui" }}>
        <section style={{ width: "100%", maxWidth: "480px", border: "1px solid #f1b5b5", borderRadius: "18px", padding: "24px", background: "#fff5f5" }}>
          <h1 style={{ marginTop: 0 }}>Session Could Not Load</h1>
          <p style={{ color: "#5b6475" }}>
            {authError ?? "The auth session did not initialize cleanly. Check the console logs for the bootstrap trace."}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => window.location.reload()}>Retry</button>
            <button onClick={() => signOut()}>Clear Session</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", fontFamily: "ui-sans-serif, system-ui" }}>
      <section style={{ width: "100%", maxWidth: "420px", border: "1px solid #d9dfeb", borderRadius: "18px", padding: "24px" }}>
        <h1 style={{ marginTop: 0 }}>Pack Ops Sign In</h1>
        <p style={{ color: "#5b6475" }}>Use your real Supabase account. This screen only exists to exercise the Workbench slice.</p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button onClick={() => setMode("password")} disabled={mode === "password"}>Email + Password</button>
          <button onClick={() => setMode("magic")} disabled={mode === "magic"}>Magic Link</button>
        </div>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            try {
              if (mode === "password") {
                await signInWithPassword(email, password);
              } else {
                await sendMagicLink(email);
                setMessage("Magic link sent. Check your email.");
              }
            } catch (authError) {
              setError(authError instanceof Error ? authError.message : "Authentication failed.");
            }
          }}
          style={{ display: "grid", gap: "12px" }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {mode === "password" ? (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          ) : null}
          <button type="submit">{mode === "password" ? "Sign In" : "Send Magic Link"}</button>
        </form>

        {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
        {message ? <p style={{ color: "#027a48" }}>{message}</p> : null}
      </section>
    </main>
  );
}
