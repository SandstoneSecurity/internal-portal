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

const IntelMap = lazy(() => import("../components/IntelMap"));

const DOT = { breach: "var(--status-breach-dot)", advisory: "var(--status-advisory-dot)", info: "var(--status-info-dot)", secure: "var(--status-secure-dot)", neutral: "var(--status-neutral-dot)" } as const;
const SEVERITY_ORDER = ["breach", "advisory", "info"] as const;
const FILTERS = ["All", "Breach", "Advisory", "Information"] as const;

export function IntelligencePage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [region, setRegionState] = useState<string | null>(null);
  const [itemParam, setItemParam] = useSelection("item");
  // Moves the map: to a region when one is picked or an item opened, back to the whole state when cleared.
  const [focus, setFocus] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  const setRegion = (key: string | null) => {
    setRegionState(key);
    setFocus((f) => ({ key, n: f.n + 1 }));
  };
  const setItem = (id: number) => {
    setItemParam(id);
    const key = d.feed.find((f) => f.id === id)?.regionKey ?? null;
    if (key) setFocus((f) => ({ key, n: f.n + 1 }));
  };

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
    return { key: r.key, label: r.label, lat: r.lat, lng: r.lng, anchor: r.anchor, count: items.length, worst, on: sel?.regionKey === r.key || region === r.key };
  });
  const regionLabel = d.regions.find((r) => r.key === region)?.label;

  return (
    <div className="pt-split pt-split--wide">
      <div className="pt-panel" style={{ padding: "22px 24px" }}>
        <div className="pt-panel__head">
          <span className="pt-eyebrow">New South Wales — monitored activity</span>
          <span className="pt-meta">{d.regions.length} regions</span>
        </div>
        <Suspense fallback={<div className="pt-imap pt-imap--loading" aria-hidden />}>
          <IntelMap markers={markers} focus={focus} onRegion={(key) => setRegion(region === key ? null : key)} />
        </Suspense>
        <div className="pt-legend" style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          {(["breach", "advisory", "info"] as const).map((k) => (
            <span key={k}>
              <i style={{ width: 8, height: 8, borderRadius: 999, background: DOT[k] }} />
              {k === "info" ? "INFORMATION" : k.toUpperCase()} {counts[k === "breach" ? "Breach" : k === "advisory" ? "Advisory" : "Information"]}
            </span>
          ))}
          <span className="pt-hide-sm" style={{ marginLeft: "auto" }}>DRAG TO MOVE · CTRL + SCROLL TO ZOOM · SELECT A REGION TO FILTER</span>
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
