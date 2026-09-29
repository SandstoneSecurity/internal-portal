import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Box, Camera, DoorOpen, Image as ImageIcon, Layers, Package, Plus, Square, Workflow } from "lucide-react";
import { frameOf } from "../../../shared/geometry";
import { RATING, type RatedScenario } from "../../../shared/risk";
import { ASSET_TYPES, CONTROL_BY_KEY, DOMAIN_LABEL, THREATS, type AssetType } from "../../../shared/threatLibrary";
import type { TmElement } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { Empty, RowMenu, SectionHead } from "../../components/ui/Bits";
import { usePortal } from "../../lib/DataProvider";
import { hueClass, type Hue } from "../../lib/hues";
import { DOMAIN_HUE, RATING_HUE, compactAud, frequencyLabel, meanOf, useClientModel } from "../../lib/riskModel";
import { AttackPaths } from "./AttackPaths";
import { SiteCrimeProfile } from "./CrimeProfile";
import { kindLabel } from "./ClientRisk";
import { ScenarioPicker } from "./ScenarioPicker";
import { PlanView, ZONE_HUE, type Pick, type Tool } from "./PlanView";
import { BuildInspector, ModelSummary } from "./BuildInspector";
import { useGeometry } from "../../lib/useGeometry";
import { GuideButton, Term } from "./Guide";

const Site3D = lazy(() => import("./Site3D"));
const VIEWS = [
  { key: "plan", label: "Plan", icon: ImageIcon },
  { key: "3d", label: "3D", icon: Box },
  { key: "paths", label: "Attack paths", icon: Workflow },
] as const;
type View = (typeof VIEWS)[number]["key"];
const assetLabel = (k: string) => ASSET_TYPES.find(([v]) => v === k)?.[1] ?? k;

