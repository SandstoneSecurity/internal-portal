import { Hono } from "hono";
import { z } from "zod";
import { CONTROL_BY_KEY, DOMAINS, ENTRY_TYPES, SITE_KINDS, THREAT_BY_KEY, ZONE_CLASSES, ASSET_TYPES } from "../shared/threatLibrary";
import { nowIso, todaySydney } from "./dates";
import { deleteThreatModel } from "./threatCleanup";
import { BadRequest, NotFound, body, handleApiError, isoDate, mustExist, optText, param, setClause, text, type Ctx, type Env } from "./writes";

export const threats = new Hono<Env>();
threats.onError(handleApiError);

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
const id = z.coerce.number().int().positive();
// null is tried first: z.coerce.number() would otherwise turn null into 0.
const nullableId = z.union([z.null(), id]).default(null);
const fraction = z.union([z.null(), z.coerce.number().min(0).max(1)]).default(null);
const optNum = (max: number) => z.union([z.null(), z.coerce.number().min(0).max(max)]).default(null);

const schemas = {
  site: z.object({
    name: text(80),
    address: optText(160),
    suburb: optText(60),
    state: z.enum(STATES).default("NSW"),
    postcode: z.union([z.literal(""), z.string().trim().regex(/^\d{4}$/, "Four digits")]).default(""),
    kind: z.enum(SITE_KINDS.map(([k]) => k) as [string, ...string[]]).default("office"),
    occupants: z.coerce.number().int().min(0).max(100_000).default(0),
    crimeFactor: z.coerce.number().min(0.2, "Between 0.2 and 5").max(5, "Between 0.2 and 5").default(1),
    hours: optText(40),
    notes: optText(1000),
  }),
  level: z.object({
    name: text(40),
    order: z.coerce.number().int().min(-5).max(200).default(0),
    heightM: z.coerce.number().min(2).max(30).default(3.6),
    widthM: z.coerce.number().min(2).max(2000).default(40),
  }),
  element: z.object({
    kind: z.enum(["zone", "asset", "entry"]),
    name: text(80),
    subtype: optText(40),
    value: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
    criticality: z.coerce.number().int().min(1).max(5).default(3),
    levelId: nullableId,
    zoneId: nullableId,
    x: fraction,
    y: fraction,
    w: fraction,
    h: fraction,
    notes: optText(1000),
  }),
  scenario: z.object({
    threatKey: z.string().trim().min(1).max(40),
    siteId: nullableId,
    elementId: nullableId,
    name: optText(120),
    domain: z.union([z.literal(""), z.enum(DOMAINS as [string, ...string[]])]).default(""),
    rateLow: optNum(100_000),
    rateTypical: optNum(100_000),
    rateHigh: optNum(100_000),
    lossLow: optNum(10_000_000_000),
    lossTypical: optNum(10_000_000_000),
    lossHigh: optNum(10_000_000_000),
    notes: optText(2000),
  }),
  bulk: z.object({
    items: z.array(z.object({ threatKey: z.string().trim().min(1).max(40), siteId: nullableId })).min(1).max(200),
  }),
  control: z.object({
    controlKey: z.string().trim().min(1).max(40),
    siteId: nullableId,
    status: z.enum(["In place", "Planned", "Proposed"]).default("In place"),
    capex: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    opex: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    effectiveness: z.coerce.number().min(0).max(1).default(1),
    notes: optText(2000),
  }),
  incident: z.object({
    threatKey: z.string().trim().min(1).max(40),
    siteId: nullableId,
    occurredOn: isoDate,
    loss: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
    description: optText(1000),
  }),
};

const SITE_COLUMNS = { name: "name", address: "address", suburb: "suburb", state: "state", postcode: "postcode", kind: "kind", occupants: "occupants", crimeFactor: "crime_factor", hours: "hours", notes: "notes" };
const LEVEL_COLUMNS = { name: "name", order: "sort_order", heightM: "height_m", widthM: "width_m" };
const ELEMENT_COLUMNS = { kind: "kind", name: "name", subtype: "subtype", value: "value", criticality: "criticality", levelId: "level_id", zoneId: "zone_id", x: "x", y: "y", w: "w", h: "h", notes: "notes" };
const SCENARIO_COLUMNS = {
  siteId: "site_id",
  elementId: "element_id",
  name: "name",
  domain: "domain",
  rateLow: "rate_low",
  rateTypical: "rate_typical",
  rateHigh: "rate_high",
  lossLow: "loss_low",
  lossTypical: "loss_typical",
  lossHigh: "loss_high",
  notes: "notes",
};
const CONTROL_COLUMNS = { status: "status", capex: "capex", opex: "opex", effectiveness: "effectiveness", notes: "notes" };
const INCIDENT_COLUMNS = { threatKey: "threat_key", siteId: "site_id", occurredOn: "occurred_on", loss: "loss", description: "description" };

