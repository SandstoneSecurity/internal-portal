import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  CLIENT_STATUSES,
  EMPLOYEE_STATUSES,
  INTEL_SEVERITIES,
  PRIORITIES,
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
    sector: text(60),
    sites: z.coerce.number().int().min(0).max(999),
    valuePa: z.coerce.number().int().min(0).max(1_000_000_000),
    owner: initials,
    status: z.enum(labels(CLIENT_STATUSES)),
    meta: optText(160),
  }),
  contact: z.object({ name: text(80), role: text(80) }),
  activity: z.object({ text: text(400) }),
  deal: z.object({
    name: text(120),
    value: z.coerce.number().int().min(0).max(1_000_000_000),
    stage: z.enum(["SCOPING", "DRAFTING", "SUBMITTED", "NEGOTIATING"]),
    review: isoDate,
  }),
  role: z.object({
    title: text(100),
    meta: optText(140),
    status: z.enum(labels(ROLE_STATUSES)),
  }),
  candidate: z.object({
    roleId: id,
    name: text(80),
    licence: text(40),
    licenceOk: z.boolean().default(true),
    source: text(60),
    stage: z.coerce.number().int().min(0).max(STAGES.length - 1).default(0),
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

// ── Clients ──────────────────────────────────────────────────────────────────
writes.post("/clients", async (c) => {
  const v = await body(c, schemas.client);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO clients (org, sector, sites, value_pa, owner_initials, status, status_kind, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .bind(v.org, v.sector, v.sites, aud(v.valuePa), v.owner, v.status, kindFor(CLIENT_STATUSES, v.status), v.meta || `${v.status} · ${v.sector}`),
    auditLastInsert(c, "client", `Opened account for ${v.org}`),
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
    { org: "org", sector: "sector", sites: "sites", valuePa: "value_pa", owner: "owner_initials", status: "status", statusKind: "status_kind", meta: "meta" }
  );
  if (!sql) return c.json({ ok: true });
  const changed = v.status && v.status !== client.status ? ` — now ${v.status}` : "";
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE clients SET ${sql} WHERE id = ?`).bind(...binds, clientId),
    audit(c, "update", "client", String(clientId), `Updated ${v.org ?? client.org}${changed}`),
  ]);
  return c.json({ ok: true });
});

writes.delete("/clients/:id", async (c) => {
  const clientId = param(c);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM client_contacts WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM client_deals WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM client_activity WHERE client_id = ?`).bind(clientId),
    db.prepare(`DELETE FROM clients WHERE id = ?`).bind(clientId),
    audit(c, "delete", "client", String(clientId), `Closed account for ${client.org}`),
  ]);
  return c.json({ ok: true });
});

writes.post("/clients/:id/contacts", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.contact);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO client_contacts (client_id, name, role, sort_order)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM client_contacts WHERE client_id = ?))`
      )
      .bind(clientId, v.name, v.role, clientId),
    audit(c, "create", "contact", String(clientId), `Added contact ${v.name} (${v.role}) at ${client.org}`),
  ]);
  return c.json({ ok: true }, 201);
});

writes.post("/clients/:id/activity", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.activity);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO client_activity (client_id, activity_date, body, sort_order)
         VALUES (?, ?, ?, (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM client_activity WHERE client_id = ?))`
      )
      .bind(clientId, shortDate(todaySydney()), v.text, clientId),
    audit(c, "create", "activity", String(clientId), `Logged activity at ${client.org}`),
  ]);
  return c.json({ ok: true }, 201);
});

writes.put("/clients/:id/deal", async (c) => {
  const clientId = param(c);
  const v = await body(c, schemas.deal);
  const client = await mustExist(c, "clients", clientId);
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO client_deals (client_id, name, value, stage, review_date) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET name = excluded.name, value = excluded.value, stage = excluded.stage, review_date = excluded.review_date`
      )
      .bind(clientId, v.name, aud(v.value), v.stage, shortDate(v.review)),
    audit(c, "update", "proposal", String(clientId), `Proposal for ${client.org}: ${v.name} (${v.stage.toLowerCase()})`),
  ]);
  return c.json({ ok: true });
});

writes.delete("/clients/:id/deal", async (c) => {
  const clientId = param(c);
  const client = await mustExist(c, "clients", clientId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM client_deals WHERE client_id = ?`).bind(clientId),
    audit(c, "delete", "proposal", String(clientId), `Closed the open proposal for ${client.org}`),
  ]);
  return c.json({ ok: true });
});

