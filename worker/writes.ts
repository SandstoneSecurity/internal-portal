import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  CLIENT_STATUSES,
  EMPLOYEE_STATUSES,
  CALL_OUTCOMES,
  DEAL_STAGES,
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  ENGAGEMENT_KINDS,
  INTEL_SEVERITIES,
  PRIORITIES,
  VERDICTS,
  type DealStage,
  ROLE_STATUSES,
  SERVICE_LINES,
  STAGES,
  kindFor,
} from "../shared/types";
import type { AuthVariables } from "./auth";
import { dayMonth, nowIso, shortDate, todaySydney } from "./dates";

type Env = { Bindings: { DB: D1Database }; Variables: AuthVariables };
type Ctx = Context<Env>;

const labels = <T extends readonly (readonly [string, string])[]>(t: T) =>
  t.map(([l]) => l) as unknown as [T[number][0], ...T[number][0][]];

const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const optText = (max: number) => z.string().trim().max(max, `At most ${max} characters`).default("");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date (YYYY-MM-DD)");
const initials = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{1,3}$/, "One to three letters"));
const optInitials = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{0,3}$/, "One to three letters"))
  .default("");
/** A date that may be cleared: "" or null both mean "no date". */
const optDate = z
  .union([isoDate, z.literal(""), z.null()])
  .transform((v) => v || null)
  .default(null);
const id = z.coerce.number().int().positive();

export const schemas = {
  work: z.object({
    title: text(120),
    site: optText(120),
    line: z.enum(SERVICE_LINES).default("Ops"),
    description: optText(4000),
    priority: z.enum(PRIORITIES).default("None"),
    startDate: optDate,
    dueDate: optDate,
    owner: optInitials,
    milestone: z.boolean().default(false),
    columnId: id.optional(),
    /** Index within the target column (0 = top). */
    position: z.coerce.number().int().min(0).max(10_000).optional(),
  }),
  dependency: z.object({ dependsOn: id }),
  subtask: z.object({
    title: text(200),
    done: z.boolean().default(false),
    owner: optInitials,
    startDate: optDate,
    dueDate: optDate,
    position: z.coerce.number().int().min(0).max(10_000).optional(),
  }),
  employee: z.object({
    name: text(80),
    role: text(80),
    licenceClass: text(20),
    licenceExpiry: isoDate,
    site: text(80),
    status: z.enum(labels(EMPLOYEE_STATUSES)),
    since: z.string().trim().regex(/^\d{4}$/, "Year, e.g. 2024"),
    firstAid: optText(40),
    mobile: optText(20),
    employmentType: z.enum(["FULL TIME", "PART TIME", "CASUAL"]),
  }),
  shift: z.object({
    date: isoDate,
    span: text(20),
    site: text(40),
  }),
  client: z.object({
    org: text(80),
    sector: optText(60),
    sites: z.coerce.number().int().min(0).max(999).default(0),
    valuePa: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    owner: optInitials,
    status: z.enum(labels(CLIENT_STATUSES)).default("Lead"),
    meta: optText(400),
    domain: optText(120),
    phone: optText(30),
    city: optText(60),
  }),
  contact: z.object({
    name: text(80),
    role: optText(80),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(120)]).default(""),
    phone: optText(30),
  }),
  engagementPatch: z.object({
      kind: z.enum(ENGAGEMENT_KINDS).default("note"),
      subject: optText(160),
      body: optText(4000),
      outcome: z.union([z.literal(""), z.enum(CALL_OUTCOMES)]).default(""),
      /** When it happened / is scheduled: a date or an ISO timestamp. */
      at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, "Use a date")
        .optional(),
      dueDate: optDate,
      done: z.boolean().default(false),
      contactId: id.nullable().optional(),
  }),
  deal: z.object({
    clientId: id,
    name: text(120),
    amount: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    stage: z.enum(DEAL_STAGES.map(([st]) => st) as unknown as [DealStage, ...DealStage[]]).default("Enquiry"),
    closeDate: optDate,
    owner: optInitials,
    position: z.coerce.number().int().min(0).max(10_000).optional(),
  }),
  role: z.object({
    title: text(100),
    meta: optText(140),
    status: z.enum(labels(ROLE_STATUSES)).default("Draft"),
    department: z.enum(DEPARTMENTS).default("Ops"),
    location: optText(80),
    employmentType: z.enum(EMPLOYMENT_TYPES).default("Full time"),
    openings: z.coerce.number().int().min(1).max(99).default(1),
    description: optText(6000),
    hiringManager: optText(80),
  }),
  candidate: z.object({
    roleId: id,
    name: text(80),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(120)]).default(""),
    phone: optText(30),
    location: optText(80),
    headline: optText(140),
    licence: optText(40),
    licenceOk: z.boolean().default(false),
    source: optText(60),
    stage: z.coerce.number().int().min(0).max(STAGES.length - 1).default(1),
    disqualified: z.boolean().default(false),
    disqualifyReason: optText(120),
  }),
  comment: z.object({ body: text(4000) }),
  evaluation: z.object({
    score: z.coerce.number().int().min(1, "Give a score").max(5),
    verdict: z.enum(VERDICTS),
    body: optText(4000),
  }),
  intel: z.object({
    severity: z.enum(labels(INTEL_SEVERITIES)),
    regionKey: text(8),
    headline: text(400),
    source: text(120),
  }),
};

class BadRequest extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(message);
  }
}

