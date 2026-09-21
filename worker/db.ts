import type {
  Candidate,
  Client,
  Employee,
  GanttSection,
  IntelItem,
  Metric,
  OpsColumn,
  Region,
  Role,
  StatusKind,
} from "../shared/types";

function asKind(v: string): StatusKind {
  return (["secure", "advisory", "breach", "info", "neutral"] as const).includes(v as StatusKind)
    ? (v as StatusKind)
    : "neutral";
}

export async function getMetrics(db: D1Database): Promise<Metric[]> {
  const { results } = await db
    .prepare(`SELECT label, value, unit, note, note_kind FROM metrics ORDER BY sort_order`)
    .all<{ label: string; value: string; unit: string; note: string; note_kind: string }>();
  return results.map((r) => ({
    label: r.label,
    value: r.value,
    unit: r.unit,
    note: r.note,
    noteKind: asKind(r.note_kind),
  }));
}

export async function getEmployees(db: D1Database): Promise<Employee[]> {
  const [{ results: rows }, { results: shiftRows }] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, role, licence_class, licence_expiry, expiry_soon, site, status,
                status_kind, employed_since, first_aid, mobile, employment_type
         FROM employees ORDER BY id`
      )
      .all<{
        id: number;
        name: string;
        role: string;
        licence_class: string;
        licence_expiry: string;
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
      .prepare(
        `SELECT employee_id, shift_date, span, site FROM employee_shifts ORDER BY employee_id, sort_order`
      )
      .all<{ employee_id: number; shift_date: string; span: string; site: string }>(),
  ]);

  const shiftsByEmployee = new Map<number, { date: string; span: string; site: string }[]>();
  for (const s of shiftRows) {
    const list = shiftsByEmployee.get(s.employee_id) ?? [];
    list.push({ date: s.shift_date, span: s.span, site: s.site });
    shiftsByEmployee.set(s.employee_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    cls: r.licence_class,
    exp: r.licence_expiry,
    expirySoon: r.expiry_soon === 1,
    site: r.site,
    status: r.status,
    kind: asKind(r.status_kind),
    since: r.employed_since,
    firstAid: r.first_aid,
    mobile: r.mobile,
    employmentType: r.employment_type,
    shifts: shiftsByEmployee.get(r.id) ?? [],
  }));
}

export async function getClients(db: D1Database): Promise<Client[]> {
  const [{ results: rows }, { results: contactRows }, { results: dealRows }, { results: activityRows }] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, org, sector, sites, value_pa, owner_initials, status, status_kind, meta
           FROM clients ORDER BY id`
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
        .prepare(`SELECT client_id, name, role FROM client_contacts ORDER BY client_id, sort_order`)
        .all<{ client_id: number; name: string; role: string }>(),
      db
        .prepare(`SELECT client_id, name, value, stage, review_date FROM client_deals`)
        .all<{ client_id: number; name: string; value: string; stage: string; review_date: string }>(),
      db
        .prepare(`SELECT client_id, activity_date, body FROM client_activity ORDER BY client_id, sort_order`)
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

export async function getOpsBoard(db: D1Database): Promise<OpsColumn[]> {
  const [{ results: cols }, { results: cards }] = await Promise.all([
    db.prepare(`SELECT id, label, is_done FROM ops_columns ORDER BY sort_order`).all<{
      id: number;
      label: string;
      is_done: number;
    }>(),
    db
      .prepare(
        `SELECT column_id, ref, title, site, line, due_label, is_late, owner_initials
         FROM ops_cards ORDER BY column_id, sort_order`
      )
      .all<{
        column_id: number;
        ref: string;
        title: string;
        site: string;
        line: string;
        due_label: string;
        is_late: number;
        owner_initials: string;
      }>(),
  ]);

  const cardsByColumn = new Map<number, OpsColumn["cards"]>();
  for (const c of cards) {
    const list = cardsByColumn.get(c.column_id) ?? [];
    list.push({
      ref: c.ref,
      title: c.title,
      site: c.site,
      line: c.line,
      due: c.due_label,
      late: c.is_late === 1,
      who: c.owner_initials,
    });
    cardsByColumn.set(c.column_id, list);
  }

  return cols.map((c) => ({
    label: c.label,
    done: c.is_done === 1,
    cards: cardsByColumn.get(c.id) ?? [],
  }));
}

export async function getGantt(db: D1Database): Promise<GanttSection[]> {
  const [{ results: sections }, { results: tasks }] = await Promise.all([
    db.prepare(`SELECT id, num, name FROM gantt_sections ORDER BY sort_order`).all<{
      id: number;
      num: string;
      name: string;
    }>(),
    db
      .prepare(`SELECT section_id, name, start_day, end_day, kind FROM gantt_tasks ORDER BY section_id, sort_order`)
      .all<{ section_id: number; name: string; start_day: number; end_day: number; kind: string }>(),
  ]);

  const tasksBySection = new Map<number, GanttSection["tasks"]>();
  for (const t of tasks) {
    const list = tasksBySection.get(t.section_id) ?? [];
    list.push({ name: t.name, s: t.start_day, e: t.end_day, k: t.kind as "done" | "active" | "plan" });
    tasksBySection.set(t.section_id, list);
  }

  return sections.map((s) => ({
    num: s.num,
    name: s.name,
    tasks: tasksBySection.get(s.id) ?? [],
  }));
}

export async function getRoles(db: D1Database): Promise<Role[]> {
  const [{ results: roles }, { results: stageCounts }] = await Promise.all([
    db.prepare(`SELECT id, title, meta, status, status_kind FROM roles ORDER BY sort_order`).all<{
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

export async function getCandidates(db: D1Database): Promise<Candidate[]> {
  const { results } = await db
    .prepare(`SELECT role_id, stage, name, licence, licence_ok, source, days_in_stage FROM candidates ORDER BY role_id, stage, sort_order`)
    .all<{
      role_id: number;
      stage: number;
      name: string;
      licence: string;
      licence_ok: number;
      source: string;
      days_in_stage: number;
    }>();
  return results.map((r) => ({
    roleId: r.role_id,
    stage: r.stage,
    name: r.name,
    lic: r.licence,
    ok: r.licence_ok === 1,
    source: r.source,
    days: r.days_in_stage,
  }));
}

export async function getRegions(db: D1Database): Promise<Region[]> {
  const { results } = await db
    .prepare(`SELECT key, label, map_x, map_y, label_anchor, label_dx, label_dy FROM regions`)
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

export async function getFeed(db: D1Database): Promise<IntelItem[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.time_label, f.severity, f.severity_kind, f.region_key, r.label as region_label,
              f.headline, f.source
       FROM intel_feed f JOIN regions r ON r.key = f.region_key
       ORDER BY f.sort_order`
    )
    .all<{
      id: number;
      time_label: string;
      severity: string;
      severity_kind: string;
      region_key: string;
      region_label: string;
      headline: string;
      source: string;
    }>();
  return results.map((r) => ({
    id: r.id,
    time: r.time_label,
    sev: r.severity,
    kind: asKind(r.severity_kind),
    region: r.region_label.toUpperCase(),
    regionKey: r.region_key,
    headline: r.headline,
    source: r.source,
  }));
}
