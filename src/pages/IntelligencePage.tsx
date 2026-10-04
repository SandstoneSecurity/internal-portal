import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Crosshair, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { IntelItem, StatusKind } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { Empty } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { addDays } from "../lib/format";
import { INTEL_KINDS, intelKind } from "../lib/intel";
import { tween, DUR } from "../lib/motion";
import { useSelection } from "../lib/selection";

const IntelMap = lazy(() => import("../components/IntelMap"));

type Filter = "all" | StatusKind;

const sydneyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });

/** Today, Yesterday or Earlier, from when the item was logged. */
function dayGroup(item: IntelItem, today: string): "Today" | "Yesterday" | "Earlier" {
  if (!item.createdAt) return "Earlier";
  const day = sydneyDay.format(new Date(item.createdAt));
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return "Earlier";
}

export function IntelligencePage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [itemParam, setItemParam] = useSelection("item");
  // Brings the chosen item's pin into view on the map.
  const [focus, setFocus] = useState<{ id: number | null; n: number }>({ id: null, n: 0 });
  // The item whose pin is being placed by clicking the map.
  const [placing, setPlacing] = useState<IntelItem | null>(null);

  const select = (id: number, fromMap = false) => {
    setItemParam(id);
    if (!fromMap) setFocus((f) => ({ id, n: f.n + 1 }));
  };

  const q = query.trim().toLowerCase();
  const shown = d.feed.filter(
    (f) => (filter === "all" || f.kind === filter) && (!q || `${f.headline} ${f.source} ${f.place} ${f.region}`.toLowerCase().includes(q))
  );
  const selId = d.feed.some((f) => f.id === itemParam) ? itemParam : null;

  useEffect(() => {
    if (itemParam !== null) document.querySelector(`[data-record="intel-${itemParam}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [itemParam]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: d.feed.length };
    for (const k of INTEL_KINDS) c[k.kind] = d.feed.filter((f) => f.kind === k.kind).length;
    return c;
  }, [d.feed]);

  const pins = shown.flatMap((f) =>
    f.pin ? [{ id: f.id, lat: f.pin.lat, lng: f.pin.lng, kind: f.kind, title: f.headline.length > 90 ? `${f.headline.slice(0, 88)}…` : f.headline }] : []
  );

  const groups = (["Today", "Yesterday", "Earlier"] as const)
    .map((label) => ({ label, items: shown.filter((f) => dayGroup(f, d.today) === label) }))
    .filter((g) => g.items.length);

  // Up and Down move through the list.
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const ordered = groups.flatMap((g) => g.items);
    const i = ordered.findIndex((f) => f.id === selId);
    const next = ordered[Math.max(0, Math.min(ordered.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      select(next.id);
      document.querySelector<HTMLElement>(`[data-record="intel-${next.id}"]`)?.focus();
    }
  };

  const place = async (lat: number, lng: number) => {
    if (!placing) return;
    const item = placing;
    setPlacing(null);
    await actions.moveIntel(item, { lat, lng });
  };

  return (
    <div className="pt-intel">
      <div className="pt-panel pt-intel__map">
        <Suspense fallback={<div className="pt-imap pt-imap--loading" aria-hidden />}>
          <IntelMap
            pins={pins}
            selectedId={selId}
            onSelect={(id) => select(id, true)}
            focus={focus}
            placing={placing ? (placing.place || placing.headline.slice(0, 40) + (placing.headline.length > 40 ? "…" : "")) : null}
            onPlace={(lat, lng) => void place(lat, lng)}
            onCancelPlace={() => setPlacing(null)}
          />
        </Suspense>
      </div>

      <section className="pt-ifeed" aria-label="Intelligence feed">
        <header className="pt-ifeed__head">
          <div className="pt-ifeed__title">
            <span className="pt-eyebrow">Feed</span>
            <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => actions.logIntel({ kind: filter === "all" ? undefined : filter })}>
              <Plus size={14} /> Log item
            </button>
          </div>
          <div className="pt-ifeed__filters" role="radiogroup" aria-label="Show">
            <button type="button" role="radio" aria-checked={filter === "all"} className="pt-ifeed__filter" onClick={() => setFilter("all")}>
              All <span className="pt-ifeed__n">{counts.all}</span>
            </button>
            {INTEL_KINDS.map(({ kind, label, short, icon: Icon }) => (
              <button key={kind} type="button" role="radio" aria-checked={filter === kind} aria-label={`${label}: ${counts[kind] ?? 0}`} className={`pt-ifeed__filter is-${kind}`} onClick={() => setFilter(filter === kind ? "all" : kind)}>
                <span className="pt-ifeed__glyph" aria-hidden>
                  <Icon size={11} strokeWidth={2.25} />
                </span>
                {short} <span className="pt-ifeed__n">{counts[kind] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="pt-ifeed__search">
            <Search size={14} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports, places and sources" aria-label="Search the feed" />
            {query && (
              <button type="button" className="pt-iconbtn pt-iconbtn--sm" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </label>
        </header>

        {d.feed.length === 0 ? (
          <Empty
            index="00"
            title="Nothing logged yet."
            body="Log incidents, news and opportunities as they come in. Each one is pinned on the map at the suburb it names."
            action={
              <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.logIntel()}>
                Log an item
              </button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="pt-ifeed__none">
            {q ? `Nothing matches “${query.trim()}”.` : `No ${intelKind(filter as StatusKind).plural} logged.`}{" "}
            <button
              className="pt-addlink"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Show everything
            </button>
          </p>
        ) : (
          <div className="pt-ifeed__list" onKeyDown={onListKey}>
            {groups.map((g) => (
              <div key={g.label} className="pt-ifeed__group">
                <div className="pt-ifeed__day">
                  {g.label} <span>{g.items.length}</span>
                </div>
                <AnimatePresence initial={false}>
                  {g.items.map((f) => (
                    <FeedItem
                      key={f.id}
                      item={f}
                      on={f.id === selId}
                      onSelect={() => select(f.id)}
                      onShow={() => setFocus((x) => ({ id: f.id, n: x.n + 1 }))}
                      onPlace={() => {
                        select(f.id);
                        setPlacing(f);
                      }}
                      placing={placing?.id === f.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FeedItem({ item: f, on, onSelect, onShow, onPlace, placing }: { item: IntelItem; on: boolean; onSelect: () => void; onShow: () => void; onPlace: () => void; placing: boolean }) {
  const actions = useActions();
  const k = intelKind(f.kind);
  const Icon = k.icon;
  const exact = f.pin?.how === "pinned";
  const where = f.place || (f.pin?.how === "suburb" ? f.pin.label : `${f.pin?.label ?? f.region} region`);
  const whereTitle = exact ? "Pinned at this spot" : f.pin?.how === "suburb" ? `Placed at ${f.pin.label}; pin the exact spot to move it` : "Placed at its region; add a suburb or pin the exact spot";
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}
      exit={{ opacity: 0, transition: tween(DUR.fast) }}
      className={`pt-ifeed__item is-${f.kind}${on ? " is-on" : ""}`}
      data-record={`intel-${f.id}`}
      aria-selected={on}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="pt-ifeed__glyph pt-ifeed__glyph--lg" title={k.label} aria-hidden>
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <div className="pt-ifeed__body">
        <div className="pt-ifeed__meta">
          <span className="pt-ifeed__kind">{k.label}</span>
          <span>{f.time}</span>
          <span className={`pt-ifeed__where${f.pin?.how === "region" ? " is-rough" : ""}`} title={whereTitle}>
            {exact ? <MapPin size={10} aria-hidden /> : null}
            {where}
          </span>
        </div>
        <div className="pt-ifeed__text">
          <strong style={{ display: "block" }}>{f.headline.split(/\r?\n/)[0]}</strong>
          {f.headline.split(/\r?\n/).slice(1).join("\n").trim().split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
            <p key={index} style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>{paragraph}</p>
          ))}
        </div>
        <div className="pt-ifeed__src">
          {/^https?:\/\//i.test(f.source) ? (
            <a href={f.source} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>View reference</a>
          ) : f.source}
        </div>
        {on && (
          <div className="pt-ifeed__actions" onClick={(e) => e.stopPropagation()}>
            <button className="pt-ifeed__act" onClick={onShow}>
              <MapPin size={12} /> Show on map
            </button>
            <button className={`pt-ifeed__act${placing ? " is-active" : ""}`} onClick={onPlace} aria-pressed={placing}>
              <Crosshair size={12} /> {exact ? "Move pin" : "Pin exact spot"}
            </button>
            {exact && (
              <button className="pt-ifeed__act" onClick={() => void actions.moveIntel(f, null)}>
                Unpin
              </button>
            )}
            <span className="pt-ifeed__spacer" />
            <button className="pt-ifeed__act" onClick={() => actions.logIntel({ item: f })}>
              <Pencil size={12} /> Edit
            </button>
            <button className="pt-ifeed__act pt-ifeed__act--danger" onClick={() => void actions.deleteIntel(f)} aria-label="Remove from feed">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
}