async function body<S extends z.ZodTypeAny>(c: Ctx, schema: S, partial = false): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new BadRequest("Request body must be JSON.");
  }
  const s = partial && schema instanceof z.ZodObject ? schema.partial() : schema;
  const parsed = s.safeParse(json);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new BadRequest("Some fields need attention.", fields);
  }
  // zod applies .default() even to keys a partial update left out; a PATCH must
  // only touch the fields it actually sent.
  if (partial && json && typeof json === "object") {
    const sent = new Set(Object.keys(json));
    for (const k of Object.keys(parsed.data as object)) if (!sent.has(k)) delete (parsed.data as Record<string, unknown>)[k];
  }
  return parsed.data as z.output<S>;
}

function param(c: Ctx, name = "id"): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest(`Invalid ${name}.`);
  return n;
}

function audit(c: Ctx, action: "create" | "update" | "delete" | "move", entity: string, entityId: string | null, summary: string) {
  return c.env.DB.prepare(
    `INSERT INTO audit_log (at, actor, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(nowIso(), c.get("userEmail"), action, entity, entityId, summary);
}

/** Same statement as audit(), but takes the entity id from the preceding INSERT in the batch. */
function auditLastInsert(c: Ctx, entity: string, summary: string) {
  return c.env.DB.prepare(
    `INSERT INTO audit_log (at, actor, action, entity, entity_id, summary)
     VALUES (?, ?, 'create', ?, CAST(last_insert_rowid() AS TEXT), ?)`
  ).bind(nowIso(), c.get("userEmail"), entity, summary);
}

async function mustExist(c: Ctx, table: string, rowId: number | string, key = "id"): Promise<Record<string, unknown>> {
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).bind(rowId).first();
  if (!row) throw new NotFound();
  return row;
}

class NotFound extends Error {}

/** Builds "SET a = ?, b = ?" from a partial record, mapping API keys to columns. */
function setClause(values: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [k, col] of Object.entries(columns)) {
    if (values[k] !== undefined) {
      sets.push(`${col} = ?`);
      binds.push(values[k]);
    }
  }
  return { sql: sets.join(", "), binds };
}

const aud = (n: number) => `$${n.toLocaleString("en-AU")}`;

export const writes = new Hono<Env>();

/** Turns validation and lookup failures into JSON the portal's forms can show. */
export function handleApiError(err: Error, c: Context): Response {
  if (err instanceof BadRequest) return c.json({ error: err.message, fields: err.fields }, 400);
  if (err instanceof NotFound) return c.json({ error: "Not found." }, 404);
  console.error(err);
  return c.json({ error: "Something went wrong saving that change." }, 500);
}
writes.onError(handleApiError);

// ── Work items ───────────────────────────────────────────────────────────────
const WORK_COLUMNS = {
  title: "title",
  site: "site",
  line: "line",
  description: "description",
  priority: "priority",
  startDate: "start_date",
  dueDate: "due_date",
  dueLabel: "due_label",
  owner: "owner_initials",
  milestoneFlag: "is_milestone",
};

function checkDates(start: string | null | undefined, due: string | null | undefined) {
  if (start && due && start > due) throw new BadRequest("Some fields need attention.", { dueDate: "Due date is before the start date" });
}

/** Rewrites sort_order for a column (or a task's subtasks) so `movedId` lands at `position`. */
async function reorder(
  db: D1Database,
  table: "ops_cards" | "ops_subtasks",
  scopeCol: "column_id" | "card_id",
  scopeId: number,
  movedId: number,
  position: number | undefined
): Promise<D1PreparedStatement[]> {
  const { results } = await db
    .prepare(`SELECT id FROM ${table} WHERE ${scopeCol} = ? AND id != ? ORDER BY sort_order, id`)
    .bind(scopeId, movedId)
    .all<{ id: number }>();
  const ids = results.map((r) => r.id);
  ids.splice(Math.min(position ?? ids.length, ids.length), 0, movedId);
  return ids.map((rowId, i) =>
    rowId === movedId
      ? db.prepare(`UPDATE ${table} SET ${scopeCol} = ?, sort_order = ? WHERE id = ?`).bind(scopeId, i + 1, rowId)
      : db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).bind(i + 1, rowId)
  );
}

/** One-line audit summary for an edit, specific when a single field changed. */
function describeWorkEdit(ref: string, v: Partial<z.output<typeof schemas.work>>): string {
  const keys = Object.keys(v).filter((k) => k !== "columnId" && k !== "position" && !(k === "startDate" && v.milestone !== undefined));
  if (keys.length === 2 && v.startDate !== undefined && v.dueDate !== undefined)
    return v.startDate && v.dueDate ? `Rescheduled ${ref} to ${dayMonth(v.startDate)} – ${dayMonth(v.dueDate)}` : `Edited the dates on ${ref}`;
  if (keys.length !== 1) return `Edited ${ref}`;
  switch (keys[0]) {
    case "title":
      return `Renamed ${ref} to “${v.title}”`;
    case "owner":
      return v.owner ? `Assigned ${ref} to ${v.owner}` : `Unassigned ${ref}`;
    case "dueDate":
      return v.dueDate ? `Set ${ref} due ${dayMonth(v.dueDate)}` : `Cleared the due date on ${ref}`;
    case "startDate":
      return v.startDate ? `Set ${ref} to start ${dayMonth(v.startDate)}` : `Cleared the start date on ${ref}`;
    case "priority":
      return `Set ${ref} priority to ${v.priority}`;
    case "description":
      return `Updated the description of ${ref}`;
    case "line":
      return `Tagged ${ref} ${v.line}`;
    case "site":
      return `Set ${ref} client / site to ${v.site || "none"}`;
    case "milestone":
      return v.milestone ? `Made ${ref} a milestone` : `Made ${ref} a task`;
    default:
      return `Edited ${ref}`;
  }
}

writes.post("/work", async (c) => {
  const v = await body(c, schemas.work);
  if (v.milestone) v.startDate = null;
  checkDates(v.startDate, v.dueDate);
  const db = c.env.DB;
  const columnId =
    v.columnId ??
    (await db.prepare(`SELECT id FROM ops_columns WHERE is_done = 0 ORDER BY sort_order LIMIT 1`).first<number>("id"));
  if (!columnId) throw new BadRequest("The operations board has no columns yet.");
  const col = await mustExist(c, "ops_columns", columnId);
  const next = (await db
    .prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(ref, 4) AS INTEGER)), 100) + 1 AS n FROM ops_cards WHERE ref LIKE 'OP-%'`)
    .first<number>("n")) ?? 101;
  const ref = `OP-${next}`;
  const order =
    (await db
      .prepare(
        v.position === 0
          ? `SELECT COALESCE(MIN(sort_order), 1) - 1 AS n FROM ops_cards WHERE column_id = ?`
          : `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ops_cards WHERE column_id = ?`
      )
      .bind(columnId)
      .first<number>("n")) ?? 1;
  const now = nowIso();
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO ops_cards (column_id, ref, title, site, line, description, priority, start_date, due_label, due_date,
                                created_at, completed_at, is_late, owner_initials, sort_order, is_milestone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?) RETURNING id`
      )
      .bind(
        columnId,
        ref,
        v.title,
        v.site,
        v.line,
        v.description,
        v.priority,
        v.startDate,
        v.dueDate ? `DUE ${dayMonth(v.dueDate)}` : "",
        v.dueDate,
        now,
        col.is_done === 1 ? now : null,
        v.owner,
        order,
        v.milestone ? 1 : 0
      ),
    auditLastInsert(c, "work", `Added ${v.milestone ? "milestone " : ""}${ref} — ${v.title}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id, ref }, 201);
});

