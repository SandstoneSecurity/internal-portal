import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { CONTROLS, DOMAINS, DOMAIN_LABEL, EXPOSURE_LABEL, SIZE_LABEL, THREATS, sizeBand, type Domain } from "../../../shared/threatLibrary";
import { useActions } from "../../actions/ActionHost";
import { Empty, Tabs } from "../../components/ui/Bits";
import { usePortal } from "../../lib/DataProvider";
import { matches } from "../../lib/format";
import { hueClass } from "../../lib/hues";
import { list, row } from "../../lib/motion";
import { DOMAIN_HUE, RATING_HUE, buildModel, compactAud, frequencyLabel, meanOf } from "../../lib/riskModel";
import { ClientRisk } from "./ClientRisk";
import { SiteWorkspace } from "./SiteWorkspace";

const TOP_TABS = ["Clients", "Library"] as const;

export function RiskPage() {
  const [params] = useSearchParams();
  const clientId = Number(params.get("client")) || null;
  const siteId = Number(params.get("site")) || null;
  if (clientId && siteId) return <SiteWorkspace clientId={clientId} siteId={siteId} />;
  if (clientId) return <ClientRisk clientId={clientId} />;
  return <Portfolio />;
}

function Portfolio() {
  const d = usePortal();
  const actions = useActions();
  const [params, setParams] = useSearchParams();
  const tab = (TOP_TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as (typeof TOP_TABS)[number]) : "Clients";
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      d.clients
        .map((c) => {
          const modelled = d.tmScenarios.some((s) => s.clientId === c.id) || d.sites.some((s) => s.clientId === c.id);
          return { c, m: modelled ? buildModel(d, c.id, 800) : null };
        })
        .sort((a, b) => (b.m?.totals.current ?? -1) - (a.m?.totals.current ?? -1) || a.c.org.localeCompare(b.c.org)),
    [d]
  );
  const modelled = rows.filter((r) => r.m);
  const total = modelled.reduce((n, r) => n + r.m!.totals.current, 0);
  const inherent = modelled.reduce((n, r) => n + r.m!.totals.inherent, 0);
  const shown = rows.filter((r) => matches(q, r.c.org, r.c.sector));

  return (
    <div className="pt-risk">
      <header className="pt-risk-hero">
        <div className="pt-risk-hero__main">
          <span className="pt-eyebrow">Portfolio exposure</span>
          <div className="pt-risk-hero__figure">
            {compactAud(total)}
            <span className="pt-risk-hero__unit">expected loss a year</span>
          </div>
          <p className="pt-risk-hero__lede">
            {modelled.length
              ? `Across ${modelled.length} modelled ${modelled.length === 1 ? "client" : "clients"} and ${d.sites.length} ${d.sites.length === 1 ? "site" : "sites"}. Controls in place remove ${inherent > 0 ? Math.round((1 - total / inherent) * 100) : 0}% of the loss those clients would carry unprotected.`
              : "Model a client's sites, people and systems to see what their threats cost in dollars a year — physical, personnel and cyber, on one scale."}
          </p>
        </div>
        <dl className="pt-risk-hero__facts">
          <div>
            <dt>Clients modelled</dt>
            <dd>{modelled.length}</dd>
          </div>
          <div>
            <dt>Scenarios</dt>
            <dd>{d.tmScenarios.length}</dd>
          </div>
          <div>
            <dt>Library</dt>
            <dd>
              {THREATS.length} threats · {CONTROLS.length} controls
            </dd>
          </div>
        </dl>
      </header>

      <Tabs id="risk-top" tabs={TOP_TABS} value={tab} onChange={(t) => setParams(t === "Clients" ? {} : { tab: t })} counts={{ Clients: d.clients.length, Library: THREATS.length }} />

      {tab === "Clients" ? (
        <>
          <div className="pt-risk-toolbar">
            <label className="pt-search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" />
            </label>
            <span style={{ flex: 1 }} />
            <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.addSite()}>
              Add site
            </button>
          </div>
          {d.clients.length === 0 ? (
            <Empty title="No clients yet." body="Threat models belong to a client. Create the company in Clients, then add its sites here." />
          ) : (
            <div className="pt-risk-ledger" role="table" aria-label="Clients by expected annual loss">
              <div className="pt-risk-ledger__row pt-risk-ledger__row--head" role="row">
                <span role="columnheader">Client</span>
                <span role="columnheader" className="pt-hide-sm">
                  Sites
                </span>
                <span role="columnheader" className="pt-hide-sm">
                  Mix
                </span>
                <span role="columnheader" className="pt-num">
                  Expected loss / yr
                </span>
                <span role="columnheader" className="pt-num pt-hide-sm">
                  1-in-10 yr
                </span>
                <span role="columnheader" className="pt-hide-sm">
                  Top risk
                </span>
              </div>
              <motion.div variants={list} initial="initial" animate="animate">
                {shown.map(({ c, m }) => {
                  const top = m?.rows[0];
                  return (
                    <motion.a
                      key={c.id}
                      variants={row}
                      role="row"
                      href={`/risk?client=${c.id}`}
                      className={`pt-risk-ledger__row${m ? "" : " is-unmodelled"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setParams({ client: String(c.id) });
                      }}
                    >
                      <span role="cell" className="pt-risk-ledger__name">
                        <b>{c.org}</b>
                        <span className="pt-meta">
                          {[c.sector, c.staff ? SIZE_LABEL[sizeBand(c.staff)].split(" (")[0] : null].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span role="cell" className="pt-mono pt-hide-sm">
                        {d.sites.filter((s) => s.clientId === c.id).length || "—"}
                      </span>
                      <span role="cell" className="pt-hide-sm">
                        {m && m.totals.current > 0 ? (
                          <span className="pt-risk-mix" aria-label="Loss by domain">
                            {DOMAINS.map((k) => (
                              <span key={k} className={hueClass(DOMAIN_HUE[k])} style={{ flexGrow: m.byDomain[k].current }} title={`${DOMAIN_LABEL[k]} ${compactAud(m.byDomain[k].current)}`} />
                            ))}
                          </span>
                        ) : (
                          <span className="pt-dim">—</span>
                        )}
                      </span>
                      <span role="cell" className="pt-num pt-risk-ledger__ale">
                        {m ? compactAud(m.totals.current) : <span className="pt-dim">Not modelled</span>}
                      </span>
                      <span role="cell" className="pt-num pt-mono pt-hide-sm">
                        {m ? compactAud(m.sims.current.p90) : ""}
                      </span>
                      <span role="cell" className="pt-hide-sm pt-risk-ledger__top">
                        {top ? (
                          <>
                            <span className={`pt-chip ${hueClass(RATING_HUE[top.rating]!)}`}>{top.rating}</span>
                            <span className="pt-risk-ledger__topname">{top.s.name}</span>
                          </>
                        ) : m ? (
                          <span className="pt-dim">No scenarios yet</span>
                        ) : (
                          <button
                            className="sds-btn sds-btn--sm sds-btn--ghost"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              actions.addSite({ clientId: c.id });
                            }}
                          >
                            Start a model
                          </button>
                        )}
                      </span>
                    </motion.a>
                  );
                })}
              </motion.div>
            </div>
          )}
        </>
      ) : (
        <Library />
      )}
    </div>
  );
}

const LIB_KINDS = ["Threats", "Controls"] as const;

export function Library() {
  const [kind, setKind] = useState<(typeof LIB_KINDS)[number]>("Threats");
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const threats = THREATS.filter((t) => (domain === "all" || t.domain === domain) && matches(q, t.name, t.category, t.description, ...t.actors));
  const controls = CONTROLS.filter((c) => (domain === "all" || c.domain === domain) && matches(q, c.name, c.description, c.standard));

  return (
    <div className="pt-risk-lib">
      <div className="pt-risk-toolbar">
        <span className="pt-seg" role="radiogroup" aria-label="Library">
          {LIB_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="pt-seg__btn pt-hue-slate" onClick={() => setKind(k)}>
              {k} <span className="pt-meta">{k === "Threats" ? THREATS.length : CONTROLS.length}</span>
            </button>
          ))}
        </span>
        <span className="pt-seg" role="radiogroup" aria-label="Domain">
          {(["all", ...DOMAINS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={domain === k} className={`pt-seg__btn ${hueClass(k === "all" ? "slate" : DOMAIN_HUE[k])}`} onClick={() => setDomain(k)}>
              {k === "all" ? "All" : DOMAIN_LABEL[k]}
            </button>
          ))}
        </span>
        <label className="pt-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind.toLowerCase()}`} aria-label={`Search ${kind.toLowerCase()}`} />
        </label>
      </div>
      <p className="pt-risk-note">
        Reference rates are for an average Australian organisation. <b>Anchored</b> figures are derived from a cited source (the arithmetic is shown); <b>estimated</b> ones are
        analyst starting points that each client's logged incidents recalibrate. Control costs are indicative Sydney market prices — replace them with quotes.
      </p>
      {kind === "Threats" ? (
        <ul className="pt-risk-libl">
          {threats.map((t) => {
            const isOpen = open === t.key;
            return (
              <li key={t.key} className={`pt-risk-libi ${hueClass(DOMAIN_HUE[t.domain])}${isOpen ? " is-open" : ""}`}>
                <button className="pt-risk-libi__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.key)}>
                  <span className="pt-chip__dot" />
                  <span className="pt-risk-libi__name">
                    <b>{t.name}</b>
                    <span className="pt-meta">
                      {DOMAIN_LABEL[t.domain]} · {t.category}
                    </span>
                  </span>
                  <span className="pt-risk-libi__num">
                    <span className="pt-mono">{frequencyLabel(meanOf(t.rate))}</span>
                    <span className="pt-meta">{EXPOSURE_LABEL[t.exposure]}</span>
                  </span>
                  <span className="pt-risk-libi__num pt-hide-sm">
                    <span className="pt-mono">
                      {compactAud(meanOf(t.loss.small)) === compactAud(meanOf(t.loss.large))
                        ? compactAud(meanOf(t.loss.small))
                        : `${compactAud(meanOf(t.loss.small))} – ${compactAud(meanOf(t.loss.large))}`}
                    </span>
                    <span className="pt-meta">{t.loss.small === t.loss.large ? "mean loss per event" : "mean loss, small → large"}</span>
                  </span>
                  <span className="pt-risk-libi__basis pt-hide-sm">
                    <Basis v={t.rateBasis} label="Rate" />
                    <Basis v={t.lossBasis} label="Loss" />
                  </span>
                  <ChevronDown size={15} className="pt-risk-libi__chev" />
                </button>
                {isOpen && (
                  <div className="pt-risk-libi__body">
                    <p>{t.description}</p>
                    <dl className="pt-risk-libi__facts">
                      <dt>Actors</dt>
                      <dd>{t.actors.join(", ")}</dd>
                      <dt>Reference rate</dt>
                      <dd className="pt-mono">
                        {t.rate.low} – {t.rate.high}, most likely {t.rate.typical} {EXPOSURE_LABEL[t.exposure]}
                      </dd>
                      {t.kindFactor && (
                        <>
                          <dt>By site type</dt>
                          <dd>
                            {Object.entries(t.kindFactor)
                              .filter(([, f]) => f !== 1)
                              .map(([k, f]) => `${k} ×${f}`)
                              .join(" · ")}
                          </dd>
                        </>
                      )}
                      <dt>Loss per event</dt>
                      <dd className="pt-mono">
                        {(["small", "medium", "large"] as const).map((b) => `${b} ${compactAud(t.loss[b].low)}–${compactAud(t.loss[b].high)} (mode ${compactAud(t.loss[b].typical)})`).join(" · ")}
                      </dd>
                      <dt>Controls</dt>
                      <dd>{CONTROLS.filter((c) => c.mitigates.some((x) => x.threat === t.key)).map((c) => c.name).join(" · ")}</dd>
                    </dl>
                    {t.evidence.length > 0 && (
                      <ol className="pt-risk-evidence">
                        {t.evidence.map((e, i) => (
                          <li key={i}>
                            <b>{e.source}.</b> {e.figure}
                            {e.derivation && <span className="pt-risk-evidence__d"> {e.derivation}</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="pt-risk-libl">
          {controls.map((c) => {
            const isOpen = open === c.key;
            return (
              <li key={c.key} className={`pt-risk-libi ${hueClass(DOMAIN_HUE[c.domain])}${isOpen ? " is-open" : ""}`}>
                <button className="pt-risk-libi__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.key)}>
                  <span className="pt-chip__dot" />
                  <span className="pt-risk-libi__name">
                    <b>{c.name}</b>
                    <span className="pt-meta">
                      {DOMAIN_LABEL[c.domain]} · {c.scope === "site" ? "per site" : "organisation-wide"}
                      {c.standard ? ` · ${c.standard}` : ""}
                    </span>
                  </span>
                  <span className="pt-risk-libi__num">
                    <span className="pt-mono">{compactAud(c.capex / 5 + c.opex)}</span>
                    <span className="pt-meta">a year, indicative</span>
                  </span>
                  <span className="pt-risk-libi__num pt-hide-sm">
                    <span className="pt-mono">{c.mitigates.length}</span>
                    <span className="pt-meta">threats reduced</span>
                  </span>
                  <span className="pt-risk-libi__basis pt-hide-sm" />
                  <ChevronDown size={15} className="pt-risk-libi__chev" />
                </button>
                {isOpen && (
                  <div className="pt-risk-libi__body">
                    <p>{c.description}</p>
                    <dl className="pt-risk-libi__facts">
                      <dt>Cost</dt>
                      <dd className="pt-mono">
                        {compactAud(c.capex)} capital · {compactAud(c.opex)} a year
                      </dd>
                    </dl>
                    <table className="pt-risk-mit">
                      <thead>
                        <tr>
                          <th>Threat</th>
                          <th>Fewer events</th>
                          <th>Smaller loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.mitigates.map((m) => (
                          <tr key={m.threat}>
                            <td>{THREATS.find((t) => t.key === m.threat)?.name}</td>
                            <td className="pt-mono">{m.freq ? `−${Math.round(m.freq * 100)}%` : "—"}</td>
                            <td className="pt-mono">{m.loss ? `−${Math.round(m.loss * 100)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Basis({ v, label }: { v: "anchored" | "estimated"; label: string }) {
  return (
    <span className={`pt-risk-basis pt-risk-basis--${v}`} title={v === "anchored" ? `${label} derived from a cited Australian source` : `${label} is an analyst estimate; calibrate with incidents`}>
      {label} {v === "anchored" ? "anchored" : "est."}
    </span>
  );
}