async function siteOf(c: Ctx, clientId: number, siteId: number | null) {
  if (siteId == null) return null;
  const site = await c.env.DB.prepare(`SELECT id, client_id FROM client_sites WHERE id = ?`).bind(siteId).first<{ id: number; client_id: number }>();
  if (!site || site.client_id !== clientId) throw new BadRequest("That site belongs to another client.", { siteId: "Pick one of this client's sites" });
  return site;
}

/** Library threats pin where they can sit: site threats need a site, organisation threats can't have one. */
function checkThreatScope(threatKey: string, siteId: number | null, custom?: { name: string; domain: string; rateTypical: number | null; lossTypical: number | null }) {
  if (threatKey === "custom") {
    if (!custom) throw new BadRequest("Pick a threat from the library.", { threatKey: "Pick a threat" });
    const fields: Record<string, string> = {};
    if (!custom.name) fields.name = "Name the scenario";
    if (!custom.domain) fields.domain = "Pick a domain";
    if (custom.rateTypical == null) fields.rateTypical = "How often a year?";
    if (custom.lossTypical == null) fields.lossTypical = "Typical loss per event";
    if (Object.keys(fields).length) throw new BadRequest("A custom scenario needs a name, domain, frequency and loss.", fields);
    return;
  }
  const t = THREAT_BY_KEY.get(threatKey);
  if (!t) throw new BadRequest("Unknown threat.", { threatKey: "Pick a threat from the library" });
  if (t.exposure === "site" && siteId == null) throw new BadRequest(`${t.name} happens at a site. Pick one.`, { siteId: "Pick a site" });
  if (t.exposure === "org" && siteId != null) throw new BadRequest(`${t.name} applies to the whole organisation, not one site.`, { siteId: "Organisation-wide" });
}

function checkRanges(v: { rateLow?: number | null; rateTypical?: number | null; rateHigh?: number | null; lossLow?: number | null; lossTypical?: number | null; lossHigh?: number | null }) {
  const bad = (a?: number | null, b?: number | null) => a != null && b != null && a > b;
  const fields: Record<string, string> = {};
  if (bad(v.rateLow, v.rateTypical) || bad(v.rateTypical, v.rateHigh) || bad(v.rateLow, v.rateHigh)) fields.rateTypical = "Low ≤ most likely ≤ high";
  if (bad(v.lossLow, v.lossTypical) || bad(v.lossTypical, v.lossHigh) || bad(v.lossLow, v.lossHigh)) fields.lossTypical = "Low ≤ most likely ≤ high";
  if (Object.keys(fields).length) throw new BadRequest("Ranges must run low to high.", fields);
}

// ── Sites ───────────────────────────────────────────────────────────────────
threats.post("/clients/:id/sites", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.site);
  await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  const order = (await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM client_sites WHERE client_id = ?`).bind(clientId).first<number>("n")) ?? 1;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO client_sites (client_id, name, address, suburb, state, postcode, kind, occupants, crime_factor, hours, notes, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(clientId, v.name, v.address, v.suburb, v.state, v.postcode, v.kind, v.occupants, v.crimeFactor, v.hours || "Business hours", v.notes, order, nowIso()),
    // Every site starts with a ground floor to hang a plan on.
    db.prepare(`INSERT INTO site_levels (site_id, name, sort_order) VALUES ((SELECT MAX(id) FROM client_sites), 'Ground floor', 0)`),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id }, 201);
});

threats.patch("/sites/:id", async (c) => {
  const siteId = param(c);
  const v = await body(c, schemas.site, true);
  await mustExist(c, "client_sites", siteId);
  const { sql, binds } = setClause(v, SITE_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE client_sites SET ${sql} WHERE id = ?`).bind(...binds, siteId).run();
  return c.json({ ok: true });
});

threats.delete("/sites/:id", async (c) => {
  const siteId = param(c);
  await mustExist(c, "client_sites", siteId);
  await c.env.DB.batch(deleteThreatModel(c.env.DB, "site_id = ?", siteId));
  return c.json({ ok: true });
});

