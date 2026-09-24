import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { pad2 } from "../lib/format";
import { list, row, tween, DUR } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";

const SurveyField = lazy(() => import("../components/SurveyField"));

const VIEWBOX = "0 -10 760 620";
const NSW_PATH =
  "M 5.8 63 L 466.9 59.9 L 495 45 L 527.8 34.6 L 552 50 L 580 56.7 L 610 50 L 643.8 44.1 L 672.8 22 L 713.4 15.8 L 733.7 10 L 738.3 40.3 L 722 90 L 713 126 L 709.9 144.9 L 698.9 189 L 696 216 L 675.7 252 L 655.4 296 L 632.2 310.6 L 614.8 333.9 L 603.2 368.6 L 585.8 384.3 L 580 404.5 L 577 441 L 539.4 485.1 L 527.8 522.9 L 524.9 560.7 L 526.6 598.5 L 423.4 554.4 L 377 510.3 L 319 510.3 L 266.8 497.7 L 234.9 510.3 L 203 491.4 L 156.6 459.9 L 139.2 422.1 L 87 425.3 L 40.6 390.6 L 5.8 379.3 Z";
const ACT_PATH = "M 469.8 465 L 490 452 L 500 470 L 496 500 L 478 505 L 466 488 Z";

// The relief is clipped to the state's outline with a mask built from the same path.
const MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${VIEWBOX}' preserveAspectRatio='none'><path d='${NSW_PATH}' fill='black'/></svg>`
)}")`;

const DOT = { breach: "var(--status-breach-dot)", advisory: "var(--status-advisory-dot)", info: "var(--status-info-dot)", secure: "var(--status-secure-dot)", neutral: "var(--status-neutral-dot)" } as const;
const SEVERITY_ORDER = ["breach", "advisory", "info"] as const;
const FILTERS = ["All", "Breach", "Advisory", "Information"] as const;

