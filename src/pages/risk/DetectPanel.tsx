import { useEffect, useRef, useState } from "react";
import { Wand2, X } from "lucide-react";
import { newId, type Frame, type LevelGeometry, type OpeningKind, type Pt } from "../../../shared/geometry";
import type { SiteLevel } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { detectWalls, type DetectResult } from "../../lib/wallDetect";
import { sheetHasLevels, toGeometry } from "../../lib/planImport";

/** Walls found on the plan, in plan fractions (thickness in metres), shown before they're accepted. */
export interface Proposal {
  walls: { a: Pt; b: Pt; t: number }[];
  openings: { c: Pt; kind: OpeningKind }[];
}

/** Resolution the plan is read at: enough for 100 mm partitions on a 60 m floor. */
const READ_EDGE = 2200;

export function DetectPanel({
  level,
  frame,
  geo,
  onPreview,
  onAccept,
  onClose,
  onSplit,
}: {
  level: SiteLevel;
  frame: Frame;
  geo: LevelGeometry;
  onPreview: (p: Proposal | null) => void;
  onAccept: (g: LevelGeometry) => void;
  onClose: () => void;
  /** Opens the importer to make each separate plan on this sheet its own level. */
  onSplit: () => void;
}) {
  const t = useThreatActions();
  const [style, setStyle] = useState<"auto" | "solid" | "outline">("auto");
  const [detail, setDetail] = useState(0.5);
  const [mode, setMode] = useState<"replace" | "add">(geo.walls.length ? "replace" : "add");
  const [result, setResult] = useState<DetectResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const img = useRef<{ data: ImageData; w: number; h: number } | null>(null);

  // Read the plan's pixels once.
  useEffect(() => {
    let live = true;
    const image = new Image();
    image.src = `/api/plans/${level.plan!.fileId}`;
    image
      .decode()
      .then(() => {
        const k = Math.min(1, READ_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
        const w = Math.round(image.naturalWidth * k);
        const h = Math.round(image.naturalHeight * k);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        if (live) {
          img.current = { data: ctx.getImageData(0, 0, w, h), w, h };
          setError(null);
          run();
        }
      })
      .catch(() => live && setError("Couldn't read the plan image."));
    return () => {
      live = false;
      onPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.plan?.fileId]);

  const pxPerM = () => (img.current && level.scaleSet ? img.current.w / frame.W : null);

  const run = () => {
    if (!img.current) return;
    setBusy(true);
    // Let the spinner paint before the (synchronous) read.
    window.setTimeout(() => {
      const { data, w, h } = img.current!;
      const r = detectWalls({ data: data.data, width: w, height: h }, { style, sensitivity: 1.6 - detail * 1.2, pxPerM: pxPerM() });
      setResult(r);
      setBusy(false);
      onPreview(toProposal(r, w, h));
    }, 30);
  };
  useEffect(() => {
    if (img.current) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, detail]);

  /** Metres per image pixel: from the set scale, else the doors' suggestion, else the level's nominal width. */
  const mPerPx = () => {
    const w = img.current?.w ?? 1;
    if (level.scaleSet) return frame.W / w;
    if (result?.pxPerMSuggest) return 1 / result.pxPerMSuggest;
    return frame.W / w;
  };

  const toProposal = (r: DetectResult, w: number, h: number): Proposal => {
    const m = level.scaleSet ? frame.W / w : r.pxPerMSuggest ? 1 / r.pxPerMSuggest : frame.W / w;
    return {
      walls: r.walls.map((x) => ({ a: [x.a[0] / w, x.a[1] / h], b: [x.b[0] / w, x.b[1] / h], t: x.t * m })),
      openings: r.openings.map((o) => {
        const wl = r.walls[o.wall]!;
        return { c: [(wl.a[0] + (wl.b[0] - wl.a[0]) * o.at) / w, (wl.a[1] + (wl.b[1] - wl.a[1]) * o.at) / h], kind: o.kind };
      }),
    };
  };

  const accept = () => {
    if (!result || !img.current) return;
    const { w, h } = img.current;
    const g = toGeometry(result, w, h, mPerPx(), newId);
    onAccept(mode === "replace" ? g : { walls: [...geo.walls, ...g.walls], openings: [...geo.openings, ...g.openings] });
  };

  const doors = result?.openings.filter((o) => o.kind === "door").length ?? 0;
  const windows = result?.openings.filter((o) => o.kind === "window").length ?? 0;
  const suggestW = !level.scaleSet && result?.pxPerMSuggest && img.current ? img.current.w / result.pxPerMSuggest : null;

  return (
    <section className="pt-pl-detect-panel" aria-label="Detect walls">
      <header>
        <span className="pt-eyebrow">
          <Wand2 size={12} /> Detect walls
        </span>
        <button className="pt-iconbtn pt-iconbtn--sm" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </header>
      <p className="pt-pl-detect-panel__lede">
        Reads the plan's heaviest lines as walls and the gaps in them as doors and windows. Check the brass preview, then accept. Anything missed can be drawn with the Wall tool.
      </p>
      <div className="pt-pl-detect-panel__row">
        <span className="pt-seg" role="radiogroup" aria-label="Wall drawing style">
          {(
            [
              ["auto", "Auto"],
              ["solid", "Solid walls"],
              ["outline", "Outlined walls"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={style === k} className="pt-seg__btn pt-hue-brass" onClick={() => setStyle(k)}>
              {l}
            </button>
          ))}
        </span>
        <label className="pt-pl-detect-panel__slider">
          <span className="pt-meta">Heavy walls only</span>
          <input type="range" min={0} max={1} step={0.05} value={detail} onChange={(e) => setDetail(Number(e.target.value))} aria-label="Detail" />
          <span className="pt-meta">Thin partitions too</span>
        </label>
      </div>
      <div className="pt-pl-detect-panel__result" aria-live="polite">
        {error ? (
          <span className="pt-risk-crime__warn">{error}</span>
        ) : busy || !result ? (
          <span className="pt-meta">Reading the plan…</span>
        ) : (
          <span>
            Found <b>{result.walls.length}</b> walls, <b>{doors}</b> doors and <b>{windows}</b> windows
            {result.style === "outline" ? " (outlined walls)" : ""}.
          </span>
        )}
        {result && sheetHasLevels(result.plans) && (
          <span className="pt-pl-detect-panel__split">
            This sheet shows <b>{result.plans.length} separate plans</b>, perhaps different levels.{" "}
            <button className="pt-addlink" onClick={onSplit}>
              Make each a level
            </button>
          </span>
        )}
        {suggestW && (
          <span className="pt-pl-detect-panel__scale">
            Door widths suggest this plan is about <b className="pt-mono">{suggestW.toFixed(1)} m</b> across.{" "}
            <button className="pt-addlink" onClick={() => void t.setScale(level, suggestW)}>
              Use this scale
            </button>{" "}
            <span className="pt-meta">or measure a known wall to be exact.</span>
          </span>
        )}
      </div>
      <footer>
        {geo.walls.length > 0 && (
          <span className="pt-seg" role="radiogroup" aria-label="Existing walls">
            {(
              [
                ["replace", `Replace the ${geo.walls.length} walls`],
                ["add", "Add to them"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} className="pt-seg__btn pt-hue-slate" onClick={() => setMode(k)}>
                {l}
              </button>
            ))}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={accept} disabled={busy || !result?.walls.length}>
          Accept {result?.walls.length ?? ""} walls
        </button>
      </footer>
    </section>
  );
}
