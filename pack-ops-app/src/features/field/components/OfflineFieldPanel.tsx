import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { localDb } from "@/data/dexie/db";
import { loadSnapshot } from "@/data/offline/cache";
import { ensureOfflineApp } from "@/data/offline/app-cache";
import { getSupabaseClient } from "@/data/supabase/client";
import type { AuthenticatedUser } from "@/domain/users/types";
import { WorkbenchService } from "@/services/workbench/workbench-service";
import { SchedulingService } from "@/services/scheduling/scheduling-service";
import { startOfWeek, endOfWeek, toDayKey, toScheduleRangeIso } from "./field-mode-shared";

export function OfflineFieldPanel({ currentUser, visible }: { currentUser: AuthenticatedUser; visible: boolean }) {
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(!navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [ready, setReady] = useState<{ count: number; savedAt: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const context = { orgId: currentUser.user.orgId, actorUserId: currentUser.user.id };

  useEffect(() => {
    let active = true;
    let syncing = false;
    const context = { orgId: currentUser.user.orgId, actorUserId: currentUser.user.id };
    const service = new WorkbenchService(context, currentUser.user, getSupabaseClient(import.meta.env));
    void loadSnapshot<{ count: number; savedAt: string }>(context, "offline-ready").then(value => { if (active) setReady(value); }).catch(() => {});
    const subscription = liveQuery(() => localDb.syncQueue.filter(row => row.orgId === context.orgId && row.actorUserId === context.actorUserId).toArray())
      .subscribe(rows => { setPending(rows.length); setFailed(rows.filter(row => row.status === "failed").length); });
    async function sync() {
      if (!navigator.onLine || syncing) return;
      syncing = true;
      try {
        const rows = await localDb.syncQueue.filter(row => row.orgId === context.orgId && row.actorUserId === context.actorUserId).count();
        if (!rows || !active) return;
        await service.flushSyncQueue();
        if (active) { setMessage(null); await queryClient.invalidateQueries(); }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Saved changes are waiting to sync.");
      } finally { syncing = false; }
    }
    function online() { setOffline(false); void sync(); }
    function offline() { setOffline(true); }
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const interval = window.setInterval(() => void sync(), 30_000);
    void sync();
    return () => { active = false; subscription.unsubscribe(); clearInterval(interval); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [currentUser.user.id, currentUser.user.orgId, queryClient]);

  async function prepare() {
    setSaving(true); setMessage(null);
    try {
      const client = getSupabaseClient(import.meta.env);
      const service = new WorkbenchService(context, currentUser.user, client);
      const scheduling = new SchedulingService(context, currentUser.user, client);
      const today = toDayKey();
      await ensureOfflineApp();
      await scheduling.getUpcomingScheduleBlocks({ from: toScheduleRangeIso(startOfWeek(today)), to: toScheduleRangeIso(endOfWeek(today), true) });
      const count = await service.prepareOfflineJobs();
      setReady({ count, savedAt: new Date().toISOString() });
      setMessage(`${count} assigned jobs saved. Stay signed in to use them offline. Plans, photos and uploads still need a connection.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not finish the offline download."); }
    finally { setSaving(false); }
  }

  if (!visible) return null;
  return <section aria-label="Offline access" style={{ padding: "12px 16px", background: offline ? "#fff7ed" : "#effaf3", color: "#16352c", fontSize: "14px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <span role="status">{offline ? `Offline · showing saved jobs${pending ? ` · ${pending} changes saved on this device` : ""}` : failed ? `${failed} changes need sync attention` : pending ? `${pending} changes saved on this device · waiting to sync` : "Online · no changes waiting to sync"}</span>
      <button type="button" disabled={offline || saving} onClick={() => void prepare()}>{saving ? "Saving jobs…" : "Save jobs offline"}</button>
    </div>
    {ready ? <div style={{ marginTop: "6px" }}>{ready.count} assigned jobs downloaded · {new Date(ready.savedAt).toLocaleString()}</div> : <div style={{ marginTop: "6px" }}>Before leaving reception, choose Save jobs offline.</div>}
    {message ? <div role="status" style={{ marginTop: "6px" }}>{message}</div> : null}
    {offline ? <div style={{ marginTop: "6px" }}>Stay signed in. Hours, assigned tasks and materials save on this device. Notes, plans, photos and uploads need a connection.</div> : null}
  </section>;
}
