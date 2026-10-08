// Investigations API: cases opened on a client's request, their evidence (files kept with their SHA-256,
// web pages captured server-side), link chart, timeline and report versions. Every change is written to
// the case's audit log in the same batch as the change itself, and a case with an access list is
// invisible to anyone not on it.
import { Hono } from "hono";
import { z } from "zod";
import {
  CASE_KINDS,
  CASE_STATUSES,
  CREDIBILITY,
  ENTITY_KINDS,
  EVENT_BASES,
  EVIDENCE_KINDS,
  RELIABILITY,
  caseRef,
  evidenceRef,
  type CaseDetail,
  type CaseFile,
  type CaseStatus,
  type CaseSummary,
  type EntityKind,
  type EventBasis,
} from "../shared/investigations";
import { kindFor } from "../shared/types";
import { nowIso, todaySydney } from "./dates";
import { findSuburb } from "./geocode";
import { BadRequest, NotFound, body, handleApiError, id, optDate, optInitials, optText, param, text, type Ctx, type Env } from "./writes";

export const investigations = new Hono<Env>();
investigations.onError(handleApiError);

const FILE_MAX = 20 * 1024 * 1024;
const CAPTURE_MAX = 5 * 1024 * 1024;
const CHUNK = 512 * 1024;

const labels = <T extends readonly (readonly [string, ...unknown[]])[]>(t: T) => t.map(([l]) => l) as unknown as [T[number][0], ...T[number][0][]];
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a date and time");
const emailList = z
  .string()
  .max(2000)
  .transform((s) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))])
  .refine((list) => list.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), "Use email addresses, separated by commas");

