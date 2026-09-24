import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Employee } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, Measure, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { daysBetween, matches } from "../lib/format";
import { list, row, swap } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";

const FILTERS = ["All", "On shift", "Rostered", "Leave", "Licences due"] as const;
const COLS = "minmax(0,1.4fr) minmax(0,1.3fr) 70px 92px minmax(0,1.2fr) 112px 34px";

function File({ e, today }: { e: Employee; today: string }) {
  const actions = useActions();
  const left = e.expDate ? daysBetween(today, e.expDate) : null;
  const expColor = e.expired ? "var(--status-breach-fg)" : e.expirySoon ? "var(--status-advisory-fg)" : "var(--text-primary)";
  const facts = [
    { k: "Licence", v: `CLASS ${e.cls}` },
    { k: "Licence expiry", v: e.exp, color: expColor },
    { k: "First aid", v: e.firstAid },
    { k: "Assignment", v: e.site.toUpperCase() },
    { k: "Employment", v: e.employmentType },
    { k: "Mobile", v: e.mobile },
  ];
  return (
    <div className="pt-file__pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pt-eyebrow">Personnel file</span>
        <Badge kind={e.kind} label={e.status} />
      </div>
      <div className="pt-file__title">{e.name}</div>
      <div className="pt-file__sub">
        {e.role} · since {e.since}
      </div>

      <div className="pt-file__block">
        <div className="pt-file__blockhead">
          <span className="pt-meta">Licence validity</span>
          <span className="pt-meta" style={{ color: expColor }}>
            {left === null ? e.exp : e.expired ? `EXPIRED ${-left} DAYS AGO` : `${left} DAYS REMAINING`}
          </span>
        </div>
        <Measure
          ratio={left === null ? 0 : e.expired ? 1 : 1 - Math.min(1, left / 365)}
          tone={e.expired ? "breach" : e.expirySoon ? "advisory" : "secure"}
        />
      </div>

      <div className="pt-facts">
        {facts.map((f) => (
          <div key={f.k} className="pt-fact">
            <span className="pt-fact__k">{f.k}</span>
            <span className="pt-fact__v" style={{ color: f.color }}>
              {f.v}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-file__block">
        <div className="pt-file__blockhead">
          <span className="pt-meta">Recent shifts</span>
          <button className="pt-addlink" onClick={() => actions.rosterShift(e)}>
            + Roster
          </button>
        </div>
        {e.shifts.length === 0 ? (
          <div style={{ font: "var(--type-small)", color: "var(--text-tertiary)", padding: "6px 0" }}>No shifts rostered yet.</div>
        ) : (
          e.shifts.slice(0, 5).map((s, i) => (
            <div key={i} className="pt-line pt-mono" style={{ fontSize: 11 }}>
              <span className="pt-dim" style={{ width: 48 }}>
                {s.date}
              </span>
              <span>{s.span}</span>
              <span className="pt-dim" style={{ marginLeft: "auto" }}>
                {s.site}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="pt-file__actions">
        <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.editEmployee(e)}>
          Edit file
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => actions.rosterShift(e)}>
          Roster shift
        </button>
      </div>
    </div>
  );
}

export function EmployeesPage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  const [idParam, setId] = useSelection("id");

  const counts = useMemo(
    () => ({
      All: d.employees.length,
      "On shift": d.employees.filter((e) => e.status === "On shift").length,
      Rostered: d.employees.filter((e) => e.status === "Rostered").length,
      Leave: d.employees.filter((e) => e.status === "Leave").length,
      "Licences due": d.employees.filter((e) => e.expirySoon).length,
    }),
    [d.employees]
  );
  const shown = d.employees.filter(
    (e) =>
      (filter === "All" || (filter === "Licences due" ? e.expirySoon : e.status === filter)) &&
      matches(q, e.name, e.role, e.site, e.cls, e.status)
  );
  const selId = d.employees.some((e) => e.id === idParam) ? idParam : shown[0]?.id ?? null;
  const sel = d.employees.find((e) => e.id === selId);

  if (d.employees.length === 0)
    return (
      <Empty
        index="00"
        title="The personnel register is empty."
        body="Add your licensed officers and head-office staff. Licence expiries are tracked automatically — anyone due within 90 days is flagged on Control."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.addEmployee}>
            Add employee
          </button>
        }
      />
    );

  return (
    <div className="pt-split">
      <div style={{ minWidth: 0 }}>
        <Tabs
          id="emp"
          tabs={FILTERS}
          value={filter}
          onChange={setFilter}
          counts={counts}
          trailing={
            <label className="pt-search" style={{ width: 200, height: 30, cursor: "text" }}>
              <Search size={13} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter register"
                aria-label="Filter the employee register"
                style={{ border: 0, outline: 0, background: "transparent", width: "100%", color: "var(--text-primary)", font: "inherit" }}
              />
            </label>
          }
        />
        <SectionHead title="Employee register" meta={`Showing ${shown.length} of ${d.employees.length}`} />
        <div className="pt-reg">
          <div className="pt-reg__head" style={{ gridTemplateColumns: COLS }}>
            <span>Name</span>
            <span>Role</span>
            <span>Licence</span>
            <span>Expiry</span>
            <span className="pt-hide-sm">Assignment</span>
            <span>Status</span>
            <span />
          </div>
          {shown.length === 0 ? (
            <div style={{ padding: "16px 12px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>No one matches this filter.</div>
          ) : (
            <motion.div variants={list} initial="initial" animate="animate" key={filter}>
              {shown.map((e) => (
                <motion.div
                  key={e.id}
                  variants={row}
                  className="pt-reg__row"
                  style={{ gridTemplateColumns: COLS }}
                  aria-selected={e.id === selId}
                  tabIndex={0}
                  onClick={() => setId(e.id)}
                  onKeyDown={(ev) => registerKeys(ev, () => setId(e.id))}
                >
                  <span className="pt-reg__name">{e.name}</span>
                  <span className="pt-reg__text">{e.role}</span>
                  <span className="pt-reg__mono">{e.cls}</span>
                  <span
                    className="pt-reg__mono"
                    style={{ color: e.expired ? "var(--status-breach-fg)" : e.expirySoon ? "var(--status-advisory-fg)" : undefined }}
                  >
                    {e.exp}
                  </span>
                  <span className="pt-reg__sub pt-hide-sm">{e.site}</span>
                  <span>
                    <Badge kind={e.kind} label={e.status} />
                  </span>
                  <RowMenu
                    items={[
                      { label: "Edit file", onSelect: () => actions.editEmployee(e) },
                      { label: "Roster shift", onSelect: () => actions.rosterShift(e) },
                      { label: "Remove from register", onSelect: () => void actions.removeEmployee(e), danger: true },
                    ]}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {sel && (
        <aside className="pt-file">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={sel.id} variants={swap} initial="initial" animate="animate" exit="exit">
              <File e={sel} today={d.today} />
            </motion.div>
          </AnimatePresence>
        </aside>
      )}
    </div>
  );
}