export function IntelligencePage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [region, setRegion] = useState<string | null>(null);
  const [itemParam, setItem] = useSelection("item");

  const shown = d.feed.filter((f) => (filter === "All" || f.sev === filter) && (!region || f.regionKey === region));
  const selId = d.feed.some((f) => f.id === itemParam) ? itemParam : shown[0]?.id ?? null;
  const sel = d.feed.find((f) => f.id === selId);

  useEffect(() => {
    if (itemParam !== null) document.querySelector(`[data-record="intel-${itemParam}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [itemParam]);

  const counts = useMemo(
    () => ({
      All: d.feed.length,
      Breach: d.feed.filter((f) => f.kind === "breach").length,
      Advisory: d.feed.filter((f) => f.kind === "advisory").length,
      Information: d.feed.filter((f) => f.kind === "info").length,
    }),
    [d.feed]
  );

  const markers = d.regions.map((r) => {
    const items = d.feed.filter((f) => f.regionKey === r.key);
    const worst = SEVERITY_ORDER.find((k) => items.some((f) => f.kind === k));
    return { ...r, items, worst, on: sel?.regionKey === r.key || region === r.key };
  });
  const regionLabel = d.regions.find((r) => r.key === region)?.label;

  return (
    <div className="pt-split pt-split--wide">
      <div className="pt-panel" style={{ padding: "22px 24px" }}>
        <div className="pt-panel__head">
          <span className="pt-eyebrow">New South Wales — monitored activity</span>
          <span className="pt-meta">{d.regions.length} regions</span>
        </div>
        <div className="pt-map">
          <svg viewBox={VIEWBOX} aria-hidden>
            <path d={NSW_PATH} fill="var(--surface-sunken)" />
          </svg>
          <div className="pt-map__relief" style={{ maskImage: MASK, WebkitMaskImage: MASK, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}>
            <Suspense fallback={null}>
              <SurveyField density={7} scale={2.1} seed={11.4} />
            </Suspense>
          </div>
          <svg viewBox={VIEWBOX} style={{ position: "absolute", inset: 0 }} role="group" aria-label="Regions">
            <path d={NSW_PATH} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} strokeLinejoin="round" />
            <path d={ACT_PATH} fill="var(--surface-accent)" stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
            {markers.map((m) => (
              <g
                key={m.key}
                className="pt-map__marker"
                role="button"
                tabIndex={0}
                aria-label={`${m.label}: ${m.items.length} items. Filter the feed to this region.`}
                onClick={() => setRegion(region === m.key ? null : m.key)}
                onKeyDown={(e) => registerKeys(e as unknown as React.KeyboardEvent<HTMLElement>, () => setRegion(region === m.key ? null : m.key))}
              >
                {m.worst === "breach" && <circle className="pt-map__ping" cx={m.x} cy={m.y} r={6} fill="none" stroke={DOT.breach} strokeWidth={1.2} />}
                <motion.circle
                  cx={m.x}
                  cy={m.y}
                  fill="none"
                  stroke="var(--brass-500)"
                  strokeWidth={1.5}
                  initial={false}
                  animate={{ r: m.on ? 12 : 5, opacity: m.on ? 1 : 0 }}
                  transition={tween(DUR.slow)}
                />
                <circle cx={m.x} cy={m.y} r={m.items.length ? 5.5 : 3.5} fill={m.worst ? DOT[m.worst] : "var(--border-strong)"} stroke="var(--surface-raised)" strokeWidth={1.5} />
              </g>
            ))}
          </svg>
          {markers.map((m) => (
            <span
              key={m.key}
              className="pt-map__label"
              onClick={() => setRegion(region === m.key ? null : m.key)}
              style={{
                left: `${(((m.x + m.dx) / 760) * 100).toFixed(2)}%`,
                top: `${(((m.y + m.dy + 10) / 620) * 100).toFixed(2)}%`,
                transform: m.anchor === "end" ? "translate(-100%,-50%)" : "translate(0,-50%)",
                color: m.on ? "var(--text-primary)" : undefined,
              }}
            >
              {m.label.toUpperCase()}
              {m.items.length > 0 && <span className="pt-dim"> · {m.items.length}</span>}
            </span>
          ))}
          <span className="pt-map__label" style={{ left: "63.5%", top: "79%", background: "none" }}>
            ACT
          </span>
        </div>
        <div className="pt-legend" style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          {(["breach", "advisory", "info"] as const).map((k) => (
            <span key={k}>
              <i style={{ width: 8, height: 8, borderRadius: 999, background: DOT[k] }} />
              {k === "info" ? "INFORMATION" : k.toUpperCase()} {counts[k === "breach" ? "Breach" : k === "advisory" ? "Advisory" : "Information"]}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>SELECT A REGION TO FILTER</span>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <Tabs id="intel" tabs={FILTERS} value={filter} onChange={setFilter} counts={counts} />
        <SectionHead
          title="Feed"
          meta={
            regionLabel ? (
              <button className="pt-tag" onClick={() => setRegion(null)} style={{ cursor: "pointer", gap: 4, background: "none" }} aria-label={`Clear ${regionLabel} filter`}>
                {regionLabel} <X size={10} />
              </button>
            ) : (
              `${pad2(shown.length)} items`
            )
          }
          action={
            <button className="pt-addlink" onClick={() => actions.logIntel({ regionKey: region ?? undefined })}>
              + Log
            </button>
          }
        />
        {d.feed.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <Empty
              index="00"
              title="Nothing logged yet."
              body="Log patrol reports, police media and other sources as they come in. Each item is placed on the map by region and graded breach, advisory or information."
              action={
                <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.logIntel()}>
                  Log an item
                </button>
              }
            />
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: "16px 12px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>Nothing matches this filter.</div>
        ) : (
          <motion.div variants={list} initial="initial" animate="animate" key={`${filter}-${region}`}>
            <AnimatePresence initial={false}>
              {shown.map((f) => (
                <motion.div
                  key={f.id}
                  variants={row}
                  exit={{ opacity: 0, transition: tween(DUR.fast) }}
                  className="pt-feed__item"
                  data-record={`intel-${f.id}`}
                  aria-selected={f.id === selId}
                  tabIndex={0}
                  onClick={() => setItem(f.id)}
                  onKeyDown={(e) => registerKeys(e, () => setItem(f.id))}
                >
                  <div className="pt-feed__meta">
                    <span className="pt-mono pt-dim" style={{ fontSize: 10.5 }}>
                      {f.time}
                    </span>
                    <Badge kind={f.kind} label={f.sev} pulse={f.kind === "breach" && f.id === selId} />
                    <span className="pt-meta" style={{ marginLeft: "auto" }}>
                      {f.region}
                    </span>
                    <RowMenu items={[{ label: "Remove from feed", onSelect: () => void actions.deleteIntel(f), danger: true }]} />
                  </div>
                  <div className="pt-feed__head">{f.headline}</div>
                  <div className="pt-feed__src">{f.source}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
