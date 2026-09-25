import type {
  AuditEntry,
  Candidate,
  Client,
  Employee,
  IntelItem,
  Metric,
  OpsColumn,
  OpsSubtask,
  PortalData,
  Priority,
  Region,
  Role,
  StatusKind,
} from "../shared/types";
import { PRIORITIES } from "../shared/types";
import { addDays, dayMonth, daysBetween, shortDate, todaySydney } from "./dates";

export function asKind(v: string): StatusKind {
  return (["secure", "advisory", "breach", "info", "neutral"] as const).includes(v as StatusKind)
    ? (v as StatusKind)
    : "neutral";
}

const EXPIRY_WINDOW_DAYS = 90;

export async function getEmployees(db: D1Database, today: string): Promise<Employee[]> {
  const [{ results: rows }, { results: shiftRows }] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, role, licence_class, licence_expiry, licence_expiry_date, expiry_soon, site, status,
                status_kind, employed_since, first_aid, mobile, employment_type
         FROM employees ORDER BY name COLLATE NOCASE`
      )
      .all<{
        id: number;
        name: string;
        role: string;
        licence_class: string;
        licence_expiry: string;
        licence_expiry_date: string | null;
        expiry_soon: number;
        site: string;
        status: string;
        status_kind: string;
        employed_since: string;
        first_aid: string;
        mobile: string;
        employment_type: string;
      }>(),
    db
      .prepare(`SELECT employee_id, shift_date, span, site FROM employee_shifts ORDER BY employee_id, sort_order, id DESC`)
      .all<{ employee_id: number; shift_date: string; span: string; site: string }>(),
  ]);

  const shiftsByEmployee = new Map<number, { date: string; span: string; site: string }[]>();
  for (const s of shiftRows) {
    const list = shiftsByEmployee.get(s.employee_id) ?? [];
    list.push({ date: s.shift_date, span: s.span, site: s.site });
    shiftsByEmployee.set(s.employee_id, list);
  }

  const horizon = addDays(today, EXPIRY_WINDOW_DAYS);
  return rows.map((r) => {
    const expDate = r.licence_expiry_date;
    const expired = expDate ? expDate < today : false;
    const soon = expDate ? expDate <= horizon : r.expiry_soon === 1;
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      cls: r.licence_class,
      exp: expDate ? shortDate(expDate) : r.licence_expiry,
      expDate,
      expirySoon: soon,
      expired,
      site: r.site,
      status: r.status,
      kind: asKind(r.status_kind),
      since: r.employed_since,
      firstAid: r.first_aid,
      mobile: r.mobile,
      employmentType: r.employment_type,
      shifts: (shiftsByEmployee.get(r.id) ?? []).slice(0, 8),
    };
  });
}

export async function getClients(db: D1Database): Promise<Client[]> {
  const [{ results: rows }, { results: contactRows }, { results: dealRows }, { results: activityRows }] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, org, sector, sites, value_pa, owner_initials, status, status_kind, meta
           FROM clients ORDER BY org COLLATE NOCASE`
        )
        .all<{
          id: number;
          org: string;
          sector: string;
          sites: number;
          value_pa: string;
          owner_initials: string;
          status: string;
          status_kind: string;
          meta: string;
        }>(),
      db
        .prepare(`SELECT client_id, name, role FROM client_contacts ORDER BY client_id, sort_order, id`)
        .all<{ client_id: number; name: string; role: string }>(),
      db
        .prepare(`SELECT client_id, name, value, stage, review_date FROM client_deals`)
        .all<{ client_id: number; name: string; value: string; stage: string; review_date: string }>(),
      db
        .prepare(`SELECT client_id, activity_date, body FROM client_activity ORDER BY client_id, sort_order, id DESC`)
        .all<{ client_id: number; activity_date: string; body: string }>(),
    ]);

  const contactsByClient = new Map<number, { name: string; role: string }[]>();
  for (const c of contactRows) {
    const list = contactsByClient.get(c.client_id) ?? [];
    list.push({ name: c.name, role: c.role });
    contactsByClient.set(c.client_id, list);
  }
  const dealByClient = new Map<number, { name: string; value: string; stage: string; review: string }>();
  for (const d of dealRows) {
    dealByClient.set(d.client_id, { name: d.name, value: d.value, stage: d.stage, review: d.review_date });
  }
  const activityByClient = new Map<number, { date: string; text: string }[]>();
  for (const a of activityRows) {
    const list = activityByClient.get(a.client_id) ?? [];
    list.push({ date: a.activity_date, text: a.body });
    activityByClient.set(a.client_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    org: r.org,
    sector: r.sector,
    sites: r.sites,
    value: r.value_pa,
    owner: r.owner_initials,
    status: r.status,
    kind: asKind(r.status_kind),
    meta: r.meta,
    contacts: contactsByClient.get(r.id) ?? [],
    deal: dealByClient.get(r.id) ?? null,
    activity: activityByClient.get(r.id) ?? [],
  }));
}