writes.patch("/work/:id", async (c) => {
  const cardId = param(c);
  const v = await body(c, schemas.work, true);
  const db = c.env.DB;
  const card = await mustExist(c, "ops_cards", cardId);
  checkDates(
    v.startDate !== undefined ? v.startDate : (card.start_date as string | null),
    v.dueDate !== undefined ? v.dueDate : (card.due_date as string | null)
  );
  const stmts: D1PreparedStatement[] = [];
  // A milestone has one date: turning a task into one (or editing one) drops any start date.
  if (v.milestone === true || (card.is_milestone === 1 && v.milestone !== false && v.startDate !== undefined)) v.startDate = null;
  const edits = {
    ...v,
    dueLabel: v.dueDate === undefined ? undefined : v.dueDate ? `DUE ${dayMonth(v.dueDate)}` : "",
    milestoneFlag: v.milestone === undefined ? undefined : v.milestone ? 1 : 0,
  };
  const { sql, binds } = setClause(edits, WORK_COLUMNS);
  if (sql) stmts.push(db.prepare(`UPDATE ops_cards SET ${sql} WHERE id = ?`).bind(...binds, cardId));

  const ref = String(card.ref);
  let summary: string | null = sql ? describeWorkEdit(ref, v) : null;
  let action: "update" | "move" = "update";
  const moving = v.columnId !== undefined && v.columnId !== card.column_id;
  if (moving || v.position !== undefined) {
    const target = v.columnId ?? (card.column_id as number);
    stmts.push(...(await reorder(db, "ops_cards", "column_id", target, cardId, v.position)));
    if (moving) {
      const col = await mustExist(c, "ops_columns", target);
      const done = col.is_done === 1;
      stmts.push(db.prepare(`UPDATE ops_cards SET completed_at = ? WHERE id = ?`).bind(done ? nowIso() : null, cardId));
      const moved = done ? `Completed ${ref}` : `Moved ${ref} to ${col.label}`;
      summary = sql ? `${summary} and ${moved.charAt(0).toLowerCase()}${moved.slice(1)}` : moved;
      action = sql ? "update" : "move";
    }
  }
  if (!stmts.length) return c.json({ ok: true });
  // Reordering within a column is housekeeping, not a change worth logging.
  if (summary) stmts.push(audit(c, action, "work", String(cardId), summary));
  await db.batch(stmts);
  return c.json({ ok: true });
});

