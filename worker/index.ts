import { Hono } from "hono";
import { requireAccess, type AccessEnv, type AuthVariables } from "./auth";
import {
  getCandidates,
  getClients,
  getEmployees,
  getFeed,
  getGantt,
  getMetrics,
  getOpsBoard,
  getRegions,
  getRoles,
} from "./db";

interface Env extends AccessEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Every request, including the static app shell, must pass Cloudflare Access.
app.use("*", requireAccess);

app.get("/api/me", (c) => c.json({ email: c.get("userEmail") }));

app.get("/api/metrics", async (c) => c.json(await getMetrics(c.env.DB)));
app.get("/api/employees", async (c) => c.json(await getEmployees(c.env.DB)));
app.get("/api/clients", async (c) => c.json(await getClients(c.env.DB)));
app.get("/api/ops/board", async (c) => c.json(await getOpsBoard(c.env.DB)));
app.get("/api/ops/gantt", async (c) => c.json(await getGantt(c.env.DB)));
app.get("/api/recruitment/roles", async (c) => c.json(await getRoles(c.env.DB)));
app.get("/api/recruitment/candidates", async (c) => c.json(await getCandidates(c.env.DB)));
app.get("/api/intel/feed", async (c) => c.json(await getFeed(c.env.DB)));
app.get("/api/intel/regions", async (c) => c.json(await getRegions(c.env.DB)));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