const schemas = {
  case: z.object({
    clientId: id,
    title: text(160),
    kind: z.enum(CASE_KINDS).default("Other"),
    instructions: optText(8000),
    legalBasis: optText(2000),
    requestedAt: optDate,
    requestedBy: optText(120),
    status: z.enum(labels(CASE_STATUSES)).default("Intake"),
    lead: optInitials,
    dueDate: optDate,
    access: emailList.default([]),
  }),
  evidence: z.object({
    title: text(200),
    kind: z.enum(EVIDENCE_KINDS).default("Document"),
    source: optText(200),
    // Shown as a link, so only ever a web address: never javascript: or data:.
    sourceUrl: z
      .union([z.literal(""), z.string().trim().url("Use a full web address").max(2000).refine((u) => /^https?:\/\//i.test(u), "Use an http or https address")])
      .default(""),
    obtainedAt: optDate,
    obtainedBy: optText(120),
    reliability: z.enum(labels(RELIABILITY)).default("F"),
    credibility: z.enum(labels(CREDIBILITY)).default("6"),
    notes: optText(8000),
  }),
  capture: z.object({
    url: z.string().trim().url("Use a full web address").max(2000).refine((u) => /^https?:\/\//i.test(u), "Only http and https pages can be captured"),
    title: optText(200),
    notes: optText(4000),
  }),
  entity: z.object({
    kind: z.enum(ENTITY_KINDS).default("Person"),
    name: text(160),
    detail: optText(1000),
    x: z.union([z.null(), z.coerce.number().min(-100_000).max(100_000)]).default(null),
    y: z.union([z.null(), z.coerce.number().min(-100_000).max(100_000)]).default(null),
  }),
  link: z.object({
    fromId: id,
    toId: id,
    label: text(80),
    evidenceId: id.nullable().default(null),
    note: optText(1000),
  }),
  event: z.object({
    startsAt: dateTime,
    endsAt: z.union([dateTime, z.literal(""), z.null()]).transform((v) => v || null).default(null),
    title: text(200),
    detail: optText(4000),
    basis: z.enum(EVENT_BASES).default("Documented"),
    place: optText(160),
    lat: z.union([z.null(), z.coerce.number().min(-90).max(90)]).default(null),
    lng: z.union([z.null(), z.coerce.number().min(-180).max(180)]).default(null),
    evidenceId: id.nullable().default(null),
    entityIds: z.array(id).max(50).default([]),
  }),
  report: z.object({ title: text(200), summary: optText(8000) }),
};

// ── Access ──────────────────────────────────────────────────────────────────

interface CaseRow {
  id: number;
  client_id: number | null;
  title: string;
  kind: string;
  instructions: string;
  legal_basis: string;
  requested_at: string | null;
  requested_by: string;
  status: string;
  lead: string;
  access: string;
  due_date: string | null;
  evidence_seq: number;
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

const accessList = (s: string) => s.split(",").filter(Boolean);
export const canSee = (row: { access: string; created_by: string }, email: string) => {
  const me = email.toLowerCase();
  const list = accessList(row.access);
  return list.length === 0 || list.includes(me) || row.created_by.toLowerCase() === me;
};

/** The case, if this person may see it; otherwise it doesn't exist as far as they're told. */
async function caseFor(c: Ctx, caseId: number): Promise<CaseRow> {
  const row = await c.env.DB.prepare(`SELECT * FROM inv_cases WHERE id = ?`).bind(caseId).first<CaseRow>();
  if (!row || !canSee(row, c.get("userEmail"))) throw new NotFound();
  return row;
}

/** A closed case is a record: reopen it before changing anything in it. */
function open(row: CaseRow): CaseRow {
  if (row.status === "Closed") throw new BadRequest("This case is closed. Reopen it to make changes.");
  return row;
}

/** A row belonging to a case, with the case (checked for access). */
async function child<T extends { case_id: number }>(c: Ctx, table: string, rowId: number): Promise<{ row: T; kase: CaseRow }> {
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(rowId).first<T>();
  if (!row) throw new NotFound();
  return { row, kase: await caseFor(c, row.case_id) };
}

const logStmt = (c: Ctx, caseId: number, action: string, detail = "") =>
  c.env.DB.prepare(`INSERT INTO inv_log (case_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?)`).bind(caseId, nowIso(), c.get("userEmail"), action, detail.slice(0, 2000));

async function mustBelong(c: Ctx, table: string, rowId: number | null | undefined, caseId: number, field: string, what: string) {
  if (rowId === null || rowId === undefined) return;
  const ok = await c.env.DB.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND case_id = ?`).bind(rowId, caseId).first();
  if (!ok) throw new BadRequest("Some fields need attention.", { [field]: `Not a ${what} in this case` });
}

/** "SET a = ?, b = ?" for the keys actually sent. */
function setClause(values: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [k, col] of Object.entries(columns))
    if (values[k] !== undefined) {
      sets.push(`${col} = ?`);
      binds.push(values[k]);
    }
  return { sql: sets.join(", "), binds };
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// ── Reads ───────────────────────────────────────────────────────────────────

const statusKind = (s: string) => kindFor(CASE_STATUSES, s);

/** The cases this person may see, for the portal's register. */
export async function getCases(db: D1Database, email: string, today: string): Promise<CaseSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.title, c.kind, c.client_id, cl.org, c.status, c.lead, c.due_date, c.created_at, c.closed_at, c.access, c.created_by,
              (SELECT count(*) FROM inv_evidence e WHERE e.case_id = c.id) AS evidence
       FROM inv_cases c LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY c.closed_at IS NOT NULL, c.created_at DESC, c.id DESC`
    )
    .all<{
      id: number;
      title: string;
      kind: string;
      client_id: number | null;
      org: string | null;
      status: string;
      lead: string;
      due_date: string | null;
      created_at: string;
      closed_at: string | null;
      access: string;
      created_by: string;
      evidence: number;
    }>();
  return results.filter((r) => canSee(r, email)).map((r) => summary(r, today));
}

function summary(
  r: { id: number; title: string; kind: string; client_id: number | null; org?: string | null; status: string; lead: string; due_date: string | null; created_at: string; closed_at: string | null; access: string; evidence?: number },
  today: string
): CaseSummary {
  return {
    id: r.id,
    ref: caseRef(r.id),
    title: r.title,
    kind: r.kind,
    clientId: r.client_id,
    client: r.org ?? "",
    status: r.status as CaseStatus,
    statusKind: statusKind(r.status),
    lead: r.lead,
    dueDate: r.due_date,
    late: !r.closed_at && !!r.due_date && r.due_date < today,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    evidence: r.evidence ?? 0,
    restricted: accessList(r.access).length > 0,
  };
}

type FileRow = { id: number; name: string; mime: string; size: number; sha256: string };
const fileOf = (f: FileRow | undefined): CaseFile | null => (f ? { id: f.id, name: f.name, mime: f.mime, size: f.size, sha256: f.sha256 } : null);

investigations.get("/investigations/:id", async (c) => {
  const kase = await caseFor(c, param(c));
  const db = c.env.DB;
  const [client, evidence, files, entities, links, events, reports, log] = await Promise.all([
    kase.client_id ? db.prepare(`SELECT org FROM clients WHERE id = ?`).bind(kase.client_id).first<{ org: string }>() : null,
    db.prepare(`SELECT * FROM inv_evidence WHERE case_id = ? ORDER BY seq`).bind(kase.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, name, mime, size, sha256 FROM inv_files WHERE case_id = ?`).bind(kase.id).all<FileRow>(),
    db.prepare(`SELECT * FROM inv_entities WHERE case_id = ? ORDER BY id`).bind(kase.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT * FROM inv_links WHERE case_id = ? ORDER BY id`).bind(kase.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT * FROM inv_events WHERE case_id = ? ORDER BY starts_at, id`).bind(kase.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT * FROM inv_reports WHERE case_id = ? ORDER BY version DESC`).bind(kase.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, at, actor, action, detail FROM inv_log WHERE case_id = ? ORDER BY id DESC LIMIT 500`).bind(kase.id).all<{ id: number; at: string; actor: string; action: string; detail: string }>(),
  ]);
  const fileById = new Map(files.results.map((f) => [f.id, f]));
  const today = todaySydney();
  const detail: CaseDetail = {
    ...summary({ ...kase, org: client?.org ?? null, evidence: evidence.results.length }, today),
    instructions: kase.instructions,
    legalBasis: kase.legal_basis,
    requestedAt: kase.requested_at,
    requestedBy: kase.requested_by,
    access: accessList(kase.access),
    createdBy: kase.created_by,
    evidenceItems: evidence.results.map((e) => ({
      id: e.id as number,
      ref: evidenceRef(e.seq as number),
      title: e.title as string,
      kind: e.kind as string,
      source: e.source as string,
      sourceUrl: e.source_url as string,
      obtainedAt: e.obtained_at as string | null,
      obtainedBy: e.obtained_by as string,
      reliability: e.reliability as string,
      credibility: e.credibility as string,
      notes: e.notes as string,
      file: fileOf(fileById.get(e.file_id as number)),
      capture: e.capture ? JSON.parse(e.capture as string) : null,
      createdBy: e.created_by as string,
      createdAt: e.created_at as string,
    })),
    entities: entities.results.map((e) => ({
      id: e.id as number,
      kind: e.kind as EntityKind,
      name: e.name as string,
      detail: e.detail as string,
      x: e.x as number | null,
      y: e.y as number | null,
    })),
    links: links.results.map((l) => ({
      id: l.id as number,
      fromId: l.from_id as number,
      toId: l.to_id as number,
      label: l.label as string,
      evidenceId: l.evidence_id as number | null,
      note: l.note as string,
    })),
    events: events.results.map((e) => {
      const given = e.lat !== null && e.lng !== null;
      const s = !given && e.place ? findSuburb(e.place as string, null, false) : null;
      return {
        id: e.id as number,
        startsAt: e.starts_at as string,
        endsAt: e.ends_at as string | null,
        title: e.title as string,
        detail: e.detail as string,
        basis: e.basis as EventBasis,
        place: e.place as string,
        lat: given ? (e.lat as number) : s?.lat ?? null,
        lng: given ? (e.lng as number) : s?.lng ?? null,
        located: given ? "given" : s ? "suburb" : null,
        evidenceId: e.evidence_id as number | null,
        entityIds: String(e.entity_ids || "")
          .split(",")
          .filter(Boolean)
          .map(Number),
      };
    }),
    reports: reports.results.map((r) => ({
      id: r.id as number,
      version: r.version as number,
      title: r.title as string,
      summary: r.summary as string,
      file: fileOf(fileById.get(r.file_id as number)),
      createdBy: r.created_by as string,
      createdAt: r.created_at as string,
    })),
    log: log.results,
  };
  return c.json(detail);
});

// ── Cases ───────────────────────────────────────────────────────────────────

const CASE_COLUMNS = {
  clientId: "client_id",
  title: "title",
  kind: "kind",
  instructions: "instructions",
  legalBasis: "legal_basis",
  requestedAt: "requested_at",
  requestedBy: "requested_by",
  status: "status",
  lead: "lead",
  dueDate: "due_date",
  access: "access",
  closedAt: "closed_at",
};

/** An access list always includes whoever set it, so nobody locks themselves out. */
const withMe = (c: Ctx, list: string[]) => (list.length && !list.includes(c.get("userEmail").toLowerCase()) ? [...list, c.get("userEmail").toLowerCase()] : list);

investigations.post("/investigations", async (c) => {
  const v = await body(c, schemas.case);
  if (!(await c.env.DB.prepare(`SELECT 1 FROM clients WHERE id = ?`).bind(v.clientId).first())) throw new BadRequest("Some fields need attention.", { clientId: "Choose a client" });
  const me = c.get("userEmail");
  const db = c.env.DB;
  const row = await db
    .prepare(
      `INSERT INTO inv_cases (client_id, title, kind, instructions, legal_basis, requested_at, requested_by, status, lead, access, due_date, created_by, created_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .bind(v.clientId, v.title, v.kind, v.instructions, v.legalBasis, v.requestedAt, v.requestedBy, v.status, v.lead, withMe(c, v.access).join(","), v.dueDate, me, nowIso(), v.status === "Closed" ? nowIso() : null)
    .first<{ id: number }>();
  const caseId = row!.id;
  await logStmt(c, caseId, "Opened case", `${caseRef(caseId)} · ${v.title}`).run();
  return c.json({ id: caseId, ref: caseRef(caseId) }, 201);
});

investigations.patch("/investigations/:id", async (c) => {
  const kase = await caseFor(c, param(c));
  const v = await body(c, schemas.case, true);
  if (v.clientId !== undefined && !(await c.env.DB.prepare(`SELECT 1 FROM clients WHERE id = ?`).bind(v.clientId).first()))
    throw new BadRequest("Some fields need attention.", { clientId: "Choose a client" });
  // Only a status change may touch a closed case (to reopen it).
  if (kase.status === "Closed" && Object.keys(v).some((k) => k !== "status")) open(kase);
  const access = v.access === undefined ? undefined : withMe(c, v.access).join(",");
  const closedAt = v.status === undefined || v.status === kase.status ? undefined : v.status === "Closed" ? nowIso() : null;
  const { sql, binds } = setClause({ ...v, access, closedAt }, CASE_COLUMNS);
  if (!sql) return c.json({ ok: true });
  const changes: string[] = [];
  if (v.status !== undefined && v.status !== kase.status) changes.push(`status ${kase.status} → ${v.status}`);
  if (access !== undefined && access !== kase.access) changes.push(`access ${access ? access.split(",").join(", ") : "everyone with portal access"}`);
  const other = Object.keys(v).filter((k) => k !== "status" && k !== "access" && (v as Record<string, unknown>)[k] !== (kase as unknown as Record<string, unknown>)[CASE_COLUMNS[k as keyof typeof CASE_COLUMNS]]);
  if (other.length) changes.push(other.join(", "));
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE inv_cases SET ${sql} WHERE id = ?`).bind(...binds, kase.id),
    ...(changes.length ? [logStmt(c, kase.id, v.status === "Closed" && kase.status !== "Closed" ? "Closed case" : v.status && kase.status === "Closed" ? "Reopened case" : "Updated case", changes.join("; "))] : []),
  ]);
  return c.json({ ok: true });
});

investigations.delete("/investigations/:id", async (c) => {
  const kase = await caseFor(c, param(c));
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM inv_log WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_links WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_events WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_entities WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_reports WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_evidence WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_file_chunks WHERE file_id IN (SELECT id FROM inv_files WHERE case_id = ?)`).bind(kase.id),
    db.prepare(`DELETE FROM inv_files WHERE case_id = ?`).bind(kase.id),
    db.prepare(`DELETE FROM inv_cases WHERE id = ?`).bind(kase.id),
  ]);
  return c.json({ ok: true });
});

// ── Files ───────────────────────────────────────────────────────────────────

/** Stores bytes as a case file; returns the statements that write it (run them with whatever links it). */
async function storeFile(c: Ctx, caseId: number, name: string, mime: string, bytes: Uint8Array): Promise<{ fileId: number; sha: string; stmts: D1PreparedStatement[] }> {
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
  const db = c.env.DB;
  const row = await db
    .prepare(`INSERT INTO inv_files (case_id, name, mime, size, sha256, chunks, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(caseId, name.slice(0, 200) || "file", mime.slice(0, 120) || "application/octet-stream", bytes.length, sha, Math.ceil(bytes.length / CHUNK), c.get("userEmail"), nowIso())
    .first<{ id: number }>();
  const fileId = row!.id;
  const stmts: D1PreparedStatement[] = [];
  for (let seq = 0, at = 0; at < bytes.length; seq++, at += CHUNK) stmts.push(db.prepare(`INSERT INTO inv_file_chunks (file_id, seq, data) VALUES (?, ?, ?)`).bind(fileId, seq, bytes.slice(at, at + CHUNK).buffer));
  return { fileId, sha, stmts };
}

/** Runs the batch; if it fails, the half-made file row goes too. */
async function commitFile(c: Ctx, fileId: number, stmts: D1PreparedStatement[]) {
  try {
    await c.env.DB.batch(stmts);
  } catch (err) {
    await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM inv_file_chunks WHERE file_id = ?`).bind(fileId), c.env.DB.prepare(`DELETE FROM inv_files WHERE id = ?`).bind(fileId)]);
    throw err;
  }
}

async function upload(c: Ctx): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) throw new BadRequest("The file is empty.");
  if (bytes.length > FILE_MAX) throw new BadRequest("Files can be up to 20 MB.");
  const name = (c.req.query("name") ?? "file").replace(/[\\/]/g, "_").slice(0, 200) || "file";
  const mime = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase() || "application/octet-stream";
  return { bytes, name, mime };
}

