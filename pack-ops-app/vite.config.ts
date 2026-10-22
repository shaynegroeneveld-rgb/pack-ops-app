import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { offlinePlugin } from "./scripts/offline-plugin";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare(), offlinePlugin()],
  server: {
    host: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
