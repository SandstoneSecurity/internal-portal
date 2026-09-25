import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Check, UserRound } from "lucide-react";
import { dateRange, dueTone } from "../../lib/format";
import { hueClass, personHue, type Hue } from "../../lib/hues";
import { DUR, tween } from "../../lib/motion";

/** Person token: initials on their own colour; a dashed outline when nobody is assigned. */
export function Avatar({ initials, size = 24, title }: { initials: string; size?: number; title?: string }) {
  if (!initials)
    return (
      <span className="pt-avatar pt-avatar--empty" style={{ width: size, height: size }} title={title ?? "Unassigned"}>
        <UserRound size={Math.round(size * 0.55)} strokeWidth={1.75} />
      </span>
    );
  return (
    <span
      className={`pt-avatar ${hueClass(personHue(initials))}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      title={title ?? initials}
    >
      {initials}
    </span>
  );
}

/** Coloured label: service line, priority, section. */
export function Chip({ hue, children, dot = false }: { hue: Hue; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`pt-chip ${hueClass(hue)}`}>
      {dot && <span className="pt-chip__dot" />}
      {children}
    </span>
  );
}

/** The completion tick. Hover previews the check; completing fills it eucalypt. */
export function CheckCircle({
  done,
  onToggle,
  size = 18,
  label,
  diamond = false,
}: {
  done: boolean;
  onToggle: () => void;
  size?: number;
  label: string;
  /** Milestones complete with a diamond rather than a circle. */
  diamond?: boolean;
}) {
  return (
    <button
      type="button"
      data-nodrag
      className={`pt-check-circle${done ? " pt-check-circle--done" : ""}${diamond ? " pt-check-circle--diamond" : ""}`}
      style={{ width: size, height: size }}
      aria-pressed={done}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <motion.span
        key={String(done)}
        style={{ display: "inline-flex" }}
        initial={done ? { scale: 0.4, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1, transition: tween(DUR.base) }}
      >
        <Check size={Math.round(size * 0.62)} strokeWidth={2.5} />
      </motion.span>
    </button>
  );
}

/** Start–due range, coloured clay when past due and eucalypt when due today or tomorrow. */
export function DueDate({
  start,
  due,
  today,
  done,
  empty = null,
}: {
  start: string | null;
  due: string | null;
  today: string;
  done: boolean;
  empty?: ReactNode;
}) {
  const text = dateRange(start, due, today);
  if (!text) return <>{empty}</>;
  return <span className={`pt-due pt-due--${dueTone(due, today, done)}`}>{text}</span>;
}

/** Thin subtask progress bar. */
export function Progress({ done, total, hue = "euc" }: { done: number; total: number; hue?: Hue }) {
  if (!total) return null;
  return (
    <div className={`pt-progress ${hueClass(hue)}`} aria-label={`${done} of ${total} subtasks complete`}>
      <motion.div className="pt-progress__fill" initial={false} animate={{ scaleX: done / total, transition: tween(DUR.slow) }} />
    </div>
  );
}
