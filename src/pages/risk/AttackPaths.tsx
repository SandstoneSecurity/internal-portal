import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { CONTROL_BY_KEY, type AssetType } from "../../../shared/threatLibrary";
import type { RatedScenario } from "../../../shared/risk";
import type { ClientSite, TmElement } from "../../../shared/types";
import { hueClass } from "../../lib/hues";
import { DOMAIN_HUE, RATING_HUE, compactAud, type ClientModel } from "../../lib/riskModel";

const COL_W = 168;
const GAP = 56;
const NODE_H = 48;
const V = 10;
const HEAD = 30;
const DIGITAL = new Set(["Network", "Remote access"]);
const COLS = ["Threats", "Entry points", "Zones", "Assets"] as const;

type Node = { id: string; col: number; y: number; label: string; sub: string; kind: "threat" | "entry" | "zone" | "asset"; ref: RatedScenario | TmElement };
type Edge = { from: string; to: string; w: number; direct?: boolean; aimed?: boolean };

/**
 * How each threat reaches what it's after: threat → entry point → zone → asset.
 * Derived from the model rather than drawn by hand: a physical threat uses
 * physical entries, a cyber threat network and remote access, and only where
 * the entry leads to an asset of a type the threat targets.
 */
export function AttackPaths({
  m,
  site,
  aimed,
  onSelect,
  onScenario,
}: {
  m: ClientModel;
  site: ClientSite;
  /** Scenario id → the asset it's aimed at. */
  aimed: Map<number, number>;
  onSelect: (id: number) => void;
  onScenario: (r: RatedScenario) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const els = m.elements.filter((e) => e.siteId === site.id);
    const zones = els.filter((e) => e.kind === "zone");
    const entries = els.filter((e) => e.kind === "entry");
    const assets = els.filter((e) => e.kind === "asset");
    const types = new Set(assets.map((a) => a.subtype));
    const threats = m.rows
      .filter((r) => r.s.siteId === site.id || (r.s.siteId == null && (r.s.threat?.targets.some((t) => types.has(t)) ?? false)))
      .slice(0, 14);

    // Assets an element leads to: those in its zone or any zone inside it.
    const inside = (zoneId: number): Set<number> => {
      const out = new Set<number>([zoneId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const z of zones) if (z.zoneId != null && out.has(z.zoneId) && !out.has(z.id)) (out.add(z.id), (grew = true));
      }
      return out;
    };
    const reach = (entry: TmElement) => (entry.zoneId == null ? assets : assets.filter((a) => a.zoneId != null && inside(entry.zoneId!).has(a.zoneId)));

    const nodes: Node[] = [];
    const place = (col: number, list: Omit<Node, "col" | "y">[]) => list.forEach((n, i) => nodes.push({ ...n, col, y: HEAD + i * (NODE_H + V) }));
    place(
      0,
      threats.map((r) => ({ id: `t${r.s.id}`, label: r.s.name, sub: compactAud(r.currentAle), kind: "threat" as const, ref: r }))
    );
    place(1, entries.map((e) => ({ id: `e${e.id}`, label: e.name, sub: e.subtype, kind: "entry" as const, ref: e })));
    place(
      2,
      zones.map((z) => ({ id: `z${z.id}`, label: z.name, sub: z.subtype + (z.zoneId ? ` · in ${zones.find((p) => p.id === z.zoneId)?.name}` : ""), kind: "zone" as const, ref: z }))
    );
    place(3, assets.map((a) => ({ id: `a${a.id}`, label: a.name, sub: [a.subtype, a.value ? compactAud(a.value) : ""].filter(Boolean).join(" · "), kind: "asset" as const, ref: a })));

    const maxAle = Math.max(1, ...threats.map((r) => r.currentAle));
    const edges: Edge[] = [];
    for (const r of threats) {
      const targets = new Set<AssetType>(r.s.threat?.targets ?? []);
      const digital = r.s.domain === "cyber";
      const w = 1 + 5 * (r.currentAle / maxAle);
      let linked = false;
      for (const e of entries) {
        if (DIGITAL.has(e.subtype) !== digital) continue;
        if (!reach(e).some((a) => targets.has(a.subtype as AssetType))) continue;
        edges.push({ from: `t${r.s.id}`, to: `e${e.id}`, w });
        linked = true;
      }
      // A scenario aimed at one asset goes straight to it.
      const target = aimed.get(r.s.id);
      if (target != null && assets.some((a) => a.id === target)) {
        edges.push({ from: `t${r.s.id}`, to: `a${target}`, w, aimed: true });
        continue;
      }
      if (!linked)
        for (const a of assets) if (targets.has(a.subtype as AssetType)) edges.push({ from: `t${r.s.id}`, to: `a${a.id}`, w, direct: true });
    }
    for (const e of entries) if (e.zoneId != null) edges.push({ from: `e${e.id}`, to: `z${e.zoneId}`, w: 1.4 });
    for (const a of assets) if (a.zoneId != null) edges.push({ from: `z${a.zoneId}`, to: `a${a.id}`, w: 1.4 });
    const height = Math.max(...[0, 1, 2, 3].map((c) => nodes.filter((n) => n.col === c).length)) * (NODE_H + V) + HEAD + 10;
    return { nodes, edges, height, threats, count: { entries: entries.length, zones: zones.length, assets: assets.length } };
  }, [m, site.id, aimed]);

  // Everything downstream of the hovered node lights up.
  const lit = useMemo(() => {
    if (!hover) return null;
    const on = new Set([hover]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of layout.edges) if (on.has(e.from) && !on.has(e.to)) (on.add(e.to), (grew = true));
    }
    return on;
  }, [hover, layout.edges]);

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const x = (col: number) => col * (COL_W + GAP);
  const width = 4 * COL_W + 3 * GAP;
  if (!layout.threats.length && !layout.count.assets) {
    return <div className="pt-risk-paths__empty">Add assets, zones and entry points on the plan, and scenarios for this site, to see how each threat reaches what it's after.</div>;
  }

  return (
    <div className="pt-risk-paths">
      <div className="pt-risk-paths__scroll">
        <div className="pt-risk-paths__canvas" style={{ width, height: layout.height }}>
          {COLS.map((c, i) => (
            <div key={c} className="pt-risk-paths__colhead pt-meta" style={{ left: x(i), width: COL_W }}>
              {c}
            </div>
          ))}
          <svg className="pt-risk-paths__edges" width={width} height={layout.height} aria-hidden>
            {layout.edges.map((e, i) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const x1 = x(a.col) + COL_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = x(b.col);
              const y2 = b.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              const on = !lit || (lit.has(e.from) && lit.has(e.to));
              const hue = a.kind === "threat" ? DOMAIN_HUE[(a.ref as RatedScenario).s.domain] : "slate";
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                  className={`pt-risk-paths__edge ${hueClass(hue)}${e.direct ? " is-direct" : ""}${e.aimed ? " is-aimed" : ""}${on ? "" : " is-dim"}`}
                  style={{ strokeWidth: e.w }}
                />
              );
            })}
          </svg>
          {layout.nodes.map((n) => {
            const dim = lit && !lit.has(n.id);
            if (n.kind === "threat") {
              const r = n.ref as RatedScenario;
              const barriers = m.controls.filter(
                (c) => c.status === "In place" && (c.siteId == null || c.siteId === r.s.siteId) && CONTROL_BY_KEY.get(c.controlKey)?.mitigates.some((x) => x.threat === r.s.threat?.key)
              );
              const cut = r.inherentAle > 0 ? Math.round((1 - r.currentAle / r.inherentAle) * 100) : 0;
              return (
                <button
                  key={n.id}
                  className={`pt-risk-node pt-risk-node--threat ${hueClass(DOMAIN_HUE[r.s.domain])}${dim ? " is-dim" : ""}`}
                  style={{ left: x(0), top: n.y, width: COL_W, height: NODE_H }}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => onScenario(r)}
                >
                  <span className="pt-risk-node__label">{n.label}</span>
                  <span className="pt-risk-node__sub">
                    <span className={`pt-risk-node__rate ${hueClass(RATING_HUE[r.rating]!)}`}>{r.rating}</span>
                    {n.sub}
                    {barriers.length > 0 && (
                      <span className="pt-risk-node__barrier" title={barriers.map((b) => CONTROL_BY_KEY.get(b.controlKey)?.name).join("\n")}>
                        <ShieldCheck size={11} /> {barriers.length} · −{cut}%
                      </span>
                    )}
                  </span>
                </button>
              );
            }
            const e = n.ref as TmElement;
            return (
              <button
                key={n.id}
                className={`pt-risk-node pt-risk-node--${n.kind}${dim ? " is-dim" : ""}`}
                style={{ left: x(n.col), top: n.y, width: COL_W, height: NODE_H }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(e.id)}
              >
                <span className="pt-risk-node__label">{n.label}</span>
                <span className="pt-risk-node__sub">{n.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="pt-risk-note">
        Line weight is expected loss a year. Dashed lines reach an asset with no modelled way in — add the entry points that lead to it. Barriers are controls in place and how much of the
        threat's loss they remove.
      </p>
    </div>
  );
}
