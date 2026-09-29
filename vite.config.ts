import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * pdf.js fetches its image decoders (JPEG 2000, JBIG2 — common in scanned drawings), colour profiles and the
 * standard fonts at run time. They're served from /pdfjs/, copied from the package so they always match it.
 */
function pdfjsAssets(): Plugin {
  const root = path.resolve("node_modules/pdfjs-dist");
  const dirs = ["wasm", "standard_fonts", "iccs"];
  const files = () =>
    dirs.flatMap((d) =>
      fs
        .readdirSync(path.join(root, d))
        .filter((f) => !f.startsWith("LICENSE") && !f.startsWith("quickjs"))
        .map((f) => `${d}/${f}`)
    );
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(/^\/+/, "");
        if (!files().includes(rel)) return next();
        if (rel.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        res.end(fs.readFileSync(path.join(root, rel)));
      });
    },
    applyToEnvironment: (env) => env.name === "client",
    generateBundle() {
      for (const f of files()) this.emitFile({ type: "asset", fileName: `pdfjs/${f}`, source: fs.readFileSync(path.join(root, f)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflare(), pdfjsAssets()],
});