// ── Levels and floor plans ──────────────────────────────────────────────────
threats.post("/sites/:id/levels", async (c) => {
  const siteId = param(c);
  const v = await body(c, schemas.level);
  await mustExist(c, "client_sites", siteId);
  const row = await c.env.DB.prepare(`INSERT INTO site_levels (site_id, name, sort_order, height_m, width_m) VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .bind(siteId, v.name, v.order, v.heightM, v.widthM)
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

threats.patch("/levels/:id", async (c) => {
  const levelId = param(c);
  const v = await body(c, schemas.level, true);
  await mustExist(c, "site_levels", levelId);
  const { sql, binds } = setClause(v, LEVEL_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE site_levels SET ${sql} WHERE id = ?`).bind(...binds, levelId).run();
  return c.json({ ok: true });
});

threats.delete("/levels/:id", async (c) => {
  const levelId = param(c);
  const level = await mustExist(c, "site_levels", levelId);
  const db = c.env.DB;
  await db.batch([
    ...removePlan(db, level.plan_file_id as number | null),
    db.prepare(`UPDATE tm_elements SET level_id = NULL WHERE level_id = ?`).bind(levelId),
    db.prepare(`DELETE FROM site_levels WHERE id = ?`).bind(levelId),
  ]);
  return c.json({ ok: true });
});

function removePlan(db: D1Database, fileId: number | null): D1PreparedStatement[] {
  if (!fileId) return [];
  return [
    db.prepare(`UPDATE site_levels SET plan_file_id = NULL, plan_w = NULL, plan_h = NULL WHERE plan_file_id = ?`).bind(fileId),
    db.prepare(`DELETE FROM site_file_chunks WHERE file_id = ?`).bind(fileId),
    db.prepare(`DELETE FROM site_files WHERE id = ?`).bind(fileId),
  ];
}

const PLAN_MAX = 8 * 1024 * 1024;
const CHUNK = 512 * 1024;

