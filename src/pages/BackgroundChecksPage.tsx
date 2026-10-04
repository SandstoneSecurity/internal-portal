import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { CHECK_RESULTS, CHECK_TYPES, appliesTo, checkType, type BackgroundCheck } from "../../shared/checks";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, Measure, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { EditableText } from "../components/ui/EditableText";
import { usePortal } from "../lib/DataProvider";
import { matches } from "../lib/format";
import { list, row, swap } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";

const FILTERS = ["Open", "Need consent", "Ready", "Flagged", "All"] as const;
type Filter = (typeof FILTERS)[number];
const COLS = "64px minmax(0,1.5fr) minmax(0,1fr) 74px 62px 136px 34px";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "2026-10-14" or an ISO timestamp → "14 OCT 26" (Sydney day for timestamps). */
function day(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.length > 10 ? new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(iso)) : iso;
  const [y, m, dd] = d.split("-");
  return `${dd} ${MONTHS[Number(m) - 1]} ${y!.slice(2)}`;
}

const done = (c: BackgroundCheck) => c.items.filter((i) => i.result !== "pending").length;
const flagged = (c: BackgroundCheck) => c.items.some((i) => i.result === "flag");

function inFilter(c: BackgroundCheck, f: Filter): boolean {
  if (f === "All") return true;
  if (f === "Open") return !c.closedAt;
  if (f === "Flagged") return flagged(c);
  if (f === "Need consent") return c.status === "Awaiting consent";
  return c.status === "Ready to report";
}