writes.delete("/work/:id", async (c) => {
  const cardId = param(c);
  const card = await mustExist(c, "ops_cards", cardId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM ops_subtasks WHERE card_id = ?`).bind(cardId),
    c.env.DB.prepare(`DELETE FROM ops_dependencies WHERE card_id = ? OR depends_on_id = ?`).bind(cardId, cardId),
    c.env.DB.prepare(`DELETE FROM ops_cards WHERE id = ?`).bind(cardId),
    audit(c, "delete", "work", String(cardId), `Deleted ${card.ref} — ${card.title}`),
  ]);
  return c.json({ ok: true });
});

// ── Dependencies ─────────────────────────────────────────────────────────────
writes.post("/work/:id/dependencies", async (c) => {
  const cardId = param(c);
  const { dependsOn } = await body(c, schemas.dependency);
  const db = c.env.DB;
  if (dependsOn === cardId) throw new BadRequest("A task can't wait on itself.", { dependsOn: "A task can't wait on itself" });
  const card = await mustExist(c, "ops_cards", cardId);
  const before = await mustExist(c, "ops_cards", dependsOn);
  const { results } = await db.prepare(`SELECT card_id, depends_on_id FROM ops_dependencies`).all<{ card_id: number; depends_on_id: number }>();
  if (results.some((r) => r.card_id === cardId && r.depends_on_id === dependsOn)) return c.json({ ok: true });
  // Refuse a loop: if `dependsOn` already (transitively) waits on this task, linking would deadlock both.
  const waitsOn = new Map<number, number[]>();
  for (const r of results) waitsOn.set(r.card_id, [...(waitsOn.get(r.card_id) ?? []), r.depends_on_id]);
  const seen = new Set<number>();
  const stack = [dependsOn];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === cardId)
      throw new BadRequest(`${before.ref} already waits on ${card.ref}, so this would make a loop.`, { dependsOn: "That would make a loop" });
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(waitsOn.get(n) ?? []));
  }
  await db.batch([
    db.prepare(`INSERT INTO ops_dependencies (card_id, depends_on_id, created_at) VALUES (?, ?, ?)`).bind(cardId, dependsOn, nowIso()),
    audit(c, "update", "work", String(cardId), `${card.ref} now waits on ${before.ref}`),
  ]);
  return c.json({ ok: true }, 201);
});

writes.delete("/work/:id/dependencies/:dependsOn", async (c) => {
  const cardId = param(c);
  const dependsOn = param(c, "dependsOn");
  const card = await mustExist(c, "ops_cards", cardId);
  const before = await c.env.DB.prepare(`SELECT ref FROM ops_cards WHERE id = ?`).bind(dependsOn).first<{ ref: string }>();
  const res = await c.env.DB.prepare(`DELETE FROM ops_dependencies WHERE card_id = ? AND depends_on_id = ?`).bind(cardId, dependsOn).run();
  if (!res.meta.changes) throw new NotFound();
  await audit(c, "update", "work", String(cardId), `${card.ref} no longer waits on ${before?.ref ?? "a deleted task"}`).run();
  return c.json({ ok: true });
});

// ── Subtasks ─────────────────────────────────────────────────────────────────
const SUBTASK_COLUMNS = { title: "title", owner: "owner_initials", startDate: "start_date", dueDate: "due_date" };

writes.post("/work/:id/subtasks", async (c) => {
  const cardId = param(c);
  const v = await body(c, schemas.subtask);
  checkDates(v.startDate, v.dueDate);
  const db = c.env.DB;
  const card = await mustExist(c, "ops_cards", cardId);
  const order =
    (await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ops_subtasks WHERE card_id = ?`).bind(cardId).first<number>("n")) ?? 1;
  const now = nowIso();
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO ops_subtasks (card_id, title, done, owner_initials, start_date, due_date, sort_order, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(cardId, v.title, v.done ? 1 : 0, v.owner, v.startDate, v.dueDate, order, now, v.done ? now : null),
    audit(c, "create", "work", String(cardId), `Added subtask “${v.title}” to ${card.ref}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/subtasks/:id", async (c) => {
  const subId = param(c);
  const v = await body(c, schemas.subtask, true);
  const db = c.env.DB;
  const sub = await mustExist(c, "ops_subtasks", subId);
  const card = await mustExist(c, "ops_cards", sub.card_id as number);
  checkDates(
    v.startDate !== undefined ? v.startDate : (sub.start_date as string | null),
    v.dueDate !== undefined ? v.dueDate : (sub.due_date as string | null)
  );
  const stmts: D1PreparedStatement[] = [];
  const { sql, binds } = setClause(v, SUBTASK_COLUMNS);
  if (sql) stmts.push(db.prepare(`UPDATE ops_subtasks SET ${sql} WHERE id = ?`).bind(...binds, subId));
  const title = v.title ?? String(sub.title);
  let summary: string | null = sql ? `Edited subtask “${title}” on ${card.ref}` : null;
  if (v.done !== undefined && v.done !== (sub.done === 1)) {
    stmts.push(
      db.prepare(`UPDATE ops_subtasks SET done = ?, completed_at = ? WHERE id = ?`).bind(v.done ? 1 : 0, v.done ? nowIso() : null, subId)
    );
    summary = `${v.done ? "Completed" : "Reopened"} subtask “${title}” on ${card.ref}`;
  }
  if (v.position !== undefined) stmts.push(...(await reorder(db, "ops_subtasks", "card_id", card.id as number, subId, v.position)));
  if (!stmts.length) return c.json({ ok: true });
  if (summary) stmts.push(audit(c, "update", "work", String(card.id), summary));
  await db.batch(stmts);
  return c.json({ ok: true });
});

writes.delete("/subtasks/:id", async (c) => {
  const subId = param(c);
  const sub = await mustExist(c, "ops_subtasks", subId);
  const card = await mustExist(c, "ops_cards", sub.card_id as number);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM ops_subtasks WHERE id = ?`).bind(subId),
    audit(c, "delete", "work", String(card.id), `Removed subtask “${sub.title}” from ${card.ref}`),
  ]);
  return c.json({ ok: true });
});

// ── Employees ────────────────────────────────────────────────────────────────
const EMPLOYEE_COLUMNS = {
  name: "name",
  role: "role",
  licenceClass: "licence_class",
  licenceExpiry: "licence_expiry_date",
  licenceLabel: "licence_expiry",
  site: "site",
  status: "status",
  statusKind: "status_kind",
  since: "employed_since",
  firstAid: "first_aid",
  mobile: "mobile",
  employmentType: "employment_type",
};

