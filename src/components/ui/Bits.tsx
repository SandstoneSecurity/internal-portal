import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Command, CornerDownLeft, MoreHorizontal } from "lucide-react";
import { isMac } from "../../lib/hotkeys";
import { DUR, EASE_OUT, tween } from "../../lib/motion";

/** A figure that counts to its value once, then tracks changes. Mono digits keep width stable. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: DUR.reveal * 1.4,
      ease: EASE_OUT,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={className}>{shown}</span>;
}

/** A hairline bar that draws to `ratio` (0–1). */
export function Measure({ ratio, tone = "ink" }: { ratio: number; tone?: "ink" | "brass" | "breach" | "advisory" | "secure" }) {
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <div className="pt-measure" aria-hidden>
      <motion.div
        className={`pt-measure__fill pt-measure__fill--${tone}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: r, transition: tween(DUR.reveal * 1.4, 0.15) }}
      />
    </div>
  );
}

/** Empty register: says what's missing and offers the one action that fills it. */
export function Empty({
  index = "00",
  title,
  body,
  action,
  compact = false,
}: {
  index?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <motion.div
      className={`pt-empty${compact ? " pt-empty--compact" : ""}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: tween(DUR.slow) }}
    >
      <span className="pt-empty__index">{index}</span>
      <div>
        <div className="pt-empty__title">{title}</div>
        {body && <div className="pt-empty__body">{body}</div>}
        {action && <div className="pt-empty__action">{action}</div>}
      </div>
    </motion.div>
  );
}

/** Tabs with a brass underline that slides between selections. */
export function Tabs<T extends string>({
  id,
  tabs,
  value,
  onChange,
  counts,
  trailing,
}: {
  id: string;
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  counts?: Partial<Record<T, number>>;
  trailing?: ReactNode;
}) {
  return (
    <div className="pt-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === value} className="pt-tabs__tab" onClick={() => onChange(t)}>
          {t}
          {counts?.[t] !== undefined && <span className="pt-tabs__count">{counts[t]}</span>}
          {t === value && (
            <motion.span layoutId={`tab-${id}`} className="pt-tabs__rule" transition={tween(DUR.slow)} />
          )}
        </button>
      ))}
      {trailing && <div className="pt-tabs__trailing">{trailing}</div>}
    </div>
  );
}

/** Small overflow menu for row actions. */
export function RowMenu({ items, label = "More actions" }: { items: { label: string; onSelect: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="pt-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className="pt-iconbtn pt-iconbtn--sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <motion.div
          role="menu"
          className="pt-menu__list"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0, transition: tween(DUR.fast) }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`pt-menu__item${it.danger ? " pt-menu__item--danger" : ""}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="pt-kbd">{children}</kbd>;
}

/** Key caps drawn as icons where the brand faces carry no glyph (⌘, ↵). */
export function ModKey() {
  return <Kbd>{isMac ? <Command size={10} aria-label="Command" /> : "Ctrl"}</Kbd>;
}
export function EnterKey() {
  return (
    <Kbd>
      <CornerDownLeft size={10} aria-label="Enter" />
    </Kbd>
  );
}

/** Section heading in the register style: eyebrow on the left, a mono count or note on the right. */
export function SectionHead({ title, meta, action }: { title: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="pt-section-head">
      <span className="pt-eyebrow">{title}</span>
      {meta !== undefined && <span className="pt-meta">{meta}</span>}
      {action}
    </div>
  );
}
