import { Hono } from "hono";
import { requireAccess, type AccessEnv, type AuthVariables } from "./auth";
import { getPortal } from "./db";
import { files } from "./files";
import { handleApiError, writes } from "./writes";

interface Env extends AccessEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.onError(handleApiError);

// Every request, including the static app shell, must pass Cloudflare Access.
app.use("*", requireAccess);

// Writes only from the portal itself. Browsers won't send a custom header
// cross-site without a CORS preflight (which this Worker never answers), and a
// present Origin must be this host, so a signed-in user's Access cookie can't be
// ridden by another site to change records.
app.use("/api/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("Origin");
  if (c.req.header("X-Sandstone-Portal") !== "1" || (origin && origin !== new URL(c.req.url).origin)) {
    return c.json({ error: "Cross-site request refused." }, 403);
  }
  return next();
});

app.get("/api/me", (c) => c.json({ email: c.get("userEmail") }));
app.get("/api/portal", async (c) => c.json(await getPortal(c.env.DB, c.get("userEmail"))));
app.route("/api", files);
app.route("/api", writes);
app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
