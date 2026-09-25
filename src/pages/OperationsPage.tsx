import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, Plus, Search } from "lucide-react";
import type { OpsCard, OpsColumn } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard, type DropPoint } from "../components/DragCard";
import { Empty, Tabs } from "../components/ui/Bits";
import { Avatar, CheckCircle, Chip, DueDate, Progress } from "../components/ui/TaskBits";
import { usePortal } from "../lib/DataProvider";
import { addDays, dayMonth, daysBetween, matches } from "../lib/format";
import { LINE_HUE, PRIORITY_HUE, columnHue, hueClass } from "../lib/hues";
import { DUR, tween } from "../lib/motion";
import { useSelection } from "../lib/selection";

const VIEWS = ["Board", "Timeline"] as const;

function TaskCard({ card, done, today, flash }: { card: OpsCard; done: boolean; today: string; flash: boolean }) {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const subs = card.subtasks;
  const subsDone = subs.filter((s) => s.done).length;
  const temp = card.id < 0;
  return (
    <>
      <div className="pt-tcard__tags">
        <Chip hue={LINE_HUE[card.line] ?? "slate"}>{card.line}</Chip>
        {card.priority !== "None" && (
          <Chip hue={PRIORITY_HUE[card.priority] ?? "slate"} dot>
            {card.priority}
          </Chip>
        )}
        <span className="pt-tcard__ref">{card.ref}</span>
      </div>
      <div className="pt-tcard__title-row">
        <CheckCircle
          done={done}
          label={done ? `Mark ${card.ref} incomplete` : `Mark ${card.ref} complete`}
          onToggle={() => !temp && void actions.toggleComplete(card)}
        />
        <span className="pt-tcard__title">{card.title}</span>
      </div>
      {card.site && <div className="pt-tcard__site">{card.site}</div>}
      <div className="pt-tcard__foot">
        <Avatar initials={card.who} size={22} />
        <DueDate start={card.startDate} due={card.dueDate} today={today} done={done} empty={card.due ? <span className="pt-due">{card.due}</span> : null} />
        <span style={{ flex: 1 }} />
        {subs.length > 0 && (
          <button
            type="button"
            data-nodrag
            className={`pt-tcard__subs${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-label={`${subsDone} of ${subs.length} subtasks done. ${open ? "Hide" : "Show"} subtasks`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <ListTree size={13} />
            {subsDone}/{subs.length}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            className="pt-tcard__sublist"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: tween(DUR.base) }}
            exit={{ height: 0, opacity: 0, transition: tween(DUR.fast) }}
          >
            {subs.map((s) => (
              <li key={s.id} className={s.done ? "is-done" : undefined}>
                <CheckCircle
                  size={14}
                  done={s.done}
                  label={s.done ? "Mark subtask incomplete" : "Mark subtask complete"}
                  onToggle={() => s.id > 0 && void actions.patchSubtask(card, s, { done: !s.done })}
                />
                <span className="pt-tcard__subtitle">{s.title}</span>
                <DueDate start={null} due={s.dueDate} today={today} done={s.done} />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {subs.length > 0 && (
        <div className="pt-tcard__progress">
          <Progress done={subsDone} total={subs.length} />
        </div>
      )}
      {flash && (
        <motion.span
          aria-hidden
          className="pt-tcard__flash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0, transition: tween(2.2, 0.6) }}
        />
      )}
    </>
  );
}

/** Inline "Add task": type a name, Enter to add and keep going, Esc to stop. */
function Composer({ columnId, onClose }: { columnId: number; onClose: () => void }) {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const add = () => {
    const t = title.trim();
    if (!t) return false;
    setTitle("");
    void actions.quickAddWork(columnId, t);
    return true;
  };
  return (
    <motion.div className="pt-composer" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}>
      <textarea
        ref={ref}
        rows={2}
        value={title}
        maxLength={120}
        placeholder="Write a task name"
        aria-label="New task name"
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        onBlur={() => {
          add();
          onClose();
        }}
      />
      <div className="pt-composer__hint">
        <span>Enter to add</span>
        <span>Esc to close</span>
      </div>
    </motion.div>
  );
}

function Board({ columns, flashId, today, filter }: { columns: OpsColumn[]; flashId: number | null; today: string; filter: string }) {
  const actions = useActions();
  const [over, setOver] = useState<DropPoint | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [composing, setComposing] = useState<number | null>(null);
  return (
    <LayoutGroup>
      <div className="pt-kanban">
        {columns.map((col, ci) => {
          const hue = columnHue(ci, col.done);
          const visible = filter ? col.cards.filter((k) => matches(filter, k.ref, k.title, k.site, k.line, k.who, k.priority)) : col.cards;
          const others = visible.filter((k) => k.id !== dragId);
          const isOver = over?.target === String(col.id);
          const markerBefore: number | "end" | null = isOver ? (others[over!.index] as OpsCard | undefined)?.id ?? "end" : null;
          return (
            <section
              key={col.id}
              className={`pt-kcol ${hueClass(hue)}${isOver ? " is-over" : ""}${col.done ? " pt-kcol--done" : ""}`}
              data-drop={col.id}
              aria-label={`${col.label}, ${col.cards.length} tasks`}
            >
              <header className="pt-kcol__head">
                <span className="pt-kcol__swatch" aria-hidden />
                <h3 className="pt-kcol__title">{col.label}</h3>
                <span className="pt-kcol__count">{visible.length}</span>
                <span style={{ flex: 1 }} />
                <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Add task to ${col.label}`} title="Add task" onClick={() => setComposing(col.id)}>
                  <Plus size={15} />
                </button>
              </header>
              <div className="pt-kcol__list">
                {visible.map((card) => (
                  <div key={card.id} style={{ display: "contents" }}>
                    {markerBefore === card.id && <div className="pt-kcol__marker" aria-hidden />}
                    <DragCard
                      id={`op-${card.id}`}
                      label={`${card.ref} ${card.title}. Drag to move, or press Enter to open.`}
                      className={`pt-tcard${card.late ? " is-late" : ""}${col.done ? " is-done" : ""}${card.id < 0 ? " is-pending" : ""}`}
                      onHover={setOver}
                      onDragState={(d) => setDragId(d ? card.id : null)}
                      onDrop={(p) => card.id > 0 && void actions.moveWork(card, Number(p.target), p.index)}
                      onOpen={() => card.id > 0 && actions.editWork(card)}
                    >
                      <TaskCard card={card} done={col.done} today={today} flash={flashId === card.id} />
                    </DragCard>
                  </div>
                ))}
                {markerBefore === "end" && <div className="pt-kcol__marker" aria-hidden />}
                {composing === col.id && <Composer columnId={col.id} onClose={() => setComposing(null)} />}
                {visible.length === 0 && composing !== col.id && (
                  <div className="pt-kcol__empty">{filter ? "No matching tasks" : col.done ? "Completed tasks land here" : "Drop tasks here"}</div>
                )}
              </div>
              {composing !== col.id && (
                <button className="pt-kcol__add" onClick={() => setComposing(col.id)}>
                  <Plus size={14} /> Add task
                </button>
              )}
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Timeline({ columns, today }: { columns: OpsColumn[]; today: string }) {
  const actions = useActions();
  const span = (k: { startDate: string | null; dueDate: string | null; createdAt?: string | null }) => {
    const due = k.dueDate!;
    const begin = k.startDate ?? (k.createdAt ? k.createdAt.slice(0, 10) : addDays(due, -3));
    return { start: begin <= due ? begin : due, end: due };
  };
  const dated = columns.flatMap((c) =>
    c.cards.filter((k) => k.dueDate).map((k) => ({ card: k, column: c, ...span(k) }))
  );
  const undated = columns.reduce((n, c) => n + c.cards.filter((k) => !k.dueDate).length, 0);

  const range = useMemo(() => {
    const subDates = dated.flatMap((x) => x.card.subtasks.flatMap((s) => [s.startDate, s.dueDate]).filter((v): v is string => !!v));
    const lo = [today, ...dated.map((x) => x.start), ...subDates].sort()[0]!;
    const hi = [addDays(today, 21), ...dated.map((x) => x.end), ...subDates].sort().reverse()[0]!;
    // Start on the Monday on/before `lo`.
    const dow = new Date(`${lo}T00:00:00Z`).getUTCDay() || 7;
    const from = addDays(lo, 1 - dow);
    const weeks = Math.min(16, Math.max(6, Math.ceil((daysBetween(from, hi) + 1) / 7)));
    return { from, weeks, days: weeks * 7 };
  }, [dated, today]);

  const pos = (iso: string) => (Math.max(0, Math.min(range.days, daysBetween(range.from, iso))) / range.days) * 100;
  const weeksGrid = (
    <div className="pt-tl__weeks" style={{ gridTemplateColumns: `repeat(${range.weeks}, 1fr)`, position: "absolute", inset: 0 }}>
      {Array.from({ length: range.weeks }, (_, w) => (
        <div key={w} className="pt-tl__week" style={{ padding: 0 }} />
      ))}
    </div>
  );

  if (dated.length === 0)
    return (
      <Empty
        index="00"
        title="Nothing on the programme yet."
        body="Tasks with a due date appear here as bars from their start date to the day they fall due, with their subtasks beneath."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.raiseWork()}>
            Raise work
          </button>
        }
      />
    );

  return (
    <>
      <div className="pt-tl">
        <div className="pt-tl__row pt-tl__row--head">
          <div className="pt-tl__label">
            <span className="pt-tl__h">Programme</span>
          </div>
          <div className="pt-tl__track">
            <div className="pt-tl__weeks" style={{ gridTemplateColumns: `repeat(${range.weeks}, 1fr)` }}>
              {Array.from({ length: range.weeks }, (_, i) => (
                <div key={i} className="pt-tl__week">
                  {dayMonth(addDays(range.from, i * 7))}
                </div>
              ))}
            </div>
          </div>
        </div>
        {columns.map((col, ci) => {
          const rows = dated.filter((x) => x.column.id === col.id).sort((a, b) => a.end.localeCompare(b.end));
          if (!rows.length) return null;
          return (
            <div key={col.id}>
              <div className={`pt-tl__row pt-tl__row--group ${hueClass(columnHue(ci, col.done))}`}>
                <div className="pt-tl__label">
                  <span className="pt-kcol__swatch" aria-hidden />
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12.5 }}>{col.label}</span>
                  <span className="pt-kcol__count">{rows.length}</span>
                </div>
                <div className="pt-tl__track" style={{ minHeight: 0 }}>
                  <div className="pt-tl__today" style={{ left: `${pos(today)}%` }} />
                </div>
              </div>
              {rows.map(({ card, start, end }, i) => {
                const hue = LINE_HUE[card.line] ?? "slate";
                const subs = card.subtasks.filter((s) => s.dueDate);
                return (
                  <div key={card.id}>
                    <div className="pt-tl__row" style={{ cursor: "pointer" }} onClick={() => actions.editWork(card)}>
                      <div className="pt-tl__label" style={{ paddingLeft: 24 }}>
                        <Avatar initials={card.who} size={18} />
                        <span className="pt-tl__name">{card.title}</span>
                      </div>
                      <div className="pt-tl__track">
                        {weeksGrid}
                        <div className="pt-tl__today" style={{ left: `${pos(today)}%` }} />
                        <motion.div
                          className={`pt-tl__bar ${hueClass(hue)}${col.done ? " is-done" : ""}${card.late ? " is-late" : ""}`}
                          title={`${card.ref} · ${dayMonth(start)} to ${dayMonth(end)}`}
                          style={{ left: `${pos(start)}%`, width: `${Math.max(0.8, pos(addDays(end, 1)) - pos(start))}%` }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1, transition: tween(DUR.reveal, 0.05 + i * 0.03) }}
                        >
                          <span className="pt-tl__barlabel">{card.ref}</span>
                        </motion.div>
                      </div>
                    </div>
                    {subs.map((s) => {
                      const ss = span(s);
                      return (
                        <div key={s.id} className="pt-tl__row pt-tl__row--sub" style={{ cursor: "pointer" }} onClick={() => actions.editWork(card)}>
                          <div className="pt-tl__label" style={{ paddingLeft: 52 }}>
                            <span className={`pt-tl__subdot${s.done ? " is-done" : ""}`} />
                            <span className="pt-tl__name">{s.title}</span>
                          </div>
                          <div className="pt-tl__track">
                            {weeksGrid}
                            <div className="pt-tl__today" style={{ left: `${pos(today)}%` }} />
                            <div
                              className={`pt-tl__bar pt-tl__bar--sub ${hueClass(hue)}${s.done ? " is-done" : ""}${s.late ? " is-late" : ""}`}
                              title={`${s.title} · ${dayMonth(ss.start)} to ${dayMonth(ss.end)}`}
                              style={{ left: `${pos(ss.start)}%`, width: `${Math.max(0.8, pos(addDays(ss.end, 1)) - pos(ss.start))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="pt-legend" style={{ marginTop: 14 }}>
        {Object.entries(LINE_HUE).map(([line, hue]) => (
          <span key={line} className={hueClass(hue)}>
            <i style={{ background: "var(--hue)" }} />
            {line.toUpperCase()}
          </span>
        ))}
        <span>
          <i style={{ border: "1.5px solid var(--status-breach-dot)" }} />
          PAST DUE
        </span>
        <span style={{ color: "var(--text-brand)" }}>
          <i style={{ width: 2, height: 12, background: "var(--brass-500)" }} />
          TODAY {dayMonth(today)}
        </span>
        {undated > 0 && <span style={{ marginLeft: "auto" }}>{undated} UNDATED NOT SHOWN</span>}
      </div>
    </>
  );
}

export function OperationsPage() {
  const d = usePortal();
  const actions = useActions();
  const [view, setView] = useState<(typeof VIEWS)[number]>("Board");
  const [filter, setFilter] = useState("");
  const [cardId, setCard] = useSelection("card");
  const [flash, setFlash] = useState<number | null>(null);
  const total = d.opsColumns.reduce((n, c) => n + c.cards.length, 0);
  const open = d.opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0);
  const late = d.opsColumns.flatMap((c) => c.cards).filter((c) => c.late).length;

  // ?card=<id> (from search, Control or a new task) opens that task and flashes
  // its card; the parameter is then cleared so the same link works again.
  useEffect(() => {
    if (cardId === null) return;
    setView("Board");
    setFlash(cardId);
    actions.openTask(cardId);
    setCard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    if (flash === null) return;
    const t = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-record="op-${flash}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 160);
    const clear = window.setTimeout(() => setFlash(null), 3200);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(clear);
    };
  }, [flash]);

  return (
    <>
      <Tabs
        id="ops"
        tabs={VIEWS}
        value={view}
        onChange={setView}
        trailing={
          view === "Board" && total > 0 ? (
            <label className="pt-filter">
              <Search size={13} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tasks" aria-label="Filter tasks" />
            </label>
          ) : (
            <span className="pt-meta">
              {open} open · {late} past due
            </span>
          )
        }
      />
      <div style={{ marginTop: 20 }}>
        {total === 0 && view === "Board" ? (
          <>
            <Empty
              index="00"
              title="The order book is clear."
              body="Add a task for anything that needs doing at a client site — patrol variances, audits, faults, debriefs. Break it into subtasks with their own dates, and drag it across the board as it progresses."
              action={
                <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.raiseWork()}>
                  Raise work
                </button>
              }
            />
            <div style={{ marginTop: 28 }}>
              <Board columns={d.opsColumns} flashId={flash} today={d.today} filter="" />
            </div>
          </>
        ) : view === "Board" ? (
          <Board columns={d.opsColumns} flashId={flash} today={d.today} filter={filter} />
        ) : (
          <Timeline columns={d.opsColumns} today={d.today} />
        )}
      </div>
    </>
  );
}
