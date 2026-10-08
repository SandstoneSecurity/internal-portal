import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lock, Search } from "lucide-react";
import type { CaseSummary } from "../../../shared/investigations";
import { useActions } from "../../actions/ActionHost";
import { Badge } from "../../components/ui/Badge";
import { Empty, SectionHead, Tabs } from "../../components/ui/Bits";
import { usePortal } from "../../lib/DataProvider";
import { matches } from "../../lib/format";
import { list, row } from "../../lib/motion";
import { registerKeys } from "../../lib/selection";
import { CASE_TABS, CaseView, type CaseTab } from "./CaseView";

const FILTERS = ["Open", "Intake", "Active", "Reporting", "Closed", "All"] as const;
type Filter = (typeof FILTERS)[number];
const COLS = "84px minmax(0,1.8fr) minmax(0,1.1fr) 56px 64px 70px 108px";

const inFilter = (c: CaseSummary, f: Filter) => (f === "All" ? true : f === "Open" ? c.status !== "Closed" : c.status === f);

/**
 * Investigations: cases opened on a client's request. The register lists every case you may see; a case
 * holds its instructions, evidence register, link chart, timeline, map, report versions and audit log.
 */
export function InvestigationsPage() {
  const d = usePortal();
  const actions = useActions();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("Open");
  const [q, setQ] = useState("");
  const caseId = Number(params.get("case")) || null;
  const tab = (CASE_TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as CaseTab) : "Overview";

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, d.cases.filter((c) => inFilter(c, f)).length])) as Record<Filter, number>, [d.cases]);

  if (caseId)
    return (
      <CaseView
        id={caseId}
        tab={tab}
        onTab={(t) => setParams({ case: String(caseId), ...(t === "Overview" ? {} : { tab: t }) })}
        onBack={() => setParams({})}
      />
    );

  if (!d.cases.length)
    return (
      <Empty
        index="00"
        title="No investigations yet."
        body="Open a case when a client asks for an investigation. Each case keeps the instructions and lawful basis, an evidence register with files held against their SHA-256, web captures, a link chart, a timeline that tests accounts against the evidence, a map, report versions and an audit log of everything done."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => actions.openCase()}>
            Open a case
          </button>
        }
      />
    );

  const shown = d.cases.filter((c) => inFilter(c, filter) && matches(q, c.ref, c.title, c.client, c.kind, c.lead));
  return (
    <div>
      <Tabs
        id="inv"
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
              placeholder="Filter cases"
              aria-label="Filter cases"
              style={{ border: 0, outline: 0, background: "transparent", width: "100%", color: "var(--text-primary)", font: "inherit" }}
            />
          </label>
        }
      />
      <SectionHead title="Case register" meta={`Showing ${shown.length} of ${d.cases.length}`} />
      <div className="pt-reg">
        <div className="pt-reg__head" style={{ gridTemplateColumns: COLS }}>
          <span>Ref</span>
          <span>Case</span>
          <span>Client</span>
          <span>Lead</span>
          <span>Items</span>
          <span>Due</span>
          <span>Status</span>
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
                tabIndex={0}
                data-record={`case-${c.id}`}
                onClick={() => setParams({ case: String(c.id) })}
                onKeyDown={(ev) => registerKeys(ev, () => setParams({ case: String(c.id) }))}
              >
                <span className="pt-reg__mono">{c.ref}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="pt-reg__name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {c.restricted && <Lock size={12} aria-label="Restricted" />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                  </span>
                  <span className="pt-reg__sub">{c.kind}</span>
                </span>
                <span className="pt-reg__text" title={c.client}>
                  {c.client || "—"}
                </span>
                <span className="pt-reg__mono">{c.lead || "—"}</span>
                <span className="pt-reg__mono">{c.evidence}</span>
                <span className="pt-reg__mono" style={{ color: c.late ? "var(--status-breach-fg)" : undefined }}>
                  {c.dueDate ? c.dueDate.slice(5).split("-").reverse().join("/") : "—"}
                </span>
                <span>
                  <Badge kind={c.statusKind} label={c.status} />
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