const describe = (name: string, size: number, sha: string) => `${name} · ${size.toLocaleString("en-AU")} bytes · SHA-256 ${sha}`;

// Attach the file an evidence item is about. Once attached it can't be swapped: add a new item instead.
investigations.put("/inv-evidence/:id/file", async (c) => {
  const { row, kase } = await child<{ case_id: number; seq: number; file_id: number | null }>(c, "inv_evidence", param(c));
  open(kase);
  if (row.file_id) throw new BadRequest("This item already has its file. Add a new item for another file.");
  const { bytes, name, mime } = await upload(c);
  const { fileId, sha, stmts } = await storeFile(c, kase.id, name, mime, bytes);
  await commitFile(c, fileId, [
    ...stmts,
    c.env.DB.prepare(`UPDATE inv_evidence SET file_id = ? WHERE id = ?`).bind(fileId, param(c)),
    logStmt(c, kase.id, `Attached file to ${evidenceRef(row.seq)}`, describe(name, bytes.length, sha)),
  ]);
  return c.json({ fileId, sha256: sha }, 201);
});

investigations.put("/inv-reports/:id/file", async (c) => {
  const { row, kase } = await child<{ case_id: number; version: number; file_id: number | null }>(c, "inv_reports", param(c));
  open(kase);
  if (row.file_id) throw new BadRequest("This version already has its file. Issue a new version instead.");
  const { bytes, name, mime } = await upload(c);
  const { fileId, sha, stmts } = await storeFile(c, kase.id, name, mime, bytes);
  await commitFile(c, fileId, [
    ...stmts,
    c.env.DB.prepare(`UPDATE inv_reports SET file_id = ? WHERE id = ?`).bind(fileId, param(c)),
    logStmt(c, kase.id, `Attached file to report v${row.version}`, describe(name, bytes.length, sha)),
  ]);
  return c.json({ fileId, sha256: sha }, 201);
});

