import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function offlinePlugin(): Plugin {
  return {
    name: "pack-ops-offline",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `/${name}`).sort();
      const version = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 16);
      this.emitFile({ type: "asset", fileName: "sw.js", source: `
const CACHE = "pack-ops-app-${version}";
const FILES = ${JSON.stringify(["/", "/index.html", "/icon-192.png", "/manifest.webmanifest", ...files])};
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(FILES.map(async file => {
    const response = await fetch(file, { cache: "reload" });
    if (!response.ok || (/\\.(js|css)$/.test(file) && response.headers.get("content-type")?.includes("text/html"))) throw new Error("Offline download incomplete");
    await cache.put(file, response);
  }));
})()));
// Let an existing session finish before activating a new app version.
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("pack-ops-app-") && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && !url.pathname.startsWith("/takeoff")) {
    event.respondWith((async () => {
      try { return await fetch(event.request, { signal: AbortSignal.timeout(3500) }); }
      catch { return (await caches.open(CACHE)).match("/index.html"); }
    })());
  } else if (!url.search && FILES.includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(url.pathname)) || fetch(event.request))());
  }
});
` });
    },
  };
}
