import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { exposureUnits, pertMean } from "../../../shared/risk";
import { DOMAINS, DOMAIN_LABEL, SITE_KINDS, THREATS, sizeBand, type Domain, type SiteKind, type ThreatDef } from "../../../shared/threatLibrary";
import { useThreatActions } from "../../actions/threatActions";
import { Modal } from "../../components/ui/Overlay";
import { hueClass } from "../../lib/hues";
import { DOMAIN_HUE, compactAud, frequencyLabel, type ClientModel } from "../../lib/riskModel";

/** Where a scenario sits: the organisation as a whole, or one site. */
interface Target {
  siteId: number | null;
  label: string;
}

interface Cell {
  target: Target;
  key: string;
  /** Expected events a year before controls. */
  rate: number;
  /** Expected annual loss before controls: the price of doing nothing. */
  ale: number;
  have: boolean;
  recommended: boolean;
}

interface Row {
  threat: ThreatDef;
  cells: Cell[];
  /** Expected annual loss across the targets still open to add. */
  ale: number;
  done: boolean;
  recommended: boolean;
}

type Sort = "cost" | "category";
const cellKey = (threatKey: string, siteId: number | null) => `${threatKey}@${siteId ?? ""}`;
const kindName = (k: string) => SITE_KINDS.find(([v]) => v === k)?.[1] ?? k;
/** Recommended = the fewest threats that together make up this share of the estimated exposure. */
const PARETO = 0.8;

/**
 * The threat library as one list. Each threat appears once, priced for this
 * client (its size, each site's type and location) so the costly ones rise to
 * the top, with a chip per site where it applies. Nothing scrolls sideways.
 */
