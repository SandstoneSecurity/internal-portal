import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Building2, Calendar, Car, CircleDot, CreditCard, Home, Mail, Maximize, Phone, Plus, User, Wand2 } from "lucide-react";
import type { CaseDetail, Entity, EntityKind, Link } from "../../../shared/investigations";
import { send } from "../../lib/api";

export const ENTITY_ICON: Record<EntityKind, typeof User> = {
  Person: User,
  Company: Building2,
  Account: CreditCard,
  Address: Home,
  Phone: Phone,
  Email: Mail,
  Vehicle: Car,
  Event: Calendar,
  Other: CircleDot,
};

type Pt = { x: number; y: number };

/**
 * Places what hasn't been placed: a small force layout (things repel, links pull) that leaves anything
 * already positioned where it is. Deterministic, so the chart doesn't jump between visits.
 */
export function layout(entities: Entity[], links: Link[], all = false): Map<number, Pt> {
  const pos = new Map<number, Pt & { fixed: boolean }>();
  entities.forEach((e, i) => {
    const placed = !all && e.x !== null && e.y !== null;
    const a = (i / Math.max(1, entities.length)) * Math.PI * 2 + i * 0.37;
    const r = 140 + 22 * (i % 5);
    pos.set(e.id, placed ? { x: e.x!, y: e.y!, fixed: true } : { x: Math.cos(a) * r, y: Math.sin(a) * r, fixed: false });
  });
  const free = [...pos.values()].filter((p) => !p.fixed);
  if (free.length) {
    const nodes = [...pos.entries()];
    for (let it = 0, heat = 1; it < 400; it++, heat *= 0.992) {
      const force = new Map<number, Pt>(nodes.map(([id]) => [id, { x: 0, y: 0 }]));
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const [ia, a] = nodes[i]!, [ib, b] = nodes[j]!;
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 25);
          const f = 40_000 / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          force.get(ia)!.x += dx * f;
          force.get(ia)!.y += dy * f;
          force.get(ib)!.x -= dx * f;
          force.get(ib)!.y -= dy * f;
        }
      for (const l of links) {
        const a = pos.get(l.fromId), b = pos.get(l.toId);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const f = (d - 220) * 0.05;
        force.get(l.fromId)!.x += (dx / d) * f;
        force.get(l.fromId)!.y += (dy / d) * f;
        force.get(l.toId)!.x -= (dx / d) * f;
        force.get(l.toId)!.y -= (dy / d) * f;
      }
      for (const [id, p] of nodes) {
        if (p.fixed) continue;
        const f = force.get(id)!;
        f.x -= p.x * 0.012;
        f.y -= p.y * 0.012;
        const step = Math.min(Math.hypot(f.x, f.y), 30 * heat);
        const m = Math.hypot(f.x, f.y) || 1;
        p.x += (f.x / m) * step;
        p.y += (f.y / m) * step;
      }
    }
  }
  return new Map([...pos.entries()].map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]));
}

const R = 22;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The link chart: people, companies, accounts, addresses and things, joined by what exactly connects
 * them. Drag a node to move it (its spot is kept); drag the background to pan; scroll to zoom;
 * double-click empty space to add something there. A dashed line isn't yet backed by evidence.
 */
