import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Diamond, Plus } from "lucide-react";
import type { OpsColumn, OpsSubtask } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { indexBoard, type CardInfo } from "../lib/board";
import { addDays, daysBetween, friendlyDate } from "../lib/format";
import { PROGRESS_HUE, PROGRESS_LABEL, columnHue, hueClass, type ProgressState } from "../lib/hues";
import { Avatar, CheckCircle } from "./ui/TaskBits";

/** Pixels per day at each zoom. */
const ZOOMS = [
  { key: "Days", ppd: 40 },
  { key: "Weeks", ppd: 18 },
  { key: "Months", ppd: 6 },
] as const;
type ZoomKey = (typeof ZOOMS)[number]["key"];
/** Days added when the view is scrolled near either end. */
const EXTEND = 84;
const MAX_DAYS = 3650;
const ZOOM_KEY = "sandstone.gantt.zoom";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const mondayOnOrBefore = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));
const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

type Row =
  | { kind: "group"; key: string; column: OpsColumn; ci: number; count: number }
  | { kind: "task"; key: string; info: CardInfo }
  | { kind: "sub"; key: string; info: CardInfo; sub: OpsSubtask };

interface Span {
  start: string;
  due: string;
  /** False when the start is inferred (no start date set). */
  explicitStart: boolean;
}

function taskSpan(info: CardInfo): Span | null {
  const k = info.card;
  if (!k.dueDate) return null;
  if (k.milestone) return { start: k.dueDate, due: k.dueDate, explicitStart: false };
  if (k.startDate) return { start: minIso(k.startDate, k.dueDate), due: k.dueDate, explicitStart: true };
  const created = k.createdAt?.slice(0, 10);
  return { start: created && created <= k.dueDate ? created : k.dueDate, due: k.dueDate, explicitStart: false };
}

function subSpan(s: OpsSubtask): Span | null {
  if (!s.dueDate) return null;
  return s.startDate ? { start: minIso(s.startDate, s.dueDate), due: s.dueDate, explicitStart: true } : { start: s.dueDate, due: s.dueDate, explicitStart: false };
}

function subProgress(s: OpsSubtask, parent: ProgressState): ProgressState {
  return s.done ? "done" : s.late ? "late" : parent === "done" ? "doing" : parent;
}

interface Preview {
  key: string;
  start: string;
  due: string;
}

interface LinkDrag {
  from: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  over: number | null;
}

interface Arrow {
  key: string;
  d: string;
  conflict: boolean;
  title: string;
}

