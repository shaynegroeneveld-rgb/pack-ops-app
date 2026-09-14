# Pack Ops takeoff editor

This source replaces the previously prebuilt-only editor. It was recovered from the local editor whose built JavaScript exactly matched the deployed `index-DDdwjg2H.js` bundle.

Install from the parent Pack Ops app with `npm ci`. `npm run build` builds this workspace and copies its versioned assets into `public/takeoff` before building Pack Ops. `npm run typecheck` checks both apps. `npm test` runs calculation, quote conversion, and navigation regressions. Run the editor alone with `npm run dev --workspace electrical-takeoff-app`.

Production is the GitHub-connected Cloudflare Pages app. Do not use the legacy Wrangler Worker deployment command.
