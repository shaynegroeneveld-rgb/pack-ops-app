# Offline readiness — October 22, 2026

The app has offline foundations, but is not ready to promise reliable offline use.

## Already implemented

- Dexie/IndexedDB stores local job data and an outbox of pending changes.
- Repository writes can save locally and enqueue sync operations.
- The sync engine retries failed writes with backoff and preserves ordering per entity.
- Pulls preserve local entities that still have queued changes.
- The shell displays offline, pending, syncing and failed states, with retry controls.

## Remaining gaps

- No service worker or app-shell precache: reopening or refreshing without a connection is not guaranteed to load the app. A web app manifest alone does not provide this.
- Session hydration fetches the user profile from Supabase. There is no offline profile bootstrap; network failures prevent opening a session normally.
- Workbench reads await remote refreshes and office data queries. IndexedDB exists, but the screens are not consistently local-first.
- Some save workflows await a flush and authoritative server confirmation. A local queued write does not guarantee the screen reports a successful offline save.
- The online event updates the status indicator; reconnect recovery needs a consistent sync coordinator rather than depending on individual screen actions.
- Attachments, plan PDFs and uploads need an explicit download/cache and deferred-upload design.

## Recommended implementation sequence

1. Define offline scope around assigned field jobs, time, tasks and material usage.
2. Add a versioned app cache with a controlled update flow and cached field screen chunks.
3. Add user-scoped offline session bootstrap, explicit sign-out cleanup, and online access revalidation.
4. Render cached assigned jobs immediately, refresh in the background, and distinguish saved-on-device from synced.
5. Coordinate reconnect sync and handle conflicts, expired sessions and rejected writes without losing local changes.
6. Add explicit plan downloads for offline use and show what is available on this device.
7. Verify airplane-mode reopening, refresh, timer restart, queued edits, reconnection, account switching and app updates on actual field devices.

The loading optimization in this change loads screen code on demand. Unvisited screens therefore still need a connection until the app cache work is implemented.
