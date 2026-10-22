import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupabaseSessionService } from "@/services/auth/supabase-session-service";

const session: any = { user: { id: "worker" }, access_token: "offline-test-session" };
const profile = { id: "worker", orgId: "company", role: "field", fullName: "Worker", deletedAt: null };
beforeEach(() => { vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); });
afterEach(() => vi.restoreAllMocks());
const service = () => new SupabaseSessionService({ from: () => { throw new Error("Unexpected online profile request"); } } as any);

it("opens an existing offline session using its previously verified profile", async () => {
  localStorage.setItem("pack-ops:offline-profile", JSON.stringify({ user: profile, savedAt: Date.now() }));
  expect((await service().hydrateSession(session)).authenticatedUser?.user.id).toBe("worker");
});

it.each([
  { user: { ...profile, id: "someone-else" }, savedAt: Date.now() },
  { user: { ...profile, deletedAt: new Date().toISOString() }, savedAt: Date.now() },
  { user: profile, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 },
])("rejects a different, deleted or expired offline identity", async saved => {
  localStorage.setItem("pack-ops:offline-profile", JSON.stringify(saved));
  await expect(service().hydrateSession(session)).rejects.toThrow("Connect and sign in");
});

it("does not authenticate from a cached profile after the session is cleared", async () => {
  localStorage.setItem("pack-ops:offline-profile", JSON.stringify({ user: profile, savedAt: Date.now() }));
  expect((await service().hydrateSession(null)).authenticatedUser).toBeNull();
});
