import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building, Layers, Plus } from "lucide-react";
import { CONSEQUENCE, CONTROL_STATUSES, LIKELIHOOD, pertMean, type RatedScenario } from "../../../shared/risk";
import { CONTROL_BY_KEY, DOMAINS, DOMAIN_LABEL, SITE_KINDS, SIZE_LABEL, THREAT_BY_KEY, sizeBand, threatsFor, type Domain, type SiteKind } from "../../../shared/threatLibrary";
import type { TmControl } from "../../../shared/types";
import { useActions } from "../../actions/ActionHost";
import { useThreatActions } from "../../actions/threatActions";
import { Empty, SectionHead, Tabs } from "../../components/ui/Bits";
import { Modal } from "../../components/ui/Overlay";
import { usePortal } from "../../lib/DataProvider";
import { friendlyDate } from "../../lib/format";
import { hueClass } from "../../lib/hues";
import { list, row } from "../../lib/motion";
import { DOMAIN_HUE, RATING_HUE, STATUS_HUE, compactAud, frequencyLabel, pct, useClientModel, type ClientModel } from "../../lib/riskModel";
import { DomainBars, ExceedanceChart, HeatMap, RangeBar } from "./charts";

const TABS = ["Overview", "Register", "Sites", "Controls", "Incidents"] as const;
type Tab = (typeof TABS)[number];
export const kindLabel = (k: string) => SITE_KINDS.find(([v]) => v === k)?.[1] ?? k;

export function ClientRisk({ clientId }: { clientId: number }) {
  const m = useClientModel(clientId);
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "Overview";
  const t = useThreatActions();
  if (!m) return <Empty title="That client no longer exists." action={<Link to="/risk">All clients</Link>} />;
  const { client, totals, sims } = m;
  const reduction = totals.inherent > 0 ? 1 - totals.current / totals.inherent : 0;
  const further = totals.current > 0 ? 1 - totals.target / totals.current : 0;
  const setTab = (next: Tab) => setParams(next === "Overview" ? { client: String(clientId) } : { client: String(clientId), tab: next });

  return (
    <div className="pt-risk">
      <Link to="/risk" className="pt-ats-back">
        <ArrowLeft size={14} /> All clients
      </Link>
      <header className="pt-risk-head">
        <div>
          <h2 className="pt-risk-head__title">{client.org}</h2>
          <div className="pt-risk-head__facts">
            <span>{client.staff ? `${client.staff} staff · ${SIZE_LABEL[sizeBand(client.staff)].split(" (")[0]}` : "Staff not set — losses use small-business ranges"}</span>
            <span>{client.revenue ? `${compactAud(client.revenue)} revenue` : "Revenue unknown"}</span>
            <span>{client.historyYears ? `${client.historyYears} years of incident history` : "No incident history recorded"}</span>
          </div>
        </div>
        <div className="pt-risk-head__actions">
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => t.editProfile(client)}>
            Edit profile
          </button>
          <Link className="sds-btn sds-btn--sm sds-btn--ghost" to={`/clients?id=${client.id}`}>
            <Building size={14} /> Company record
          </Link>
        </div>
      </header>

      <section className="pt-risk-kpis" aria-label="Risk profile">
        <div className="pt-risk-kpi pt-risk-kpi--lead">
          <span className="pt-risk-kpi__l">Expected loss a year</span>
          <span className="pt-risk-kpi__v">{compactAud(totals.current)}</span>
          <span className="pt-risk-kpi__n">with controls in place · {compactAud(totals.inherent)} without</span>
        </div>
        <div className="pt-risk-kpi">
          <span className="pt-risk-kpi__l">1-in-10-year loss</span>
          <span className="pt-risk-kpi__v">{compactAud(sims.current.p90)}</span>
          <span className="pt-risk-kpi__n">90th percentile year</span>
        </div>
        <div className="pt-risk-kpi">
          <span className="pt-risk-kpi__l">1-in-100-year loss</span>
          <span className="pt-risk-kpi__v">{compactAud(sims.current.p99)}</span>
          <span className="pt-risk-kpi__n">the bad year to plan reserves for</span>
        </div>
        <div className="pt-risk-kpi">
          <span className="pt-risk-kpi__l">Controls remove</span>
          <span className="pt-risk-kpi__v">{Math.round(reduction * 100)}%</span>
          <span className="pt-risk-kpi__n">{compactAud(totals.spend)} a year spent</span>
        </div>
        <div className="pt-risk-kpi">
          <span className="pt-risk-kpi__l">Planned &amp; proposed</span>
          <span className="pt-risk-kpi__v">−{Math.round(further * 100)}%</span>
          <span className="pt-risk-kpi__n">to {compactAud(totals.target)} a year</span>
        </div>
      </section>

      <Tabs
        id={`risk-client-${clientId}`}
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={{ Register: m.rows.length, Sites: m.sites.length, Controls: m.controls.length, Incidents: m.incidents.length }}
      />

      {tab === "Overview" && <Overview m={m} onOpenRegister={() => setTab("Register")} />}
      {tab === "Register" && <Register m={m} />}
      {tab === "Sites" && <Sites m={m} />}
      {tab === "Controls" && <Controls m={m} />}
      {tab === "Incidents" && <Incidents m={m} />}
    </div>
  );
}

