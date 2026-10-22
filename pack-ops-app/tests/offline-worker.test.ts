import { expect, it, vi } from "vitest";
import vm from "node:vm";
import { offlinePlugin } from "../scripts/offline-plugin";

function worker(cached: Response | undefined) {
  const listeners = new Map<string, (event: any) => void>();
  let source = "";
  const plugin: any = offlinePlugin();
  plugin.generateBundle.call({ emitFile: (file: any) => { source = file.source; } }, {}, { "assets/app.js": {} });
  vm.runInNewContext(source, {
    self: { location: { origin: "https://pack-ops-app.pages.dev" }, addEventListener: (name: string, handler: any) => listeners.set(name, handler) },
    caches: { open: async () => ({ match: async () => cached }) },
    fetch: async () => { throw new Error("No connection"); },
    URL, Response, AbortSignal,
  });
  return listeners.get("fetch")!;
}

it("serves Cloudflare's cached redirected home page as a fresh offline navigation response", async () => {
  const cached = new Response("<html>Pack Ops</html>", { headers: { "content-type": "text/html" } });
  Object.defineProperty(cached, "redirected", { value: true });
  let result: Promise<Response> | undefined;
  worker(cached)({ request: { method: "GET", url: "https://pack-ops-app.pages.dev/", mode: "navigate" }, respondWith: (response: Promise<Response>) => { result = response; } });
  const response = await result!;
  expect(response.redirected).toBe(false);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Pack Ops");
});

it("does not cache authenticated API calls or writes", () => {
  const respondWith = vi.fn();
  const handle = worker(undefined);
  handle({ request: { method: "GET", url: "https://example.supabase.co/rest/v1/jobs", mode: "cors" }, respondWith });
  handle({ request: { method: "POST", url: "https://pack-ops-app.pages.dev/api", mode: "cors" }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