/** Types the browser may show in place; anything else downloads. */
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

// A case file, checked against its SHA-256 before it's served, and logged as viewed or downloaded.
// ?download=1 saves it; ?as=text shows a text file (a captured page's source) as plain text.
investigations.get("/inv-files/:id{[0-9]+}", async (c) => {
  const fileId = Number(c.req.param("id"));
  const file = await c.env.DB.prepare(`SELECT * FROM inv_files WHERE id = ?`).bind(fileId).first<FileRow & { case_id: number; chunks: number }>();
  if (!file) throw new NotFound();
  const kase = await caseFor(c, file.case_id);
  const { results } = await c.env.DB.prepare(`SELECT data FROM inv_file_chunks WHERE file_id = ? ORDER BY seq`).bind(fileId).all<{ data: ArrayBuffer | Uint8Array | number[] }>();
  const parts = results.map(({ data }) => (data instanceof Uint8Array ? data : Array.isArray(data) ? Uint8Array.from(data) : new Uint8Array(data)));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
  const owner = await c.env.DB.prepare(
    `SELECT 'evidence' AS what, seq AS n FROM inv_evidence WHERE file_id = ?1 UNION ALL SELECT 'report' AS what, version AS n FROM inv_reports WHERE file_id = ?1`
  )
    .bind(fileId)
    .first<{ what: string; n: number }>();
  const label = owner ? (owner.what === "evidence" ? evidenceRef(owner.n) : `report v${owner.n}`) : file.name;
  if (parts.length !== file.chunks || bytes.length !== file.size || sha !== file.sha256) {
    await logStmt(c, kase.id, `Integrity check FAILED for ${label}`, `expected SHA-256 ${file.sha256}, got ${sha}`).run();
    return c.json({ error: "That file is incomplete or doesn't match its recorded SHA-256." }, 500);
  }
  const asText = c.req.query("as") === "text" && /^(text\/|application\/(xhtml\+xml|json|xml))/.test(file.mime);
  const download = c.req.query("download") !== undefined;
  const inline = !download && (asText || INLINE.has(file.mime));
  await logStmt(c, kase.id, `${download ? "Downloaded" : "Viewed"} ${label}`, `${file.name} · SHA-256 verified`).run();
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": asText ? "text/plain; charset=utf-8" : inline ? file.mime : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      // Evidence is never run as part of the portal, whatever it contains.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Evidence-SHA256": sha,
    },
  });
});

