import type {
  AuditEntry,
  Candidate,
  CandidateEvent,
  CandidateFile,
  CandidateEventKind,
  Client,
  ClientContact,
  Deal,
  DealStage,
  Engagement,
  EngagementKind,
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
import { DEAL_STAGES, ENGAGEMENT_KINDS, PRIORITIES, STAGES } from "../shared/types";
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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Legacy display dates ("28 AUG 26") back to ISO, so old and new activity sort together. */
function labelToIso(label: string): string | null {
  const m = /^(\d{1,2}) ([A-Z]{3}) (\d{2})$/.exec(label.trim().toUpperCase());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[2]!);
  return mo < 0 ? null : `20${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

const moneyNum = (v: string) => Number(v.replace(/[^0-9.]/g, "") || 0);

export async function getClients(db: D1Database): Promise<Client[]> {
  const [{ results: rows }, { results: contactRows }, { results: activityRows }] = await Promise.all([
    db
      .prepare(
        `SELECT id, org, sector, sites, value_pa, owner_initials, status, status_kind, meta, domain, phone, city, created_at
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
        domain: string;
        phone: string;
        city: string;
        created_at: string | null;
      }>(),
    db
      .prepare(`SELECT id, client_id, name, role, email, phone FROM client_contacts ORDER BY client_id, sort_order, id`)
      .all<{ id: number; client_id: number; name: string; role: string; email: string; phone: string }>(),
    db
      .prepare(
        `SELECT id, client_id, activity_date, body, kind, subject, at, actor, outcome, due_date, done, contact_id
         FROM client_activity ORDER BY client_id, sort_order, id DESC`
      )
      .all<{
        id: number;
        client_id: number;
        activity_date: string;
        body: string;
        kind: string;
        subject: string;
        at: string | null;
        actor: string;
        outcome: string;
        due_date: string | null;
        done: number;
        contact_id: number | null;
      }>(),
  ]);

  const contactsByClient = new Map<number, ClientContact[]>();
  for (const c of contactRows) {
    const list = contactsByClient.get(c.client_id) ?? [];
    list.push({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone });
    contactsByClient.set(c.client_id, list);
  }
  const activityByClient = new Map<number, Engagement[]>();
  for (const a of activityRows) {
    const list = activityByClient.get(a.client_id) ?? [];
    list.push({
      id: a.id,
      clientId: a.client_id,
      kind: (ENGAGEMENT_KINDS as readonly string[]).includes(a.kind) ? (a.kind as EngagementKind) : "note",
      subject: a.subject,
      body: a.body,
      at: a.at ?? labelToIso(a.activity_date) ?? a.activity_date,
      actor: a.actor,
      outcome: a.outcome,
      dueDate: a.due_date,
      done: a.done === 1,
      contactId: a.contact_id,
    });
    activityByClient.set(a.client_id, list);
  }
  for (const list of activityByClient.values()) list.sort((x, y) => y.at.localeCompare(x.at) || y.id - x.id);

  return rows.map((r) => {
    const activity = activityByClient.get(r.id) ?? [];
    return {
      id: r.id,
      org: r.org,
      sector: r.sector,
      sites: r.sites,
      value: r.value_pa,
      valueNum: moneyNum(r.value_pa),
      owner: r.owner_initials,
      status: r.status,
      kind: asKind(r.status_kind),
      meta: r.meta,
      domain: r.domain,
      phone: r.phone,
      city: r.city,
      createdAt: r.created_at,
      lastActivity: activity.find((a) => a.kind !== "task" || a.done)?.at.slice(0, 10) ?? null,
      contacts: contactsByClient.get(r.id) ?? [],
      activity,
    };
  });
}

const DEAL_STAGE_SET = new Set<string>(DEAL_STAGES.map(([s]) => s));