export function SiteWorkspace({ clientId, siteId }: { clientId: number; siteId: number }) {
  const d = usePortal();
  const m = useClientModel(clientId);
  const t = useThreatActions();
  const [params, setParams] = useSearchParams();
  const view: View = (["plan", "3d", "paths"] as const).includes(params.get("view") as View) ? (params.get("view") as View) : "plan";
  const [selected, setSelectedEl] = useState<number | null>(null);
  const [pick, setPickState] = useState<Pick | null>(null);
  const [toolReq, setToolReq] = useState<{ tool: Tool; n: number } | null>(null);
  const [adding, setAdding] = useState(false);
  // One thing is selected at a time: a model element, or a wall, opening or camera.
  const setSelected = (id: number | null) => {
    setSelectedEl(id);
    if (id != null) setPickState(null);
  };
  const setPick = (p: Pick | null) => {
    setPickState(p);
    if (p) setSelectedEl(null);
  };
  const site = m?.sites.find((s) => s.id === siteId);
  const levelParam = Number(params.get("level")) || null;
  const levels = useMemo(() => [...(site?.levels ?? [])].sort((a, b) => a.order - b.order), [site]);
  const level = levels.find((l) => l.id === levelParam) ?? levels[0] ?? null;
  const elements = useMemo(() => (m ? m.elements.filter((e) => e.siteId === siteId) : []), [m, siteId]);
  const geoApi = useGeometry(level);
  const siteCams = useMemo(() => d.tmCameras.filter((c) => c.siteId === siteId), [d.tmCameras, siteId]);
  const levelCams = useMemo(() => siteCams.filter((c) => c.levelId === (level?.id ?? null)), [siteCams, level]);
  const camView = Number(params.get("cam")) || null;
  const aimed = useMemo(() => new Map(d.tmScenarios.filter((s) => s.elementId != null).map((s) => [s.id, s.elementId!])), [d.tmScenarios]);

  // Each asset takes the worst rating among the scenarios aimed at it (or at its type, at this site).
  const risk = useMemo(() => {
    const out = new Map<number, Hue>();
    if (!m) return out;
    for (const e of elements) {
      if (e.kind !== "asset") continue;
      const hits = m.rows.filter((r) => (aimed.get(r.s.id) === e.id || (r.s.siteId === siteId && !aimed.has(r.s.id))) && r.s.threat?.targets.includes(e.subtype as AssetType));
      const worst = hits.reduce((w, r) => Math.max(w, RATING.indexOf(r.rating)), -1);
      if (worst >= 0) out.set(e.id, RATING_HUE[RATING[worst]!]!);
    }
    return out;
  }, [m, elements, aimed, siteId]);

  if (!m || !site) return <Empty title="That site no longer exists." action={<Link to={`/risk?client=${clientId}&tab=Sites`}>Back to sites</Link>} />;
  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v);
      return n;
    });
  const siteRows = m.rows.filter((r) => r.s.siteId === siteId);
  const siteAle = siteRows.reduce((n, r) => n + r.currentAle, 0);
  const sel = elements.find((e) => e.id === selected) ?? null;
  const frame = level ? frameOf(level) : null;
  const onLevelEls = elements.filter((e) => e.levelId === level?.id && e.x != null);
  const viewCamera = (id: number) => {
    const c = siteCams.find((x) => x.id === id);
    set({ view: "3d", cam: String(id), ...(c?.levelId ? { level: String(c.levelId) } : {}) });
  };
  const pickCamera = (id: number) => {
    const c = siteCams.find((x) => x.id === id);
    if (c?.levelId && c.levelId !== level?.id) set({ level: String(c.levelId) });
    setPick({ kind: "camera", id });
  };

  return (
    <div className="pt-risk">
      <Link to={`/risk?client=${clientId}&tab=Sites`} className="pt-ats-back">
        <ArrowLeft size={14} /> {m.client.org}
      </Link>
      <header className="pt-risk-head">
        <div>
          <span className="pt-eyebrow">{kindLabel(site.kind)}</span>
          <h2 className="pt-risk-head__title">{site.name}</h2>
          <div className="pt-risk-head__facts">
            <span>{[site.address, site.suburb, site.state, site.postcode].filter(Boolean).join(", ") || "Address not set"}</span>
            <span>{site.occupants} people</span>
            <span>{site.hours}</span>
            <span>{site.lga && d.crime.rates[site.lga] ? `${site.lga} LGA` : `Crime ×${site.crimeFactor} (manual)`}</span>
          </div>
        </div>
        <div className="pt-risk-head__actions">
          <span className="pt-risk-head__ale">
            {compactAud(siteAle)}
            <span className="pt-meta">
              expected a year at this site
              <Term k="ale" />
            </span>
          </span>
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => t.editSite(site)}>
            Edit site
          </button>
          <GuideButton topic="site" />
        </div>
      </header>

      <div className={`pt-risk-ws${view === "paths" ? " pt-risk-ws--wide" : ""}`}>
        <aside className="pt-risk-tree" aria-label="Model browser">
          <div className="pt-risk-tree__head">
            <span className="pt-eyebrow">Model</span>
            <RowMenu
              label="Add to model"
              trigger={<Plus size={15} />}
              items={[
                { label: "Zone", onSelect: () => t.addElement(site, "zone", { levelId: level?.id }) },
                { label: "Asset", onSelect: () => t.addElement(site, "asset", { levelId: level?.id }) },
                { label: "Entry point", onSelect: () => t.addElement(site, "entry", { levelId: level?.id }) },
                { label: "Level", onSelect: () => t.addLevel(site) },
              ]}
            />
          </div>
          <div className="pt-risk-tree__group">
            <div className="pt-risk-tree__label">
              <Layers size={12} /> Levels
            </div>
            {levels.map((l) => (
              <div key={l.id} className={`pt-risk-tree__item pt-risk-tree__level${level?.id === l.id ? " is-on" : ""}`}>
                <button onClick={() => set({ level: String(l.id), view: view === "paths" ? "plan" : view })}>
                  {l.name}
                  <span className="pt-meta">{l.plan ? "plan" : "no plan"}</span>
                </button>
                <RowMenu label={`${l.name} options`} items={[{ label: "Edit level", onSelect: () => t.editLevel(l) }]} />
              </div>
            ))}
          </div>
          <Tree elements={elements} selected={selected} onSelect={setSelected} risk={risk} />
          <div className="pt-risk-tree__group">
            <div className="pt-risk-tree__label">
              <Camera size={12} /> Cameras
            </div>
            {siteCams.length === 0 && <p className="pt-dim pt-risk-tree__none">Place cameras with the Camera tool on the plan.</p>}
            {siteCams.map((c) => (
              <button key={c.id} className={`pt-risk-tree__item pt-risk-tree__el pt-hue-brass${pick?.kind === "camera" && pick.id === c.id ? " is-on" : ""}`} onClick={() => pickCamera(c.id)}>
                <span className="pt-risk-tree__icon">
                  <Camera size={12} />
                </span>
                <span className="pt-risk-tree__name">{c.name}</span>
                <span className="pt-meta">{levels.find((l) => l.id === c.levelId)?.name ?? ""}</span>
              </button>
            ))}
          </div>
          <div className="pt-risk-tree__group">
            <div className="pt-risk-tree__label">Scenarios here</div>
            {siteRows.length === 0 && <p className="pt-dim pt-risk-tree__none">None yet.</p>}
            {siteRows.map((r) => (
              <button key={r.s.id} className={`pt-risk-tree__item pt-risk-tree__scn ${hueClass(DOMAIN_HUE[r.s.domain])}`} onClick={() => t.editScenario(clientId, r)}>
                <span className="pt-chip__dot" />
                <span className="pt-risk-tree__name">{r.s.name}</span>
                <span className={`pt-risk-tree__rating ${hueClass(RATING_HUE[r.rating]!)}`}>{r.rating[0]}</span>
              </button>
            ))}
            <button className="pt-addlink pt-risk-tree__add" onClick={() => setAdding(true)}>
              + Threats for this site
            </button>
          </div>
        </aside>

        <section className="pt-risk-stage">
          <div className="pt-risk-stage__bar">
            <span className="pt-seg" role="radiogroup" aria-label="View">
              {VIEWS.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" role="radio" aria-checked={view === key} className="pt-seg__btn pt-hue-slate" onClick={() => set({ view: key === "plan" ? null : key, cam: null })}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </span>
            {view === "paths" && <Term k="paths" />}
            {view === "plan" && levels.length > 1 && (
              <div className="pt-select pt-select--sm">
                <select value={level?.id ?? ""} onChange={(e) => set({ level: e.target.value })} aria-label="Level">
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {view === "plan" && (
            <PlanView
              site={site}
              level={level}
              elements={elements}
              risk={risk}
              selected={selected}
              onSelect={setSelected}
              geo={geoApi}
              cameras={levelCams}
              pick={pick}
              onPick={setPick}
              toolRequest={toolReq}
            />
          )}
          {view === "3d" && (
            <Suspense fallback={<div className="pt-risk-3d pt-skeleton" />}>
              <Site3D
                levels={levels}
                elements={elements}
                risk={risk}
                selected={selected}
                onSelect={setSelected}
                cameras={siteCams}
                camView={camView}
                onCamView={(id) => set({ cam: id == null ? null : String(id) })}
                onPickCamera={pickCamera}
                pickedCamera={pick?.kind === "camera" ? pick.id : null}
              />
            </Suspense>
          )}
          {view === "paths" && <AttackPaths m={m} site={site} aimed={aimed} onSelect={setSelected} onScenario={(r) => t.editScenario(clientId, r)} />}
        </section>

        <aside className="pt-risk-inspector" aria-label="Inspector">
          {pick && level && frame ? (
            <BuildInspector
              pick={pick}
              onPick={setPick}
              level={level}
              frame={frame}
              geoApi={geoApi}
              cameras={levelCams}
              zones={onLevelEls.filter((e) => e.kind === "zone")}
              entries={onLevelEls.filter((e) => e.kind === "entry")}
              onViewCamera={viewCamera}
            />
          ) : sel ? (
            <Inspector el={sel} clientId={clientId} rows={m.rows} aimed={aimed} onClose={() => setSelected(null)} zones={elements.filter((e) => e.kind === "zone")} />
          ) : (
            <>
              {level && frame && (
                <ModelSummary
                  level={level}
                  frame={frame}
                  geo={geoApi.geo}
                  cameras={levelCams}
                  zones={onLevelEls.filter((e) => e.kind === "zone")}
                  entries={onLevelEls.filter((e) => e.kind === "entry")}
                  onMeasure={() => {
                    set({ view: null, cam: null });
                    setToolReq({ tool: "measure", n: Date.now() });
                  }}
                />
              )}
              <SiteCrimeProfile site={site} onEdit={() => t.editSite(site)} />
              <SectionHead title="This site" />
              <dl className="pt-risk-insp__facts">
                <dt>Expected loss</dt>
                <dd>{compactAud(siteAle)} a year</dd>
                <dt>Share of client</dt>
                <dd>{m.totals.current > 0 ? `${Math.round((siteAle / m.totals.current) * 100)}%` : "—"}</dd>
                <dt>Elements</dt>
                <dd>
                  {elements.filter((e) => e.kind === "zone").length} zones · {elements.filter((e) => e.kind === "asset").length} assets · {elements.filter((e) => e.kind === "entry").length} entries
                </dd>
              </dl>
              <SectionHead title="Controls here" />
              <ul className="pt-risk-insp__list">
                {m.controls.filter((c) => c.siteId === siteId).length === 0 && <li className="pt-dim">None recorded at this site.</li>}
                {d.tmControls
                  .filter((c) => c.clientId === clientId && c.siteId === siteId)
                  .map((c) => (
                    <li key={c.id}>
                      <button className="pt-risk-insp__row" onClick={() => t.editControl(c)}>
                        <span>{CONTROL_BY_KEY.get(c.controlKey)?.name}</span>
                        <span className="pt-meta">{c.status}</span>
                      </button>
                    </li>
                  ))}
              </ul>
              <p className="pt-risk-note">Select a wall, camera, zone, asset or entry point on the plan, in 3D or in the model browser to inspect it.</p>
            </>
          )}
        </aside>
      </div>
      <ScenarioPicker m={m} open={adding} onClose={() => setAdding(false)} siteId={siteId} />
    </div>
  );
}

/** Containment tree: zones hold zones, assets and entry points; the rest sit at the bottom. */
function Tree({ elements, selected, onSelect, risk }: { elements: TmElement[]; selected: number | null; onSelect: (id: number) => void; risk: Map<number, Hue> }) {
  const zones = elements.filter((e) => e.kind === "zone");
  const icon = (e: TmElement) => (e.kind === "zone" ? <Square size={12} /> : e.kind === "asset" ? <Package size={12} /> : <DoorOpen size={12} />);
  const renderItem = (e: TmElement, depth: number): JSX.Element => (
    <div key={e.id}>
      <button
        className={`pt-risk-tree__item pt-risk-tree__el ${hueClass(e.kind === "zone" ? ZONE_HUE[e.subtype] ?? "slate" : risk.get(e.id) ?? (e.kind === "entry" ? "harbour" : "slate"))}${selected === e.id ? " is-on" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelect(e.id)}
        data-tree={e.id}
      >
        <span className="pt-risk-tree__icon">{icon(e)}</span>
        <span className="pt-risk-tree__name">{e.name}</span>
        {e.x == null && <span className="pt-meta">unplaced</span>}
      </button>
      {e.kind === "zone" && elements.filter((c) => c.zoneId === e.id).map((c) => renderItem(c, depth + 1))}
    </div>
  );
  const top = zones.filter((z) => z.zoneId == null);
  const loose = elements.filter((e) => e.kind !== "zone" && e.zoneId == null);
  return (
    <div className="pt-risk-tree__group">
      <div className="pt-risk-tree__label">
        <Square size={12} /> Zones &amp; assets
      </div>
      {elements.length === 0 && <p className="pt-dim pt-risk-tree__none">Draw zones and place assets and entry points on the plan.</p>}
      {top.map((z) => renderItem(z, 0))}
      {loose.length > 0 && (
        <>
          <div className="pt-risk-tree__sublabel pt-meta">Not in a zone</div>
          {loose.map((e) => renderItem(e, 0))}
        </>
      )}
    </div>
  );
}

function Inspector({
  el,
  clientId,
  rows,
  aimed,
  zones,
  onClose,
}: {
  el: TmElement;
  clientId: number;
  rows: RatedScenario[];
  aimed: Map<number, number>;
  zones: TmElement[];
  onClose: () => void;
}) {
  const t = useThreatActions();
  const d = usePortal();
  const relevant =
    el.kind === "asset"
      ? rows.filter((r) => aimed.get(r.s.id) === el.id || (r.s.siteId === el.siteId && !aimed.has(r.s.id) && r.s.threat?.targets.includes(el.subtype as AssetType)))
      : el.kind === "entry"
        ? rows.filter((r) => r.s.siteId === el.siteId && (r.s.domain === "cyber") === (el.subtype === "Network" || el.subtype === "Remote access"))
        : rows.filter((r) => r.s.siteId === el.siteId);
  const aimedHere = new Set(d.tmScenarios.filter((s) => s.elementId === el.id).map((s) => s.threatKey));
  const addable = el.kind === "asset" ? THREATS.filter((th) => th.exposure === "site" && th.targets.includes(el.subtype as AssetType) && !aimedHere.has(th.key)) : [];
  return (
    <div className="pt-risk-insp">
      <div className="pt-risk-insp__head">
        <span className="pt-eyebrow">{el.kind === "entry" ? "Entry point" : el.kind === "zone" ? "Zone" : "Asset"}</span>
        <button className="pt-iconbtn pt-iconbtn--sm" aria-label="Close inspector" onClick={onClose}>
          ✕
        </button>
      </div>
      <h3 className="pt-risk-insp__title">{el.name}</h3>
      <dl className="pt-risk-insp__facts">
        <dt>Type</dt>
        <dd>{el.kind === "asset" ? assetLabel(el.subtype) : el.subtype || "—"}</dd>
        {el.kind === "asset" && (
          <>
            <dt>Value at risk</dt>
            <dd>{el.value ? compactAud(el.value) : "Not set"}</dd>
          </>
        )}
        <dt>Criticality</dt>
        <dd>
          <span className="pt-risk-crit" aria-label={`${el.criticality} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} className={i <= el.criticality ? "is-on" : ""} />
            ))}
          </span>
        </dd>
        <dt>Zone</dt>
        <dd>{zones.find((z) => z.id === el.zoneId)?.name ?? "—"}</dd>
        <dt>On plan</dt>
        <dd>{el.x != null ? `${Math.round(el.x * 100)}%, ${Math.round((el.y ?? 0) * 100)}%` : "Not placed"}</dd>
      </dl>
      <div className="pt-risk-insp__actions">
        <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => t.editElement(el)}>
          Edit
        </button>
        {el.x != null && (
          <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => void t.placeElement(el, { x: null, y: null })}>
            Take off plan
          </button>
        )}
      </div>
      <SectionHead title={el.kind === "asset" ? "Threats to this asset" : "Scenarios"} meta={relevant.length || undefined} />
      <ul className="pt-risk-insp__list">
        {relevant.length === 0 && <li className="pt-dim">None modelled.</li>}
        {relevant.map((r) => (
          <li key={r.s.id}>
            <button className={`pt-risk-insp__row ${hueClass(DOMAIN_HUE[r.s.domain])}`} onClick={() => t.editScenario(clientId, r)}>
              <span className={`pt-chip ${hueClass(RATING_HUE[r.rating]!)}`}>{r.rating}</span>
              <span>
                {r.s.name}
                <span className="pt-meta">
                  {frequencyLabel(meanOf(r.s.rate))} · {compactAud(r.currentAle)}/yr{aimed.get(r.s.id) === el.id ? " · aimed here" : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {addable.length > 0 && (
        <>
          <SectionHead title="Aim a threat at this asset" />
          <div className="pt-risk-insp__chips">
            {addable.map((th) => (
              <button key={th.key} className={`pt-chip ${hueClass(DOMAIN_HUE[th.domain])}`} title={`${DOMAIN_LABEL[th.domain]} · ${th.category}`} onClick={() => void t.addScenario(clientId, { threatKey: th.key, siteId: el.siteId, elementId: el.id })}>
                + {th.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
