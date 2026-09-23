import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static publish build: same React app, no Cloudflare Worker plugin, relative
// asset base so it can be served from any path (e.g. a published artifact URL).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist-static", emptyOutDir: true },
});
