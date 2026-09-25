import { motion } from "motion/react";
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { CountUp, Empty, Measure, SectionHead } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { daysBetween, firstName, greeting, isoWeek, longDate, pad2, relativeTime, sydneyTime } from "../lib/format";
import { list, row } from "../lib/motion";
import { registerKeys } from "../lib/selection";

// three.js loads in its own chunk, after the page has painted.
const SurveyField = lazy(() => import("../components/SurveyField"));

const NOTE_COLOR = {
  neutral: "var(--text-tertiary)",
  breach: "var(--status-breach-fg)",
  advisory: "var(--status-advisory-fg)",
  secure: "var(--status-secure-fg)",
  info: "var(--status-info-fg)",
} as const;

const BRIEF_COLOR = {
  breach: "var(--clay-100)",
  advisory: "var(--ochre-400)",
  info: "var(--slate-100)",
  secure: "var(--euc-300)",
  neutral: "var(--bark-200)",
} as const;

export function ControlPage() {
  const d = usePortal();
  const actions = useActions();
  const navigate = useNavigate();

  const cards = d.opsColumns.flatMap((c) => c.cards.map((k) => ({ ...k, column: c.label, done: c.done })));
  const open = cards
    .filter((c) => !c.done)
    .sort((a, b) => Number(b.late) - Number(a.late) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const late = open.filter((c) => c.late);
  const onShift = d.employees.filter((e) => e.status === "On shift");
  const expiring = d.employees
    .filter((e) => e.expirySoon)
    .sort((a, b) => (a.expDate ?? "9").localeCompare(b.expDate ?? "9"));
  const brief = d.feed.slice(0, 4);
  const empty = !d.employees.length && !d.clients.length && !cards.length && !d.feed.length;

  const ratio: Record<string, [number, "secure" | "ink" | "breach" | "advisory"]> = {
    shift: [d.employees.length ? onShift.length / d.employees.length : 0, "secure"],
    sites: [d.clients.length ? d.clients.filter((c) => c.status === "Customer").length / d.clients.length : 0, "ink"],
    work: [open.length ? late.length / open.length : 0, "breach"],
    licences: [d.employees.length ? expiring.length / d.employees.length : 0, "advisory"],
  };
  const target: Record<string, string> = { shift: "/employees", sites: "/clients", work: "/operations", licences: "/employees" };

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <section className="pt-hero">
        <Suspense fallback={null}>
          <SurveyField />
        </Suspense>
        <div className="pt-hero__scrim" />
        <span className="pt-hero__mark" style={{ right: 32, top: 20 }} aria-hidden />
        <span className="pt-hero__mark" style={{ right: 32, bottom: 38 }} aria-hidden />
        <div className="pt-hero__body">
          <span className="pt-eyebrow">Control room</span>
          <div className="pt-hero__date">
            {longDate(d.today)} · week {pad2(isoWeek(d.today))} · Sydney {sydneyTime()}
          </div>
          <h2 className="pt-hero__title">
            {greeting()}
            {firstName(d.me.email) ? `, ${firstName(d.me.email)}` : ""}.
          </h2>
          {empty ? (
            <>
              <p className="pt-hero__lede">
                The ledger is empty. Every figure on this page is calculated from the records you keep — start with your people and
                your accounts.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.addEmployee}>
                  Add employee
                </button>
                <button className="sds-btn sds-btn--md sds-btn--secondary" onClick={actions.newClient}>
                  Create company
                </button>
                <button className="sds-btn sds-btn--md sds-btn--ghost" onClick={() => actions.raiseWork()}>
                  Raise work
                </button>
              </div>
            </>
          ) : (
            <p className="pt-hero__lede">
              <b>{onShift.length}</b> of {plural(d.employees.length, "officer is", "officers are")} on shift.{" "}
              <b>{plural(open.length, "work item", "work items")}</b> open
              {late.length ? (
                <>
                  , <b style={{ color: "var(--status-breach-fg)" }}>{late.length} past due</b>
                </>
              ) : null}
              . {expiring.length ? <b>{plural(expiring.length, "licence", "licences")}</b> : "No licences"} due in the next 90 days.
            </p>
          )}
        </div>
        <div className="pt-hero__coords" aria-hidden>
          33°52′S 151°12′E · CONTROL ROOM
        </div>
      </section>

      <motion.div className="pt-metrics" variants={list} initial="initial" animate="animate">
        {d.metrics.map((m) => {
          const [r, tone] = ratio[m.key] ?? [0, "ink"];
          return (
            <motion.button key={m.key} variants={row} className="pt-metric" onClick={() => navigate(target[m.key] ?? "/")}>
              <div className="pt-metric__label">{m.label}</div>
              <div className="pt-metric__figure">
                <CountUp value={m.value} className="pt-metric__value" />
                <span className="pt-metric__unit">{m.unit}</span>
              </div>
              <Measure ratio={r} tone={tone} />
              <div className="pt-metric__note" style={{ color: NOTE_COLOR[m.noteKind] }}>
                {m.note}
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="pt-control">
        <div style={{ minWidth: 0 }}>
          <SectionHead
            title="Work raised"
            meta={`${open.length} open · ${late.length} past due`}
            action={
              <button className="pt-addlink" onClick={() => actions.raiseWork()}>
                + Raise
              </button>
            }
          />
          {open.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <Empty
                compact
                index="00"
                title="No open work items."
                action={
                  <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.raiseWork()}>
                    Raise work
                  </button>
                }
              />
            </div>
          ) : (
            <motion.div className="pt-reg" variants={list} initial="initial" animate="animate">
              {open.slice(0, 8).map((c) => (
                <motion.div
                  key={c.id}
                  variants={row}
                  className="pt-reg__row"
                  style={{ gridTemplateColumns: "70px minmax(0,1fr) minmax(0,160px) 92px 110px" }}
                  tabIndex={0}
                  onClick={() => navigate(`/operations?card=${c.id}`)}
                  onKeyDown={(e) => registerKeys(e, () => navigate(`/operations?card=${c.id}`))}
                >
                  <span className="pt-reg__mono">{c.ref}</span>
                  <span className="pt-reg__text" style={{ color: "var(--text-primary)" }}>
                    {c.title}
                  </span>
                  <span className="pt-reg__sub pt-hide-sm">{c.site || "—"}</span>
                  <span className="pt-reg__mono pt-hide-sm" style={c.late ? { color: "var(--status-breach-fg)" } : undefined}>
                    {c.due || "NO DATE"}
                  </span>
                  <span>{c.late ? <Badge kind="breach" label="Past due" pulse /> : <Badge kind="neutral" label={c.column} />}</span>
                </motion.div>
              ))}
            </motion.div>
          )}

          <div style={{ marginTop: 36 }}>
            <SectionHead title="Recent changes" meta={d.audit.length ? `${d.audit.length} recorded` : undefined} />
            {d.audit.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <Empty compact index="00" title="Changes you make will be recorded here." />
              </div>
            ) : (
              <motion.div className="pt-reg" variants={list} initial="initial" animate="animate">
                {d.audit.slice(0, 6).map((a) => (
                  <motion.div key={a.id} variants={row} className="pt-reg__row" style={{ gridTemplateColumns: "96px minmax(0,1fr)", cursor: "default" }}>
                    <span className="pt-reg__mono pt-dim">{relativeTime(a.at)}</span>
                    <span className="pt-reg__text">{a.summary}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 24 }}>
          <div className="pt-panel pt-panel--ruled">
            <div className="pt-panel__head">
              <span className="pt-eyebrow">Licence expiries</span>
              <span className="pt-meta">Next 90 days</span>
            </div>
            {expiring.length === 0 ? (
              <div style={{ padding: "14px 0 4px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>
                No licences fall due in the next 90 days.
              </div>
            ) : (
              expiring.slice(0, 6).map((e) => {
                const left = e.expDate ? daysBetween(d.today, e.expDate) : null;
                return (
                  <div
                    key={e.id}
                    className="pt-line"
                    style={{ cursor: "pointer" }}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/employees?id=${e.id}`)}
                    onKeyDown={(ev) => registerKeys(ev, () => navigate(`/employees?id=${e.id}`))}
                  >
                    <span style={{ flex: 1 }}>{e.name}</span>
                    <span className="pt-mono pt-dim">{e.cls}</span>
                    <span className="pt-mono" style={{ color: e.expired ? "var(--status-breach-fg)" : "var(--status-advisory-fg)", minWidth: 64, textAlign: "right" }}>
                      {left === null ? e.exp : e.expired ? "EXPIRED" : `${left} DAYS`}
                    </span>
                  </div>
                );
              })
            )}
            <div className="pt-panel__foot">
              <button onClick={() => navigate("/employees")} className="sds-btn sds-btn--sm sds-btn--secondary">
                Open employee register
              </button>
            </div>
          </div>

          <div className="pt-panel pt-panel--inverse">
            <div className="pt-panel__head">
              <span className="pt-eyebrow">Intelligence</span>
              <span className="pt-meta" style={{ color: "var(--bark-300)" }}>
                Latest {brief.length}
              </span>
            </div>
            {brief.length === 0 ? (
              <div style={{ padding: "14px 0 4px", fontSize: 13, color: "var(--bark-200)" }}>Nothing logged yet.</div>
            ) : (
              brief.map((f) => (
                <div
                  key={f.id}
                  className="pt-brief"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/intelligence?item=${f.id}`)}
                  onKeyDown={(e) => registerKeys(e, () => navigate(`/intelligence?item=${f.id}`))}
                >
                  <div className="pt-brief__meta">
                    <span style={{ color: "var(--bark-300)" }}>{f.time}</span>
                    <span style={{ color: BRIEF_COLOR[f.kind] }}>{f.sev.toUpperCase()}</span>
                    <span style={{ marginLeft: "auto", color: "var(--bark-300)" }}>{f.region}</span>
                  </div>
                  <div className="pt-brief__text">{f.headline.length > 110 ? `${f.headline.slice(0, 110)}…` : f.headline}</div>
                </div>
              ))
            )}
            <div className="pt-panel__foot" style={{ display: "flex", gap: 8 }}>
              <button onClick={() => navigate("/intelligence")} className="sds-btn sds-btn--sm sds-btn--outline-inverse">
                Open intelligence
              </button>
              <button onClick={() => actions.logIntel()} className="sds-btn sds-btn--sm sds-btn--outline-inverse" style={{ borderColor: "transparent" }}>
                Log an item
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
