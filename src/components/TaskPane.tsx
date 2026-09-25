import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { PRIORITIES, SERVICE_LINES, type OpsCard, type OpsSubtask } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { usePortalData } from "../lib/DataProvider";
import { dueTone, friendlyDate, initialsOf, relativeTime } from "../lib/format";
import { LINE_HUE, PRIORITY_HUE, columnHue, hueClass } from "../lib/hues";
import { DUR, tween } from "../lib/motion";
import { EditableText } from "./ui/EditableText";
import { Drawer } from "./ui/Overlay";
import { Avatar, CheckCircle, Progress } from "./ui/TaskBits";

/** A date field that saves as soon as a whole date is chosen, with a clear button. */
function DateField({
  value,
  onChange,
  label,
  tone = "none",
  compact = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  tone?: "late" | "soon" | "none";
  compact?: boolean;
}) {
  return (
    <span className={`pt-datefield pt-datefield--${tone}${compact ? " pt-datefield--compact" : ""}${value ? "" : " pt-datefield--empty"}`}>
      <input
        type="date"
        aria-label={label}
        title={label}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) onChange(v || null);
        }}
      />
      {value && !compact && (
        <button type="button" className="pt-datefield__clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function SubtaskRow({ card, sub, today }: { card: OpsCard; sub: OpsSubtask; today: string }) {
  const actions = useActions();
  const temp = sub.id < 0;
  const patch = (p: Parameters<typeof actions.patchSubtask>[2]) => !temp && void actions.patchSubtask(card, sub, p);
  return (
    <motion.li
      layout="position"
      className={`pt-subtask${sub.done ? " pt-subtask--done" : ""}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}
      exit={{ opacity: 0, transition: tween(DUR.fast) }}
    >
      <CheckCircle size={16} done={sub.done} label={sub.done ? "Mark subtask incomplete" : "Mark subtask complete"} onToggle={() => patch({ done: !sub.done })} />
      <EditableText
        className="pt-subtask__title"
        value={sub.title}
        required
        maxLength={200}
        ariaLabel="Subtask name"
        onSave={(v) => patch({ title: v })}
      />
      <span className="pt-subtask__who">
        <Avatar initials={sub.who} size={20} />
        <EditableText
          className="pt-subtask__initials"
          value={sub.who}
          maxLength={3}
          placeholder="—"
          ariaLabel="Subtask assignee initials"
          onSave={(v) => patch({ owner: v.toUpperCase() })}
        />
      </span>
      <DateField compact label="Subtask start" value={sub.startDate} onChange={(v) => patch({ startDate: v })} />
      <DateField compact label="Subtask due" value={sub.dueDate} tone={dueTone(sub.dueDate, today, sub.done)} onChange={(v) => patch({ dueDate: v })} />
      <button type="button" className="pt-iconbtn pt-iconbtn--sm pt-subtask__del" aria-label={`Delete subtask ${sub.title}`} onClick={() => !temp && void actions.deleteSubtask(card, sub)}>
        <Trash2 size={13} />
      </button>
    </motion.li>
  );
}

function AddSubtask({ card }: { card: OpsCard }) {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const add = () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    void actions.addSubtask(card, t);
  };
  return (
    <div className="pt-subtask-add">
      <Plus size={14} />
      <input
        value={title}
        maxLength={200}
        placeholder="Add a subtask, then press Enter"
        aria-label="New subtask"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape" && title) {
            e.stopPropagation();
            setTitle("");
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export function TaskPane({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = usePortalData();
  const actions = useActions();
  const columns = data?.opsColumns ?? [];
  const colIndex = columns.findIndex((c) => c.cards.some((k) => k.id === id));
  const column = columns[colIndex];
  const card = column?.cards.find((k) => k.id === id);
  const today = data?.today ?? "";
  const seenCard = useRef(false);

  // Close if the task disappears (deleted here or elsewhere).
  useEffect(() => {
    if (id === null) {
      seenCard.current = false;
      return;
    }
    if (card) seenCard.current = true;
    else if (seenCard.current && data) onClose();
  }, [id, card, data, onClose]);

  const open = id !== null && !!card && !!column;
  const done = !!column?.done;
  const subsDone = card?.subtasks.filter((s) => s.done).length ?? 0;
  const activity = (data?.audit ?? []).filter((a) => a.entity === "work" && a.entityId === String(id));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      eyebrow={card && column ? `${card.ref} · ${column.label}` : ""}
      title={
        card ? (
          <EditableText
            wrap
            className="pt-task__title"
            value={card.title}
            required
            maxLength={120}
            ariaLabel="Task name"
            onSave={(v) => void actions.patchWork(card, { title: v })}
          />
        ) : (
          ""
        )
      }
      footer={
        card && (
          <>
            <button type="button" className="sds-btn sds-btn--md sds-btn--ghost pt-danger-link" onClick={() => void actions.deleteWork(card)}>
              Delete task
            </button>
            <span style={{ flex: 1 }} />
            <span className="pt-meta pt-hide-sm">Saved automatically</span>
            <button type="button" className="sds-btn sds-btn--md sds-btn--secondary" onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      {card && column && (
        <div className="pt-task">
          <div className="pt-task__bar">
            <button type="button" data-autofocus className={`pt-complete${done ? " pt-complete--done" : ""}`} aria-pressed={done} onClick={() => void actions.toggleComplete(card)}>
              <Check size={14} strokeWidth={2.5} />
              {done ? "Completed" : "Mark complete"}
            </button>
            {card.late && <span className="pt-chip pt-hue-clay">Past due</span>}
            <span className="pt-meta" style={{ marginLeft: "auto" }}>
              {card.createdAt ? `Added ${relativeTime(card.createdAt)}` : ""}
              {done && card.completedAt ? ` · completed ${relativeTime(card.completedAt)}` : ""}
            </span>
          </div>

          <dl className="pt-task__fields">
            <dt>Assignee</dt>
            <dd className="pt-task__who">
              <Avatar initials={card.who} size={26} />
              <EditableText
                className="pt-task__initials"
                value={card.who}
                maxLength={3}
                placeholder="Initials"
                ariaLabel="Assignee initials"
                onSave={(v) => void actions.patchWork(card, { owner: v.toUpperCase() })}
              />
            </dd>

            <dt>Dates</dt>
            <dd className="pt-task__dates">
              <DateField label="Start date" value={card.startDate} onChange={(v) => void actions.patchWork(card, { startDate: v })} />
              <span className="pt-dim">to</span>
              <DateField
                label="Due date"
                value={card.dueDate}
                tone={dueTone(card.dueDate, today, done)}
                onChange={(v) => void actions.patchWork(card, { dueDate: v })}
              />
              {card.dueDate && <span className={`pt-due pt-due--${dueTone(card.dueDate, today, done)}`}>{friendlyDate(card.dueDate, today)}</span>}
            </dd>

            <dt>Section</dt>
            <dd className="pt-seg" role="radiogroup" aria-label="Section">
              {columns.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === column.id}
                  className={`pt-seg__btn ${hueClass(columnHue(i, c.done))}`}
                  onClick={() => void actions.moveWork(card, c.id, c.done ? 0 : undefined)}
                >
                  <span className="pt-chip__dot" />
                  {c.label}
                </button>
              ))}
            </dd>

            <dt>Priority</dt>
            <dd className="pt-seg" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={card.priority === p}
                  className={`pt-seg__btn ${hueClass(PRIORITY_HUE[p] ?? "slate")}`}
                  onClick={() => void actions.patchWork(card, { priority: p })}
                >
                  {p !== "None" && <span className="pt-chip__dot" />}
                  {p}
                </button>
              ))}
            </dd>

            <dt>Service line</dt>
            <dd className="pt-seg" role="radiogroup" aria-label="Service line">
              {SERVICE_LINES.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={card.line === l}
                  className={`pt-seg__btn ${hueClass(LINE_HUE[l] ?? "slate")}`}
                  onClick={() => void actions.patchWork(card, { line: l })}
                >
                  {l}
                </button>
              ))}
            </dd>

            <dt>Client / site</dt>
            <dd>
              <EditableText
                className="pt-task__site"
                value={card.site}
                maxLength={120}
                placeholder="Add a client or site"
                ariaLabel="Client or site"
                onSave={(v) => void actions.patchWork(card, { site: v })}
              />
            </dd>
          </dl>

          <section className="pt-task__section">
            <h3 className="pt-task__h">Description</h3>
            <EditableText
              multiline
              className="pt-task__desc"
              value={card.description}
              maxLength={4000}
              placeholder="What needs doing, and what does done look like?"
              ariaLabel="Description"
              onSave={(v) => void actions.patchWork(card, { description: v })}
            />
          </section>

          <section className="pt-task__section">
            <div className="pt-task__subhead">
              <h3 className="pt-task__h">Subtasks</h3>
              {card.subtasks.length > 0 && (
                <span className="pt-meta">
                  {subsDone} of {card.subtasks.length} done
                </span>
              )}
            </div>
            <Progress done={subsDone} total={card.subtasks.length} />
            {card.subtasks.length > 0 && (
              <div className="pt-subtask pt-subtask--head" aria-hidden>
                <span />
                <span>Name</span>
                <span>Assignee</span>
                <span>Start</span>
                <span>Due</span>
                <span />
              </div>
            )}
            <ul className="pt-subtasks">
              <AnimatePresence initial={false}>
                {card.subtasks.map((s) => (
                  <SubtaskRow key={s.id} card={card} sub={s} today={today} />
                ))}
              </AnimatePresence>
            </ul>
            <AddSubtask card={card} />
          </section>

          <section className="pt-task__section">
            <h3 className="pt-task__h">Activity</h3>
            {activity.length === 0 ? (
              <p className="pt-dim" style={{ fontSize: 13 }}>
                Changes to this task will be listed here.
              </p>
            ) : (
              <ul className="pt-task__activity">
                {activity.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <Avatar initials={initialsOf(a.actor)} size={20} title={a.actor} />
                    <span>{a.summary}</span>
                    <span className="pt-meta">{relativeTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
