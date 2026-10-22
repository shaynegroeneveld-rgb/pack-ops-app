let registration: Promise<ServiceWorkerRegistration> | undefined;

export async function ensureOfflineApp(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("This browser does not support offline app downloads.");
  registration ??= navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => { registration = undefined; throw error; });
  await registration;
  let timeout: number | undefined;
  let onControl: (() => void) | undefined;
  const controlled = async () => {
    const ready = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      onControl = () => resolve();
      navigator.serviceWorker.addEventListener("controllerchange", onControl, { once: true });
      if (navigator.serviceWorker.controller) resolve();
    });
    return ready;
  };
  try {
    return await Promise.race([controlled(), new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => reject(new Error("Offline app download did not finish. Keep the app open with a connection and try again.")), 45_000);
    })]);
  } finally {
    window.clearTimeout(timeout);
    if (onControl) navigator.serviceWorker.removeEventListener("controllerchange", onControl);
  }
}

export function scheduleOfflineApp() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const start = () => window.setTimeout(() => { void ensureOfflineApp().catch(console.error); }, 10_000);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
