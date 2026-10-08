import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Gauge, Layers, Plus } from "lucide-react";
import { analyseTimeline, duration, type CaseDetail, type CaseEvent, type TimelineFinding } from "../../../shared/investigations";
import { Empty } from "../../components/ui/Bits";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabel = (t: string) => {
  const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const hm = (t: string) => t.slice(11, 16);
const ms = (t: string) => Date.parse(`${t}:00Z`);

/** What the timeline tests found, by event. */
function findingsBy(findings: TimelineFinding[]) {
  const by = new Map<number, TimelineFinding[]>();
  const add = (id: number, f: TimelineFinding) => by.set(id, [...(by.get(id) ?? []), f]);
  for (const f of findings) {
    if (f.type === "overlap") add(f.a, f), add(f.b, f);
    if (f.type === "conflict") add(f.claim, f), add(f.documented, f);
    if (f.type === "travel") add(f.to, f);
  }
  return by;
}

/**
 * The timeline: documented events and claimed ones in order, with what doesn't add up called out —
 * overlaps, unaccounted gaps, claims that put someone elsewhere at the time, and moves too fast to
 * have happened. The strip at the top shows the whole span at once.
 */
export function TimelineTab({ d, onAdd, onEdit, readOnly }: { d: CaseDetail; onAdd: () => void; onEdit: (e: CaseEvent) => void; readOnly: boolean }) {
  const [who, setWho] = useState<number | "all">("all");
  const [basis, setBasis] = useState<"all" | "Documented" | "Claimed">("all");
  const events = useMemo(
    () => d.events.filter((e) => (who === "all" || e.entityIds.includes(who)) && (basis === "all" || e.basis === basis)),
    [d.events, who, basis]
  );
  const findings = useMemo(() => analyseTimeline(events), [events]);
  const by = findingsBy(findings);
  const gaps = new Map(findings.filter((f): f is Extract<TimelineFinding, { type: "gap" }> => f.type === "gap").map((g) => [g.before, g]));
  const title = (id: number) => d.events.find((e) => e.id === id);
  const ev = (id: number | null) => (id ? d.evidenceItems.find((x) => x.id === id) : undefined);
  const name = (id: number) => d.entities.find((x) => x.id === id)?.name ?? "?";

  if (d.events.length === 0)
    return (
      <Empty
        index="00"
        title="Nothing on the timeline yet."
        body="Add what the evidence shows happened, and what people say happened. Overlaps, unaccounted gaps, claims that conflict with the evidence and moves too fast to be possible are flagged as you go."
        action={
          !readOnly && (
            <button className="sds-btn sds-btn--md sds-btn--primary" onClick={onAdd}>
              Add the first event
            </button>
          )
        }
      />
    );

  const count = (t: TimelineFinding["type"]) => findings.filter((f) => f.type === t).length;
  const t0 = Math.min(...events.map((e) => ms(e.startsAt))), t1 = Math.max(...events.map((e) => ms(e.endsAt ?? e.startsAt)));
  const span = Math.max(t1 - t0, 3_600_000);
  const xOf = (t: string) => ((ms(t) - t0) / span) * 100;
  const days = [...new Set(events.map((e) => e.startsAt.slice(0, 10)))];

  return (
    <div className="pt-tl">
      <div className="pt-tl__bar">
        <div className="pt-tl__filters">
          <label className="pt-tl__pick">
            <span>Whose timeline</span>
            <select value={who} onChange={(e) => setWho(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">Everyone</option>
              {d.entities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pt-tl__seg" role="radiogroup" aria-label="Show">
            {(["all", "Documented", "Claimed"] as const).map((b) => (
              <button key={b} role="radio" aria-checked={basis === b} className="pt-tl__segopt" onClick={() => setBasis(b)}>
                {b === "all" ? "Both" : b}
              </button>
            ))}
          </div>
        </div>
        {!readOnly && (
          <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={onAdd}>
            <Plus size={14} /> Add event
          </button>
        )}
      </div>

      <div className="pt-tl__tests" aria-label="What the timeline tests found">
        <span className={count("conflict") ? "is-breach" : ""}>
          <AlertTriangle size={13} /> {count("conflict")} {count("conflict") === 1 ? "claim conflicts" : "claims conflict"} with the evidence
        </span>
        <span className={count("travel") ? "is-breach" : ""}>
          <Gauge size={13} /> {count("travel")} impossible {count("travel") === 1 ? "move" : "moves"}
        </span>
        <span className={count("gap") ? "is-advisory" : ""}>
          <Clock size={13} /> {count("gap")} unaccounted {count("gap") === 1 ? "gap" : "gaps"}
        </span>
        <span>
          <Layers size={13} /> {count("overlap")} {count("overlap") === 1 ? "overlap" : "overlaps"}
        </span>
      </div>

      {/* The whole span at a glance: documented above, claimed below. */}
      <div className="pt-tl__strip" aria-hidden>
        {(["Documented", "Claimed"] as const).map((lane) => (
          <div key={lane} className="pt-tl__lane">
            <span className="pt-tl__lanename">{lane}</span>
            <div className="pt-tl__track">
              {events
                .filter((e) => e.basis === lane)
                .map((e) => (
                  <button
                    key={e.id}
                    tabIndex={-1}
                    className={`pt-tl__blip is-${lane.toLowerCase()}${by.get(e.id)?.some((f) => f.type === "conflict" || f.type === "travel") ? " is-flag" : ""}`}
                    style={{ left: `${xOf(e.startsAt)}%`, width: e.endsAt ? `max(4px, ${xOf(e.endsAt) - xOf(e.startsAt)}%)` : undefined }}
                    title={`${e.startsAt.replace("T", " ")} · ${e.title}`}
                    onClick={() => document.querySelector(`[data-event="${e.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                  />
                ))}
            </div>
          </div>
        ))}
        <div className="pt-tl__axis">
          <span>{events[0] ? `${dayLabel(new Date(t0).toISOString())} ${new Date(t0).toISOString().slice(11, 16)}` : ""}</span>
          <span>{duration(span / 60_000)}</span>
          <span>{`${dayLabel(new Date(t1).toISOString())} ${new Date(t1).toISOString().slice(11, 16)}`}</span>
        </div>
      </div>

      {events.length === 0 && <p className="pt-dim" style={{ fontSize: 13 }}>Nothing matches these filters.</p>}
      {days.map((day) => (
        <section key={day} className="pt-tl__day">
          <h3 className="pt-tl__date">{dayLabel(day)}</h3>
          <ol className="pt-tl__list">
            {events
              .filter((e) => e.startsAt.slice(0, 10) === day)
              .map((e) => {
                const gap = gaps.get(e.id);
                const flags = by.get(e.id) ?? [];
                const evidence = ev(e.evidenceId);
                return (
                  <li key={e.id}>
                    {gap && (
                      <div className="pt-tl__gap">
                        <Clock size={12} /> {duration(gap.minutes)} with nothing documented
                      </div>
                    )}
                    <button className={`pt-tl__event is-${e.basis.toLowerCase()}${flags.some((f) => f.type === "conflict" || f.type === "travel") ? " is-flag" : ""}`} data-event={e.id} onClick={() => onEdit(e)} disabled={readOnly}>
                      <span className="pt-tl__time">
                        {hm(e.startsAt)}
                        {e.endsAt && <span className="pt-dim">–{e.endsAt.slice(0, 10) === day ? hm(e.endsAt) : e.endsAt.replace("T", " ")}</span>}
                      </span>
                      <span className="pt-tl__mark" aria-hidden />
                      <span className="pt-tl__body">
                        <span className="pt-tl__head">
                          <span className={`pt-tl__basis is-${e.basis.toLowerCase()}`}>{e.basis}</span>
                          <b>{e.title}</b>
                        </span>
                        <span className="pt-tl__meta">
                          {e.place && <span>{e.place}</span>}
                          {e.entityIds.map((id) => (
                            <span key={id} className="pt-tl__who">
                              {name(id)}
                            </span>
                          ))}
                          {evidence ? <span className="pt-tl__ev">{evidence.ref}</span> : e.basis === "Documented" ? <span className="pt-tl__noev">no evidence linked</span> : null}
                        </span>
                        {e.detail && <span className="pt-tl__detail">{e.detail}</span>}
                        {flags.map((f, i) => {
                          if (f.type === "conflict") {
                            const other = title(f.claim === e.id ? f.documented : f.claim);
                            return (
                              <span key={i} className="pt-tl__flag is-breach">
                                <AlertTriangle size={12} /> {f.claim === e.id ? "Conflicts with" : "Contradicts the claim"} “{other?.title}” at {other ? hm(other.startsAt) : ""}: {f.km} km apart
                              </span>
                            );
                          }
                          if (f.type === "travel") {
                            const from = title(f.from);
                            return (
                              <span key={i} className="pt-tl__flag is-breach">
                                <Gauge size={12} /> {f.km} km from “{from?.title}” in {f.minutes} min{f.kmh > 0 ? ` (${f.kmh} km/h)` : ""}
                              </span>
                            );
                          }
                          if (f.type === "overlap") {
                            const other = title(f.a === e.id ? f.b : f.a);
                            return (
                              <span key={i} className="pt-tl__flag">
                                <Layers size={12} /> Overlaps “{other?.title}”
                              </span>
                            );
                          }
                          return null;
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
