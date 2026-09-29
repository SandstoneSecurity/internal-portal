import { useEffect, useMemo, useState } from "react";
import { Box, Trash2 } from "lucide-react";
import { CAMERA_KINDS, DORI, LENSES, RESOLUTIONS, blockersOf, coverage, coverageAt, coverageIn, doriLevel, reachFor, vfovOf } from "../../../shared/cameras";
import {
  OPENING_KINDS,
  OPENING_WIDTH,
  WALL_KINDS,
  WALL_THICKNESS,
  ceilingOf,
  newId,
  toF,
  wallRun,
  type Frame,
  type LevelGeometry,
  type OpeningKind,
  type WallKind,
} from "../../../shared/geometry";
import type { SiteLevel, TmCamera, TmElement } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { SectionHead } from "../../components/ui/Bits";
import type { GeometryApi } from "../../lib/useGeometry";
import { Hint } from "../../components/ui/Hint";
import { placed, type Pick } from "./PlanView";

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** A number field that saves on Enter or when it loses focus. */
function NumField({ label, value, onSave, step = 0.01, min, max, suffix, hint }: { label: string; value: number | null; onSave: (v: number | null) => void; step?: number; min?: number; max?: number; suffix?: string; hint?: string }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  const save = () => {
    if (draft.trim() === "") return value == null ? undefined : onSave(null);
    const v = Number(draft);
    if (!Number.isFinite(v)) return setDraft(value == null ? "" : String(value));
    const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
    if (c !== value) onSave(c);
    setDraft(String(c));
  };
  return (
    <label className="pt-bi-field">
      <span>
        {label}
        {hint && <Hint text={hint} />}
      </span>
      <span className="pt-bi-input">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={draft}
          placeholder={value == null ? "auto" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}

function SelField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <label className="pt-bi-field">
      <span>{label}</span>
      <span className="pt-select pt-select--sm">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Head({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <>
      <div className="pt-risk-insp__head">
        <span className="pt-eyebrow">{eyebrow}</span>
        <button className="pt-iconbtn pt-iconbtn--sm" aria-label="Close inspector" onClick={onClose}>
          ✕
        </button>
      </div>
      <h3 className="pt-risk-insp__title">{title}</h3>
    </>
  );
}

export function BuildInspector({ pick, onPick, level, frame, geoApi, cameras, zones, entries, onViewCamera }: {
  pick: Pick;
  onPick: (p: Pick | null) => void;
  level: SiteLevel;
  frame: Frame;
  geoApi: GeometryApi;
  cameras: TmCamera[];
  zones: TmElement[];
  entries: TmElement[];
  onViewCamera: (id: number) => void;
}) {
  const geo = geoApi.geo;
  const commit = (g: LevelGeometry) => void geoApi.commit(g);
  if (pick.kind === "wall") {
    const wall = geo.walls.find((w) => w.id === pick.id);
    if (!wall) return null;
    const run = wallRun(wall, geo.openings, frame);
    const set = (patch: Partial<typeof wall>) => commit({ ...geo, walls: geo.walls.map((w) => (w.id === wall.id ? { ...w, ...patch } : w)) });
    const setLength = (len: number | null) => {
      if (!len || len <= 0.05) return;
      const b = toF([run.a[0] + run.dir[0] * len, run.a[1] + run.dir[1] * len], frame);
      set({ b });
    };
    const addOpening = (kind: OpeningKind) => {
      const w = Math.min(OPENING_WIDTH[kind], run.len * 0.9);
      const o = { id: newId("o"), wall: wall.id, at: 0.5, w, kind };
      commit({ ...geo, openings: [...geo.openings, o] });
      onPick({ kind: "opening", id: o.id });
    };
    return (
      <div className="pt-risk-insp pt-bi">
        <Head eyebrow={WALL_KINDS.find(([k]) => k === wall.kind)?.[1] ?? "Wall"} title={`${round(run.len)} m long`} onClose={() => onPick(null)} />
        <div className="pt-bi-grid">
          <SelField
            label="Type"
            value={wall.kind}
            options={WALL_KINDS}
            onChange={(k: WallKind) => set({ kind: k, t: Math.abs(wall.t - WALL_THICKNESS[wall.kind]) < 0.005 ? WALL_THICKNESS[k] : wall.t })}
          />
          <NumField label="Thickness" value={Math.round(wall.t * 1000)} suffix="mm" step={10} min={10} max={3000} onSave={(v) => v && set({ t: v / 1000 })} />
          <NumField label="Length" value={round(run.len)} suffix="m" min={0.1} max={2000} onSave={setLength} hint="Changing the length moves the wall's far end along its line." />
          <NumField
            label="Height"
            value={wall.h}
            suffix="m"
            step={0.1}
            min={0.3}
            max={30}
            onSave={(v) => set({ h: v })}
            hint={`Blank uses the level's ceiling (${ceilingOf(level.heightM).toFixed(1)} m). Set a lower height for part-height screens and counters.`}
          />
        </div>
        <SectionHead title="Openings" meta={run.gaps.length || undefined} />
        <ul className="pt-risk-insp__list">
          {run.gaps.length === 0 && <li className="pt-dim">None. Add one below, or use the Door and Window tools.</li>}
          {run.gaps.map((g) => (
            <li key={g.opening.id}>
              <button className="pt-risk-insp__row" onClick={() => onPick({ kind: "opening", id: g.opening.id })}>
                <span>{OPENING_KINDS.find(([k]) => k === g.opening.kind)?.[1]}</span>
                <span className="pt-meta">
                  {g.opening.w} m wide · {round(g.s0)} m from the start
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pt-risk-insp__actions">
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => addOpening("door")}>
            + Door
          </button>
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => addOpening("window")}>
            + Window
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link"
            onClick={() => {
              commit({ walls: geo.walls.filter((w) => w.id !== wall.id), openings: geo.openings.filter((o) => o.wall !== wall.id) });
              onPick(null);
            }}
          >
            <Trash2 size={13} /> Delete wall
          </button>
        </div>
        <p className="pt-risk-note">Drag the round handles on the plan to move either end. Corners shared with other walls move together. Ctrl Z undoes.</p>
      </div>
    );
  }

  if (pick.kind === "opening") {
    const o = geo.openings.find((x) => x.id === pick.id);
    const wall = o && geo.walls.find((w) => w.id === o.wall);
    if (!o || !wall) return null;
    const run = wallRun(wall, geo.openings, frame);
    const set = (patch: Partial<typeof o>) => commit({ ...geo, openings: geo.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) });
    return (
      <div className="pt-risk-insp pt-bi">
        <Head eyebrow="Opening" title={OPENING_KINDS.find(([k]) => k === o.kind)?.[1] ?? "Opening"} onClose={() => onPick(null)} />
        <div className="pt-bi-grid">
          <SelField label="Type" value={o.kind} options={OPENING_KINDS} onChange={(k: OpeningKind) => set({ kind: k, w: Math.abs(o.w - OPENING_WIDTH[o.kind]) < 0.01 ? Math.min(OPENING_WIDTH[k], run.len) : o.w })} />
          <NumField label="Width" value={o.w} suffix="m" min={0.3} max={Math.max(0.3, run.len)} onSave={(v) => v && set({ w: v })} />
          <NumField
            label="From wall start"
            value={round(o.at * run.len - o.w / 2)}
            suffix="m"
            min={0}
            max={Math.max(0, run.len - o.w)}
            onSave={(v) => v != null && set({ at: (v + o.w / 2) / run.len })}
            hint="Distance from the wall's first end to the near side of the opening."
          />
        </div>
        <p className="pt-risk-note">Closed doors and roller doors block camera views; windows and open doorways don't.</p>
        <div className="pt-risk-insp__actions">
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => onPick({ kind: "wall", id: wall.id })}>
            Select its wall
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link"
            onClick={() => {
              commit({ ...geo, openings: geo.openings.filter((x) => x.id !== o.id) });
              onPick(null);
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }

  const cam = cameras.find((c) => c.id === pick.id);
  if (!cam) return null;
  return <CameraInspector cam={cam} level={level} frame={frame} geo={geo} cameras={cameras} zones={zones} entries={entries} onClose={() => onPick(null)} onView={() => onViewCamera(cam.id)} />;
}

function CameraInspector({ cam, frame, geo, zones, entries, onClose, onView }: {
  cam: TmCamera;
  level: SiteLevel;
  frame: Frame;
  geo: LevelGeometry;
  cameras: TmCamera[];
  zones: TmElement[];
  entries: TmElement[];
  onClose: () => void;
  onView: () => void;
}) {
  const t = useThreatActions();
  const [tilt, setTilt] = useState(cam.tilt);
  const [hfov, setHfov] = useState(cam.hfov);
  useEffect(() => setTilt(cam.tilt), [cam.tilt]);
  useEffect(() => setHfov(cam.hfov), [cam.hfov]);
  const save = (patch: Partial<TmCamera>) => void t.updateCamera(cam, patch);
  const live = { ...cam, tilt, hfov };
  const fisheye = cam.kind === "fisheye";
  const lens = LENSES.find((l) => Math.abs(l.hfov - cam.hfov) < 0.5);
  const res = RESOLUTIONS.find((r) => r.w === cam.resW && r.h === cam.resH);

  // What this camera alone covers: zones by share of area, entry points by detail.
  const mine = useMemo(() => {
    const cov = coverage(placed([live], frame), blockersOf(geo, frame), frame);
    return {
      zones: zones
        .filter((z) => z.w && z.h)
        .map((z) => ({ z, share: coverageIn(cov, z.x! * frame.W, z.y! * frame.D, z.w! * frame.W, z.h! * frame.D) }))
        .filter((x) => x.share[3]! > 0.02),
      entries: entries.map((e) => ({ e, lvl: doriLevel(coverageAt(cov, e.x! * frame.W, e.y! * frame.D)) })).filter((x) => x.lvl < DORI.length),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, tilt, hfov, geo, frame.W, frame.D, zones, entries]);

  return (
    <div className="pt-risk-insp pt-bi">
      <Head eyebrow="Camera" title={cam.name} onClose={onClose} />
      <div className="pt-risk-insp__actions">
        <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={onView}>
          <Box size={13} /> View through camera
        </button>
      </div>
      <div className="pt-bi-grid">
        <label className="pt-bi-field pt-bi-field--wide">
          <span>Name</span>
          <input className="pt-bi-text" defaultValue={cam.name} key={cam.name} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value !== cam.name && save({ name: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </label>
        <SelField
          label="Type"
          value={cam.kind}
          options={CAMERA_KINDS}
          onChange={(k) => save(k === "fisheye" ? { kind: k, hfov: 180, tilt: 90, resW: 4000, resH: 3000 } : { kind: k, hfov: cam.kind === "fisheye" ? 85 : cam.hfov, tilt: cam.kind === "fisheye" ? 25 : cam.tilt })}
        />
        {!fisheye && (
          <label className="pt-bi-field">
            <span>Lens</span>
            <span className="pt-select pt-select--sm">
              <select value={lens ? String(lens.hfov) : "custom"} onChange={(e) => e.target.value !== "custom" && save({ hfov: Number(e.target.value) })}>
                {LENSES.map((l) => (
                  <option key={l.hfov} value={l.hfov}>
                    {l.label}
                  </option>
                ))}
                {!lens && <option value="custom">Custom ({Math.round(cam.hfov)}°)</option>}
              </select>
            </span>
          </label>
        )}
        <label className="pt-bi-field">
          <span>Resolution</span>
          <span className="pt-select pt-select--sm">
            <select value={res ? `${res.w}x${res.h}` : "custom"} onChange={(e) => e.target.value !== "custom" && save({ resW: Number(e.target.value.split("x")[0]), resH: Number(e.target.value.split("x")[1]) })}>
              {RESOLUTIONS.map((r) => (
                <option key={r.label} value={`${r.w}x${r.h}`}>
                  {r.label}
                </option>
              ))}
              {!res && (
                <option value="custom">
                  {cam.resW} × {cam.resH}
                </option>
              )}
            </select>
          </span>
        </label>
        <NumField label="Mounting height" value={cam.heightM} suffix="m" step={0.1} min={0.5} max={30} onSave={(v) => v && save({ heightM: v })} />
        <NumField label="Useful range" value={cam.rangeM} suffix="m" step={1} min={0} max={1000} onSave={(v) => save({ rangeM: v ?? 0 })} hint="How far the lighting or the camera's infrared reaches at night. 0 means resolution is the only limit." />
        {!fisheye && (
          <>
            <label className="pt-bi-field pt-bi-field--wide">
              <span>
                Field of view <b className="pt-mono">{Math.round(hfov)}° × {Math.round(vfovOf(live))}°</b>
              </span>
              <input type="range" min={8} max={120} step={1} value={hfov} onChange={(e) => setHfov(Number(e.target.value))} onPointerUp={() => save({ hfov })} onKeyUp={() => save({ hfov })} aria-label="Horizontal field of view" />
            </label>
            <label className="pt-bi-field pt-bi-field--wide">
              <span>
                Tilt down <b className="pt-mono">{Math.round(tilt)}°</b>
              </span>
              <input type="range" min={0} max={90} step={1} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} onPointerUp={() => save({ tilt })} onKeyUp={() => save({ tilt })} aria-label="Tilt" />
            </label>
            <NumField label="Direction" value={Math.round(((cam.yaw % 360) + 360) % 360)} suffix="°" step={1} min={0} max={359} onSave={(v) => v != null && save({ yaw: v })} hint="Degrees clockwise from the right-hand edge of the plan. Easier: drag the round handle on the plan." />
          </>
        )}
      </div>

      <SectionHead title="Detail by distance" />
      <table className="pt-bi-dori">
        <tbody>
          {DORI.map((d) => {
            const slant = reachFor(live, d.ppm);
            const ground = Math.sqrt(Math.max(0, slant * slant - cam.heightM * cam.heightM));
            return (
              <tr key={d.key} title={d.hint}>
                <th>{d.label}</th>
                <td className="pt-mono">{ground > 0.1 ? `to ${ground >= 10 ? Math.round(ground) : ground.toFixed(1)} m` : "out of reach"}</td>
                <td className="pt-meta">{d.ppm} px/m</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pt-risk-note">Distances along the floor, before walls. The coloured area on the plan shows what the camera actually sees.</p>

      <SectionHead title="What it covers" />
      {mine.zones.length === 0 && mine.entries.length === 0 ? (
        <p className="pt-dim" style={{ fontSize: 13 }}>
          No zones or entry points in view yet.
        </p>
      ) : (
        <ul className="pt-risk-insp__list">
          {mine.entries.map(({ e, lvl }) => (
            <li key={e.id} className="pt-bi-cov">
              <span>{e.name}</span>
              <span className={`pt-bi-dot pt-bi-dot--${lvl}`}>{DORI[lvl]!.label}</span>
            </li>
          ))}
          {mine.zones.map(({ z, share }) => (
            <li key={z.id} className="pt-bi-cov">
              <span>{z.name}</span>
              <span className="pt-meta">
                {Math.round(share[1]! * 100)}% recognise · {Math.round(share[3]! * 100)}% detect
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-risk-insp__actions">
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link" onClick={() => void t.deleteCamera(cam)}>
          <Trash2 size={13} /> Delete camera
        </button>
      </div>
    </div>
  );
}

/** Level summary: how complete the building model is, and how well cameras cover it. */
export function ModelSummary({ level, frame, geo, cameras, zones, entries, onMeasure }: {
  level: SiteLevel;
  frame: Frame;
  geo: LevelGeometry;
  cameras: TmCamera[];
  zones: TmElement[];
  entries: TmElement[];
  onMeasure: () => void;
}) {
  const stats = useMemo(() => {
    if (!cameras.length) return null;
    const cov = coverage(placed(cameras, frame), blockersOf(geo, frame), frame);
    const z = zones.filter((x) => x.w && x.h).map((x) => coverageIn(cov, x.x! * frame.W, x.y! * frame.D, x.w! * frame.W, x.h! * frame.D));
    const areas = zones.filter((x) => x.w && x.h).map((x) => x.w! * x.h!);
    const total = areas.reduce((n, a) => n + a, 0);
    const weighted = (k: number) => (total ? z.reduce((n, s, i) => n + s[k]! * areas[i]!, 0) / total : 0);
    const ent = entries.map((e) => doriLevel(coverageAt(cov, e.x! * frame.W, e.y! * frame.D)));
    return { recognise: weighted(1), detect: weighted(3), zones: z.length, identifyEntries: ent.filter((l) => l <= 0).length, seenEntries: ent.filter((l) => l < DORI.length).length };
  }, [cameras, geo, frame.W, frame.D, zones, entries]);
  const doors = geo.openings.filter((o) => o.kind !== "window").length;
  const windows = geo.openings.length - doors;
  return (
    <>
      <SectionHead title="Building model" meta={level.name} />
      <dl className="pt-risk-insp__facts">
        <dt>Scale</dt>
        <dd>
          {level.scaleSet ? (
            `${level.widthM} m across`
          ) : (
            <button className="pt-addlink" onClick={onMeasure}>
              Not set · measure a wall
            </button>
          )}
        </dd>
        <dt>Walls</dt>
        <dd>
          {geo.walls.length} · {doors} doors · {windows} windows
        </dd>
        <dt>Cameras</dt>
        <dd>{cameras.length}</dd>
      </dl>
      {stats && (
        <>
          <SectionHead title="CCTV coverage" />
          <dl className="pt-risk-insp__facts">
            {stats.zones > 0 && (
              <>
                <dt>
                  Zones at recognise
                  <Hint text="Share of zone floor area where a known person could be recognised (125 px/m or more), with walls blocking the view." />
                </dt>
                <dd>{Math.round(stats.recognise * 100)}%</dd>
                <dt>Zones seen at all</dt>
                <dd>{Math.round(stats.detect * 100)}%</dd>
              </>
            )}
            {entries.length > 0 && (
              <>
                <dt>
                  Entries identified
                  <Hint text="Entry points where a camera captures enough detail to identify a stranger (250 px/m or more)." />
                </dt>
                <dd>
                  {stats.identifyEntries} of {entries.length}
                </dd>
                <dt>Entries in view</dt>
                <dd>
                  {stats.seenEntries} of {entries.length}
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </>
  );
}