export function Gantt({ columns, today }: { columns: OpsColumn[]; today: string }) {
  const actions = useActions();
  const index = useMemo(() => indexBoard(columns), [columns]);
  const [zoom, setZoom] = useState<ZoomKey>(() => {
    try {
      const z = localStorage.getItem(ZOOM_KEY);
      return ZOOMS.some((x) => x.key === z) ? (z as ZoomKey) : "Weeks";
    } catch {
      return "Weeks";
    }
  });
  const ppd = ZOOMS.find((z) => z.key === zoom)!.ppd;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [link, setLink] = useState<LinkDrag | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [measureTick, setMeasureTick] = useState(0);

  // Re-measure dependency arrows when the window (and so the layout) changes size.
  useEffect(() => {
    const onResize = () => setMeasureTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const labelCell = useRef<HTMLDivElement>(null);
  const pendingShift = useRef(0);
  const pendingCenter = useRef<number | null>(null);
  const dragging = useRef(false);
  const extending = useRef(false);

  // ── Range: starts around the work and today, then grows as you scroll ──
  const [range, setRange] = useState(() => {
    const dates: string[] = [today];
    for (const i of index.values()) {
      const sp = taskSpan(i);
      if (sp) dates.push(sp.start, sp.due);
      for (const s of i.card.subtasks) if (s.dueDate) dates.push(s.startDate ?? s.dueDate, s.dueDate);
    }
    const lo = addDays(dates.reduce(minIso), -21);
    const hi = addDays(dates.reduce(maxIso), 120);
    const from = mondayOnOrBefore(minIso(lo, addDays(today, -28)));
    return { from, days: Math.ceil((daysBetween(from, hi) + 1) / 7) * 7 };
  });
  const x = useCallback((iso: string) => daysBetween(range.from, iso) * ppd, [range.from, ppd]);
  const labelW = () => labelCell.current?.offsetWidth ?? 300;
  const trackW = range.days * ppd;

  // ── Rows ──
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    columns.forEach((column, ci) => {
      out.push({ kind: "group", key: `g${column.id}`, column, ci, count: column.cards.length });
      if (collapsed.has(`g${column.id}`)) return;
      for (const card of column.cards) {
        const info = index.get(card.id);
        if (!info || card.id < 0) continue;
        out.push({ kind: "task", key: `t${card.id}`, info });
        if (!collapsed.has(`t${card.id}`)) for (const sub of card.subtasks) out.push({ kind: "sub", key: `s${sub.id}`, info, sub });
      }
    });
    return out;
  }, [columns, index, collapsed]);

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // ── Scrolling: initial position, infinite extension, zoom anchoring ──
  const updateMonthLabel = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const day = Math.floor((el.scrollLeft + (el.clientWidth - labelW()) / 2) / ppd);
    const iso = addDays(range.from, Math.max(0, day));
    setMonthLabel(`${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`);
  }, [ppd, range.from]);

  const scrollToDate = useCallback(
    (iso: string, behavior: ScrollBehavior = "smooth") => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({ left: Math.max(0, x(iso) - (el.clientWidth - labelW()) * 0.3), behavior });
    },
    [x]
  );

  useLayoutEffect(() => {
    scrollToDate(today, "auto");
    updateMonthLabel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pendingShift.current) {
      el.scrollLeft += pendingShift.current;
      pendingShift.current = 0;
    }
    extending.current = false;
  }, [range]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || pendingCenter.current === null) return;
    el.scrollLeft = pendingCenter.current * ppd - (el.clientWidth - labelW()) / 2;
    pendingCenter.current = null;
    updateMonthLabel();
  }, [ppd, updateMonthLabel]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    updateMonthLabel();
    if (dragging.current || extending.current) return;
    const near = 6 * 7 * ppd;
    if (el.scrollLeft < near && range.days < MAX_DAYS) {
      extending.current = true;
      pendingShift.current = EXTEND * ppd;
      setRange((r) => ({ from: addDays(r.from, -EXTEND), days: r.days + EXTEND }));
    } else if (el.scrollWidth - el.scrollLeft - el.clientWidth < near && range.days < MAX_DAYS) {
      extending.current = true;
      setRange((r) => ({ ...r, days: r.days + EXTEND }));
    }
  };

  const changeZoom = (z: ZoomKey) => {
    const el = scroller.current;
    if (el) pendingCenter.current = (el.scrollLeft + (el.clientWidth - labelW()) / 2) / ppd;
    setZoom(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {
      // Zoom just won't be remembered.
    }
  };

  const page = (dir: -1 | 1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth - labelW()) * 0.8, behavior: "smooth" });
  };

  // ── Dragging bars: move, resize either end; auto-scrolls at the edges ──
  const beginDrag = (
    e: RPointerEvent,
    key: string,
    span: Span,
    mode: "move" | "start" | "end",
    commit: (start: string, due: string, mode: "move" | "start" | "end") => void,
    open: () => void
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = scroller.current!;
    const st = { x0: e.clientX, sl0: el.scrollLeft, lastX: e.clientX, moved: false, lastKey: "" };
    dragging.current = true;
    let result = { start: span.start, due: span.due };
    const compute = () => {
      const dx = st.lastX - st.x0 + (el.scrollLeft - st.sl0);
      if (Math.abs(dx) > 3) st.moved = true;
      const dd = Math.round(dx / ppd);
      let start = span.start;
      let due = span.due;
      if (mode === "move") (start = addDays(span.start, dd)), (due = addDays(span.due, dd));
      else if (mode === "start") start = minIso(addDays(span.start, dd), span.due);
      else due = maxIso(addDays(span.due, dd), span.start);
      result = { start, due };
      const k = `${start}|${due}`;
      if (st.moved && k !== st.lastKey) {
        st.lastKey = k;
        setPreview({ key, start, due });
      }
    };
    let raf = 0;
    const loop = () => {
      const r = el.getBoundingClientRect();
      const left = r.left + labelW();
      if (st.lastX > r.right - 44) el.scrollLeft += Math.min(18, (st.lastX - (r.right - 44)) / 2 + 4);
      else if (st.lastX < left + 44 && el.scrollLeft > 0) el.scrollLeft -= Math.min(18, (left + 44 - st.lastX) / 2 + 4);
      compute();
      raf = requestAnimationFrame(loop);
    };
    const onMove = (ev: PointerEvent) => (st.lastX = ev.clientX);
    const finish = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragging.current = false;
      if (ev.type === "pointercancel") return setPreview(null);
      st.lastX = ev.clientX;
      compute();
      if (!st.moved) {
        setPreview(null);
        open();
        return;
      }
      if (result.start !== span.start || result.due !== span.due) commit(result.start, result.due, mode);
      setPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    raf = requestAnimationFrame(loop);
  };

  const commitTask = (info: CardInfo, span: Span) => (start: string, due: string, mode: "move" | "start" | "end") => {
    const k = info.card;
    if (k.milestone) void actions.patchWork(k, { dueDate: due });
    else if (mode === "end" && !span.explicitStart) void actions.patchWork(k, { dueDate: due });
    else void actions.patchWork(k, { startDate: start, dueDate: due });
  };
  const commitSub = (info: CardInfo, sub: OpsSubtask, span: Span) => (start: string, due: string, mode: "move" | "start" | "end") => {
    if (mode === "end" && !span.explicitStart) void actions.patchSubtask(info.card, sub, { dueDate: due });
    else void actions.patchSubtask(info.card, sub, { startDate: start, dueDate: due });
  };

  const nudge = (e: React.KeyboardEvent, span: Span, commit: (s: string, d: string, m: "move" | "start" | "end") => void, open: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return open();
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (e.shiftKey) commit(span.start, maxIso(addDays(span.due, d), span.start), "end");
    else commit(addDays(span.start, d), addDays(span.due, d), "move");
  };

  // ── Panning the empty timeline; clicking an undated row schedules it ──
  const beginPan = (e: RPointerEvent, row?: Row) => {
    if (e.button !== 0) return;
    const el = scroller.current!;
    const st = { x0: e.clientX, sl0: el.scrollLeft, moved: false };
    const track = e.currentTarget as HTMLElement;
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - st.x0) > 4) st.moved = true;
      if (st.moved) el.scrollLeft = st.sl0 - (ev.clientX - st.x0);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.classList.remove("is-panning");
      if (st.moved || !row || row.kind !== "task" || row.info.card.dueDate) return;
      const day = addDays(range.from, Math.floor((ev.clientX - track.getBoundingClientRect().left) / ppd));
      const k = row.info.card;
      void actions.patchWork(k, k.milestone ? { dueDate: day } : { startDate: day, dueDate: addDays(day, 2) });
    };
    el.classList.add("is-panning");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── Linking: drag the dot at a bar's end onto another bar ──
  const beginLink = (e: RPointerEvent, from: number) => {
    e.stopPropagation();
    e.preventDefault();
    const c = canvas.current!.getBoundingClientRect();
    const dot = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x1 = dot.left + dot.width / 2 - c.left;
    const y1 = dot.top + dot.height / 2 - c.top;
    const targetAt = (cx: number, cy: number) => {
      for (const el of document.elementsFromPoint(cx, cy)) {
        const id = (el as HTMLElement).closest?.<HTMLElement>("[data-gbar]")?.dataset.gbar;
        if (id && Number(id) !== from) return Number(id);
      }
      return null;
    };
    const onMove = (ev: PointerEvent) => {
      const cc = canvas.current!.getBoundingClientRect();
      setLink({ from, x1, y1, x2: ev.clientX - cc.left, y2: ev.clientY - cc.top, over: targetAt(ev.clientX, ev.clientY) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLink(null);
      const target = targetAt(ev.clientX, ev.clientY);
      const t = target !== null ? index.get(target) : undefined;
      if (t) void actions.addDependency(t.card, from);
    };
    setLink({ from, x1, y1, x2: x1, y2: y1, over: null });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const spanWithPreview = (info: CardInfo): Span | null => {
    const sp = taskSpan(info);
    const pv = preview?.key === `t${info.card.id}` ? preview : null;
    return sp && pv ? { ...sp, start: pv.start, due: pv.due } : sp;
  };

  // ── Dependency arrows, measured from the rendered bars ──
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const c = root.getBoundingClientRect();
    const box = (id: number) => {
      const el = root.querySelector<HTMLElement>(`[data-gbar="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - c.left, r: r.right - c.left, y: r.top + r.height / 2 - c.top };
    };
    const out: Arrow[] = [];
    for (const i of index.values()) {
      for (const pre of i.card.blockedBy) {
        const a = box(pre);
        const b = box(i.card.id);
        const preInfo = index.get(pre);
        if (!a || !b || !preInfo) continue;
        // A conflict is about dates, not pixels: the dependent starts before its predecessor is due
        // (on the same day is fine when either side is a milestone).
        const ps = spanWithPreview(preInfo);
        const ds = spanWithPreview(i);
        const sameDayOk = i.card.milestone || preInfo.card.milestone;
        const conflict = !!ps && !!ds && !preInfo.done && (ds.start < ps.due || (ds.start === ps.due && !sameDayOk));
        let d: string;
        if (b.l - a.r >= 16) {
          const xm = a.r + 8;
          d = `M${a.r},${a.y} H${xm} V${b.y} H${b.l - 2}`;
        } else {
          const ym = a.y === b.y ? a.y + 16 : a.y < b.y ? b.y - 13 : b.y + 13;
          d = `M${a.r},${a.y} h8 V${ym} H${b.l - 10} V${b.y} H${b.l - 2}`;
        }
        const preCard = index.get(pre)?.card;
        out.push({
          key: `${pre}-${i.card.id}`,
          d,
          conflict,
          title: `${i.card.ref} waits on ${preCard?.ref ?? ""}${conflict ? " — starts before it finishes" : ""}`,
        });
      }
    }
    setArrows(out);
  }, [index, rows, range, ppd, preview, measureTick]);

  // ── Header ticks ──
  const months = useMemo(() => {
    const out: { key: string; left: number; width: number; label: string }[] = [];
    let cur = range.from;
    const end = addDays(range.from, range.days);
    while (cur < end) {
      const y = Number(cur.slice(0, 4));
      const m = Number(cur.slice(5, 7));
      const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
      const stop = minIso(next, end);
      out.push({
        key: cur,
        left: x(cur),
        width: daysBetween(cur, stop) * ppd,
        label: zoom === "Months" ? `${SHORT[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`,
      });
      cur = stop;
    }
    return out;
  }, [range, ppd, zoom, x]);

  const ticks = useMemo(() => {
    const out: { key: string; left: number; width: number; label: string; sub?: string; weekend?: boolean; today?: boolean }[] = [];
    if (zoom === "Days") {
      for (let i = 0; i < range.days; i++) {
        const d = addDays(range.from, i);
        const w = dow(d);
        out.push({ key: d, left: i * ppd, width: ppd, label: String(Number(d.slice(8))), sub: DOW[w], weekend: w === 0 || w === 6, today: d === today });
      }
    } else {
      for (let i = 0; i < range.days; i += 7) {
        const d = addDays(range.from, i);
        out.push({ key: d, left: i * ppd, width: 7 * ppd, label: zoom === "Weeks" ? `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}` : String(Number(d.slice(8))) });
      }
    }
    return out;
  }, [range, ppd, zoom, today]);

  const grid = useMemo(() => {
    const week = 7 * ppd;
    const layers = [`repeating-linear-gradient(90deg, var(--gantt-line) 0 1px, transparent 1px ${week}px)`];
    if (zoom === "Days") layers.push(`repeating-linear-gradient(90deg, var(--gantt-line-faint) 0 1px, transparent 1px ${ppd}px)`);
    if (zoom !== "Months") layers.push(`repeating-linear-gradient(90deg, transparent 0 ${5 * ppd}px, var(--gantt-weekend) ${5 * ppd}px ${week}px)`);
    return layers.join(", ");
  }, [ppd, zoom]);

  // ── Render helpers ──
  const renderTaskBar = (info: CardInfo) => {
    const k = info.card;
    const base = taskSpan(info);
    if (!base) return <span className="pt-gantt__schedule">Click to schedule</span>;
    const pv = preview?.key === `t${k.id}` ? preview : null;
    const span = pv ? { ...base, start: pv.start, due: pv.due } : base;
    const hue = hueClass(PROGRESS_HUE[info.progress]);
    const open = () => actions.editWork(k);
    const commit = commitTask(info, base);
    const label = `${k.ref} ${k.title}, ${k.milestone ? friendlyDate(span.due, today) : `${friendlyDate(span.start, today)} to ${friendlyDate(span.due, today)}`}. ${PROGRESS_LABEL[info.progress]}.`;
    const linkTarget = link && link.over === k.id ? " is-link-target" : "";
    if (k.milestone) {
      const left = x(span.due) + ppd / 2;
      return (
        <>
          <div
            className={`pt-gmile ${hue}${pv ? " is-dragging" : ""}${linkTarget}`}
            data-gbar={k.id}
            style={{ left }}
            role="button"
            tabIndex={0}
            aria-label={`Milestone ${label}`}
            title={`${k.title} · ${friendlyDate(span.due, today)}`}
            onPointerDown={(e) => beginDrag(e, `t${k.id}`, base, "move", commit, open)}
            onKeyDown={(e) => nudge(e, base, commit, open)}
          >
            <span className="pt-gmile__shape" />
            <span className="pt-gbar__link" title="Drag to another task to make it wait on this" onPointerDown={(e) => beginLink(e, k.id)} />
          </div>
          <span className="pt-gbar__name" style={{ left: left + 14 }}>
            {k.title}
            <em>{friendlyDate(span.due, today)}</em>
          </span>
        </>
      );
    }
    const left = x(span.start);
    const width = (daysBetween(span.start, span.due) + 1) * ppd;
    const subs = k.subtasks.length;
    const pct = subs ? (k.subtasks.filter((s) => s.done).length / subs) * 100 : 100;
    return (
      <>
        <div
          className={`pt-gbar ${hue}${pv ? " is-dragging" : ""}${linkTarget}${info.done ? " is-done" : ""}`}
          data-gbar={k.id}
          style={{ left, width }}
          role="button"
          tabIndex={0}
          aria-label={label}
          title={`${k.title} · ${friendlyDate(span.start, today)} – ${friendlyDate(span.due, today)}`}
          onPointerDown={(e) => beginDrag(e, `t${k.id}`, base, "move", commit, open)}
          onKeyDown={(e) => nudge(e, base, commit, open)}
        >
          <span className="pt-gbar__body">
            <span className="pt-gbar__fill" style={{ width: `${pct}%` }} />
            {width > 64 && <span className="pt-gbar__label">{k.ref}</span>}
          </span>
          <span className="pt-gbar__h pt-gbar__h--start" onPointerDown={(e) => beginDrag(e, `t${k.id}`, base, "start", commit, open)} />
          <span className="pt-gbar__h pt-gbar__h--end" onPointerDown={(e) => beginDrag(e, `t${k.id}`, base, "end", commit, open)} />
          <span className="pt-gbar__link" title="Drag to another task to make it wait on this" onPointerDown={(e) => beginLink(e, k.id)} />
        </div>
        <span className="pt-gbar__name" style={{ left: left + width + 16 }}>
          {k.title}
          {pv && (
            <em>
              {friendlyDate(span.start, today)} – {friendlyDate(span.due, today)}
            </em>
          )}
        </span>
      </>
    );
  };

  const renderSubBar = (info: CardInfo, sub: OpsSubtask) => {
    const base = subSpan(sub);
    if (!base) return null;
    const pv = preview?.key === `s${sub.id}` ? preview : null;
    const span = pv ? { ...base, start: pv.start, due: pv.due } : base;
    const open = () => actions.editWork(info.card);
    const commit = commitSub(info, sub, base);
    const left = x(span.start);
    const width = (daysBetween(span.start, span.due) + 1) * ppd;
    return (
      <div
        className={`pt-gbar pt-gbar--sub ${hueClass(PROGRESS_HUE[subProgress(sub, info.progress)])}${pv ? " is-dragging" : ""}`}
        style={{ left, width }}
        role="button"
        tabIndex={0}
        aria-label={`Subtask ${sub.title}, ${friendlyDate(span.start, today)} to ${friendlyDate(span.due, today)}`}
        title={`${sub.title} · ${friendlyDate(span.start, today)} – ${friendlyDate(span.due, today)}`}
        onPointerDown={(e) => beginDrag(e, `s${sub.id}`, base, "move", commit, open)}
        onKeyDown={(e) => nudge(e, base, commit, open)}
      >
        <span className="pt-gbar__body" />
        <span className="pt-gbar__h pt-gbar__h--start" onPointerDown={(e) => beginDrag(e, `s${sub.id}`, base, "start", commit, open)} />
        <span className="pt-gbar__h pt-gbar__h--end" onPointerDown={(e) => beginDrag(e, `s${sub.id}`, base, "end", commit, open)} />
      </div>
    );
  };

  const undated = [...index.values()].filter((i) => !i.card.dueDate).length;
  const todayX = x(today) + ppd / 2;

  return (
    <div className="pt-gantt">
      <div className="pt-gantt__toolbar">
        <button type="button" className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => scrollToDate(today)}>
          Today
        </button>
        <span className="pt-gantt__nav">
          <button type="button" className="pt-iconbtn pt-iconbtn--sm" aria-label="Earlier" title="Earlier" onClick={() => page(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="pt-iconbtn pt-iconbtn--sm" aria-label="Later" title="Later" onClick={() => page(1)}>
            <ChevronRight size={16} />
          </button>
        </span>
        <span className="pt-gantt__month" aria-live="polite">
          {monthLabel}
        </span>
        <span style={{ flex: 1 }} />
        <span className="pt-seg" role="radiogroup" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z.key} type="button" role="radio" aria-checked={zoom === z.key} className="pt-seg__btn pt-hue-slate" onClick={() => changeZoom(z.key)}>
              {z.key}
            </button>
          ))}
        </span>
        <button type="button" className="sds-btn sds-btn--sm sds-btn--secondary pt-gantt__add" onClick={() => actions.raiseWork({ milestone: true })}>
          <Diamond size={13} /> Milestone
        </button>
        <button type="button" className="sds-btn sds-btn--sm sds-btn--primary pt-gantt__add" onClick={() => actions.raiseWork()}>
          <Plus size={14} /> Task
        </button>
      </div>

      <div className="pt-gantt__scroll" ref={scroller} onScroll={onScroll}>
        <div className="pt-gantt__canvas" ref={canvas} style={{ width: `calc(var(--gantt-label) + ${trackW}px)` }}>
          <div className="pt-gantt__bg" style={{ width: trackW, backgroundImage: grid }}>
            {months.map((m) => (
              <span key={m.key} className="pt-gantt__monthline" style={{ left: m.left }} />
            ))}
            <span className="pt-gantt__today" style={{ left: todayX }} />
          </div>

          <svg className="pt-gantt__links" width="100%" height="100%" aria-hidden>
            <defs>
              <marker id="pt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 z" className="pt-gantt__arrowhead" />
              </marker>
              <marker id="pt-arrow-conflict" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 z" className="pt-gantt__arrowhead pt-gantt__arrowhead--conflict" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path
                key={a.key}
                d={a.d}
                className={`pt-gantt__arrow${a.conflict ? " pt-gantt__arrow--conflict" : ""}`}
                markerEnd={`url(#${a.conflict ? "pt-arrow-conflict" : "pt-arrow"})`}
              >
                <title>{a.title}</title>
              </path>
            ))}
          </svg>

          <div className="pt-grow pt-grow--head">
            <div className="pt-grow__label" ref={labelCell}>
              <span className="pt-tl__h">Task</span>
            </div>
            <div className="pt-grow__track" style={{ width: trackW }}>
              <div className="pt-gantt__months">
                {months.map((m) => (
                  <div key={m.key} className="pt-gantt__mcell" style={{ left: m.left, width: m.width }}>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="pt-gantt__ticks">
                {ticks.map((t) => (
                  <div key={t.key} className={`pt-gantt__tick${t.weekend ? " is-weekend" : ""}${t.today ? " is-today" : ""}`} style={{ left: t.left, width: t.width }}>
                    {t.sub && <em>{t.sub}</em>}
                    {t.label}
                  </div>
                ))}
                <span className="pt-gantt__todaytag" style={{ left: todayX }}>
                  Today
                </span>
              </div>
            </div>
          </div>

          {rows.map((row) => {
            if (row.kind === "group") {
              const open = !collapsed.has(row.key);
              return (
                <div key={row.key} className={`pt-grow pt-grow--group ${hueClass(columnHue(row.ci, row.column.done))}`}>
                  <div className="pt-grow__label">
                    <button type="button" className="pt-gantt__toggle" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${row.column.label}`} onClick={() => toggle(row.key)}>
                      <ChevronDown size={14} style={{ transform: open ? undefined : "rotate(-90deg)" }} />
                    </button>
                    <span className="pt-kcol__swatch" aria-hidden />
                    <span className="pt-grow__group">{row.column.label}</span>
                    <span className="pt-kcol__count">{row.count}</span>
                  </div>
                  <div className="pt-grow__track" style={{ width: trackW }} onPointerDown={(e) => beginPan(e)} />
                </div>
              );
            }
            if (row.kind === "task") {
              const k = row.info.card;
              const open = !collapsed.has(row.key);
              return (
                <div key={row.key} className={`pt-grow pt-grow--task${k.dueDate ? "" : " is-undated"}`}>
                  <div className="pt-grow__label">
                    {k.subtasks.length > 0 ? (
                      <button type="button" className="pt-gantt__toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} subtasks of ${k.ref}`} onClick={() => toggle(row.key)}>
                        <ChevronDown size={13} style={{ transform: open ? undefined : "rotate(-90deg)" }} />
                      </button>
                    ) : (
                      <span className="pt-gantt__toggle" />
                    )}
                    <span className={`pt-gantt__state ${hueClass(PROGRESS_HUE[row.info.progress])}`} title={PROGRESS_LABEL[row.info.progress]}>
                      {k.milestone ? <Diamond size={11} /> : <span />}
                    </span>
                    <button type="button" className="pt-grow__name" onClick={() => actions.editWork(k)} title={k.title}>
                      {k.title}
                    </button>
                    <Avatar initials={k.who} size={18} />
                  </div>
                  <div className="pt-grow__track" style={{ width: trackW }} onPointerDown={(e) => beginPan(e, row)} title={k.dueDate ? undefined : "Click a day to schedule this task"}>
                    {renderTaskBar(row.info)}
                  </div>
                </div>
              );
            }
            const s = row.sub;
            return (
              <div key={row.key} className="pt-grow pt-grow--sub">
                <div className="pt-grow__label">
                  <CheckCircle
                    size={13}
                    done={s.done}
                    label={s.done ? "Mark subtask incomplete" : "Mark subtask complete"}
                    onToggle={() => s.id > 0 && void actions.patchSubtask(row.info.card, s, { done: !s.done })}
                  />
                  <span className={`pt-grow__subname${s.done ? " is-done" : ""}`} title={s.title}>
                    {s.title}
                  </span>
                </div>
                <div className="pt-grow__track" style={{ width: trackW }} onPointerDown={(e) => beginPan(e)}>
                  {renderSubBar(row.info, s)}
                </div>
              </div>
            );
          })}

          {link && (
            <svg className="pt-gantt__linking" width="100%" height="100%" aria-hidden>
              <line x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} />
              <circle cx={link.x2} cy={link.y2} r={4} />
            </svg>
          )}
        </div>
      </div>

      <div className="pt-legend pt-gantt__legend">
        {(Object.keys(PROGRESS_HUE) as ProgressState[]).map((p) => (
          <span key={p} className={hueClass(PROGRESS_HUE[p])}>
            <i style={{ background: "var(--hue)" }} />
            {PROGRESS_LABEL[p].toUpperCase()}
          </span>
        ))}
        <span>
          <Diamond size={11} /> MILESTONE
        </span>
        <span>
          <svg width="22" height="10" aria-hidden>
            <path d="M0,5 H18" className="pt-gantt__arrow" />
            <path d="M14,1 L20,5 L14,9 z" className="pt-gantt__arrowhead" />
          </svg>
          DEPENDENCY
        </span>
        <span>
          <svg width="22" height="10" aria-hidden>
            <path d="M0,5 H18" className="pt-gantt__arrow pt-gantt__arrow--conflict" />
            <path d="M14,1 L20,5 L14,9 z" className="pt-gantt__arrowhead pt-gantt__arrowhead--conflict" />
          </svg>
          DATE CONFLICT
        </span>
        <span style={{ marginLeft: "auto" }}>
          DRAG BARS TO MOVE · DRAG ENDS TO RESIZE · DRAG THE DOT TO LINK{undated ? ` · ${undated} UNDATED` : ""}
        </span>
      </div>
    </div>
  );
}