// ── Evidence ────────────────────────────────────────────────────────────────

const EVIDENCE_COLUMNS = {
  title: "title",
  kind: "kind",
  source: "source",
  sourceUrl: "source_url",
  obtainedAt: "obtained_at",
  obtainedBy: "obtained_by",
  reliability: "reliability",
  credibility: "credibility",
  notes: "notes",
};

/** Takes the case's next evidence number (EV-001, EV-002…), never reused even after a deletion. */
async function nextSeq(c: Ctx, caseId: number): Promise<number> {
  const r = await c.env.DB.prepare(`UPDATE inv_cases SET evidence_seq = evidence_seq + 1 WHERE id = ? RETURNING evidence_seq`).bind(caseId).first<{ evidence_seq: number }>();
  return r!.evidence_seq;
}

investigations.post("/investigations/:id/evidence", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.evidence);
  const seq = await nextSeq(c, kase.id);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO inv_evidence (case_id, seq, title, kind, source, source_url, obtained_at, obtained_by, reliability, credibility, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(kase.id, seq, v.title, v.kind, v.source, v.sourceUrl, v.obtainedAt, v.obtainedBy, v.reliability, v.credibility, v.notes, c.get("userEmail"), nowIso()),
    logStmt(c, kase.id, `Added ${evidenceRef(seq)}`, `${v.kind} · ${v.title} · graded ${v.reliability}${v.credibility}`),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id, ref: evidenceRef(seq) }, 201);
});

