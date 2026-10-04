import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { pad2 } from "../lib/format";
import { list, row, tween, DUR } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";

const IntelMap = lazy(() => import("../components/IntelMap"));

const FILTERS = ["All", "Breach", "Advisory", "Information"] as const;

export function IntelligencePage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [itemParam, setItem] = useSelection("item");

  const shown = d.feed.filter((f) => filter === "All" || f.sev === filter);
  const selId = d.feed.some((f) => f.id === itemParam) ? itemParam : shown[0]?.id ?? null;

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

  return (
    <div className="pt-split pt-split--wide">
      <div className="pt-panel" style={{ padding: "22px 24px" }}>
        <div className="pt-panel__head">
          <span className="pt-eyebrow">New South Wales</span>
        </div>
        <Suspense fallback={<div className="pt-imap pt-imap--loading" aria-hidden />}>
          <IntelMap />
        </Suspense>
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
              body="Log patrol reports, police media and other sources as they come in. Each item is tagged with its region and graded breach, advisory or information."
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