const PRIORITY_SET = new Set<string>(PRIORITIES);

export async function getOpsBoard(db: D1Database, today: string): Promise<OpsColumn[]> {
  const [{ results: cols }, { results: cards }, { results: subs }, { results: deps }] = await Promise.all([
    db.prepare(`SELECT id, label, is_done FROM ops_columns ORDER BY sort_order`).all<{
      id: number;
      label: string;
      is_done: number;
    }>(),
    db
      .prepare(
        `SELECT id, column_id, ref, title, site, line, due_label, due_date, start_date, created_at, completed_at,
                is_late, owner_initials, description, priority, is_milestone
         FROM ops_cards ORDER BY column_id, sort_order, id`
      )
      .all<{
        id: number;
        column_id: number;
        ref: string;
        title: string;
        site: string;
        line: string;
        due_label: string;
        due_date: string | null;
        start_date: string | null;
        created_at: string | null;
        completed_at: string | null;
        is_late: number;
        owner_initials: string;
        description: string;
        priority: string;
        is_milestone: number;
      }>(),
    db
      .prepare(
        `SELECT id, card_id, title, done, owner_initials, start_date, due_date
         FROM ops_subtasks ORDER BY card_id, sort_order, id`
      )
      .all<{
        id: number;
        card_id: number;
        title: string;
        done: number;
        owner_initials: string;
        start_date: string | null;
        due_date: string | null;
      }>(),
    db
      .prepare(`SELECT card_id, depends_on_id FROM ops_dependencies ORDER BY created_at`)
      .all<{ card_id: number; depends_on_id: number }>(),
  ]);

  const blockedBy = new Map<number, number[]>();
  for (const d of deps) blockedBy.set(d.card_id, [...(blockedBy.get(d.card_id) ?? []), d.depends_on_id]);

  const subsByCard = new Map<number, OpsSubtask[]>();
  for (const s of subs) {
    const list = subsByCard.get(s.card_id) ?? [];
    list.push({
      id: s.id,
      cardId: s.card_id,
      title: s.title,
      done: s.done === 1,
      who: s.owner_initials,
      startDate: s.start_date,
      dueDate: s.due_date,
      late: s.done !== 1 && !!s.due_date && s.due_date < today,
    });
    subsByCard.set(s.card_id, list);
  }

  const doneColumns = new Set(cols.filter((c) => c.is_done === 1).map((c) => c.id));
  const cardsByColumn = new Map<number, OpsColumn["cards"]>();
  for (const c of cards) {
    const done = doneColumns.has(c.column_id);
    const late = done ? false : c.due_date ? c.due_date < today : c.is_late === 1;
    const list = cardsByColumn.get(c.column_id) ?? [];
    list.push({
      id: c.id,
      columnId: c.column_id,
      ref: c.ref,
      title: c.title,
      site: c.site,
      line: c.line,
      description: c.description,
      priority: (PRIORITY_SET.has(c.priority) ? c.priority : "None") as Priority,
      due: c.due_date ? `DUE ${dayMonth(c.due_date)}` : c.due_label,
      startDate: c.start_date,
      dueDate: c.due_date,
      createdAt: c.created_at,
      completedAt: c.completed_at,
      late,
      who: c.owner_initials,
      milestone: c.is_milestone === 1,
      blockedBy: blockedBy.get(c.id) ?? [],
      subtasks: subsByCard.get(c.id) ?? [],
    });
    cardsByColumn.set(c.column_id, list);
  }

  return cols.map((c) => ({
    id: c.id,
    label: c.label,
    done: c.is_done === 1,
    cards: cardsByColumn.get(c.id) ?? [],
  }));
}