function employeeRecord(v: Partial<z.output<typeof schemas.employee>>) {
  return {
    ...v,
    licenceLabel: v.licenceExpiry ? shortDate(v.licenceExpiry) : undefined,
    statusKind: v.status ? kindFor(EMPLOYEE_STATUSES, v.status) : undefined,
  };
}

writes.post("/employees", async (c) => {
  const v = await body(c, schemas.employee);
  const r = employeeRecord(v);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO employees (name, role, licence_class, licence_expiry, licence_expiry_date, expiry_soon, site, status, status_kind,
                                employed_since, first_aid, mobile, employment_type)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(r.name, r.role, r.licenceClass, r.licenceLabel, r.licenceExpiry, r.site, r.status, r.statusKind, r.since, r.firstAid || "—", r.mobile || "—", r.employmentType),
    auditLastInsert(c, "employee", `Added ${v.name} to the register`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/employees/:id", async (c) => {
  const empId = param(c);
  const v = await body(c, schemas.employee, true);
  const emp = await mustExist(c, "employees", empId);
  const { sql, binds } = setClause(employeeRecord(v), EMPLOYEE_COLUMNS);
  if (!sql) return c.json({ ok: true });
  const changed = v.status && v.status !== emp.status ? ` — now ${v.status}` : "";
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE employees SET ${sql} WHERE id = ?`).bind(...binds, empId),
    audit(c, "update", "employee", String(empId), `Updated personnel file for ${v.name ?? emp.name}${changed}`),
  ]);
  return c.json({ ok: true });
});

writes.delete("/employees/:id", async (c) => {
  const empId = param(c);
  const emp = await mustExist(c, "employees", empId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM employee_shifts WHERE employee_id = ?`).bind(empId),
    db.prepare(`DELETE FROM employees WHERE id = ?`).bind(empId),
    audit(c, "delete", "employee", String(empId), `Removed ${emp.name} from the register`),
  ]);
  return c.json({ ok: true });
});

writes.post("/employees/:id/shifts", async (c) => {
  const empId = param(c);
  const v = await body(c, schemas.shift);
  const emp = await mustExist(c, "employees", empId);
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO employee_shifts (employee_id, shift_date, span, site, sort_order)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM employee_shifts WHERE employee_id = ?))`
      )
      .bind(empId, dayMonth(v.date), v.span.toUpperCase(), v.site.toUpperCase(), empId),
    audit(c, "create", "shift", String(empId), `Rostered ${emp.name} · ${dayMonth(v.date)} ${v.span} at ${v.site}`),
  ]);
  return c.json({ ok: true }, 201);
});

// ── Companies (CRM) ──────────────────────────────────────────────────────────
const CLIENT_COLUMNS = {
  org: "org",
  sector: "sector",
  sites: "sites",
  valuePa: "value_pa",
  owner: "owner_initials",
  status: "status",
  statusKind: "status_kind",
  meta: "meta",
  domain: "domain",
  phone: "phone",
  city: "city",
};
const PROPERTY_NAMES: Record<string, string> = {
  org: "name",
  sector: "industry",
  sites: "sites",
  valuePa: "annual value",
  owner: "owner",
  status: "lifecycle stage",
  meta: "description",
  domain: "domain",
  phone: "phone",
  city: "city",
};

writes.post("/clients", async (c) => {
  const v = await body(c, schemas.client);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO clients (org, sector, sites, value_pa, owner_initials, status, status_kind, meta, domain, phone, city, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(v.org, v.sector, v.sites, aud(v.valuePa), v.owner, v.status, kindFor(CLIENT_STATUSES, v.status), v.meta, v.domain, v.phone, v.city, nowIso()),
    auditLastInsert(c, "client", `Created company ${v.org}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/clients/:id", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.client, true);
  const client = await mustExist(c, "clients", clientId);
  const { sql, binds } = setClause(
    {
      ...v,
      valuePa: v.valuePa !== undefined ? aud(v.valuePa) : undefined,
      statusKind: v.status ? kindFor(CLIENT_STATUSES, v.status) : undefined,
    },
    CLIENT_COLUMNS
  );
  if (!sql) return c.json({ ok: true });
  const keys = Object.keys(v);
  const name = v.org ?? String(client.org);
  const summary =
    v.status && v.status !== client.status
      ? `Moved ${name} to ${v.status}`
      : keys.length === 1
        ? `Updated ${PROPERTY_NAMES[keys[0]!] ?? "details"} for ${name}`
        : `Updated ${name}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE clients SET ${sql} WHERE id = ?`).bind(...binds, clientId),
    audit(c, "update", "client", String(clientId), summary),
  ]);
  return c.json({ ok: true });
});

writes.delete("/clients/:id", async (c) => {
  const clientId = param(c);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM client_contacts WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM deals WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM client_activity WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM clients WHERE id = ?`).bind(clientId),
    audit(c, "delete", "client", String(clientId), `Deleted company ${client.org}`),
  ]);
  return c.json({ ok: true });
});

// Contacts
writes.post("/clients/:id/contacts", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.contact);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO client_contacts (client_id, name, role, email, phone, sort_order)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM client_contacts WHERE client_id = ?)) RETURNING id`
      )
      .bind(clientId, v.name, v.role, v.email, v.phone, clientId),
    audit(c, "create", "client", String(clientId), `Added contact ${v.name}${v.role ? ` (${v.role})` : ""} to ${client.org}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/contacts/:id", async (c) => {
  const contactId = param(c);
  const v = await body(c, schemas.contact, true);
  const contact = await mustExist(c, "client_contacts", contactId);
  const { sql, binds } = setClause(v, { name: "name", role: "role", email: "email", phone: "phone" });
  if (!sql) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE client_contacts SET ${sql} WHERE id = ?`).bind(...binds, contactId),
    audit(c, "update", "client", String(contact.client_id), `Updated contact ${v.name ?? contact.name}`),
  ]);
  return c.json({ ok: true });
});