function CheckFile({ c }: { c: BackgroundCheck }) {
  const actions = useActions();
  const d = usePortal();
  const n = done(c);
  const available = CHECK_TYPES.filter((t) => appliesTo(t, c.subjectKind) && !c.items.some((i) => i.kind === t.key));
  const needsConsent = c.subjectKind === "Individual";
  return (
    <div className="pt-file__pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="pt-eyebrow">File {c.ref}</span>
        <Badge kind={c.statusKind} label={c.status} />
      </div>
      <div className="pt-file__title">{c.subject}</div>
      <div className="pt-file__sub">
        {c.subjectKind === "Company" ? "Company" : "Person"} · {c.purpose} · for {c.client || "a former client"}
      </div>

      {needsConsent && (
        <div className={`pt-bgc__consent${c.consentDate ? " is-ok" : ""}`}>
          {c.consentDate ? (
            <>
              <span>Signed consent received {day(c.consentDate)}</span>
              {!c.closedAt && (
                <button className="pt-addlink" onClick={() => void actions.patchCheck(c, { consentDate: null })}>
                  Undo
                </button>
              )}
            </>
          ) : (
            <>
              <span title="Checks on a person don't start without their signed consent.">Waiting on signed consent.</span>
              <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => void actions.patchCheck(c, { consentDate: d.today })}>
                Consent received
              </button>
            </>
          )}
        </div>
      )}

      <div className="pt-file__block">
        <div className="pt-file__blockhead">
          <span className="pt-meta">
            Checks · {n} of {c.items.length} done
          </span>
          {c.outcome && <Badge kind={c.outcomeKind} label={c.outcome} />}
        </div>
        <Measure ratio={c.items.length ? n / c.items.length : 0} tone={flagged(c) ? "breach" : n === c.items.length && n ? "secure" : "brass"} />
        <ul className="pt-bgc__items">
          {c.items.map((i) => {
            const t = checkType(i.kind);
            return (
              <li key={i.id} className={`pt-bgc__item is-${i.result}`}>
                <div className="pt-bgc__itemhead">
                  <div style={{ minWidth: 0 }}>
                    <div className="pt-bgc__label">{t.label}</div>
                    <div className="pt-bgc__source">{t.source}</div>
                  </div>
                  {!c.closedAt && (
                    <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Remove ${t.label}`} title="Remove this check" onClick={() => void actions.removeCheckItem(c, i)}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="pt-bgc__results" role="radiogroup" aria-label={`${t.label} result`}>
                  {CHECK_RESULTS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={i.result === key}
                      className={`pt-bgc__result is-${key}`}
                      disabled={!!c.closedAt}
                      onClick={() => i.result !== key && void actions.patchCheckItem(c, i, { result: key })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <EditableText
                  className="pt-bgc__finding"
                  value={i.finding}
                  multiline
                  maxLength={2000}
                  placeholder={i.result === "flag" ? "What was found, and its source" : "Finding or reference, e.g. certificate number"}
                  ariaLabel={`${t.label} finding`}
                  onSave={(v) => void actions.patchCheckItem(c, i, { finding: v })}
                />
                {i.completedAt && <div className="pt-bgc__when">{day(i.completedAt)}</div>}
              </li>
            );
          })}
        </ul>
        {c.items.length === 0 && <p className="pt-dim" style={{ fontSize: 12.5, margin: "8px 0 0" }}>No checks on this file yet.</p>}
        {!c.closedAt && available.length > 0 && (
          <label className="pt-bgc__add">
            <span className="pt-addlink">+ Add check</span>
            <select
              value=""
              aria-label="Add a check"
              onChange={(e) => {
                if (e.target.value) void actions.addCheckItem(c, e.target.value);
              }}
            >
              <option value="">Choose a check…</option>
              {available.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="pt-facts">
        <div className="pt-fact">
          <span className="pt-fact__k">Report due</span>
          <span className="pt-fact__v" style={{ color: c.late ? "var(--status-breach-fg)" : undefined }}>
            {day(c.dueDate)}
            {c.late ? " · LATE" : ""}
          </span>
        </div>
        <div className="pt-fact">
          <span className="pt-fact__k">Investigator</span>
          <span className="pt-fact__v">{c.owner || "—"}</span>
        </div>
        <div className="pt-fact">
          <span className="pt-fact__k">Opened</span>
          <span className="pt-fact__v">{day(c.createdAt)}</span>
        </div>
        {c.closedAt && (
          <div className="pt-fact">
            <span className="pt-fact__k">Report sent</span>
            <span className="pt-fact__v">{day(c.closedAt)}</span>
          </div>
        )}
      </div>

      <div className="pt-file__block">
        <span className="pt-meta">Identifying details</span>
        <EditableText
          className="pt-bgc__notes"
          value={c.details}
          multiline
          maxLength={1000}
          placeholder="Date of birth, address, licence number; or ABN/ACN"
          ariaLabel="Identifying details"
          onSave={(v) => void actions.patchCheck(c, { details: v })}
        />
      </div>
      <div className="pt-file__block">
        <span className="pt-meta">Notes</span>
        <EditableText
          className="pt-bgc__notes"
          value={c.notes}
          multiline
          maxLength={4000}
          placeholder="Scope agreed with the client, anything to watch for"
          ariaLabel="Notes"
          onSave={(v) => void actions.patchCheck(c, { notes: v })}
        />
      </div>

      <div className="pt-file__actions">
        {c.closedAt ? (
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => void actions.patchCheck(c, { closed: false })}>
            Reopen file
          </button>
        ) : (
          <button
            className="sds-btn sds-btn--sm sds-btn--primary"
            disabled={c.status !== "Ready to report"}
            title={c.status === "Ready to report" ? undefined : "Every check needs a result first"}
            onClick={() => void actions.patchCheck(c, { closed: true })}
          >
            Mark report sent
          </button>
        )}
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => actions.editCheck(c)}>
          Edit file
        </button>
      </div>
    </div>
  );
}

/** Background checks run for clients: a file per person or company, with what each check found. */
export function BackgroundChecksPage() {
  const d = usePortal();
  const actions = useActions();
  const [filter, setFilter] = useState<Filter>("Open");
  const [q, setQ] = useState("");
  const [idParam, setId] = useSelection("check");

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, d.checks.filter((c) => inFilter(c, f)).length])) as Record<Filter, number>, [d.checks]);
  const shown = d.checks.filter((c) => inFilter(c, filter) && matches(q, c.subject, c.client, c.ref, c.purpose, c.owner));
  const selId = d.checks.some((c) => c.id === idParam) ? idParam : shown[0]?.id ?? null;
  const sel = d.checks.find((c) => c.id === selId);

  if (d.checks.length === 0)
    return (
      <Empty
        index="00"
        title="No background checks yet."
        body="Order a check for a client on a person or a company: identity, police, right to work, employment, referees, insolvency, court records, sanctions, media and more. Each file tracks consent, what every check found, and when the report went out."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.orderCheck()}>
            Order a check
          </button>
        }
      />
    );

  return (
    <div className="pt-split pt-bgc">
      <div style={{ minWidth: 0 }}>
        <Tabs
          id="bgc"
          tabs={FILTERS}
          value={filter}
          onChange={setFilter}
          counts={counts}
          trailing={
            <label className="pt-search" style={{ width: 150, height: 30, cursor: "text" }}>
              <Search size={13} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter checks"
                aria-label="Filter background checks"
                style={{ border: 0, outline: 0, background: "transparent", width: "100%", color: "var(--text-primary)", font: "inherit" }}
              />
            </label>
          }
        />
        <SectionHead title="Background checks" meta={`Showing ${shown.length} of ${d.checks.length}`} />
        <div className="pt-reg">
          <div className="pt-reg__head" style={{ gridTemplateColumns: COLS }}>
            <span>Ref</span>
            <span>Subject</span>
            <span>Client</span>
            <span>Checks</span>
            <span>Due</span>
            <span>Status</span>
            <span />
          </div>
          {shown.length === 0 ? (
            <div style={{ padding: "16px 12px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>Nothing matches this filter.</div>
          ) : (
            <motion.div variants={list} initial="initial" animate="animate" key={filter}>
              {shown.map((c) => (
                <motion.div
                  key={c.id}
                  variants={row}
                  className="pt-reg__row"
                  style={{ gridTemplateColumns: COLS }}
                  aria-selected={c.id === selId}
                  tabIndex={0}
                  data-record={`check-${c.id}`}
                  onClick={() => setId(c.id)}
                  onKeyDown={(ev) => registerKeys(ev, () => setId(c.id))}
                >
                  <span className="pt-reg__mono">{c.ref}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="pt-reg__name" style={{ display: "block" }}>
                      {c.subject}
                    </span>
                    <span className="pt-reg__sub">{c.subjectKind === "Company" ? "Company" : "Person"} · {c.purpose}</span>
                  </span>
                  <span className="pt-reg__text" title={c.client}>{c.client || "—"}</span>
                  <span className="pt-reg__mono" style={{ color: flagged(c) ? "var(--status-breach-fg)" : undefined }}>
                    {done(c)}/{c.items.length}
                    {flagged(c) ? " · FLAG" : ""}
                  </span>
                  <span className="pt-reg__mono" style={{ color: c.late ? "var(--status-breach-fg)" : undefined }}>
                    {c.dueDate ? day(c.dueDate).slice(0, 6) : "—"}
                  </span>
                  <span>
                    <Badge kind={c.statusKind} label={c.status} />
                  </span>
                  <RowMenu
                    items={[
                      { label: "Edit file", onSelect: () => actions.editCheck(c) },
                      ...(c.closedAt
                        ? [{ label: "Reopen file", onSelect: () => void actions.patchCheck(c, { closed: false }) }]
                        : c.status === "Ready to report"
                          ? [{ label: "Mark report sent", onSelect: () => void actions.patchCheck(c, { closed: true }) }]
                          : []),
                      { label: "Delete file", onSelect: () => void actions.deleteCheck(c), danger: true },
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
              <CheckFile c={sel} />
            </motion.div>
          </AnimatePresence>
        </aside>
      )}
    </div>
  );
}