investigations.patch("/inv-evidence/:id", async (c) => {
  const { row, kase } = await child<Record<string, unknown> & { case_id: number; seq: number }>(c, "inv_evidence", param(c));
  open(kase);
  const v = await body(c, schemas.evidence, true);
  const { sql, binds } = setClause(v, EVIDENCE_COLUMNS);
  if (!sql) return c.json({ ok: true });
  const changed = Object.keys(v)
    .filter((k) => (v as Record<string, unknown>)[k] !== row[EVIDENCE_COLUMNS[k as keyof typeof EVIDENCE_COLUMNS]])
    .map((k) => (k === "reliability" || k === "credibility" ? `${k} ${row[k]} → ${(v as Record<string, string>)[k]}` : k));
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE inv_evidence SET ${sql} WHERE id = ?`).bind(...binds, param(c)),
    ...(changed.length ? [logStmt(c, kase.id, `Edited ${evidenceRef(row.seq)}`, changed.join(", "))] : []),
  ]);
  return c.json({ ok: true });
});

investigations.delete("/inv-evidence/:id", async (c) => {
  const evId = param(c);
  const { row, kase } = await child<{ case_id: number; seq: number; title: string; file_id: number | null }>(c, "inv_evidence", evId);
  open(kase);
  const db = c.env.DB;
  const f = row.file_id ? await db.prepare(`SELECT name, sha256 FROM inv_files WHERE id = ?`).bind(row.file_id).first<{ name: string; sha256: string }>() : null;
  await db.batch([
    db.prepare(`UPDATE inv_links SET evidence_id = NULL WHERE evidence_id = ?`).bind(evId),
    db.prepare(`UPDATE inv_events SET evidence_id = NULL WHERE evidence_id = ?`).bind(evId),
    db.prepare(`DELETE FROM inv_evidence WHERE id = ?`).bind(evId),
    ...(row.file_id ? [db.prepare(`DELETE FROM inv_file_chunks WHERE file_id = ?`).bind(row.file_id), db.prepare(`DELETE FROM inv_files WHERE id = ?`).bind(row.file_id)] : []),
    logStmt(c, kase.id, `Removed ${evidenceRef(row.seq)}`, `${row.title}${f ? ` · file ${f.name} · SHA-256 ${f.sha256}` : ""}`),
  ]);
  return c.json({ ok: true });
});

// Web capture: the Worker fetches the page itself and keeps exactly what came back, with its SHA-256,
// the address it ended up at, the status and the time, so a finding traces back to captured material.
investigations.post("/investigations/:id/captures", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.capture);
  let res: Response;
  try {
    res = await fetch(v.url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SandstoneEvidenceCapture/1.0)", Accept: "text/html,application/xhtml+xml,application/pdf,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new BadRequest("That page couldn't be fetched.", { url: (err as Error).name === "TimeoutError" ? "The site took too long to answer" : "The site couldn't be reached" });
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > CAPTURE_MAX) {
        await reader.cancel();
        throw new BadRequest("That page is too large to capture.", { url: "Pages up to 5 MB can be captured" });
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const ch of chunks) {
    bytes.set(ch, at);
    at += ch.length;
  }
  if (!bytes.length) throw new BadRequest("That page came back empty.", { url: `The site answered ${res.status} with nothing in it` });
  const contentType = (res.headers.get("Content-Type") ?? "application/octet-stream").slice(0, 120);
  const mime = contentType.split(";")[0]!.trim().toLowerCase();
  const fetchedAt = nowIso();
  const pageTitle = /^text\/html|xhtml/.test(mime) ? /<title[^>]*>([^<]{1,300})<\/title>/i.exec(new TextDecoder().decode(bytes.subarray(0, 200_000)))?.[1]?.replace(/\s+/g, " ").trim() : undefined;
  const host = new URL(res.url || v.url).hostname;
  const ext = mime.includes("html") ? "html" : mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? mime.slice(6).replace("jpeg", "jpg") : "bin";
  const name = `capture-${host}-${fetchedAt.replace(/[:.]/g, "-")}.${ext}`;
  const { fileId, sha, stmts } = await storeFile(c, kase.id, name, mime, bytes);
  const seq = await nextSeq(c, kase.id);
  const title = v.title || pageTitle || host;
  const capture = { url: v.url, finalUrl: res.url || v.url, status: res.status, contentType, fetchedAt };
  const db = c.env.DB;
  await commitFile(c, fileId, [
    ...stmts,
    db
      .prepare(
        `INSERT INTO inv_evidence (case_id, seq, title, kind, source, source_url, obtained_at, obtained_by, reliability, credibility, notes, file_id, capture, created_by, created_at)
         VALUES (?, ?, ?, 'Web capture', ?, ?, ?, ?, 'F', '6', ?, ?, ?, ?, ?)`
      )
      .bind(kase.id, seq, title.slice(0, 200), host, v.url, todaySydney(), c.get("userEmail"), v.notes, fileId, JSON.stringify(capture), c.get("userEmail"), fetchedAt),
    logStmt(c, kase.id, `Captured ${evidenceRef(seq)}`, `${v.url}${capture.finalUrl !== v.url ? ` → ${capture.finalUrl}` : ""} · HTTP ${res.status} · ${describe(name, bytes.length, sha)}`),
  ]);
  return c.json({ ref: evidenceRef(seq), sha256: sha, status: res.status, title }, 201);
});

// ── Link chart ──────────────────────────────────────────────────────────────

investigations.post("/investigations/:id/entities", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.entity);
  const [ins] = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO inv_entities (case_id, kind, name, detail, x, y) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(kase.id, v.kind, v.name, v.detail, v.x, v.y),
    logStmt(c, kase.id, `Added ${v.kind.toLowerCase()}`, v.name),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id }, 201);
});

investigations.patch("/inv-entities/:id", async (c) => {
  const { row, kase } = await child<{ case_id: number; name: string }>(c, "inv_entities", param(c));
  open(kase);
  const v = await body(c, schemas.entity, true);
  const { sql, binds } = setClause(v, { kind: "kind", name: "name", detail: "detail", x: "x", y: "y" });
  if (!sql) return c.json({ ok: true });
  // Moving a node on the chart isn't worth a log line; changing what it says is.
  const words = Object.keys(v).filter((k) => k !== "x" && k !== "y");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE inv_entities SET ${sql} WHERE id = ?`).bind(...binds, param(c)),
    ...(words.length ? [logStmt(c, kase.id, `Edited ${short(row.name, 60)}`, words.join(", "))] : []),
  ]);
  return c.json({ ok: true });
});

