import { LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { OpsCard, OpsColumn } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard } from "../components/DragCard";
import { Badge, Tag } from "../components/ui/Badge";
import { Empty, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { addDays, dayMonth, daysBetween, pad2 } from "../lib/format";
import { DUR, tween } from "../lib/motion";
import { useSelection } from "../lib/selection";

const VIEWS = ["Board", "Timeline"] as const;

function Card({ card, done, flash }: { card: OpsCard; done: boolean; flash: boolean }) {
  return (
    <>
      <div className="pt-card__top">
        <span className="pt-mono pt-dim">{card.ref}</span>
        <Tag>{card.line}</Tag>
      </div>
      <div className="pt-card__title">{card.title}</div>
      <div className="pt-card__site">{card.site}</div>
      <div className="pt-card__foot">
        <span className={`pt-card__due${card.late ? " pt-card__due--late" : ""}`}>{done ? "COMPLETE" : card.due}</span>
        {card.late && <Badge kind="breach" label="Past due" />}
        <span className="pt-owner" style={{ marginLeft: "auto" }} title={`Owner ${card.who}`}>
          {card.who}
        </span>
      </div>
      {flash && (
        <motion.span
          aria-hidden
          style={{ position: "absolute", inset: -1, border: "1px solid var(--brass-500)", pointerEvents: "none" }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0, transition: tween(2.2, 0.6) }}
        />
      )}
    </>
  );
}