export async function getRoles(db: D1Database): Promise<Role[]> {
  const [{ results: roles }, { results: stageCounts }] = await Promise.all([
    db.prepare(`SELECT id, title, meta, status, status_kind FROM roles ORDER BY sort_order, id`).all<{
      id: number;
      title: string;
      meta: string;
      status: string;
      status_kind: string;
    }>(),
    db
      .prepare(`SELECT role_id, stage, COUNT(*) as n FROM candidates GROUP BY role_id, stage`)
      .all<{ role_id: number; stage: number; n: number }>(),
  ]);

  const countsByRole = new Map<number, number[]>();
  for (const r of roles) countsByRole.set(r.id, [0, 0, 0, 0, 0]);
  for (const sc of stageCounts) {
    const counts = countsByRole.get(sc.role_id);
    if (counts && sc.stage >= 0 && sc.stage < counts.length) counts[sc.stage] = sc.n;
  }

  return roles.map((r) => ({
    id: r.id,
    title: r.title,
    meta: r.meta,
    status: r.status,
    kind: asKind(r.status_kind),
    counts: countsByRole.get(r.id) ?? [0, 0, 0, 0, 0],
  }));
}

export async function getCandidates(db: D1Database, today: string): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT id, role_id, stage, name, licence, licence_ok, source, days_in_stage, stage_since
       FROM candidates ORDER BY role_id, stage, sort_order, id`
    )
    .all<{
      id: number;
      role_id: number;
      stage: number;
      name: string;
      licence: string;
      licence_ok: number;
      source: string;
      days_in_stage: number;
      stage_since: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    roleId: r.role_id,
    stage: r.stage,
    name: r.name,
    lic: r.licence,
    ok: r.licence_ok === 1,
    source: r.source,
    days: r.stage_since ? Math.max(0, daysBetween(r.stage_since.slice(0, 10), today)) : r.days_in_stage,
  }));
}

export async function getRegions(db: D1Database): Promise<Region[]> {
  const { results } = await db
    .prepare(`SELECT key, label, map_x, map_y, label_anchor, label_dx, label_dy FROM regions ORDER BY label`)
    .all<{
      key: string;
      label: string;
      map_x: number;
      map_y: number;
      label_anchor: string;
      label_dx: number;
      label_dy: number;
    }>();
  return results.map((r) => ({
    key: r.key,
    label: r.label,
    x: r.map_x,
    y: r.map_y,
    anchor: r.label_anchor === "end" ? "end" : "start",
    dx: r.label_dx,
    dy: r.label_dy,
  }));
}

const sydneyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });
const sydneyTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "14:05" today, "YEST 22:10" yesterday, "21 SEP" before that — as the prototype's feed read. */
function feedTime(createdAt: string | null, fallback: string, today: string): string {
  if (!createdAt) return fallback;
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return fallback;
  const day = sydneyDate.format(at);
  const time = sydneyTime.format(at);
  if (day === today) return time;
  if (day === addDays(today, -1)) return `YEST ${time}`;
  return dayMonth(day);
}

export async function getFeed(db: D1Database, today: string): Promise<IntelItem[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.time_label, f.created_at, f.severity, f.severity_kind, f.region_key, r.label as region_label,
              f.headline, f.source
       FROM intel_feed f JOIN regions r ON r.key = f.region_key
       ORDER BY COALESCE(f.created_at, '') DESC, f.sort_order, f.id DESC`
    )
    .all<{
      id: number;
      time_label: string;
      created_at: string | null;
      severity: string;
      severity_kind: string;
      region_key: string;
      region_label: string;
      headline: string;
      source: string;
    }>();
  return results.map((r) => ({
    id: r.id,
    time: feedTime(r.created_at, r.time_label, today),
    sev: r.severity,
    kind: asKind(r.severity_kind),
    region: r.region_label.toUpperCase(),
    regionKey: r.region_key,
    headline: r.headline,
    source: r.source,
  }));
}