/** Only raster images the browser can draw; the bytes must match the claimed type. */
function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// The floor plan arrives as the raw image body; its pixel size comes in the query.
threats.put("/levels/:id/plan", async (c) => {
  const levelId = param(c);
  const level = await mustExist(c, "site_levels", levelId);
  const w = Number(c.req.query("w"));
  const h = Number(c.req.query("h"));
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16 || w > 20_000 || h > 20_000) throw new BadRequest("Plan size missing.");
  const filename = (c.req.query("name") ?? "floor-plan").slice(0, 120) || "floor-plan";
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) throw new BadRequest("The plan file is empty.");
  if (bytes.length > PLAN_MAX) throw new BadRequest("Floor plans can be up to 8 MB.");
  const mime = sniffImage(bytes);
  if (!mime) throw new BadRequest("Upload a PNG, JPEG or WebP image of the floor plan.");
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const db = c.env.DB;
  const file = await db
    .prepare(`INSERT INTO site_files (site_id, filename, mime, size, sha256, chunks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(level.site_id, filename, mime, bytes.length, sha, Math.ceil(bytes.length / CHUNK), nowIso())
    .first<{ id: number }>();
  const fileId = file!.id;
  const stmts: D1PreparedStatement[] = [];
  for (let seq = 0, at = 0; at < bytes.length; seq++, at += CHUNK) stmts.push(db.prepare(`INSERT INTO site_file_chunks (file_id, seq, data) VALUES (?, ?, ?)`).bind(fileId, seq, bytes.slice(at, at + CHUNK).buffer));
  stmts.push(...removePlan(db, level.plan_file_id as number | null));
  stmts.push(db.prepare(`UPDATE site_levels SET plan_file_id = ?, plan_w = ?, plan_h = ? WHERE id = ?`).bind(fileId, w, h, levelId));
  try {
    await db.batch(stmts);
  } catch (err) {
    await db.prepare(`DELETE FROM site_files WHERE id = ?`).bind(fileId).run();
    throw err;
  }
  return c.json({ fileId, w, h }, 201);
});

threats.delete("/levels/:id/plan", async (c) => {
  const levelId = param(c);
  const level = await mustExist(c, "site_levels", levelId);
  if (level.plan_file_id) await c.env.DB.batch(removePlan(c.env.DB, level.plan_file_id as number));
  return c.json({ ok: true });
});

threats.get("/plans/:id{[0-9]+}", async (c) => {
  const fileId = Number(c.req.param("id"));
  const file = await c.env.DB.prepare(`SELECT mime, size, chunks FROM site_files WHERE id = ?`).bind(fileId).first<{ mime: string; size: number; chunks: number }>();
  if (!file) return c.json({ error: "Not found." }, 404);
  const { results } = await c.env.DB.prepare(`SELECT data FROM site_file_chunks WHERE file_id = ? ORDER BY seq`).bind(fileId).all<{ data: ArrayBuffer | Uint8Array | number[] }>();
  const parts = results.map(({ data }) => (data instanceof Uint8Array ? data : Array.isArray(data) ? Uint8Array.from(data) : new Uint8Array(data)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  const mime = sniffImage(out);
  if (parts.length !== file.chunks || out.length !== file.size || !mime) return c.json({ error: "That plan is incomplete or damaged." }, 500);
  return new Response(out, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(out.length),
      "X-Content-Type-Options": "nosniff",
      // A plan's id changes whenever it's replaced, so a private cache is safe.
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
});

// ── Model elements ──────────────────────────────────────────────────────────
async function checkElementRefs(c: Ctx, siteId: number, v: { levelId?: number | null; zoneId?: number | null }, selfId?: number) {
  if (v.levelId != null) {
    const l = await c.env.DB.prepare(`SELECT site_id FROM site_levels WHERE id = ?`).bind(v.levelId).first<{ site_id: number }>();
    if (!l || l.site_id !== siteId) throw new BadRequest("That level is on another site.", { levelId: "Pick a level on this site" });
  }
  if (v.zoneId != null) {
    if (v.zoneId === selfId) throw new BadRequest("A zone can't sit inside itself.", { zoneId: "Pick another zone" });
    const z = await c.env.DB.prepare(`SELECT site_id, kind FROM tm_elements WHERE id = ?`).bind(v.zoneId).first<{ site_id: number; kind: string }>();
    if (!z || z.site_id !== siteId || z.kind !== "zone") throw new BadRequest("Pick a zone on this site.", { zoneId: "Pick a zone on this site" });
  }
}

function checkSubtype(kind: string, subtype: string | undefined) {
  if (!subtype) return;
  const allowed: readonly string[] = kind === "asset" ? ASSET_TYPES.map(([k]) => k) : kind === "zone" ? ZONE_CLASSES : ENTRY_TYPES;
  if (!allowed.includes(subtype)) throw new BadRequest("Pick a type from the list.", { subtype: "Pick a type" });
}

threats.post("/sites/:id/elements", async (c) => {
  const siteId = param(c);
  const v = await body(c, schemas.element);
  await mustExist(c, "client_sites", siteId);
  checkSubtype(v.kind, v.subtype);
  await checkElementRefs(c, siteId, v);
  const row = await c.env.DB.prepare(
    `INSERT INTO tm_elements (site_id, level_id, kind, name, subtype, value, criticality, zone_id, x, y, w, h, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(siteId, v.levelId, v.kind, v.name, v.subtype, v.value, v.criticality, v.zoneId, v.x, v.y, v.w, v.h, v.notes, nowIso())
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

threats.patch("/elements/:id", async (c) => {
  const elementId = param(c);
  const v = await body(c, schemas.element, true);
  const el = await mustExist(c, "tm_elements", elementId);
  checkSubtype(v.kind ?? String(el.kind), v.subtype);
  await checkElementRefs(c, el.site_id as number, v, elementId);
  const { sql, binds } = setClause(v, ELEMENT_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE tm_elements SET ${sql} WHERE id = ?`).bind(...binds, elementId).run();
  return c.json({ ok: true });
});

threats.delete("/elements/:id", async (c) => {
  const elementId = param(c);
  await mustExist(c, "tm_elements", elementId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`UPDATE tm_elements SET zone_id = NULL WHERE zone_id = ?`).bind(elementId),
    db.prepare(`UPDATE tm_scenarios SET element_id = NULL WHERE element_id = ?`).bind(elementId),
    db.prepare(`DELETE FROM tm_elements WHERE id = ?`).bind(elementId),
  ]);
  return c.json({ ok: true });
});

// ── Scenarios ───────────────────────────────────────────────────────────────
async function checkElement(c: Ctx, elementId: number | null, siteId: number | null) {
  if (elementId == null) return;
  const el = await c.env.DB.prepare(`SELECT site_id FROM tm_elements WHERE id = ?`).bind(elementId).first<{ site_id: number }>();
  if (!el || el.site_id !== siteId) throw new BadRequest("That asset is on another site.", { elementId: "Pick an asset at this site" });
}

threats.post("/clients/:id/scenarios", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.scenario);
  await mustExist(c, "clients", clientId);
  checkThreatScope(v.threatKey, v.siteId, v);
  checkRanges(v);
  await siteOf(c, clientId, v.siteId);
  await checkElement(c, v.elementId, v.siteId);
  const row = await c.env.DB.prepare(
    `INSERT INTO tm_scenarios (client_id, site_id, threat_key, element_id, name, domain, rate_low, rate_typical, rate_high, loss_low, loss_typical, loss_high, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(clientId, v.siteId, v.threatKey, v.elementId, v.name, v.domain, v.rateLow, v.rateTypical, v.rateHigh, v.lossLow, v.lossTypical, v.lossHigh, v.notes, nowIso())
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

// Several library threats at once (the "add from library" picker). Ones already modelled are skipped.
threats.post("/clients/:id/scenarios/bulk", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.bulk);
  await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  for (const item of v.items) {
    checkThreatScope(item.threatKey, item.siteId);
    await siteOf(c, clientId, item.siteId);
  }
  const { results } = await db.prepare(`SELECT threat_key, site_id FROM tm_scenarios WHERE client_id = ? AND element_id IS NULL`).bind(clientId).all<{ threat_key: string; site_id: number | null }>();
  const have = new Set(results.map((r) => `${r.threat_key}@${r.site_id ?? ""}`));
  const now = nowIso();
  const fresh = v.items.filter((i) => {
    const k = `${i.threatKey}@${i.siteId ?? ""}`;
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
  if (fresh.length)
    await db.batch(fresh.map((i) => db.prepare(`INSERT INTO tm_scenarios (client_id, site_id, threat_key, created_at) VALUES (?, ?, ?, ?)`).bind(clientId, i.siteId, i.threatKey, now)));
  return c.json({ added: fresh.length, skipped: v.items.length - fresh.length }, 201);
});

threats.patch("/scenarios/:id", async (c) => {
  const scenarioId = param(c);
  const v = await body(c, schemas.scenario, true);
  const sc = await mustExist(c, "tm_scenarios", scenarioId);
  if (v.threatKey !== undefined && v.threatKey !== sc.threat_key) throw new BadRequest("A scenario's threat can't change; add a new scenario instead.", { threatKey: "Fixed" });
  const siteId = v.siteId !== undefined ? v.siteId : (sc.site_id as number | null);
  const merged = {
    rateLow: v.rateLow !== undefined ? v.rateLow : (sc.rate_low as number | null),
    rateTypical: v.rateTypical !== undefined ? v.rateTypical : (sc.rate_typical as number | null),
    rateHigh: v.rateHigh !== undefined ? v.rateHigh : (sc.rate_high as number | null),
    lossLow: v.lossLow !== undefined ? v.lossLow : (sc.loss_low as number | null),
    lossTypical: v.lossTypical !== undefined ? v.lossTypical : (sc.loss_typical as number | null),
    lossHigh: v.lossHigh !== undefined ? v.lossHigh : (sc.loss_high as number | null),
  };
  checkThreatScope(String(sc.threat_key), siteId, {
    name: v.name ?? String(sc.name),
    domain: v.domain ?? String(sc.domain),
    rateTypical: merged.rateTypical,
    lossTypical: merged.lossTypical,
  });
  checkRanges(merged);
  await siteOf(c, sc.client_id as number, siteId);
  await checkElement(c, v.elementId !== undefined ? v.elementId : (sc.element_id as number | null), siteId);
  const { sql, binds } = setClause(v, SCENARIO_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE tm_scenarios SET ${sql} WHERE id = ?`).bind(...binds, scenarioId).run();
  return c.json({ ok: true });
});

threats.delete("/scenarios/:id", async (c) => {
  const scenarioId = param(c);
  const res = await c.env.DB.prepare(`DELETE FROM tm_scenarios WHERE id = ?`).bind(scenarioId).run();
  if (!res.meta.changes) throw new NotFound();
  return c.json({ ok: true });
});

// ── Controls ────────────────────────────────────────────────────────────────
threats.post("/clients/:id/controls", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.control);
  await mustExist(c, "clients", clientId);
  const def = CONTROL_BY_KEY.get(v.controlKey);
  if (!def) throw new BadRequest("Unknown control.", { controlKey: "Pick a control from the library" });
  if (def.scope === "site" && v.siteId == null) throw new BadRequest(`${def.name} is installed at a site. Pick one.`, { siteId: "Pick a site" });
  if (def.scope === "org" && v.siteId != null) throw new BadRequest(`${def.name} covers the whole organisation.`, { siteId: "Organisation-wide" });
  await siteOf(c, clientId, v.siteId);
  const dup = await c.env.DB.prepare(`SELECT id FROM tm_controls WHERE client_id = ? AND control_key = ? AND site_id IS ?`).bind(clientId, v.controlKey, v.siteId).first();
  if (dup) throw new BadRequest(`${def.name} is already recorded${v.siteId ? " at this site" : ""}.`, { controlKey: "Already applied" });
  const row = await c.env.DB.prepare(
    `INSERT INTO tm_controls (client_id, site_id, control_key, status, capex, opex, effectiveness, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(clientId, v.siteId, v.controlKey, v.status, v.capex, v.opex, v.effectiveness, v.notes, nowIso())
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

threats.patch("/tm-controls/:id", async (c) => {
  const controlId = param(c);
  const v = await body(c, schemas.control, true);
  await mustExist(c, "tm_controls", controlId);
  if (v.controlKey !== undefined || v.siteId !== undefined) throw new BadRequest("Remove the control and apply it again to change what or where it is.");
  const { sql, binds } = setClause(v, CONTROL_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE tm_controls SET ${sql} WHERE id = ?`).bind(...binds, controlId).run();
  return c.json({ ok: true });
});

threats.delete("/tm-controls/:id", async (c) => {
  const controlId = param(c);
  const res = await c.env.DB.prepare(`DELETE FROM tm_controls WHERE id = ?`).bind(controlId).run();
  if (!res.meta.changes) throw new NotFound();
  return c.json({ ok: true });
});

// ── Observed incidents ──────────────────────────────────────────────────────
async function checkIncident(c: Ctx, clientId: number, v: { threatKey: string; siteId: number | null; occurredOn: string }) {
  const t = THREAT_BY_KEY.get(v.threatKey);
  if (!t) throw new BadRequest("Pick a threat from the library.", { threatKey: "Pick a threat" });
  if (t.exposure === "site" && v.siteId == null) throw new BadRequest(`Say which site the ${t.name.toLowerCase()} happened at.`, { siteId: "Pick a site" });
  if (t.exposure === "org" && v.siteId != null) throw new BadRequest(`${t.name} is recorded against the organisation.`, { siteId: "Organisation-wide" });
  if (v.occurredOn > todaySydney()) throw new BadRequest("That date is in the future.", { occurredOn: "In the future" });
  await siteOf(c, clientId, v.siteId);
}

threats.post("/clients/:id/incidents", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.incident);
  await mustExist(c, "clients", clientId);
  await checkIncident(c, clientId, v);
  const row = await c.env.DB.prepare(`INSERT INTO tm_incidents (client_id, site_id, threat_key, occurred_on, loss, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(clientId, v.siteId, v.threatKey, v.occurredOn, v.loss, v.description, nowIso())
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

threats.patch("/incidents/:id", async (c) => {
  const incidentId = param(c);
  const v = await body(c, schemas.incident, true);
  const inc = await mustExist(c, "tm_incidents", incidentId);
  await checkIncident(c, inc.client_id as number, {
    threatKey: v.threatKey ?? String(inc.threat_key),
    siteId: v.siteId !== undefined ? v.siteId : (inc.site_id as number | null),
    occurredOn: v.occurredOn ?? String(inc.occurred_on),
  });
  const { sql, binds } = setClause(v, INCIDENT_COLUMNS);
  if (sql) await c.env.DB.prepare(`UPDATE tm_incidents SET ${sql} WHERE id = ?`).bind(...binds, incidentId).run();
  return c.json({ ok: true });
});

threats.delete("/incidents/:id", async (c) => {
  const incidentId = param(c);
  const res = await c.env.DB.prepare(`DELETE FROM tm_incidents WHERE id = ?`).bind(incidentId).run();
  if (!res.meta.changes) throw new NotFound();
  return c.json({ ok: true });
});
