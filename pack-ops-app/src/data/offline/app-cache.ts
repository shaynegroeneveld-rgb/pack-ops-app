let registration: Promise<ServiceWorkerRegistration> | undefined;

export async function ensureOfflineApp(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("This browser does not support offline app downloads.");
  registration ??= navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => { registration = undefined; throw error; });
  await registration;
  let timeout: number | undefined;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => reject(new Error("Offline app download did not finish. Keep the app open with a connection and try again.")), 45_000);
    })]);
  } finally { window.clearTimeout(timeout); }
}

export function scheduleOfflineApp() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const start = () => window.setTimeout(() => { void ensureOfflineApp().catch(console.error); }, 10_000);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