writes.delete("/contacts/:id", async (c) => {
  const contactId = param(c);
  const contact = await mustExist(c, "client_contacts", contactId);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE client_activity SET contact_id = NULL WHERE contact_id = ?`).bind(contactId),
    c.env.DB.prepare(`DELETE FROM client_contacts WHERE id = ?`).bind(contactId),
    audit(c, "delete", "client", String(contact.client_id), `Removed contact ${contact.name}`),
  ]);
  return c.json({ ok: true });
});

// Engagements: notes, emails, calls, meetings, tasks
const engagementCreate = schemas.engagementPatch.refine((v) => v.subject || v.body, {
  message: "Add a subject or some detail",
  path: ["body"],
});
const KIND_VERB: Record<string, string> = { note: "Added a note", email: "Logged an email", call: "Logged a call", meeting: "Logged a meeting", task: "Created a task" };

writes.post("/clients/:id/activity", async (c) => {
  const clientId = param(c);
  const v = await body(c, engagementCreate);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  const at = v.at ?? nowIso();
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO client_activity (client_id, activity_date, body, sort_order, kind, subject, at, actor, outcome, due_date, done, contact_id)
         VALUES (?, ?, ?, (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM client_activity WHERE client_id = ?), ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(clientId, shortDate(at.slice(0, 10)), v.body, clientId, v.kind, v.subject, at, c.get("userEmail"), v.outcome, v.dueDate, v.done ? 1 : 0, v.contactId ?? null),
    audit(c, "create", "client", String(clientId), `${KIND_VERB[v.kind]} on ${client.org}${v.subject ? `: ${v.subject}` : ""}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/activity/:id", async (c) => {
  const actId = param(c);
  const v = await body(c, schemas.engagementPatch, true);
  const act = await mustExist(c, "client_activity", actId);
  const { sql, binds } = setClause(
    { ...v, done: v.done === undefined ? undefined : v.done ? 1 : 0, contactId: v.contactId === undefined ? undefined : v.contactId },
    { subject: "subject", body: "body", outcome: "outcome", at: "at", dueDate: "due_date", done: "done", contactId: "contact_id" }
  );
  if (!sql) return c.json({ ok: true });
  const label = String(act.subject || act.body).slice(0, 60);
  const summary = v.done !== undefined && Object.keys(v).length === 1 ? `${v.done ? "Completed" : "Reopened"} task “${label}”` : `Edited ${act.kind} “${label}”`;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE client_activity SET ${sql} WHERE id = ?`).bind(...binds, actId),
    audit(c, "update", "client", String(act.client_id), summary),
  ]);
  return c.json({ ok: true });
});

writes.delete("/activity/:id", async (c) => {
  const actId = param(c);
  const act = await mustExist(c, "client_activity", actId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM client_activity WHERE id = ?`).bind(actId),
    audit(c, "delete", "client", String(act.client_id), `Deleted ${act.kind} “${String(act.subject || act.body).slice(0, 60)}”`),
  ]);
  return c.json({ ok: true });
});

// Deals
const CLOSED = new Set(["Closed won", "Closed lost"]);

writes.post("/deals", async (c) => {
  const v = await body(c, schemas.deal);
  const client = await mustExist(c, "clients", v.clientId);
  const db = c.env.DB;
  const now = nowIso();
  const order = (await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM deals WHERE stage = ?`).bind(v.stage).first<number>("n")) ?? 1;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO deals (client_id, name, amount, stage, close_date, owner_initials, sort_order, created_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(v.clientId, v.name, v.amount, v.stage, v.closeDate, v.owner || String(client.owner_initials), order, now, CLOSED.has(v.stage) ? now : null),
    audit(c, "create", "client", String(v.clientId), `Created deal “${v.name}” (${aud(v.amount)}) for ${client.org}`),
  ];
  // A company with an open deal is at least an opportunity.
  if (client.status === "Lead" && !CLOSED.has(v.stage))
    stmts.push(db.prepare(`UPDATE clients SET status = 'Opportunity', status_kind = 'advisory' WHERE id = ?`).bind(v.clientId));
  const [ins] = await db.batch(stmts);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/deals/:id", async (c) => {
  const dealId = param(c);
  const v = await body(c, schemas.deal, true);
  const deal = await mustExist(c, "deals", dealId);
  const db = c.env.DB;
  if (v.clientId !== undefined) await mustExist(c, "clients", v.clientId);
  const stmts: D1PreparedStatement[] = [];
  const stageChanged = v.stage !== undefined && v.stage !== deal.stage;
  const { sql, binds } = setClause(
    { ...v, closedAt: stageChanged ? (CLOSED.has(v.stage!) ? nowIso() : null) : undefined },
    { clientId: "client_id", name: "name", amount: "amount", stage: "stage", closeDate: "close_date", owner: "owner_initials", closedAt: "closed_at" }
  );
  if (sql) stmts.push(db.prepare(`UPDATE deals SET ${sql} WHERE id = ?`).bind(...binds, dealId));
  if (v.position !== undefined || stageChanged) {
    const stage = v.stage ?? String(deal.stage);
    const { results } = await db.prepare(`SELECT id FROM deals WHERE stage = ? AND id != ? ORDER BY sort_order, id`).bind(stage, dealId).all<{ id: number }>();
    const ids = results.map((r) => r.id);
    ids.splice(Math.min(v.position ?? ids.length, ids.length), 0, dealId);
    ids.forEach((rowId, i) => stmts.push(db.prepare(`UPDATE deals SET sort_order = ? WHERE id = ?`).bind(i + 1, rowId)));
  }
  if (!stmts.length) return c.json({ ok: true });
  const clientId = v.clientId ?? (deal.client_id as number);
  const name = v.name ?? String(deal.name);
  if (stageChanged) {
    stmts.push(audit(c, "move", "client", String(clientId), `Moved deal “${name}” to ${v.stage}`));
    // Winning a deal makes the company a customer.
    if (v.stage === "Closed won")
      stmts.push(db.prepare(`UPDATE clients SET status = 'Customer', status_kind = 'secure' WHERE id = ? AND status != 'Customer'`).bind(clientId));
  } else if (sql) stmts.push(audit(c, "update", "client", String(clientId), `Updated deal “${name}”`));
  await db.batch(stmts);
  return c.json({ ok: true });
});

writes.delete("/deals/:id", async (c) => {
  const dealId = param(c);
  const deal = await mustExist(c, "deals", dealId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM deals WHERE id = ?`).bind(dealId),
    audit(c, "delete", "client", String(deal.client_id), `Deleted deal “${deal.name}”`),
  ]);
  return c.json({ ok: true });
});

