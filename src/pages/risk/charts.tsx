import { useMemo, useRef, useState } from "react";
import { CONSEQUENCE, LIKELIHOOD, rating, type RatedScenario } from "../../../shared/risk";
import { DOMAINS, DOMAIN_LABEL, type Domain } from "../../../shared/threatLibrary";
import { hueClass } from "../../lib/hues";
import { DOMAIN_HUE, RATING_HUE, compactAud, pct } from "../../lib/riskModel";

type Curve = { loss: number; p: number }[];

const W = 640;
const H = 280;
const PAD = { l: 44, r: 16, t: 14, b: 30 };

/**
 * Loss exceedance curve: for each dollar amount, the chance a year's losses exceed it.
 * Log dollar axis, because security losses span four orders of magnitude.
 */
export function ExceedanceChart({ inherent, current, target, p90 }: { inherent: Curve; current: Curve; target: Curve; p90: number }) {
  const all = [...inherent, ...current, ...target];
  const [hover, setHover] = useState<{ x: number; loss: number; p: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const scale = useMemo(() => {
    const losses = all.map((d) => d.loss).filter((v) => v > 0);
    const lo = Math.pow(10, Math.floor(Math.log10(Math.max(1_000, Math.min(...losses, 1e12)))));
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...losses, lo * 10))));
    const x = (v: number) => PAD.l + ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v *= 10) ticks.push(v);
    return { lo, hi, x, y, ticks };
  }, [all.length, inherent, current, target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current.length) {
    return <div className="pt-risk-chart pt-risk-chart--empty">No simulated losses yet. Add scenarios to see the curve.</div>;
  }
  const path = (c: Curve) => c.map((d, i) => `${i ? "L" : "M"}${scale.x(d.loss).toFixed(1)},${scale.y(d.p).toFixed(1)}`).join("");
  const onMove = (e: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD.l || px > W - PAD.r) return setHover(null);
    const t = (px - PAD.l) / (W - PAD.l - PAD.r);
    const loss = Math.pow(10, Math.log10(scale.lo) + t * (Math.log10(scale.hi) - Math.log10(scale.lo)));
    const pt = current.find((d) => d.loss >= loss) ?? current[current.length - 1]!;
    setHover({ x: px, loss, p: loss > (current[current.length - 1]?.loss ?? 0) ? 0 : pt.p });
  };

  return (
    <figure className="pt-risk-chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Loss exceedance curve" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={PAD.l} x2={W - PAD.r} y1={scale.y(p)} y2={scale.y(p)} className="pt-risk-chart__grid" />
            <text x={PAD.l - 8} y={scale.y(p) + 3} textAnchor="end" className="pt-risk-chart__tick">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {scale.ticks.map((v, i) => (
          <g key={v}>
            <line x1={scale.x(v)} x2={scale.x(v)} y1={PAD.t} y2={H - PAD.b} className="pt-risk-chart__grid pt-risk-chart__grid--v" />
            <text x={scale.x(v)} y={H - PAD.b + 16} textAnchor={i === scale.ticks.length - 1 ? "end" : "middle"} className="pt-risk-chart__tick">
              {compactAud(v)}
            </text>
          </g>
        ))}
        <path d={path(inherent)} className="pt-risk-chart__line pt-risk-chart__line--inherent" />
        <path d={path(target)} className="pt-risk-chart__line pt-risk-chart__line--target" />
        <path d={path(current)} className="pt-risk-chart__line pt-risk-chart__line--current" />
        {p90 > 0 && (
          <g className="pt-risk-chart__marker">
            <line x1={scale.x(p90)} x2={scale.x(p90)} y1={scale.y(0.1)} y2={H - PAD.b} />
            <circle cx={scale.x(p90)} cy={scale.y(0.1)} r={3.5} />
            <text x={scale.x(p90) + 6} y={scale.y(0.1) - 6}>
              1-in-10 year · {compactAud(p90)}
            </text>
          </g>
        )}
        {hover && (
          <g className="pt-risk-chart__hover">
            <line x1={hover.x} x2={hover.x} y1={PAD.t} y2={H - PAD.b} />
            <circle cx={hover.x} cy={scale.y(hover.p)} r={3} />
          </g>
        )}
      </svg>
      <figcaption className="pt-risk-chart__cap">
        {hover ? (
          <span>
            <b>{pct(hover.p)}</b> chance of losing more than <b>{compactAud(hover.loss)}</b> in a year, with controls in place.
          </span>
        ) : (
          <span className="pt-risk-legend">
            <i className="pt-risk-legend__k pt-risk-legend__k--inherent" /> No controls
            <i className="pt-risk-legend__k pt-risk-legend__k--current" /> Controls in place
            <i className="pt-risk-legend__k pt-risk-legend__k--target" /> With planned &amp; proposed
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** 5×5 likelihood × consequence matrix. Each scenario sits in its current (controlled) cell. */
export function HeatMap({ rows, selected, onPick }: { rows: RatedScenario[]; selected?: { l: number; c: number } | null; onPick?: (cell: { l: number; c: number } | null) => void }) {
  const cells = new Map<string, RatedScenario[]>();
  for (const r of rows) {
    const k = `${r.likelihood}:${r.consequence}`;
    cells.set(k, [...(cells.get(k) ?? []), r]);
  }
  return (
    <div className="pt-risk-heat" role="grid" aria-label="Risk matrix">
      <div className="pt-risk-heat__ylab">Likelihood</div>
      <div className="pt-risk-heat__grid">
        {[4, 3, 2, 1, 0].map((l) => (
          <div key={l} className="pt-risk-heat__row" role="row">
            <div className="pt-risk-heat__rl">{LIKELIHOOD[l]}</div>
            {[0, 1, 2, 3, 4].map((c) => {
              const list = cells.get(`${l}:${c}`) ?? [];
              const rt = rating(l, c);
              const on = selected && selected.l === l && selected.c === c;
              return (
                <button
                  key={c}
                  role="gridcell"
                  className={`pt-risk-heat__cell ${hueClass(RATING_HUE[rt]!)} pt-risk-heat__cell--${rt.toLowerCase()}${on ? " is-on" : ""}`}
                  aria-label={`${LIKELIHOOD[l]}, ${CONSEQUENCE[c]}: ${list.length} ${list.length === 1 ? "scenario" : "scenarios"} (${rt})`}
                  title={list.map((r) => r.s.name).join("\n") || rt}
                  onClick={() => onPick?.(on ? null : { l, c })}
                  disabled={!list.length}
                >
                  {list.length > 0 && <span className="pt-risk-heat__n">{list.length}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="pt-risk-heat__row pt-risk-heat__row--foot">
          <div />
          {CONSEQUENCE.map((c) => (
            <div key={c} className="pt-risk-heat__cl" title={c}>
              {c === "Insignificant" ? "Insignif." : c}
            </div>
          ))}
        </div>
      </div>
      <div className="pt-risk-heat__xlab">Consequence of a typical event</div>
    </div>
  );
}

/** Expected annual loss by domain: faint bar without controls, solid bar with, tick for the target. */
export function DomainBars({ byDomain }: { byDomain: Record<Domain, { inherent: number; current: number; target: number; count: number }> }) {
  const max = Math.max(1, ...DOMAINS.map((k) => byDomain[k].inherent));
  return (
    <div className="pt-risk-dom">
      {DOMAINS.map((k) => {
        const b = byDomain[k];
        return (
          <div key={k} className={`pt-risk-dom__row ${hueClass(DOMAIN_HUE[k])}`}>
            <div className="pt-risk-dom__label">
              <span className="pt-chip__dot" />
              {DOMAIN_LABEL[k]}
              <span className="pt-meta">{b.count}</span>
            </div>
            <div className="pt-risk-dom__track">
              <span className="pt-risk-dom__inh" style={{ width: `${(b.inherent / max) * 100}%` }} />
              <span className="pt-risk-dom__cur" style={{ width: `${(b.current / max) * 100}%` }} />
              {b.target < b.current && <span className="pt-risk-dom__tgt" style={{ left: `${(b.target / max) * 100}%` }} title={`Target ${compactAud(b.target)}`} />}
            </div>
            <div className="pt-risk-dom__v">{compactAud(b.current)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A range shown as a thin bar: low to high, with the most-likely value marked. */
export function RangeBar({ low, typical, high, max, format }: { low: number; typical: number; high: number; max: number; format: (n: number) => string }) {
  const f = (v: number) => `${Math.min(100, (Math.log10(1 + v) / Math.log10(1 + max)) * 100)}%`;
  return (
    <span className="pt-risk-range" title={`${format(low)} – ${format(high)}, most likely ${format(typical)}`}>
      <span className="pt-risk-range__bar" style={{ left: f(low), width: `calc(${f(high)} - ${f(low)})` }} />
      <span className="pt-risk-range__mode" style={{ left: f(typical) }} />
    </span>
  );
}