function Overview({ m, onOpenRegister }: { m: ClientModel; onOpenRegister: () => void }) {
  const t = useThreatActions();
  const [adding, setAdding] = useState(false);
  if (!m.rows.length) {
    return (
      <>
        <Empty
          title="No scenarios modelled yet."
          body={
            m.sites.length
              ? "Add threats from the library: the ones that apply to each site's type and to the organisation as a whole are suggested."
              : "Start with a site (or model organisation-wide threats such as cyber and fraud straight away)."
          }
          action={
            <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => setAdding(true)}>
              Add threats from the library
            </button>
          }
        />
        <ScenarioPicker m={m} open={adding} onClose={() => setAdding(false)} />
      </>
    );
  }
  return (
    <div className="pt-risk-overview">
      <div className="pt-panel pt-panel--ruled pt-risk-overview__curve">
        <SectionHead title="Loss exceedance" meta={`${m.sims.current.trials.toLocaleString()} simulated years`} />
        <ExceedanceChart inherent={m.curves.inherent} current={m.curves.current} target={m.curves.target} p90={m.sims.current.p90} />
      </div>
      <div className="pt-panel pt-risk-overview__heat">
        <SectionHead title="Risk matrix" meta="current controls" />
        <HeatMap rows={m.rows} onPick={() => onOpenRegister()} />
      </div>
      <div className="pt-panel pt-risk-overview__dom">
        <SectionHead title="By domain" meta="expected loss a year" />
        <DomainBars byDomain={m.byDomain} />
      </div>
      <div className="pt-panel pt-risk-overview__top">
        <SectionHead title="Largest exposures" meta="expected loss a year" action={<button className="pt-addlink" onClick={onOpenRegister}>Register</button>} />
        <ol className="pt-risk-top">
          {m.rows.slice(0, 6).map((r) => (
            <li key={r.s.id}>
              <button className="pt-risk-top__row" onClick={() => t.editScenario(m.client.id, r)}>
                <span className={`pt-chip ${hueClass(RATING_HUE[r.rating]!)}`}>{r.rating}</span>
                <span className="pt-risk-top__name">
                  {r.s.name}
                  <span className="pt-meta">{where(m, r)}</span>
                </span>
                <span className="pt-risk-top__v">{compactAud(r.currentAle)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="pt-panel pt-risk-overview__rec">
        <SectionHead title="Best value next" meta="loss removed per dollar" />
        <Recommendations m={m} limit={5} />
      </div>
    </div>
  );
}

const where = (m: ClientModel, r: RatedScenario) => (r.s.siteId ? m.sites.find((s) => s.id === r.s.siteId)?.name ?? "Site" : "Organisation-wide");

function Recommendations({ m, limit }: { m: ClientModel; limit: number }) {
  const t = useThreatActions();
  if (!m.recommendations.length) return <p className="pt-dim" style={{ fontSize: 13 }}>No further controls in the library reduce these scenarios.</p>;
  return (
    <ul className="pt-risk-recs">
      {m.recommendations.slice(0, limit).map((r) => (
        <li key={`${r.def.key}@${r.siteId ?? ""}`} className={hueClass(DOMAIN_HUE[r.def.domain])}>
          <span className="pt-chip__dot" />
          <span className="pt-risk-recs__name">
            {r.def.name}
            <span className="pt-meta">
              {r.siteId ? m.sites.find((s) => s.id === r.siteId)?.name : "Organisation-wide"} · {compactAud(r.value.cost)} a year
            </span>
          </span>
          <span className="pt-risk-recs__v">
            −{compactAud(r.value.benefit)}
            <span className="pt-meta">{r.value.rosi != null ? `ROSI ${r.value.rosi >= 10 ? Math.round(r.value.rosi) : r.value.rosi.toFixed(1)}×` : ""}</span>
          </span>
          <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => t.applyControl(m.client.id, r.def.key, r.siteId, "Proposed")}>
            Propose
          </button>
        </li>
      ))}
    </ul>
  );
}

function Register({ m }: { m: ClientModel }) {
  const t = useThreatActions();
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [site, setSite] = useState<string>("all");
  const [cell, setCell] = useState<{ l: number; c: number } | null>(null);
  const rows = m.rows.filter(
    (r) =>
      (domain === "all" || r.s.domain === domain) &&
      (site === "all" || String(r.s.siteId ?? "org") === site) &&
      (!cell || (r.likelihood === cell.l && r.consequence === cell.c))
  );
  const maxLoss = Math.max(1, ...m.rows.map((r) => r.s.loss.high));
  return (
    <div className="pt-risk-register">
      <div className="pt-risk-toolbar">
        <span className="pt-seg" role="radiogroup" aria-label="Domain">
          {(["all", ...DOMAINS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={domain === k} className={`pt-seg__btn ${hueClass(k === "all" ? "slate" : DOMAIN_HUE[k])}`} onClick={() => setDomain(k)}>
              {k === "all" ? "All" : DOMAIN_LABEL[k]}
            </button>
          ))}
        </span>
        <div className="pt-select pt-select--sm">
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Where">
            <option value="all">Everywhere</option>
            <option value="org">Organisation-wide</option>
            {m.sites.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {cell && (
          <button className="pt-chip pt-hue-slate pt-risk-cellchip" onClick={() => setCell(null)}>
            {LIKELIHOOD[cell.l]} × {CONSEQUENCE[cell.c]} ✕
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => t.addCustomScenario(m.client.id)}>
          Custom scenario
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add from library
        </button>
      </div>
      <div className="pt-risk-regsplit">
        <div className="pt-risk-table" role="table" aria-label="Risk register">
          <div className="pt-risk-table__row pt-risk-table__row--head" role="row">
            <span role="columnheader">Scenario</span>
            <span role="columnheader" className="pt-hide-sm">
              How often
            </span>
            <span role="columnheader" className="pt-hide-sm">
              Loss per event
            </span>
            <span role="columnheader" className="pt-num pt-hide-sm">
              Chance / yr
            </span>
            <span role="columnheader">Rating</span>
            <span role="columnheader" className="pt-num pt-hide-sm">
              Unprotected
            </span>
            <span role="columnheader" className="pt-num">
              Expected / yr
            </span>
          </div>
          <motion.div variants={list} initial="initial" animate="animate">
            {rows.map((r) => (
              <motion.button key={r.s.id} variants={row} role="row" className={`pt-risk-table__row ${hueClass(DOMAIN_HUE[r.s.domain])}`} onClick={() => t.editScenario(m.client.id, r)}>
                <span role="cell" className="pt-risk-table__name">
                  <span className="pt-chip__dot" />
                  <span>
                    <b>{r.s.name}</b>
                    <span className="pt-meta">
                      {where(m, r)}
                      {r.s.threat ? ` · ${r.s.threat.category}` : " · custom"}
                    </span>
                  </span>
                </span>
                <span role="cell" className="pt-hide-sm pt-risk-table__freq">
                  <span className="pt-mono">{frequencyLabel(pertMean(r.s.rate))}</span>
                  {r.s.rateSource !== "library" && (
                    <span className={`pt-risk-src pt-risk-src--${r.s.rateSource}`} title={r.s.calibration ? `${r.s.calibration.observed} incidents in ${r.s.calibration.years} years → ×${r.s.calibration.factor.toFixed(2)} the reference rate` : "Set by hand"}>
                      {r.s.rateSource === "calibrated" ? `${r.s.calibration!.observed} in ${r.s.calibration!.years} yrs · ×${r.s.calibration!.factor.toFixed(1)}` : "override"}
                    </span>
                  )}
                </span>
                <span role="cell" className="pt-hide-sm pt-risk-table__loss">
                  <span className="pt-mono">{compactAud(r.s.loss.typical)}</span>
                  <RangeBar low={r.s.loss.low} typical={r.s.loss.typical} high={r.s.loss.high} max={maxLoss} format={compactAud} />
                </span>
                <span role="cell" className="pt-num pt-mono pt-hide-sm">
                  {pct(r.probability)}
                </span>
                <span role="cell">
                  <span className={`pt-chip ${hueClass(RATING_HUE[r.rating]!)}`}>{r.rating}</span>
                </span>
                <span role="cell" className="pt-num pt-mono pt-dim pt-hide-sm">
                  {compactAud(r.inherentAle)}
                </span>
                <span role="cell" className="pt-num pt-risk-table__ale">
                  {compactAud(r.currentAle)}
                  {r.targetAle < r.currentAle - 1 && <span className="pt-meta">→ {compactAud(r.targetAle)}</span>}
                </span>
              </motion.button>
            ))}
            {rows.length === 0 && <div className="pt-risk-none">{m.rows.length ? "No scenarios match." : "No scenarios yet. Add threats from the library."}</div>}
          </motion.div>
        </div>
        <aside className="pt-panel pt-risk-regsplit__heat">
          <SectionHead title="Matrix" meta="click a cell to filter" />
          <HeatMap rows={m.rows} selected={cell} onPick={setCell} />
        </aside>
      </div>
      <ScenarioPicker m={m} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** Library picker: suggests the threats that fit each site's type and the organisation. */
export function ScenarioPicker({ m, open, onClose, siteId }: { m: ClientModel; open: boolean; onClose: () => void; siteId?: number }) {
  const t = useThreatActions();
  const have = useMemo(() => new Set(m.rows.map((r) => `${r.s.threat?.key}@${r.s.siteId ?? ""}`)), [m.rows]);
  const groups = useMemo(
    () => [
      { siteId: null as number | null, label: "Organisation-wide", sub: "Cyber, fraud and people risks that follow the organisation", threats: threatsFor(null) },
      ...m.sites.map((s) => ({ siteId: s.id as number | null, label: s.name, sub: kindLabel(s.kind), threats: threatsFor(s.kind as SiteKind) })),
    ].filter((g) => siteId === undefined || g.siteId === siteId || g.siteId === null),
    [m.sites, siteId]
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const key = (threatKey: string, siteId: number | null) => `${threatKey}@${siteId ?? ""}`;
  const toggle = (k: string) => setPicked((p) => (p.has(k) ? new Set([...p].filter((x) => x !== k)) : new Set([...p, k])));
  const suggestAll = () => setPicked(new Set(groups.flatMap((g) => g.threats.map((th) => key(th.key, g.siteId)).filter((k) => !have.has(k)))));
  const submit = async () => {
    const items = [...picked].map((k) => {
      const [threatKey, site] = k.split("@");
      return { threatKey: threatKey!, siteId: site ? Number(site) : null };
    });
    await t.addScenarios(m.client.id, items);
    setPicked(new Set());
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} label="Add threats from the library" className="pt-risk-picker">
      <header className="pt-risk-picker__head">
        <div>
          <div className="pt-eyebrow">Threat library</div>
          <h2>Add threats to {m.client.org}</h2>
        </div>
        <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={suggestAll}>
          Select all that apply
        </button>
      </header>
      <div className="pt-risk-picker__body">
        {groups.map((g) => (
          <section key={g.label} className="pt-risk-picker__group">
            <div className="pt-risk-picker__glabel">
              <b>{g.label}</b>
              <span className="pt-meta">{g.sub}</span>
            </div>
            <div className="pt-risk-picker__grid">
              {g.threats.map((th) => {
                const k = key(th.key, g.siteId);
                const already = have.has(k);
                return (
                  <label key={k} className={`pt-risk-pick ${hueClass(DOMAIN_HUE[th.domain])}${already ? " is-have" : ""}`}>
                    <input type="checkbox" checked={already || picked.has(k)} disabled={already} onChange={() => toggle(k)} />
                    <span className="pt-risk-pick__box" aria-hidden />
                    <span className="pt-risk-pick__name">
                      {th.name}
                      <span className="pt-meta">{already ? "modelled" : `${DOMAIN_LABEL[th.domain]} · ${th.category}`}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        {m.sites.length === 0 && <p className="pt-risk-note">Add a site to model break-ins, violence, protest and other threats that happen at a place.</p>}
      </div>
      <footer className="pt-risk-picker__foot">
        <span className="pt-meta">{picked.size} selected</span>
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--md sds-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="sds-btn sds-btn--md sds-btn--primary" disabled={!picked.size} onClick={() => void submit()}>
          Add {picked.size || ""} {picked.size === 1 ? "scenario" : "scenarios"}
        </button>
      </footer>
    </Modal>
  );
}

function Sites({ m }: { m: ClientModel }) {
  const actions = useActions();
  const [, setParams] = useSearchParams();
  return (
    <motion.div className="pt-risk-sites" variants={list} initial="initial" animate="animate">
      {m.sites.map((s) => {
        const plan = s.levels.find((l) => l.plan)?.plan;
        const stat = m.bySite.get(s.id);
        const els = m.elements.filter((e) => e.siteId === s.id);
        return (
          <motion.button key={s.id} variants={row} className="pt-risk-sitecard" onClick={() => setParams({ client: String(m.client.id), site: String(s.id) })}>
            <span className="pt-risk-sitecard__plan">{plan ? <img src={`/api/plans/${plan.fileId}`} alt="" loading="lazy" /> : <span className="pt-risk-sitecard__hatch">No plan</span>}</span>
            <span className="pt-risk-sitecard__body">
              <span className="pt-eyebrow">{kindLabel(s.kind)}</span>
              <b className="pt-risk-sitecard__name">{s.name}</b>
              <span className="pt-meta">{[s.suburb, s.state].filter(Boolean).join(" ") || "Address not set"}</span>
              <span className="pt-risk-sitecard__facts">
                <span>
                  <Layers size={12} /> {s.levels.length} {s.levels.length === 1 ? "level" : "levels"}
                </span>
                <span>{els.length} elements</span>
                <span>{stat?.count ?? 0} scenarios</span>
              </span>
            </span>
            <span className="pt-risk-sitecard__ale">
              {compactAud(stat?.current ?? 0)}
              <span className="pt-meta">a year</span>
            </span>
          </motion.button>
        );
      })}
      <button className="pt-risk-sitecard pt-risk-sitecard--add" onClick={() => actions.addSite({ clientId: m.client.id })}>
        <Plus size={18} /> Add site
      </button>
    </motion.div>
  );
}

function Controls({ m }: { m: ClientModel }) {
  const t = useThreatActions();
  const d = usePortal();
  const [browsing, setBrowsing] = useState(false);
  const rows = d.tmControls.filter((c) => c.clientId === m.client.id);
  return (
    <div className="pt-risk-controls">
      <div className="pt-risk-toolbar">
        <span className="pt-meta">
          In place {rows.filter((c) => c.status === "In place").length} · planned {rows.filter((c) => c.status === "Planned").length} · proposed{" "}
          {rows.filter((c) => c.status === "Proposed").length}
        </span>
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => setBrowsing(true)}>
          <Plus size={14} /> Apply a control
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty compact title="No controls recorded." body="Record what's already in place, then compare planned and proposed options by the loss each one removes per dollar." />
      ) : (
        <div className="pt-risk-table pt-risk-table--controls" role="table" aria-label="Controls">
          <div className="pt-risk-table__row pt-risk-table__row--head" role="row">
            <span role="columnheader">Control</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="pt-num pt-hide-sm">
              Cost / yr
            </span>
            <span role="columnheader" className="pt-num">
              Loss removed / yr
            </span>
            <span role="columnheader" className="pt-num pt-hide-sm">
              ROSI
            </span>
          </div>
          {rows.map((c) => {
            const def = CONTROL_BY_KEY.get(c.controlKey);
            const v = m.controlValues.get(c.id);
            return (
              <div key={c.id} role="row" className={`pt-risk-table__row ${hueClass(DOMAIN_HUE[def?.domain ?? "physical"])}`}>
                <button role="cell" className="pt-risk-table__name pt-risk-table__namebtn" onClick={() => t.editControl(c)}>
                  <span className="pt-chip__dot" />
                  <span>
                    <b>{def?.name ?? c.controlKey}</b>
                    <span className="pt-meta">
                      {c.siteId ? m.sites.find((s) => s.id === c.siteId)?.name : "Organisation-wide"}
                      {c.effectiveness < 1 ? ` · ${Math.round(c.effectiveness * 100)}% effective` : ""}
                      {def?.standard ? ` · ${def.standard}` : ""}
                    </span>
                  </span>
                </button>
                <span role="cell">
                  <StatusPick c={c} />
                </span>
                <span role="cell" className="pt-num pt-mono pt-hide-sm">
                  {compactAud(c.capex / 5 + c.opex)}
                </span>
                <span role="cell" className="pt-num pt-risk-table__ale">
                  {compactAud(v?.benefit ?? 0)}
                </span>
                <span role="cell" className={`pt-num pt-mono pt-hide-sm ${v?.rosi != null && v.rosi < 0 ? "pt-risk-neg" : ""}`}>
                  {v?.rosi != null ? `${v.rosi >= 10 ? Math.round(v.rosi) : v.rosi.toFixed(1)}×` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-panel" style={{ marginTop: 20 }}>
        <SectionHead title="Best value next" meta="library controls not yet applied" />
        <Recommendations m={m} limit={8} />
      </div>
      <ControlPicker m={m} open={browsing} onClose={() => setBrowsing(false)} />
    </div>
  );
}

function StatusPick({ c }: { c: TmControl }) {
  const t = useThreatActions();
  return (
    <label className={`pt-ats-state ${hueClass(STATUS_HUE[c.status])}`}>
      <span className="pt-chip__dot" />
      <select value={c.status} aria-label="Status" onChange={(e) => void t.setControlStatus(c, e.target.value as TmControl["status"])}>
        {CONTROL_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}

function ControlPicker({ m, open, onClose }: { m: ClientModel; open: boolean; onClose: () => void }) {
  const t = useThreatActions();
  const threatKeys = new Set(m.rows.map((r) => r.s.threat?.key));
  const [domain, setDomain] = useState<Domain | "all">("all");
  const defs = [...CONTROL_BY_KEY.values()].filter((c) => domain === "all" || c.domain === domain);
  return (
    <Modal open={open} onClose={onClose} label="Apply a control" className="pt-risk-picker">
      <header className="pt-risk-picker__head">
        <div>
          <div className="pt-eyebrow">Control library</div>
          <h2>Apply a control</h2>
        </div>
        <span className="pt-seg" role="radiogroup" aria-label="Domain">
          {(["all", ...DOMAINS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={domain === k} className={`pt-seg__btn ${hueClass(k === "all" ? "slate" : DOMAIN_HUE[k])}`} onClick={() => setDomain(k)}>
              {k === "all" ? "All" : DOMAIN_LABEL[k]}
            </button>
          ))}
        </span>
      </header>
      <div className="pt-risk-picker__body">
        <ul className="pt-risk-cpick">
          {defs.map((c) => {
            const relevant = c.mitigates.filter((x) => threatKeys.has(x.threat));
            return (
              <li key={c.key} className={hueClass(DOMAIN_HUE[c.domain])}>
                <button
                  onClick={() => {
                    onClose();
                    t.applyControl(m.client.id, c.key, c.scope === "site" ? m.sites[0]?.id ?? null : null);
                  }}
                  disabled={c.scope === "site" && !m.sites.length}
                >
                  <span className="pt-chip__dot" />
                  <span className="pt-risk-cpick__name">
                    <b>{c.name}</b>
                    <span className="pt-meta">
                      {c.scope === "site" ? "per site" : "organisation-wide"} · {compactAud(c.capex / 5 + c.opex)} a year
                    </span>
                  </span>
                  <span className="pt-risk-cpick__rel">
                    {relevant.length ? `reduces ${relevant.length} modelled ${relevant.length === 1 ? "threat" : "threats"}` : <span className="pt-dim">no modelled threats</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

function Incidents({ m }: { m: ClientModel }) {
  const t = useThreatActions();
  const d = usePortal();
  const calibrated = m.rows.filter((r) => r.s.rateSource === "calibrated");
  return (
    <div className="pt-risk-incidents">
      <div className="pt-risk-toolbar">
        <span className="pt-meta">
          {m.client.historyYears ? `Calibrating over the last ${m.client.historyYears} years` : "Set how many years of history these incidents cover in the profile to calibrate the model"}
        </span>
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => t.editProfile(m.client)}>
          History: {m.client.historyYears} yrs
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => t.logIncident(m.client.id)}>
          <Plus size={14} /> Log incident
        </button>
      </div>
      {m.incidents.length === 0 ? (
        <Empty compact title="No incidents logged." body="Every real incident you log moves the matching scenario's frequency from the national reference rate towards this client's experience." />
      ) : (
        <ul className="pt-risk-inc">
          {m.incidents.map((i) => {
            const th = THREAT_BY_KEY.get(i.threatKey);
            return (
              <li key={i.id}>
                <button className={`pt-risk-inc__row ${hueClass(DOMAIN_HUE[th?.domain ?? "physical"])}`} onClick={() => t.editIncident(i)}>
                  <span className="pt-mono pt-risk-inc__date">{friendlyDate(i.occurredOn, d.today)}</span>
                  <span className="pt-chip__dot" />
                  <span className="pt-risk-inc__what">
                    <b>{th?.name ?? i.threatKey}</b>
                    <span className="pt-meta">{i.siteId ? m.sites.find((s) => s.id === i.siteId)?.name : "Organisation-wide"}</span>
                    {i.description && <span className="pt-risk-inc__desc">{i.description}</span>}
                  </span>
                  <span className="pt-mono pt-risk-inc__loss">{i.loss ? compactAud(i.loss) : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {calibrated.length > 0 && (
        <div className="pt-panel" style={{ marginTop: 20 }}>
          <SectionHead title="Calibration" meta="reference rate → this client" />
          <ul className="pt-risk-cal">
            {calibrated.map((r) => (
              <li key={r.s.id}>
                <span>{r.s.name}</span>
                <span className="pt-meta">{where(m, r)}</span>
                <span className="pt-mono">
                  {frequencyLabel(pertMean(r.s.referenceRate))} → <b>{frequencyLabel(pertMean(r.s.rate))}</b>
                </span>
                <span className="pt-meta">
                  {r.s.calibration!.observed} in {r.s.calibration!.years} yrs
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