// ── Recruitment (jobs and candidates) ────────────────────────────────────────
const ROLE_COLUMNS = {
  title: "title",
  meta: "meta",
  status: "status",
  statusKind: "status_kind",
  department: "department",
  location: "location",
  employmentType: "employment_type",
  openings: "openings",
  description: "description",
  hiringManager: "hiring_manager",
};

writes.post("/roles", async (c) => {
  const v = await body(c, schemas.role);
  const db = c.env.DB;
  const meta = v.meta || [v.department, v.location, v.employmentType.toLowerCase(), v.openings > 1 ? `${v.openings} positions` : ""].filter(Boolean).join(" · ");
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO roles (title, meta, status, status_kind, department, location, employment_type, openings, description, hiring_manager, created_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM roles)) RETURNING id`
      )
      .bind(v.title, meta, v.status, kindFor(ROLE_STATUSES, v.status), v.department, v.location, v.employmentType, v.openings, v.description, v.hiringManager, nowIso()),
    auditLastInsert(c, "role", `Created job — ${v.title}${v.status === "Published" ? " (published)" : ""}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/roles/:id", async (c) => {
  const roleId = param(c);
  const v = await body(c, schemas.role, true);
  const role = await mustExist(c, "roles", roleId);
  const { sql, binds } = setClause({ ...v, statusKind: v.status ? kindFor(ROLE_STATUSES, v.status) : undefined }, ROLE_COLUMNS);
  if (!sql) return c.json({ ok: true });
  const title = v.title ?? String(role.title);
  const summary = v.status && v.status !== role.status ? `${v.status === "Published" ? "Published" : `Set to ${v.status}:`} ${title}` : `Updated job — ${title}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE roles SET ${sql} WHERE id = ?`).bind(...binds, roleId),
    audit(c, "update", "role", String(roleId), summary),
  ]);
  return c.json({ ok: true });
});

