# Offline readiness — October 22, 2026

The first offline field workflow is implemented. Before leaving reception, sign in, open Field, choose **Save jobs offline**, and wait for the downloaded job count. Stay signed in. A previously verified profile can reopen offline for up to seven days before an online sign-in is required again.

## Already implemented

- Dexie/IndexedDB stores local job data and an outbox of pending changes.
- Repository writes can save locally and enqueue sync operations.
- The sync engine retries failed writes with backoff and preserves ordering per entity.
- Pulls preserve local entities that still have queued changes.
- The shell displays offline, pending, syncing and failed states, with retry controls.
- A versioned service worker caches the app and screen code. Initial background caching starts after the page loads; Save jobs offline explicitly waits for the cache to be ready.
- Offline session hydration uses the saved profile only when it matches the existing Supabase session identity. Sign-out removes that offline profile.
- Save jobs offline downloads active assigned jobs, crew, the current week's schedule, material choices and job details into user/company-scoped snapshots.
- The full active material catalogue and assemblies are downloaded independently of job plans, including all catalogue pages, names, supplier codes and nicknames. The download confirmation shows material and assembly counts. Download again after catalogue changes; use All materials or search to add items that were not on the plan.
- Offline field screens read those snapshots and overlay saved hours, completed tasks and material changes from IndexedDB.
- Fractional hours and material usage can be saved offline; running timers and unfinished time drafts survive refresh. Stable request IDs prevent repeated saves from creating duplicate hours/material entries.
- New time entries, timer writes, task writes and offline material writes persist atomically with their queued operations.
- The app retries queued changes on reconnect and every 30 seconds while open and online. It checks the signed-in user before automatic replay. Flushes are scoped by company and actor, serialized across tabs where Web Locks are available, and recover interrupted processing entries.
- Pending hour edits are preserved during server refresh. Retried entity edits remain ordered behind their failed creation.

## Remaining gaps

- Office workflows, financial calculations, scheduling changes, job creation and assignment changes still require a connection.
- Notes, attachments, plan PDFs and uploads need an explicit download/cache and deferred-upload design. The field offline status explains these limitations.
- Offline access applies to data downloaded on that device. A new assignment or changed schedule is not available until refreshed online.
- Reconnection requires the app to remain open; there is no OS background sync while it is closed.
- A live connection with an unreachable server can still produce a network error instead of using snapshots, because the first release switches to offline reads when the browser reports offline.
- Broader multi-device edit conflict resolution and revoked-access behavior need further testing on field devices. Server permissions remain authoritative when queued writes are sent; rejected writes remain visible for correction.

## Recommended implementation sequence

1. Verify the workflow on the actual crew phones, including airplane mode and return to reception.
2. Add explicit plan downloads for offline use and show what is available on each device.
3. Extend cached reads to slow or unreachable networks even when the browser still reports online.
4. Add background-first refresh for faster online field views and broader conflict handling.
5. Extend support to other workflows only after the field scope has been used successfully.

Automated checks cover snapshot identity isolation, fractional-hour persistence and deduplication, cached assignment permissions, timer restart/stop persistence, material add/edit/remove persistence, reconnect filtering, interrupted processing recovery, delayed-entity ordering, unfinished time drafts and offline profile matching/expiry.
