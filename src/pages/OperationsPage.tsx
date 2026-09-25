import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, Plus, Search } from "lucide-react";
import type { OpsCard, OpsColumn } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard, type DropPoint } from "../components/DragCard";
import { Gantt } from "../components/Gantt";
import { Empty, Tabs } from "../components/ui/Bits";
import { Avatar, CheckCircle, Chip, DueDate, Progress } from "../components/ui/TaskBits";
import { usePortal } from "../lib/DataProvider";
import { matches } from "../lib/format";
import { LINE_HUE, PRIORITY_HUE, columnHue, hueClass } from "../lib/hues";
import { DUR, tween } from "../lib/motion";
import { useSelection } from "../lib/selection";
import { indexBoard, type CardInfo } from "../lib/board";

const VIEWS = ["Board", "Timeline"] as const;

function TaskCard({ card, info, today, flash }: { card: OpsCard; info: CardInfo | undefined; today: string; flash: boolean }) {
  const done = !!info?.done;
  const hue = columnHue(info?.columnIndex ?? 0, done);
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const subs = card.subtasks;
  const subsDone = subs.filter((s) => s.done).length;
  const temp = card.id < 0;
  return (
    <>
      <div className="pt-tcard__tags">
        <Chip hue={LINE_HUE[card.line] ?? "slate"}>{card.line}</Chip>
        {card.milestone && <Chip hue="slate">Milestone</Chip>}
        {card.priority !== "None" && (
          <Chip hue={PRIORITY_HUE[card.priority] ?? "slate"} dot>
            {card.priority}
          </Chip>
        )}
        {!done && info && info.waitingOn.length > 0 && (
          <span title={`Waiting on ${info.waitingOn.map((w) => `${w.ref} ${w.title}`).join(", ")}`}>
            <Chip hue="ochre" dot>
              Waiting on {info.waitingOn[0]!.ref}
              {info.waitingOn.length > 1 ? ` +${info.waitingOn.length - 1}` : ""}
            </Chip>
          </span>
        )}
        <span className="pt-tcard__ref">{card.ref}</span>
      </div>
      <div className="pt-tcard__title-row">
        <CheckCircle
          done={done}
          diamond={card.milestone}
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
          <Progress done={subsDone} total={subs.length} hue={hue} />
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
  const index = useMemo(() => indexBoard(columns), [columns]);
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
                      <TaskCard card={card} info={index.get(card.id)} today={today} flash={flashId === card.id} />
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
        ) : total === 0 ? (
          <Empty
            index="00"
            title="Nothing on the programme yet."
            body="Tasks and milestones with dates appear here as bars you can drag, stretch and link. Add a task or a milestone to begin."
            action={
              <span style={{ display: "flex", gap: 10 }}>
                <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.raiseWork()}>
                  Raise work
                </button>
                <button className="sds-btn sds-btn--md sds-btn--secondary" onClick={() => actions.raiseWork({ milestone: true })}>
                  Add milestone
                </button>
              </span>
            }
          />
        ) : (
          <Gantt columns={d.opsColumns} today={d.today} />
        )}
      </div>
    </>
  );
}