writes.delete("/roles/:id", async (c) => {
  const roleId = param(c);
  const role = await mustExist(c, "roles", roleId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM candidate_events WHERE candidate_id IN (SELECT id FROM candidates WHERE role_id = ?)`).bind(roleId),
    db.prepare(`DELETE FROM candidates WHERE role_id = ?`).bind(roleId),
    db.prepare(`DELETE FROM roles WHERE id = ?`).bind(roleId),
    audit(c, "delete", "role", String(roleId), `Deleted job — ${role.title}`),
  ]);
  return c.json({ ok: true });
});

/** A timeline event. "newest" targets the candidate just inserted earlier in the same batch. */
function candidateEvent(c: Ctx, candidateId: number | "newest", kind: string, body = "", score: number | null = null, verdict: string | null = null) {
  const idSql = candidateId === "newest" ? "(SELECT MAX(id) FROM candidates)" : "?";
  const stmt = c.env.DB.prepare(
    `INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict) VALUES (${idSql}, ?, ?, ?, ?, ?, ?)`
  );
  return candidateId === "newest"
    ? stmt.bind(nowIso(), c.get("userEmail"), kind, body, score, verdict)
    : stmt.bind(candidateId, nowIso(), c.get("userEmail"), kind, body, score, verdict);
}

writes.post("/candidates", async (c) => {
  const v = await body(c, schemas.candidate);
  const role = await mustExist(c, "roles", v.roleId);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO candidates (role_id, stage, name, licence, licence_ok, source, days_in_stage, stage_since, sort_order,
                                 email, phone, location, headline, disqualified, disqualify_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM candidates WHERE role_id = ?),
                 ?, ?, ?, ?, 0, '', ?) RETURNING id`
      )
      .bind(v.roleId, v.stage, v.name, v.licence.toUpperCase(), v.licenceOk ? 1 : 0, v.source, todaySydney(), v.roleId, v.email, v.phone, v.location, v.headline, nowIso()),
    // Audit first: it reads last_insert_rowid(), which the event insert would overwrite.
    auditLastInsert(c, "candidate", `Added candidate ${v.name} for ${role.title}`),
    candidateEvent(c, "newest", "created", `Added to ${STAGES[v.stage]}${v.source ? ` · source: ${v.source}` : ""}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/candidates/:id", async (c) => {
  const candId = param(c);
  const v = await body(c, schemas.candidate, true);
  const cand = await mustExist(c, "candidates", candId);
  if (v.roleId !== undefined) await mustExist(c, "roles", v.roleId);
  const stageChanged = v.stage !== undefined && v.stage !== cand.stage;
  const dqChanged = v.disqualified !== undefined && v.disqualified !== (cand.disqualified === 1);
  const { sql, binds } = setClause(
    {
      ...v,
      licence: v.licence?.toUpperCase(),
      licenceOk: v.licenceOk === undefined ? undefined : v.licenceOk ? 1 : 0,
      disqualified: v.disqualified === undefined ? undefined : v.disqualified ? 1 : 0,
      disqualifyReason: dqChanged && !v.disqualified ? "" : v.disqualifyReason,
      stageSince: stageChanged ? todaySydney() : undefined,
    },
    {
      roleId: "role_id",
      name: "name",
      email: "email",
      phone: "phone",
      location: "location",
      headline: "headline",
      licence: "licence",
      licenceOk: "licence_ok",
      source: "source",
      stage: "stage",
      stageSince: "stage_since",
      disqualified: "disqualified",
      disqualifyReason: "disqualify_reason",
    }
  );
  if (!sql) return c.json({ ok: true });
  const name = v.name ?? String(cand.name);
  const stmts: D1PreparedStatement[] = [c.env.DB.prepare(`UPDATE candidates SET ${sql} WHERE id = ?`).bind(...binds, candId)];
  let summary = `Updated candidate ${name}`;
  let action: "update" | "move" = "update";
  if (stageChanged) {
    stmts.push(candidateEvent(c, candId, "stage", `Moved to ${STAGES[v.stage!]}`));
    summary = `Moved ${name} to ${STAGES[v.stage!]}`;
    action = "move";
  }
  if (dqChanged) {
    stmts.push(candidateEvent(c, candId, v.disqualified ? "disqualified" : "requalified", v.disqualified ? v.disqualifyReason ?? "" : ""));
    summary = v.disqualified ? `Disqualified ${name}${v.disqualifyReason ? ` — ${v.disqualifyReason}` : ""}` : `Requalified ${name}`;
  }
  stmts.push(audit(c, action, "candidate", String(candId), summary));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

writes.delete("/candidates/:id", async (c) => {
  const candId = param(c);
  const cand = await mustExist(c, "candidates", candId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM candidate_events WHERE candidate_id = ?`).bind(candId),
    c.env.DB.prepare(`DELETE FROM candidates WHERE id = ?`).bind(candId),
    audit(c, "delete", "candidate", String(candId), `Deleted candidate ${cand.name}`),
  ]);
  return c.json({ ok: true });
});

writes.post("/candidates/:id/comments", async (c) => {
  const candId = param(c);
  const v = await body(c, schemas.comment);
  const cand = await mustExist(c, "candidates", candId);
  await c.env.DB.batch([
    candidateEvent(c, candId, "comment", v.body),
    audit(c, "create", "candidate", String(candId), `Commented on ${cand.name}`),
  ]);
  return c.json({ ok: true }, 201);
});

writes.post("/candidates/:id/evaluations", async (c) => {
  const candId = param(c);
  const v = await body(c, schemas.evaluation);
  const cand = await mustExist(c, "candidates", candId);
  await c.env.DB.batch([
    candidateEvent(c, candId, "evaluation", v.body, v.score, v.verdict),
    audit(c, "create", "candidate", String(candId), `Evaluated ${cand.name}: ${v.verdict} (${v.score}/5)`),
  ]);
  return c.json({ ok: true }, 201);
});

writes.delete("/candidate-events/:id", async (c) => {
  const evId = param(c);
  const ev = await mustExist(c, "candidate_events", evId);
  if (ev.kind !== "comment" && ev.kind !== "evaluation") throw new BadRequest("Only comments and evaluations can be deleted.");
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM candidate_events WHERE id = ?`).bind(evId),
    audit(c, "delete", "candidate", String(ev.candidate_id), `Deleted a ${ev.kind}`),
  ]);
  return c.json({ ok: true });
});

// ── Intelligence ─────────────────────────────────────────────────────────────
writes.post("/intel", async (c) => {
  const v = await body(c, schemas.intel);
  const region = await c.env.DB.prepare(`SELECT label FROM regions WHERE key = ?`).bind(v.regionKey).first<string>("label");
  if (!region) throw new BadRequest("Some fields need attention.", { regionKey: "Choose a region" });
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO intel_feed (time_label, severity, severity_kind, region_key, headline, source, created_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`
      )
      .bind(time, v.severity, kindFor(INTEL_SEVERITIES, v.severity), v.regionKey, v.headline, v.source, nowIso(now)),
    auditLastInsert(c, "intel", `Logged ${v.severity.toLowerCase()} item — ${region}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.delete("/intel/:id", async (c) => {
  const itemId = param(c);
  const item = await mustExist(c, "intel_feed", itemId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM intel_feed WHERE id = ?`).bind(itemId),
    audit(c, "delete", "intel", String(itemId), `Removed ${String(item.severity).toLowerCase()} item from the feed`),
  ]);
  return c.json({ ok: true });
});