export async function getDeals(db: D1Database): Promise<Deal[]> {
  const { results } = await db
    .prepare(`SELECT id, client_id, name, amount, stage, close_date, owner_initials, created_at, closed_at FROM deals ORDER BY sort_order, id`)
    .all<{
      id: number;
      client_id: number;
      name: string;
      amount: number;
      stage: string;
      close_date: string | null;
      owner_initials: string;
      created_at: string;
      closed_at: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    amount: r.amount,
    stage: (DEAL_STAGE_SET.has(r.stage) ? r.stage : "Enquiry") as DealStage,
    closeDate: r.close_date,
    owner: r.owner_initials,
    createdAt: r.created_at,
    closedAt: r.closed_at,
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
    db
      .prepare(
        `SELECT id, title, meta, status, status_kind, department, location, employment_type, openings, description, hiring_manager, created_at
         FROM roles ORDER BY sort_order, id`
      )
      .all<{
        id: number;
        title: string;
        meta: string;
        status: string;
        status_kind: string;
        department: string;
        location: string;
        employment_type: string;
        openings: number;
        description: string;
        hiring_manager: string;
        created_at: string | null;
      }>(),
    db
      .prepare(`SELECT role_id, stage, disqualified, COUNT(*) as n FROM candidates GROUP BY role_id, stage, disqualified`)
      .all<{ role_id: number; stage: number; disqualified: number; n: number }>(),
  ]);

  const countsByRole = new Map<number, { counts: number[]; dq: number }>();
  for (const r of roles) countsByRole.set(r.id, { counts: STAGES.map(() => 0), dq: 0 });
  for (const sc of stageCounts) {
    const entry = countsByRole.get(sc.role_id);
    if (!entry) continue;
    if (sc.disqualified) entry.dq += sc.n;
    else if (sc.stage >= 0 && sc.stage < STAGES.length) entry.counts[sc.stage]! += sc.n;
  }

  return roles.map((r) => ({
    id: r.id,
    title: r.title,
    meta: r.meta,
    status: r.status,
    kind: asKind(r.status_kind),
    counts: countsByRole.get(r.id)?.counts ?? STAGES.map(() => 0),
    disqualified: countsByRole.get(r.id)?.dq ?? 0,
    department: r.department,
    location: r.location,
    employmentType: r.employment_type,
    openings: r.openings,
    description: r.description,
    hiringManager: r.hiring_manager,
    createdAt: r.created_at,
  }));
}

export async function getCandidates(db: D1Database, today: string): Promise<Candidate[]> {
  const [{ results }, { results: events }, { results: files }] = await Promise.all([
    db
      .prepare(
        `SELECT id, role_id, stage, name, licence, licence_ok, source, days_in_stage, stage_since,
                email, phone, location, headline, disqualified, disqualify_reason, created_at
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
        email: string;
        phone: string;
        location: string;
        headline: string;
        disqualified: number;
        disqualify_reason: string;
        created_at: string | null;
      }>(),
    db
      .prepare(`SELECT id, candidate_id, at, actor, kind, body, score, verdict FROM candidate_events ORDER BY at DESC, id DESC`)
      .all<{ id: number; candidate_id: number; at: string; actor: string; kind: string; body: string; score: number | null; verdict: string | null }>(),
    db
      .prepare(`SELECT id, candidate_id, filename, mime, size, created_at FROM careers_cv_files ORDER BY created_at DESC, id DESC`)
      .all<{ id: number; candidate_id: number; filename: string; mime: string; size: number; created_at: string }>(),
  ]);
  const filesByCandidate = new Map<number, CandidateFile[]>();
  for (const f of files) {
    const list = filesByCandidate.get(f.candidate_id) ?? [];
    list.push({ id: f.id, filename: f.filename, mime: f.mime, size: f.size, uploadedAt: f.created_at });
    filesByCandidate.set(f.candidate_id, list);
  }
  const eventsByCandidate = new Map<number, CandidateEvent[]>();
  for (const e of events) {
    const list = eventsByCandidate.get(e.candidate_id) ?? [];
    list.push({ id: e.id, at: e.at, actor: e.actor, kind: e.kind as CandidateEventKind, body: e.body, score: e.score, verdict: e.verdict });
    eventsByCandidate.set(e.candidate_id, list);
  }
  return results.map((r) => {
    const evs = eventsByCandidate.get(r.id) ?? [];
    const scores = evs.filter((e) => e.kind === "evaluation" && e.score).map((e) => e.score!);
    return {
      id: r.id,
      roleId: r.role_id,
      stage: r.stage,
      name: r.name,
      lic: r.licence,
      ok: r.licence_ok === 1,
      source: r.source,
      days: r.stage_since ? Math.max(0, daysBetween(r.stage_since.slice(0, 10), today)) : r.days_in_stage,
      email: r.email,
      phone: r.phone,
      location: r.location,
      headline: r.headline,
      disqualified: r.disqualified === 1,
      disqualifyReason: r.disqualify_reason,
      appliedAt: r.created_at,
      rating: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      events: evs,
      files: filesByCandidate.get(r.id) ?? [],
    };
  });
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

  const active = clients.filter((c) => c.status === "Customer");
  const sites = active.reduce((n, c) => n + c.sites, 0);
  const value = active.reduce((n, c) => n + c.valueNum, 0);

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
      unit: `${active.length} ${active.length === 1 ? "customer" : "customers"}`,
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
  const [employees, clients, deals, opsColumns, roles, candidates, regions, feed, audit] = await Promise.all([
    getEmployees(db, today),
    getClients(db),
    getDeals(db),
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
    deals,
    opsColumns,
    roles,
    candidates,
    regions,
    feed,
    audit,
  };
}
