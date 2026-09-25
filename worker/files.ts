import { Hono } from "hono";
import type { AuthVariables } from "./auth";

type Env = { Bindings: { DB: D1Database }; Variables: AuthVariables };

/** Types the browser may render in place. Anything else downloads as opaque bytes. */
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export const files = new Hono<Env>();

// A file sent with an application, reassembled from the chunks the careers
// site stored. ?download=1 asks the browser to save it rather than show it.
files.get("/files/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const file = await c.env.DB.prepare(`SELECT filename, mime, size, sha256, chunks FROM careers_cv_files WHERE id = ?`)
    .bind(id)
    .first<{ filename: string; mime: string; size: number; sha256: string; chunks: number }>();
  if (!file) return c.json({ error: "Not found." }, 404);

  const { results } = await c.env.DB.prepare(`SELECT data FROM careers_cv_chunks WHERE file_id = ? ORDER BY seq`)
    .bind(id)
    .all<{ data: ArrayBuffer | Uint8Array | number[] }>();
  const parts = results.map(({ data }) => (data instanceof Uint8Array ? data : Array.isArray(data) ? Uint8Array.from(data) : new Uint8Array(data)));
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.length;
  }
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (parts.length !== file.chunks || body.length !== file.size || digest !== file.sha256.toLowerCase()) {
    console.error(`file ${id}: ${parts.length}/${file.chunks} chunks, ${body.length}/${file.size} bytes, sha256 ${digest === file.sha256.toLowerCase() ? "ok" : "mismatch"}`);
    return c.json({ error: "That file is incomplete or damaged." }, 500);
  }

  const mime = file.mime.toLowerCase().split(";")[0]!.trim();
  // A PDF must look like one: the type comes from the uploader, not from us.
  const inline = INLINE.has(mime) && (mime !== "application/pdf" || isPdf(body)) && c.req.query("download") === undefined;
  const headers = new Headers({
    "Content-Type": inline || INLINE.has(mime) ? mime : "application/octet-stream",
    "Content-Length": String(body.length),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; ${dispositionName(file.filename)}`,
    "X-Content-Type-Options": "nosniff",
    // Personal data: never keep a copy in a shared or on-disk cache.
    "Cache-Control": "private, no-store",
  });
  if (!inline) headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  return new Response(body, { headers });
});

const isPdf = (b: Uint8Array) => b.length > 4 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-";

/** filename= for old clients (ASCII only), filename*= with the real name. */
function dispositionName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