export function ScenarioPicker({ m, open, onClose, siteId }: { m: ClientModel; open: boolean; onClose: () => void; siteId?: number }) {
  const t = useThreatActions();
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [sort, setSort] = useState<Sort>("cost");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const fine = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  const { rows, siteOnly } = useMemo(() => {
    const have = new Set(m.rows.map((r) => cellKey(r.s.threat?.key ?? "", r.s.siteId)));
    const band = sizeBand(m.org.staff);
    const sites = m.sites.filter((s) => siteId === undefined || s.id === siteId);
    const org: Target = { siteId: null, label: "Organisation-wide" };
    const rows: Row[] = [];
    let siteOnly = 0;
    for (const threat of THREATS) {
      const loss = pertMean(threat.loss[band]);
      const targets =
        threat.exposure === "site"
          ? sites.filter((s) => (threat.kindFactor?.[s.kind as SiteKind] ?? 1) > 0).map((s) => ({ siteId: s.id as number | null, label: s.name }))
          : [org];
      if (!targets.length) {
        if (threat.exposure === "site" && !m.sites.length) siteOnly++;
        continue;
      }
      const cells = targets.map((target): Cell => {
        const profile = target.siteId != null ? m.profiles.get(target.siteId) ?? null : null;
        const rate = pertMean(threat.rate) * exposureUnits(threat, profile, m.org);
        const key = cellKey(threat.key, target.siteId);
        return { target, key, rate, ale: rate * loss, have: have.has(key), recommended: false };
      });
      rows.push({ threat, cells, ale: 0, done: false, recommended: false });
    }
    // Pareto: rank every open (threat, place) pair by expected loss and recommend the head that makes up 90%.
    const open = rows.flatMap((r) => r.cells.filter((c) => !c.have)).sort((a, b) => b.ale - a.ale);
    const total = open.reduce((n, c) => n + c.ale, 0);
    let run = 0;
    for (const c of open) {
      if (run >= total * PARETO) break;
      c.recommended = true;
      run += c.ale;
    }
    for (const r of rows) {
      const left = r.cells.filter((c) => !c.have);
      r.done = left.length === 0;
      r.ale = (r.done ? r.cells : left).reduce((n, c) => n + c.ale, 0);
      r.recommended = left.some((c) => c.recommended);
    }
    return { rows, siteOnly };
  }, [m, siteId]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (r: Row) => {
    if (!words.length) return true;
    const hay = `${r.threat.name} ${r.threat.category} ${r.threat.description} ${r.threat.actors.join(" ")} ${DOMAIN_LABEL[r.threat.domain]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const searched = rows.filter(matches);
  const counts = Object.fromEntries(DOMAINS.map((d) => [d, searched.filter((r) => r.threat.domain === d).length])) as Record<Domain, number>;
  const shown = searched
    .filter((r) => domain === "all" || r.threat.domain === domain)
    .sort((a, b) => Number(a.done) - Number(b.done) || b.ale - a.ale);
  const groups: { title: string; rows: Row[] }[] =
    sort === "cost"
      ? [{ title: "", rows: shown }]
      : DOMAINS.flatMap((d) => {
          const inDomain = shown.filter((r) => r.threat.domain === d);
          const cats = [...new Set(inDomain.map((r) => r.threat.category))].sort((a, b) => a.localeCompare(b));
          return cats.map((c) => ({ title: `${DOMAIN_LABEL[d]} · ${c}`, rows: inDomain.filter((r) => r.threat.category === c) }));
        });

  const openKeys = (list: Row[], only?: (c: Cell) => boolean) => list.flatMap((r) => r.cells.filter((c) => !c.have && (!only || only(c))).map((c) => c.key));
  const recommendedKeys = openKeys(rows, (c) => c.recommended);
  const shownKeys = openKeys(shown);
  const filtered = words.length > 0 || domain !== "all";

  const setMany = (keys: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      for (const k of keys) on ? next.add(k) : next.delete(k);
      return next;
    });
  const toggleRow = (r: Row) => {
    const keys = r.cells.filter((c) => !c.have).map((c) => c.key);
    setMany(keys, !keys.every((k) => picked.has(k)));
  };

  const pickedCells = rows.flatMap((r) => r.cells.filter((c) => picked.has(c.key)));
  const pickedThreats = new Set(pickedCells.map((c) => c.key.split("@")[0])).size;
  const pickedAle = pickedCells.reduce((n, c) => n + c.ale, 0);

  const close = () => {
    setQ("");
    onClose();
  };
  const submit = async () => {
    const items = [...picked].map((k) => {
      const [threatKey, site] = k.split("@");
      return { threatKey: threatKey!, siteId: site ? Number(site) : null };
    });
    await t.addScenarios(m.client.id, items);
    setPicked(new Set());
    close();
  };

  return (
    <Modal open={open} onClose={close} label="Add threats from the library" className="pt-tp">
      <header className="pt-tp__head">
        <div className="pt-tp__title">
          <div className="pt-eyebrow">Threat library</div>
          <h2>Add threats to {m.client.org}</h2>
          <p>
            Priced for this client: its size{m.sites.length ? ", and each site's type and location" : ""}. Expected cost is a year's loss before controls.
          </p>
        </div>
        <button className="pt-iconbtn" onClick={close} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <div className="pt-tp__tools">
        <label className="pt-filter pt-tp__search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search threats: theft, phishing, violence…" aria-label="Search threats" data-autofocus={fine ? "" : undefined} />
          {q && (
            <button className="pt-tp__clear" onClick={() => setQ("")} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>
        <div className="pt-tp__filters">
          <div className="pt-seg pt-tp__domains" role="radiogroup" aria-label="Domain">
            {(["all", ...DOMAINS] as const).map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={domain === d}
                className={`pt-seg__btn ${hueClass(d === "all" ? "slate" : DOMAIN_HUE[d])}`}
                onClick={() => setDomain(d)}
              >
                {d === "all" ? "All" : DOMAIN_LABEL[d]} <span className="pt-tp__n">{d === "all" ? searched.length : counts[d]}</span>
              </button>
            ))}
          </div>
          <div className="pt-select pt-select--sm pt-tp__sort">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="cost">Highest expected cost</option>
              <option value="category">By category</option>
            </select>
          </div>
        </div>
        <div className="pt-tp__quick">
          <button className="sds-btn sds-btn--sm sds-btn--secondary" disabled={!recommendedKeys.length} onClick={() => setMany(recommendedKeys, true)}>
            Select recommended ({recommendedKeys.length})
          </button>
          {filtered && (
            <button className="sds-btn sds-btn--sm sds-btn--ghost" disabled={!shownKeys.length} onClick={() => setMany(shownKeys, true)}>
              Select all shown ({shownKeys.length})
            </button>
          )}
          {picked.size > 0 && (
            <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          )}
          <span className="pt-tp__hint">Recommended: the threats making up {Math.round(PARETO * 100)}% of the expected cost.</span>
        </div>
      </div>

      <div className="pt-tp__body">
        {groups.map((g) => (
          <section key={g.title || "all"} className="pt-tp__group" aria-label={g.title || "Threats"}>
            {g.title && <h3 className="pt-tp__gtitle">{g.title}</h3>}
            <ul className="pt-tp__list">
              {g.rows.map((r) => {
                const open = r.cells.filter((c) => !c.have);
                const on = open.length > 0 && open.every((c) => picked.has(c.key));
                const some = !on && open.some((c) => picked.has(c.key));
                const single = r.cells.length === 1 ? r.cells[0]! : null;
                return (
                  <li key={r.threat.key} className={`pt-tp-row ${hueClass(DOMAIN_HUE[r.threat.domain])}${on ? " is-on" : ""}${r.done ? " is-done" : ""}`}>
                    <button className="pt-tp-row__main" aria-pressed={on ? true : some ? "mixed" : false} disabled={r.done} onClick={() => toggleRow(r)}>
                      <span className={`pt-tp-box${on ? " is-on" : some ? " is-some" : ""}`} aria-hidden>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="pt-tp-row__text">
                        <span className="pt-tp-row__name">
                          {r.threat.name}
                          {r.recommended && <span className="pt-tp-rec">Recommended</span>}
                        </span>
                        <span className="pt-tp-row__desc">{r.threat.description}</span>
                        <span className="pt-tp-row__meta">
                          {DOMAIN_LABEL[r.threat.domain]} · {r.threat.category}
                          {single && ` · ${single.have ? "modelled" : frequencyLabel(single.rate)}`}
                          {single && single.target.siteId != null && ` · ${single.target.label}`}
                          {!single && r.done && " · modelled at every site"}
                        </span>
                      </span>
                      <span className="pt-tp-row__ale">
                        <b>{compactAud(r.ale)}</b>
                        <span>a year</span>
                      </span>
                    </button>
                    {!single && (
                      <div className="pt-tp-row__targets" role="group" aria-label={`Where to model ${r.threat.name}`}>
                        {r.cells.map((c) => (
                          <button
                            key={c.key}
                            className={`pt-tp-chip${picked.has(c.key) ? " is-on" : ""}`}
                            aria-pressed={c.have || picked.has(c.key)}
                            disabled={c.have}
                            title={c.have ? "Already modelled" : `${frequencyLabel(c.rate)} · ${compactAud(c.ale)} a year`}
                            onClick={() => setMany([c.key], !picked.has(c.key))}
                          >
                            {(c.have || picked.has(c.key)) && <Check size={11} strokeWidth={3} />}
                            <span className="pt-tp-chip__label">{c.target.label}</span>
                            <span className="pt-tp-chip__v">{c.have ? "modelled" : compactAud(c.ale)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {shown.length === 0 && (
          <div className="pt-tp__none">
            No threats match{q ? ` "${q}"` : ""}.{" "}
            <button
              className="pt-addlink"
              onClick={() => {
                setQ("");
                setDomain("all");
              }}
            >
              Show all
            </button>
          </div>
        )}
        {siteOnly > 0 && (
          <p className="pt-risk-note pt-tp__note">
            {siteOnly} more threats happen at a place (break-ins, violence, protest, hazards). Add a site to model them.
          </p>
        )}
        {siteId !== undefined && (
          <p className="pt-risk-note pt-tp__note">
            Showing threats for {m.sites.find((s) => s.id === siteId)?.name ?? "this site"} ({kindName(m.sites.find((s) => s.id === siteId)?.kind ?? "")}) and the organisation as a whole.
          </p>
        )}
      </div>

      <footer className="pt-tp__foot">
        <span className="pt-tp__sum">
          {picked.size ? (
            <>
              <b>{picked.size}</b> {picked.size === 1 ? "scenario" : "scenarios"}
              {pickedThreats !== picked.size && ` from ${pickedThreats} threats`} · <span className="pt-mono">{compactAud(pickedAle)}</span> a year
            </>
          ) : (
            "Nothing selected"
          )}
        </span>
        <span className="pt-tp__actions">
          <button className="sds-btn sds-btn--md sds-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button className="sds-btn sds-btn--md sds-btn--primary" disabled={!picked.size} onClick={() => void submit()}>
            Add {picked.size || ""} {picked.size === 1 ? "scenario" : "scenarios"}
          </button>
        </span>
      </footer>
    </Modal>
  );
}
