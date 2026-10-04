import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { pad2 } from "../lib/format";
import { list, row, tween, DUR } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";
import { intelCategory, intelReport } from "../../shared/intelligence";

const IntelMap = lazy(() => import("../components/IntelMap"));

const FILTERS = ["All", "Opportunity", "Breach", "Advisory", "Information"] as const;

export function IntelligencePage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [itemParam, setItem] = useSelection("item");

  const shown = d.feed.filter((f) => filter === "All" || intelCategory(f) === filter);
  const selId = shown.some((f) => f.id === itemParam) ? itemParam : shown[0]?.id ?? null;

  useEffect(() => {
    if (itemParam !== null) document.querySelector(`[data-record="intel-${itemParam}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [itemParam]);

  const counts = useMemo(
    () => ({
      All: d.feed.length,
      Opportunity: d.feed.filter((f) => intelCategory(f) === "Opportunity").length,
      Breach: d.feed.filter((f) => intelCategory(f) === "Breach").length,
      Advisory: d.feed.filter((f) => intelCategory(f) === "Advisory").length,
      Information: d.feed.filter((f) => intelCategory(f) === "Information").length,
    }),
    [d.feed]
  );

  return (
    <div className="pt-split pt-split--wide">
      <div className="pt-panel" style={{ padding: "22px 24px" }}>
        <div className="pt-panel__head">
          <span className="pt-eyebrow">New South Wales</span>
        </div>
        <Suspense fallback={<div className="pt-imap pt-imap--loading" aria-hidden />}>
          <IntelMap items={shown} regions={d.regions} selectedId={selId} onSelect={setItem} />
        </Suspense>
        <p className="pt-meta" style={{ marginTop: 10 }}>
          Regional markers group the visible feed. They are not exact property or incident locations.
          Select a marker to choose an item.
        </p>
      </div>

      <div style={{ minWidth: 0 }}>
        <Tabs id="intel" tabs={FILTERS} value={filter} onChange={setFilter} counts={counts} />
        <SectionHead
          title="Feed"
          meta={`${pad2(shown.length)} items`}
          action={
            <button className="pt-addlink" onClick={() => actions.logIntel()}>
              + Log
            </button>
          }
        />
        {d.feed.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <Empty
              index="00"
              title="Nothing logged yet."
              body="Log opportunities, patrol reports and police media with their source and region."
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
          <motion.div variants={list} initial="initial" animate="animate" key={filter}>
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
                    <Badge kind={f.kind} label={intelCategory(f)} pulse={f.kind === "breach" && f.id === selId} />
                    <span className="pt-meta" style={{ marginLeft: "auto" }}>
                      {f.region}
                    </span>
                    <RowMenu items={[{ label: "Edit item", onSelect: () => actions.editIntel(f) }, { label: "Remove from feed", onSelect: () => void actions.deleteIntel(f), danger: true }]} />
                  </div>
                  <div className="pt-feed__head">{intelReport(f.headline).headline}</div>
                  {intelReport(f.headline).details.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
                    <p key={index} style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{paragraph}</p>
                  ))}
                  <div className="pt-feed__src">
                    {/^https?:\/\//i.test(f.source) ? (
                      <a href={f.source} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>View source</a>
                    ) : f.source}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
