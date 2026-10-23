// The operations-board task that follows an investigation. A case gets one once it has a date (when the
// client asked, or when the report is due); from then on the task's dates, assignee, title and client are
// the case's, and a change of status moves it to the matching section. Everything else on the task
// (priority, service line, description, subtasks, dependencies) is the board's own.
import { caseRef } from "../shared/investigations";
import { dayMonth, nowIso } from "./dates";

export interface CaseForBoard {
  id: number;
  title: string;
  status: string;
  lead: string;
  access: string;
  requested_at: string | null;
  due_date: string | null;
}

/** What the board shows for a case. A restricted case shows only its reference, as anyone can see the board. */
export function boardFields(kase: CaseForBoard, org: string | null) {
  const restricted = kase.access !== "";
  const start = kase.requested_at && (!kase.due_date || kase.requested_at <= kase.due_date) ? kase.requested_at : null;
  return {
    title: restricted ? "Restricted investigation" : kase.title.slice(0, 120),
    site: restricted ? "" : (org ?? ""),
    start,
    due: kase.due_date,
    owner: kase.lead,
  };
}

/** Intake → first open section; closed → first done section; anything else → the second open section (In progress). */
async function columnFor(db: D1Database, status: string): Promise<{ id: number; is_done: number } | null> {
  const { results } = await db.prepare(`SELECT id, is_done FROM ops_columns ORDER BY sort_order`).all<{ id: number; is_done: number }>();
  const open = results.filter((c) => c.is_done === 0);
  const done = results.filter((c) => c.is_done === 1);
  const pick = status === "Closed" ? done[0] : status === "Intake" ? open[0] : (open[1] ?? open[0]);
  return pick ?? open[0] ?? results[0] ?? null;
}

/** Where a task lands in a section: done sections list the latest first; open ones take new work at the bottom. */
async function slotIn(db: D1Database, col: { id: number; is_done: number }): Promise<number> {
  const sql = col.is_done
    ? `SELECT COALESCE(MIN(sort_order), 1) - 1 AS n FROM ops_cards WHERE column_id = ?`
    : `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ops_cards WHERE column_id = ?`;
  return (await db.prepare(sql).bind(col.id).first<number>("n")) ?? 1;
}

/**
 * Statements that bring the case's board task in step with the case (to run in the same batch as the
 * change to the case). Creates the task once the case has a date; moves it only when `statusChanged`,
 * so a task dragged on the board stays where it was put until the case's status changes.
 */
export async function syncCaseCard(db: D1Database, kase: CaseForBoard, org: string | null, statusChanged: boolean): Promise<D1PreparedStatement[]> {
  const card = await db.prepare(`SELECT id, column_id FROM ops_cards WHERE case_id = ?`).bind(kase.id).first<{ id: number; column_id: number }>();
  if (!card && !kase.requested_at && !kase.due_date) return [];
  const f = boardFields(kase, org);
  const dueLabel = f.due ? `DUE ${dayMonth(f.due)}` : "";
  const now = nowIso();

  if (!card) {
    const col = await columnFor(db, kase.status);
    if (!col) return [];
    const next = (await db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(ref, 4) AS INTEGER)), 100) + 1 AS n FROM ops_cards WHERE ref LIKE 'OP-%'`).first<number>("n")) ?? 101;
    return [
      db
        .prepare(
          `INSERT INTO ops_cards (column_id, ref, title, site, line, description, priority, start_date, due_label, due_date,
                                  created_at, completed_at, is_late, owner_initials, sort_order, is_milestone, case_id)
           VALUES (?, ?, ?, ?, 'Advisory', ?, 'None', ?, ?, ?, ?, ?, 0, ?, ?, 0, ?)`
        )
        .bind(col.id, `OP-${next}`, f.title, f.site, `Follows investigation ${caseRef(kase.id)}.`, f.start, dueLabel, f.due, now, col.is_done ? now : null, f.owner, await slotIn(db, col), kase.id),
    ];
  }

  const stmts = [
    db
      .prepare(`UPDATE ops_cards SET title = ?, site = ?, start_date = ?, due_date = ?, due_label = ?, owner_initials = ?, is_milestone = 0 WHERE id = ?`)
      .bind(f.title, f.site, f.start, f.due, dueLabel, f.owner, card.id),
  ];
  if (statusChanged) {
    const col = await columnFor(db, kase.status);
    if (col && col.id !== card.column_id) {
      const order = await slotIn(db, col);
      stmts.push(db.prepare(`UPDATE ops_cards SET column_id = ?, sort_order = ?, completed_at = ? WHERE id = ?`).bind(col.id, order, col.is_done ? now : null, card.id));
    }
  }
  return stmts;
}

/** Removes a case's board task with its subtasks and links. */
export function dropCaseCard(db: D1Database, caseId: number): D1PreparedStatement[] {
  const card = `(SELECT id FROM ops_cards WHERE case_id = ?)`;
  return [
    db.prepare(`DELETE FROM ops_subtasks WHERE card_id IN ${card}`).bind(caseId),
    db.prepare(`DELETE FROM ops_dependencies WHERE card_id IN ${card} OR depends_on_id IN ${card}`).bind(caseId, caseId),
    db.prepare(`DELETE FROM ops_cards WHERE case_id = ?`).bind(caseId),
  ];
}