export function LinkChart({
  d,
  selected,
  onSelect,
  onAddAt,
  readOnly,
}: {
  d: CaseDetail;
  selected: { type: "entity" | "link"; id: number } | null;
  onSelect: (s: { type: "entity" | "link"; id: number } | null) => void;
  onAddAt: (p?: Pt) => void;
  readOnly: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [pos, setPos] = useState<Map<number, Pt>>(() => layout(d.entities, d.links));
  const [view, setView] = useState({ x: -400, y: -300, w: 800, h: 600 });
  const drag = useRef<{ kind: "node"; id: number; start: Pt; origin: Pt; moved: boolean } | { kind: "pan"; start: Pt; view: typeof view } | null>(null);
  const fitted = useRef(false);

  // Follow the case: new things get placed, removed ones go; dragged spots stay.
  useEffect(() => {
    setPos((old) => {
      const placed = d.entities.map((e) => (old.has(e.id) && (e.x === null || e.y === null) ? { ...e, ...old.get(e.id)! } : e));
      return layout(placed, d.links);
    });
  }, [d.entities, d.links]);

  const fit = (p = pos) => {
    if (!p.size) return setView({ x: -400, y: -300, w: 800, h: 600 });
    const xs = [...p.values()].map((q) => q.x), ys = [...p.values()].map((q) => q.y);
    const pad = 90;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const box = svg.current?.getBoundingClientRect();
    const aspect = box && box.height ? box.width / box.height : 4 / 3;
    let w = Math.max(maxX - minX, 400), h = Math.max(maxY - minY, 300);
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    setView({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h });
  };
  useEffect(() => {
    if (!fitted.current && pos.size) {
      fitted.current = true;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const toChart = (e: { clientX: number; clientY: number }): Pt => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const onDown = (e: RPointerEvent, id?: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toChart(e);
    drag.current = id !== undefined && !readOnly ? { kind: "node", id, start: p, origin: pos.get(id)!, moved: false } : { kind: "pan", start: { x: e.clientX, y: e.clientY }, view };
    if (id !== undefined) onSelect({ type: "entity", id });
  };
  const onMove = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    if (g.kind === "node") {
      const p = toChart(e);
      const nx = g.origin.x + p.x - g.start.x, ny = g.origin.y + p.y - g.start.y;
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 3) g.moved = true;
      setPos((old) => new Map(old).set(g.id, { x: nx, y: ny }));
    } else {
      const box = svg.current!.getBoundingClientRect();
      const k = g.view.w / box.width;
      setView({ ...g.view, x: g.view.x - (e.clientX - g.start.x) * k, y: g.view.y - (e.clientY - g.start.y) * k });
    }
  };
  const onUp = () => {
    const g = drag.current;
    drag.current = null;
    if (g?.kind === "node" && g.moved) {
      const p = pos.get(g.id)!;
      void send("PATCH", `/inv-entities/${g.id}`, { x: Math.round(p.x), y: Math.round(p.y) }).catch(() => undefined);
    }
    if (g?.kind === "pan" && Math.abs(view.x - g.view.x) < 1 && Math.abs(view.y - g.view.y) < 1) onSelect(null);
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0015)));
      setView((v) => {
        const box = el.getBoundingClientRect();
        const fx = (e.clientX - box.left) / box.width, fy = (e.clientY - box.top) / box.height;
        const w = Math.min(8000, Math.max(160, v.w * k)), h = (w * v.h) / v.w;
        return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const tidy = async () => {
    const next = layout(d.entities, d.links, true);
    setPos(next);
    fit(next);
    await Promise.all([...next.entries()].map(([id, p]) => send("PATCH", `/inv-entities/${id}`, { x: p.x, y: p.y }).catch(() => undefined)));
  };

  // Lines between the same two things bend apart so each label can be read.
  const curves = useMemo(() => {
    const groups = new Map<string, Link[]>();
    for (const l of d.links) {
      const key = [l.fromId, l.toId].sort((a, b) => a - b).join("-");
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const bend = new Map<number, number>();
    for (const g of groups.values()) g.forEach((l, i) => bend.set(l.id, (i - (g.length - 1) / 2) * 46 * (l.fromId < l.toId ? 1 : -1)));
    return bend;
  }, [d.links]);

  // Each label goes at the first point along its line that clears the labels already placed and the nodes.
  const tags = useMemo(() => {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const out = new Map<number, { x: number; y: number; text: string }>();
    const hits = (r: { x: number; y: number; w: number; h: number }) =>
      placed.some((q) => Math.abs(q.x - r.x) * 2 < q.w + r.w && Math.abs(q.y - r.y) * 2 < q.h + r.h) ||
      [...pos.values()].some((n) => Math.abs(n.x - r.x) < r.w / 2 + R && Math.abs(n.y - r.y) < r.h / 2 + R + 26 && n.y - r.y < R + 30);
    for (const l of d.links) {
      const a = pos.get(l.fromId), b = pos.get(l.toId);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(Math.hypot(dx, dy), 1);
      const k = curves.get(l.id) ?? 0;
      const cx = (a.x + b.x) / 2 + (-dy / len) * k, cy = (a.y + b.y) / 2 + (dx / len) * k;
      const text = clip(l.label, 28);
      const w = text.length * 6.2 + 12, h = 18;
      let best: { x: number; y: number } | null = null;
      for (const t of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
        const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t ** 2 * b.x, y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t ** 2 * b.y;
        best ??= { x, y };
        if (!hits({ x, y, w, h })) {
          best = { x, y };
          break;
        }
      }
      placed.push({ ...best!, w, h });
      out.set(l.id, { ...best!, text });
    }
    return out;
  }, [d.links, pos, curves]);

  const sel = selected;
  const near = new Set<number>();
  if (sel?.type === "entity") for (const l of d.links) if (l.fromId === sel.id || l.toId === sel.id) near.add(l.fromId).add(l.toId);

  return (
    <div className="pt-chart">
      <svg
        ref={svg}
        className="pt-chart__svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={(e) => onDown(e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={(e) => !readOnly && e.target === svg.current && onAddAt(toChart(e))}
        role="img"
        aria-label={`Link chart: ${d.entities.length} people and things, ${d.links.length} links`}
      >
        <defs>
          <marker id="pt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="pt-chart__arrow" />
          </marker>
        </defs>
        {d.links.map((l) => {
          const a = pos.get(l.fromId), b = pos.get(l.toId);
          if (!a || !b) return null;
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(Math.hypot(dx, dy), 1);
          const nx = -dy / len, ny = dx / len, k = curves.get(l.id) ?? 0;
          const cx = (a.x + b.x) / 2 + nx * k, cy = (a.y + b.y) / 2 + ny * k;
          // Stop the line at the edge of the target's circle.
          const tx = b.x - cx, ty = b.y - cy, tl = Math.max(Math.hypot(tx, ty), 1);
          const ex = b.x - (tx / tl) * (R + 4), ey = b.y - (ty / tl) * (R + 4);
          const on = sel?.type === "link" && sel.id === l.id;
          const dim = sel?.type === "entity" && sel.id !== l.fromId && sel.id !== l.toId;
          return (
            <g
              key={l.id}
              className={`pt-chart__link${l.evidenceId ? "" : " is-unbacked"}${on ? " is-on" : ""}${dim ? " is-dim" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect({ type: "link", id: l.id });
              }}
            >
              <path d={`M${a.x},${a.y} Q${cx},${cy} ${ex},${ey}`} className="pt-chart__hit" />
              <path d={`M${a.x},${a.y} Q${cx},${cy} ${ex},${ey}`} className="pt-chart__line" markerEnd="url(#pt-arrow)" />
            </g>
          );
        })}
        {d.entities.map((e) => {
          const p = pos.get(e.id);
          if (!p) return null;
          const Icon = ENTITY_ICON[e.kind] ?? CircleDot;
          const on = sel?.type === "entity" && sel.id === e.id;
          const dim = sel?.type === "entity" && !on && !near.has(e.id);
          return (
            <g
              key={e.id}
              className={`pt-chart__node is-${e.kind.toLowerCase()}${on ? " is-on" : ""}${dim ? " is-dim" : ""}`}
              transform={`translate(${p.x},${p.y})`}
              onPointerDown={(ev) => onDown(ev, e.id)}
              data-entity={e.id}
            >
              <title>{`${e.kind}: ${e.name}${e.detail ? `\n${e.detail}` : ""}`}</title>
              {e.kind === "Company" || e.kind === "Account" ? (
                <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={2} className="pt-chart__shape" />
              ) : (
                <circle r={R} className="pt-chart__shape" />
              )}
              <Icon x={-9} y={-9} width={18} height={18} className="pt-chart__icon" strokeWidth={1.75} />
              <text y={R + 16} textAnchor="middle" className="pt-chart__name">
                {clip(e.name, 26)}
              </text>
              <text y={R + 29} textAnchor="middle" className="pt-chart__kind">
                {e.kind.toUpperCase()}
              </text>
            </g>
          );
        })}
        {/* Labels last, so a line or a node never covers what a link says. */}
        {d.links.map((l) => {
          const t = tags.get(l.id);
          if (!t) return null;
          const { x: mx, y: my, text: label } = t;
          const on = sel?.type === "link" && sel.id === l.id;
          const dim = sel?.type === "entity" && sel.id !== l.fromId && sel.id !== l.toId;
          return (
            <g
              key={l.id}
              className={`pt-chart__link pt-chart__taggroup${l.evidenceId ? "" : " is-unbacked"}${on ? " is-on" : ""}${dim ? " is-dim" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect({ type: "link", id: l.id });
              }}
            >
              <rect x={mx - label.length * 3.1 - 6} y={my - 9} width={label.length * 6.2 + 12} height={18} rx={1} className="pt-chart__tag" />
              <text x={mx} y={my + 4} textAnchor="middle" className="pt-chart__label">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {d.entities.length === 0 && (
        <div className="pt-chart__empty">
          <p>Add the people, companies, accounts, addresses and vehicles in this case, then link them by what exactly connects them.</p>
          {!readOnly && (
            <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => onAddAt()}>
              <Plus size={14} /> Add the first
            </button>
          )}
        </div>
      )}
      <div className="pt-chart__tools">
        <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => fit()} title="Fit the chart" aria-label="Fit the chart">
          <Maximize size={14} />
        </button>
        {!readOnly && d.entities.length > 1 && (
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => void tidy()} title="Tidy the layout" aria-label="Tidy the layout">
            <Wand2 size={14} />
          </button>
        )}
      </div>
      <div className="pt-chart__legend" aria-hidden>
        <span>
          <i className="pt-chart__key" /> backed by evidence
        </span>
        <span>
          <i className="pt-chart__key is-unbacked" /> not yet evidenced
        </span>
        {!readOnly && <span>Double-click empty space to add · drag to move · scroll to zoom</span>}
      </div>
    </div>
  );
}