export async function getAudit(db: D1Database, limit = 60): Promise<AuditEntry[]> {
  const { results } = await db
    .prepare(`SELECT id, at, actor, action, entity, entity_id, summary FROM audit_log ORDER BY id DESC LIMIT ?`)
    .bind(limit)
    .all<{ id: number; at: string; actor: string; action: string; entity: string; entity_id: string | null; summary: string }>();
  return results.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action as AuditEntry["action"],
    entity: r.entity,
    entityId: r.entity_id,
    summary: r.summary,
  }));
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/** Headline figures, computed live from the records rather than stored. */
export function computeMetrics(
  employees: Employee[],
  clients: Client[],
  opsColumns: OpsColumn[]
): Metric[] {
  const onShift = employees.filter((e) => e.status === "On shift").length;
  const rostered = employees.filter((e) => e.status === "Rostered").length;
  const onLeave = employees.filter((e) => e.status === "Leave").length;

  const active = clients.filter((c) => c.status === "Active");
  const sites = active.reduce((n, c) => n + c.sites, 0);
  const value = active.reduce((n, c) => n + Number(c.value.replace(/[^0-9.]/g, "") || 0), 0);

  const open = opsColumns.filter((c) => !c.done).flatMap((c) => c.cards);
  const late = open.filter((c) => c.late);

  const expiring = employees.filter((e) => e.expirySoon);
  const expired = expiring.filter((e) => e.expired);
  const nextUp = [...expiring]
    .filter((e) => e.expDate && !e.expired)
    .sort((a, b) => (a.expDate ?? "").localeCompare(b.expDate ?? ""))[0];

  return [
    {
      key: "shift",
      label: "Officers on shift",
      value: onShift,
      unit: `of ${employees.length} on register`,
      note: `${rostered} ROSTERED · ${onLeave} ON LEAVE`,
      noteKind: "neutral",
    },
    {
      key: "sites",
      label: "Sites under order",
      value: sites,
      unit: `${active.length} active ${active.length === 1 ? "account" : "accounts"}`,
      note: `CONTRACT VALUE ${money(value)} P.A.`,
      noteKind: "neutral",
    },
    {
      key: "work",
      label: "Open work items",
      value: open.length,
      unit: `${late.length} past due`,
      note: late.length ? late.slice(0, 3).map((c) => c.ref).join(" · ") : "NONE PAST DUE",
      noteKind: late.length ? "breach" : "secure",
    },
    {
      key: "licences",
      label: "Licences expiring",
      value: expiring.length,
      unit: `next ${EXPIRY_WINDOW_DAYS} days`,
      note: expired.length
        ? `${expired.length} ALREADY EXPIRED`
        : nextUp
          ? `NEXT · ${nextUp.name.toUpperCase()} ${nextUp.exp}`
          : "NONE DUE",
      noteKind: expired.length ? "breach" : expiring.length ? "advisory" : "secure",
    },
  ];
}

export async function getPortal(db: D1Database, email: string, now = new Date()): Promise<PortalData> {
  const today = todaySydney(now);
  const [employees, clients, opsColumns, roles, candidates, regions, feed, audit] = await Promise.all([
    getEmployees(db, today),
    getClients(db),
    getOpsBoard(db, today),
    getRoles(db),
    getCandidates(db, today),
    getRegions(db),
    getFeed(db, today),
    getAudit(db),
  ]);
  return {
    me: { email },
    today,
    metrics: computeMetrics(employees, clients, opsColumns),
    employees,
    clients,
    opsColumns,
    roles,
    candidates,
    regions,
    feed,
    audit,
  };
}