function Board({ columns, flashId }: { columns: OpsColumn[]; flashId: number | null }) {
  const actions = useActions();
  const [over, setOver] = useState<string | null>(null);
  return (
    <LayoutGroup>
      <div className="pt-board">
        {columns.map((col) => (
          <section
            key={col.id}
            className={`pt-col${col.done ? " pt-col--done" : ""}${over === String(col.id) ? " pt-col--over" : ""}`}
            data-drop={col.id}
            aria-label={`${col.label}, ${col.cards.length} items`}
          >
            <div className="pt-col__head">
              <span className="pt-eyebrow" style={{ gap: 0 }}>
                {col.label}
              </span>
              <span className="pt-meta">{pad2(col.cards.length)}</span>
              <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Raise work in ${col.label}`} onClick={() => actions.raiseWork({ columnId: col.id })}>
                <Plus size={14} />
              </button>
            </div>
            <div className="pt-col__cards">
              {col.cards.map((card) => (
                <DragCard
                  key={card.id}
                  id={`op-${card.id}`}
                  label={`${card.ref} ${card.title}. Drag to move, or press Enter to edit.`}
                  className={`pt-card${card.late ? " pt-card--late" : ""}`}
                  onHover={setOver}
                  onDrop={(target) => void actions.moveWork(card, Number(target))}
                  onOpen={() => actions.editWork(card)}
                >
                  <Card card={card} done={col.done} flash={flashId === card.id} />
                </DragCard>
              ))}
              {col.cards.length === 0 && <div className="pt-col__drop">{col.done ? "Completed items land here" : "Drop work here"}</div>}
            </div>
          </section>
        ))}
      </div>
    </LayoutGroup>
  );
}

function Timeline({ columns, today }: { columns: OpsColumn[]; today: string }) {
  const actions = useActions();
  const dated = columns.flatMap((c, i) =>
    c.cards
      .filter((k) => k.dueDate)
      .map((k) => {
        const created = k.createdAt ? k.createdAt.slice(0, 10) : addDays(k.dueDate!, -7);
        const start = created < k.dueDate! ? created : addDays(k.dueDate!, -1);
        return { card: k, column: c, start, end: k.dueDate!, kind: c.done ? "done" : k.late ? "late" : i === 0 ? "plan" : "active" };
      })
  );
  const undated = columns.reduce((n, c) => n + c.cards.filter((k) => !k.dueDate).length, 0);

  const range = useMemo(() => {
    const lo = [today, ...dated.map((x) => x.start)].sort()[0]!;
    const hi = [addDays(today, 21), ...dated.map((x) => x.end)].sort().reverse()[0]!;
    // Start on the Monday on/before `lo`.
    const dow = new Date(`${lo}T00:00:00Z`).getUTCDay() || 7;
    const from = addDays(lo, 1 - dow);
    const weeks = Math.min(16, Math.max(6, Math.ceil((daysBetween(from, hi) + 1) / 7)));
    return { from, weeks, days: weeks * 7 };
  }, [dated, today]);

  const pos = (iso: string) => (Math.max(0, Math.min(range.days, daysBetween(range.from, iso))) / range.days) * 100;

  if (dated.length === 0)
    return (
      <Empty
        index="00"
        title="Nothing on the programme yet."
        body="Work items appear here as bars from the day they were raised to the day they fall due."
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
            <span className="pt-eyebrow" style={{ gap: 0 }}>
              Programme
            </span>
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
        {columns.map((col) => {
          const rows = dated.filter((x) => x.column.id === col.id).sort((a, b) => a.end.localeCompare(b.end));
          if (!rows.length) return null;
          return (
            <div key={col.id}>
              <div className="pt-tl__row pt-tl__row--group">
                <div className="pt-tl__label">
                  <span className="pt-mono" style={{ color: "var(--text-brand)" }}>
                    {pad2(rows.length)}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12.5 }}>{col.label}</span>
                </div>
                <div className="pt-tl__track" style={{ minHeight: 0 }}>
                  <div className="pt-tl__today" style={{ left: `${pos(today)}%` }} />
                </div>
              </div>
              {rows.map(({ card, start, end, kind }, i) => (
                <div key={card.id} className="pt-tl__row" style={{ cursor: "pointer" }} onClick={() => actions.editWork(card)}>
                  <div className="pt-tl__label" style={{ paddingLeft: 38 }}>
                    <span className="pt-mono pt-dim">{card.ref}</span>
                    <span>{card.title}</span>
                  </div>
                  <div className="pt-tl__track">
                    <div className="pt-tl__weeks" style={{ gridTemplateColumns: `repeat(${range.weeks}, 1fr)`, position: "absolute", inset: 0 }}>
                      {Array.from({ length: range.weeks }, (_, w) => (
                        <div key={w} className="pt-tl__week" style={{ padding: 0 }} />
                      ))}
                    </div>
                    <div className="pt-tl__today" style={{ left: `${pos(today)}%` }} />
                    <motion.div
                      className={`pt-tl__bar pt-tl__bar--${kind}`}
                      title={`${card.ref} · ${dayMonth(start)} → ${dayMonth(end)}`}
                      style={{ left: `${pos(start)}%`, width: `${Math.max(0.8, pos(addDays(end, 1)) - pos(start))}%` }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1, transition: tween(DUR.reveal, 0.05 + i * 0.03) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="pt-legend" style={{ marginTop: 14 }}>
        <span>
          <i style={{ background: "var(--sand-300)" }} />
          COMPLETE
        </span>
        <span>
          <i style={{ background: "var(--rule-strong)" }} />
          IN PROGRESS
        </span>
        <span>
          <i style={{ border: "1px solid var(--border-strong)" }} />
          RAISED
        </span>
        <span>
          <i style={{ background: "var(--status-breach-dot)" }} />
          PAST DUE
        </span>
        <span style={{ color: "var(--text-brand)" }}>
          <i style={{ width: 2, height: 12, background: "var(--brass-500)" }} />
          TODAY {dayMonth(today)}
        </span>
        {undated > 0 && <span style={{ marginLeft: "auto" }}>{undated} UNDATED ITEMS NOT SHOWN</span>}
      </div>
    </>
  );
}

export function OperationsPage() {
  const d = usePortal();
  const actions = useActions();
  const [view, setView] = useState<(typeof VIEWS)[number]>("Board");
  const [cardId] = useSelection("card");
  const [flash, setFlash] = useState<number | null>(null);
  const total = d.opsColumns.reduce((n, c) => n + c.cards.length, 0);
  const open = d.opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0);
  const late = d.opsColumns.flatMap((c) => c.cards).filter((c) => c.late).length;

  useEffect(() => {
    if (cardId === null) return;
    setView("Board");
    setFlash(cardId);
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-record="op-${cardId}"]`);
      el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(t);
  }, [cardId]);

  return (
    <>
      <Tabs
        id="ops"
        tabs={VIEWS}
        value={view}
        onChange={setView}
        trailing={
          <span className="pt-meta">
            {open} open · {late} past due · drag cards between columns
          </span>
        }
      />
      <div style={{ marginTop: 20 }}>
        {total === 0 && view === "Board" ? (
          <>
            <Empty
              index="00"
              title="The order book is clear."
              body="Raise a work item for anything that needs doing at a client site — patrol variances, audits, faults, debriefs. Drag it across the board as it progresses."
              action={
                <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.raiseWork()}>
                  Raise work
                </button>
              }
            />
            <div style={{ marginTop: 28 }}>
              <Board columns={d.opsColumns} flashId={flash} />
            </div>
          </>
        ) : view === "Board" ? (
          <Board columns={d.opsColumns} flashId={flash} />
        ) : (
          <Timeline columns={d.opsColumns} today={d.today} />
        )}
      </div>
    </>
  );
}