// ── Recruitment ──────────────────────────────────────────────────────────────
writes.post("/roles", async (c) => {
  const v = await body(c, schemas.role);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO roles (title, meta, status, status_kind, sort_order)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM roles)) RETURNING id`
      )
      .bind(v.title, v.meta, v.status, kindFor(ROLE_STATUSES, v.status)),
    auditLastInsert(c, "role", `Posted role — ${v.title}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/roles/:id", async (c) => {
  const roleId = param(c);
  const v = await body(c, schemas.role, true);
  const role = await mustExist(c, "roles", roleId);
  const { sql, binds } = setClause(
    { ...v, statusKind: v.status ? kindFor(ROLE_STATUSES, v.status) : undefined },
    { title: "title", meta: "meta", status: "status", statusKind: "status_kind" }
  );
  if (!sql) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE roles SET ${sql} WHERE id = ?`).bind(...binds, roleId),
    audit(c, "update", "role", String(roleId), `Updated role — ${v.title ?? role.title}${v.status ? ` (${v.status})` : ""}`),
  ]);
  return c.json({ ok: true });
});

writes.delete("/roles/:id", async (c) => {
  const roleId = param(c);
  const role = await mustExist(c, "roles", roleId);
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM candidates WHERE role_id = ?`).bind(roleId),
    db.prepare(`DELETE FROM roles WHERE id = ?`).bind(roleId),
    audit(c, "delete", "role", String(roleId), `Withdrew role — ${role.title}`),
  ]);
  return c.json({ ok: true });
});

writes.post("/candidates", async (c) => {
  const v = await body(c, schemas.candidate);
  const role = await mustExist(c, "roles", v.roleId);
  const db = c.env.DB;
  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO candidates (role_id, stage, name, licence, licence_ok, source, days_in_stage, stage_since, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM candidates WHERE role_id = ?)) RETURNING id`
      )
      .bind(v.roleId, v.stage, v.name, v.licence.toUpperCase(), v.licenceOk ? 1 : 0, v.source, todaySydney(), v.roleId),
    auditLastInsert(c, "candidate", `Added candidate ${v.name} for ${role.title}`),
  ]);
  return c.json({ id: (ins.results[0] as { id: number }).id }, 201);
});

writes.patch("/candidates/:id", async (c) => {
  const candId = param(c);
  const v = await body(c, schemas.candidate.omit({ roleId: true }), true);
  const cand = await mustExist(c, "candidates", candId);
  const stageChanged = v.stage !== undefined && v.stage !== cand.stage;
  const { sql, binds } = setClause(
    {
      ...v,
      licence: v.licence?.toUpperCase(),
      licenceOk: v.licenceOk === undefined ? undefined : v.licenceOk ? 1 : 0,
      stageSince: stageChanged ? todaySydney() : undefined,
    },
    { name: "name", licence: "licence", licenceOk: "licence_ok", source: "source", stage: "stage", stageSince: "stage_since" }
  );
  if (!sql) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE candidates SET ${sql} WHERE id = ?`).bind(...binds, candId),
    audit(
      c,
      stageChanged ? "move" : "update",
      "candidate",
      String(candId),
      stageChanged ? `Moved ${cand.name} to ${STAGES[v.stage as number]}` : `Updated candidate ${v.name ?? cand.name}`
    ),
  ]);
  return c.json({ ok: true });
});

writes.delete("/candidates/:id", async (c) => {
  const candId = param(c);
  const cand = await mustExist(c, "candidates", candId);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM candidates WHERE id = ?`).bind(candId),
    audit(c, "delete", "candidate", String(candId), `Withdrew candidate ${cand.name}`),
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