investigations.delete("/inv-entities/:id", async (c) => {
  const entId = param(c);
  const { row, kase } = await child<{ case_id: number; name: string; kind: string }>(c, "inv_entities", entId);
  open(kase);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM inv_links WHERE from_id = ?1 OR to_id = ?1`).bind(entId),
    db.prepare(`UPDATE inv_events SET entity_ids = trim(replace(',' || entity_ids || ',', ',' || ?1 || ',', ','), ',') WHERE case_id = ?2`).bind(String(entId), kase.id),
    db.prepare(`DELETE FROM inv_entities WHERE id = ?`).bind(entId),
    logStmt(c, kase.id, `Removed ${row.kind.toLowerCase()}`, `${row.name} and its links`),
  ]);
  return c.json({ ok: true });
});

const nameOf = async (c: Ctx, entId: number) => (await c.env.DB.prepare(`SELECT name FROM inv_entities WHERE id = ?`).bind(entId).first<{ name: string }>())?.name ?? "?";

investigations.post("/investigations/:id/links", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.link);
  if (v.fromId === v.toId) throw new BadRequest("Some fields need attention.", { toId: "Link two different things" });
  await mustBelong(c, "inv_entities", v.fromId, kase.id, "fromId", "person or thing");
  await mustBelong(c, "inv_entities", v.toId, kase.id, "toId", "person or thing");
  await mustBelong(c, "inv_evidence", v.evidenceId, kase.id, "evidenceId", "evidence item");
  const [ins] = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO inv_links (case_id, from_id, to_id, label, evidence_id, note) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(kase.id, v.fromId, v.toId, v.label, v.evidenceId, v.note),
    logStmt(c, kase.id, "Linked", `${await nameOf(c, v.fromId)} — ${v.label} → ${await nameOf(c, v.toId)}`),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id }, 201);
});

investigations.patch("/inv-links/:id", async (c) => {
  const { row, kase } = await child<{ case_id: number; from_id: number; to_id: number; label: string }>(c, "inv_links", param(c));
  open(kase);
  const v = await body(c, schemas.link, true);
  const from = v.fromId ?? row.from_id, to = v.toId ?? row.to_id;
  if (from === to) throw new BadRequest("Some fields need attention.", { toId: "Link two different things" });
  await mustBelong(c, "inv_entities", v.fromId, kase.id, "fromId", "person or thing");
  await mustBelong(c, "inv_entities", v.toId, kase.id, "toId", "person or thing");
  await mustBelong(c, "inv_evidence", v.evidenceId, kase.id, "evidenceId", "evidence item");
  const { sql, binds } = setClause(v, { fromId: "from_id", toId: "to_id", label: "label", evidenceId: "evidence_id", note: "note" });
  if (!sql) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE inv_links SET ${sql} WHERE id = ?`).bind(...binds, param(c)),
    logStmt(c, kase.id, "Edited link", `${await nameOf(c, from)} — ${v.label ?? row.label} → ${await nameOf(c, to)}`),
  ]);
  return c.json({ ok: true });
});

investigations.delete("/inv-links/:id", async (c) => {
  const { row, kase } = await child<{ case_id: number; from_id: number; to_id: number; label: string }>(c, "inv_links", param(c));
  open(kase);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM inv_links WHERE id = ?`).bind(param(c)),
    logStmt(c, kase.id, "Removed link", `${await nameOf(c, row.from_id)} — ${row.label} → ${await nameOf(c, row.to_id)}`),
  ]);
  return c.json({ ok: true });
});

// ── Timeline ────────────────────────────────────────────────────────────────

async function checkEvent(c: Ctx, caseId: number, v: Partial<z.infer<typeof schemas.event>>, current?: { starts_at: string; ends_at: string | null; lat: number | null; lng: number | null }) {
  const starts = v.startsAt ?? current?.starts_at, ends = v.endsAt === undefined ? current?.ends_at : v.endsAt;
  if (starts && ends && ends < starts) throw new BadRequest("Some fields need attention.", { endsAt: "Ends before it starts" });
  const lat = v.lat === undefined ? current?.lat ?? null : v.lat, lng = v.lng === undefined ? current?.lng ?? null : v.lng;
  if ((lat === null) !== (lng === null)) throw new BadRequest("Some fields need attention.", { lat: "Give both latitude and longitude, or neither" });
  await mustBelong(c, "inv_evidence", v.evidenceId, caseId, "evidenceId", "evidence item");
  for (const e of v.entityIds ?? []) await mustBelong(c, "inv_entities", e, caseId, "entityIds", "person or thing");
}

investigations.post("/investigations/:id/events", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.event);
  await checkEvent(c, kase.id, v);
  const [ins] = await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO inv_events (case_id, starts_at, ends_at, title, detail, basis, place, lat, lng, evidence_id, entity_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(kase.id, v.startsAt, v.endsAt, v.title, v.detail, v.basis, v.place, v.lat, v.lng, v.evidenceId, [...new Set(v.entityIds)].join(",")),
    logStmt(c, kase.id, `Added ${v.basis.toLowerCase()} event`, `${v.startsAt.replace("T", " ")} · ${v.title}`),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id }, 201);
});

investigations.patch("/inv-events/:id", async (c) => {
  const { row, kase } = await child<{ case_id: number; starts_at: string; ends_at: string | null; lat: number | null; lng: number | null; title: string }>(c, "inv_events", param(c));
  open(kase);
  const v = await body(c, schemas.event, true);
  await checkEvent(c, kase.id, v, row);
  const { sql, binds } = setClause(
    { ...v, entityIds: v.entityIds === undefined ? undefined : [...new Set(v.entityIds)].join(",") },
    { startsAt: "starts_at", endsAt: "ends_at", title: "title", detail: "detail", basis: "basis", place: "place", lat: "lat", lng: "lng", evidenceId: "evidence_id", entityIds: "entity_ids" }
  );
  if (!sql) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE inv_events SET ${sql} WHERE id = ?`).bind(...binds, param(c)),
    logStmt(c, kase.id, "Edited event", `${(v.startsAt ?? row.starts_at).replace("T", " ")} · ${v.title ?? row.title} (${Object.keys(v).join(", ")})`),
  ]);
  return c.json({ ok: true });
});

investigations.delete("/inv-events/:id", async (c) => {
  const { row, kase } = await child<{ case_id: number; starts_at: string; title: string }>(c, "inv_events", param(c));
  open(kase);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM inv_events WHERE id = ?`).bind(param(c)),
    logStmt(c, kase.id, "Removed event", `${row.starts_at.replace("T", " ")} · ${row.title}`),
  ]);
  return c.json({ ok: true });
});

// ── Reports ─────────────────────────────────────────────────────────────────

// Each report is a new version; versions are never edited or deleted.
investigations.post("/investigations/:id/reports", async (c) => {
  const kase = open(await caseFor(c, param(c)));
  const v = await body(c, schemas.report);
  const next = ((await c.env.DB.prepare(`SELECT MAX(version) AS v FROM inv_reports WHERE case_id = ?`).bind(kase.id).first<{ v: number | null }>())?.v ?? 0) + 1;
  const [ins] = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO inv_reports (case_id, version, title, summary, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(kase.id, next, v.title, v.summary, c.get("userEmail"), nowIso()),
    logStmt(c, kase.id, `Issued report v${next}`, v.title),
  ]);
  return c.json({ id: (ins!.results[0] as { id: number }).id, version: next }, 201);
});
