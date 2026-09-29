import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  DoorOpen,
  Hand,
  Layers,
  Maximize,
  MousePointer2,
  Package,
  PanelTop,
  Redo2,
  Ruler,
  Square,
  Undo2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DORI, blockersOf, coverage, doriLevel, viewPolygon, type PlacedCamera } from "../../../shared/cameras";
import {
  OPENING_KINDS,
  OPENING_WIDTH,
  WALL_KINDS,
  WALL_THICKNESS,
  dist,
  frameOf,
  newId,
  project,
  toF,
  toM,
  wallRun,
  type Frame,
  type LevelGeometry,
  type OpeningKind,
  type Pt,
  type Wall,
  type WallKind,
} from "../../../shared/geometry";
import type { ClientSite, SiteLevel, TmCamera, TmElement } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { useToast } from "../../components/ui/Toast";
import { send } from "../../lib/api";
import { usePortalData } from "../../lib/DataProvider";
import { hueClass, type Hue } from "../../lib/hues";
import type { GeometryApi } from "../../lib/useGeometry";
import { DetectPanel, type Proposal } from "./DetectPanel";
import { PlanImport, type ImportSource } from "./PlanImport";
import { GuideButton, Term } from "./Guide";

export type Tool = "select" | "wall" | "door" | "window" | "measure" | "camera" | "zone" | "asset" | "entry";
export type Pick = { kind: "wall" | "opening"; id: string } | { kind: "camera"; id: number };

interface ToolDef {
  key: Tool;
  label: string;
  icon: typeof Hand;
  key1: string;
  hint: string;
}
const BUILD: ToolDef[] = [
  { key: "select", label: "Select", icon: MousePointer2, key1: "V", hint: "Click a wall, door, camera or marker to edit it. Drag to move; drag empty space to pan when zoomed." },
  { key: "wall", label: "Wall", icon: PanelTop, key1: "W", hint: "Click to start, click to add each corner. Type a length and press Enter for an exact wall. Double-click or Esc to finish. Snaps to corners and right angles; hold Shift for 45°." },
  { key: "door", label: "Door", icon: DoorOpen, key1: "D", hint: "Click on a wall to put a door there." },
  { key: "window", label: "Window", icon: Square, key1: "N", hint: "Click on a wall to put a window there." },
  { key: "measure", label: "Measure", icon: Ruler, key1: "M", hint: "Click two points. Enter the real distance to set the plan's scale." },
];
const SECURITY: ToolDef[] = [
  { key: "camera", label: "Camera", icon: Camera, key1: "C", hint: "Click where the camera is mounted, then click where it should look." },
  { key: "zone", label: "Zone", icon: Layers, key1: "Z", hint: "Drag a rectangle to draw a security zone." },
  { key: "asset", label: "Asset", icon: Package, key1: "A", hint: "Click where the asset is." },
  { key: "entry", label: "Entry", icon: DoorOpen, key1: "E", hint: "Click an entry point: door, gate, dock or roof hatch." },
];
const ALL_TOOLS = [...BUILD, ...SECURITY];

export const ZONE_HUE: Record<string, Hue> = { Public: "euc", Reception: "harbour", Operational: "ochre", Restricted: "jacaranda", Secure: "clay" };
/** DORI bands on the plan, most detail first (identify → detect). */
export const DORI_RGB: [number, number, number, number][] = [
  [47, 111, 78, 0.55],
  [104, 150, 88, 0.45],
  [201, 154, 62, 0.4],
  [196, 128, 104, 0.3],
];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmtM = (m: number) => `${m >= 10 ? m.toFixed(1) : m.toFixed(2)} m`;
const deg = (r: number) => (r * 180) / Math.PI;

/** Cameras on a level, in metres. */
export function placed(cams: TmCamera[], f: Frame): PlacedCamera[] {
  return cams.map((c) => ({ ...c, x: c.x * f.W, y: c.y * f.D }));
}

/** Coverage raster for a level, painted with the DORI colours. */
export function paintCoverage(canvas: HTMLCanvasElement, cams: PlacedCamera[], geo: LevelGeometry, f: Frame) {
  const cov = coverage(cams, blockersOf(geo, f), f);
  canvas.width = cov.cols;
  canvas.height = cov.rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cov.cols, cov.rows);
  for (let i = 0; i < cov.ppm.length; i++) {
    const lvl = doriLevel(cov.ppm[i]!);
    if (lvl >= DORI.length) continue;
    const [r, g, b, a] = DORI_RGB[lvl]!;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return cov;
}

type Drag =
  | { kind: "pan"; x: number; y: number; px: number; py: number; moved: boolean }
  | { kind: "end"; wall: string; end: "a" | "b"; others: { wall: string; end: "a" | "b" }[]; p: Pt }
  | { kind: "wall"; wall: string; from: Pt; d: Pt }
  | { kind: "opening"; id: string; at: number }
  | { kind: "camera"; id: number; x: number; y: number; dx: number; dy: number; moved: boolean }
  | { kind: "aim"; id: number; yaw: number }
  | { kind: "el"; id: number; dx: number; dy: number; x: number; y: number }
  | { kind: "zone"; x0: number; y0: number; x1: number; y1: number };

export function PlanView({
  site,
  level,
  elements,
  risk,
  selected,
  onSelect,
  geo: geoApi,
  cameras,
  pick,
  onPick,
  toolRequest,
}: {
  site: ClientSite;
  level: SiteLevel | null;
  elements: TmElement[];
  /** Rating hue for each element with scenarios aimed at it. */
  risk: Map<number, Hue>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  geo: GeometryApi;
  /** Cameras on this level. */
  cameras: TmCamera[];
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
  /** Switches tool from outside (e.g. "measure" from the level summary). */
  toolRequest?: { tool: Tool; n: number } | null;
}) {
  const t = useThreatActions();
  const { refresh } = usePortalData();
  const toast = useToast();
  const [tool, setTool] = useState<Tool>("select");
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [doorKind, setDoorKind] = useState<OpeningKind>("door");
  const [windowKind, setWindowKind] = useState<OpeningKind>("window");
  const [chain, setChain] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [typed, setTyped] = useState("");
  const [measure, setMeasure] = useState<Pt[]>([]);
  const [realLen, setRealLen] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [aiming, setAiming] = useState<number | null>(null);
  const [aimYaw, setAimYaw] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>([0, 0]);
  const [box, setBox] = useState({ vw: 800, vh: 500, bw: 800, bh: 500 });
  const [planLayer, setPlanLayer] = useState<"show" | "faded" | "hidden">("show");
  const [showCoverage, setShowCoverage] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [over, setOver] = useState(false);
  const [importing, setImporting] = useState<ImportSource | null>(null);
  /** A drawing dropped on a site with no levels yet, waiting for its first level to exist. */
  const [pending, setPending] = useState<File | null>(null);
  const busy = importing !== null || pending !== null;
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const covCanvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const plan = level?.plan ?? null;
  const f: Frame = level ? frameOf(level) : { W: 40, D: 25 };
  const geo = geoApi.geo;
  const onLevel = elements.filter((e) => (level ? e.levelId === level.id : true) && e.x != null && e.y != null);
  const hint = ALL_TOOLS.find((x) => x.key === tool)!.hint;

  // Fit the plan inside the viewport; zoom and pan move it from there.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const fit = () => {
      const vw = el.clientWidth;
      const vh = Math.max(320, Math.min(window.innerHeight * 0.72, (vw * f.D) / f.W));
      const bw = Math.min(vw, (vh * f.W) / f.D);
      setBox({ vw, vh, bw, bh: (bw * f.D) / f.W });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.W, f.D]);
  const fitView = useCallback(() => {
    setZoom(1);
    setPan([0, 0]);
  }, []);
  useEffect(fitView, [level?.id, fitView]);
  /** Screen pixels per metre at the current zoom. */
  const ppm = (box.bw * zoom) / f.W;
  const px = (n: number) => n / ppm;
  const base: Pt = [(box.vw - box.bw) / 2, (box.vh - box.bh) / 2];

  const zoomAt = (factor: number, cx = box.vw / 2, cy = box.vh / 2) => {
    const z = Math.max(1, Math.min(12, zoom * factor));
    // Keep the point under the cursor still.
    const k = z / zoom;
    setPan([cx - base[0] - (cx - base[0] - pan[0]) * k, cy - base[1] - (cy - base[1] - pan[1]) * k]);
    setZoom(z);
    if (z === 1) setPan([0, 0]);
  };

  const toPlan = (clientX: number, clientY: number): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * f.W, ((clientY - r.top) / r.height) * f.D];
  };

  // Walls in metres, for drawing, snapping and hit tests.
  const runs = useMemo(() => geo.walls.map((w) => wallRun(w, geo.openings, f)), [geo, f.W, f.D]);
  const cams = useMemo(() => {
    const list = placed(cameras, f);
    if (drag?.kind === "camera") return list.map((c) => (c.id === drag.id ? { ...c, x: drag.x, y: drag.y } : c));
    if (drag?.kind === "aim") return list.map((c) => (c.id === drag.id ? { ...c, yaw: drag.yaw } : c));
    if (aiming != null && aimYaw != null) return list.map((c) => (c.id === aiming ? { ...c, yaw: aimYaw } : c));
    return list;
  }, [cameras, f.W, f.D, drag, aiming, aimYaw]);
  const blockers = useMemo(() => blockersOf(geo, f), [geo, f.W, f.D]);
  const views = useMemo(() => cams.map((c) => ({ id: c.id, poly: viewPolygon(c, blockers, 60) })), [cams, blockers]);

  // Coverage raster, repainted when cameras or walls change (at most once a frame while dragging).
  useEffect(() => {
    const cv = covCanvas.current;
    if (!cv || !showCoverage) return;
    const raf = requestAnimationFrame(() => {
      if (cams.length) paintCoverage(cv, cams, geo, f);
      else cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
    });
    return () => cancelAnimationFrame(raf);
  }, [cams, geo, f.W, f.D, showCoverage]);

  // ── Snapping ──────────────────────────────────────────────────────────────
  const snapPoint = (p: Pt, from: Pt | null, shift: boolean, skip?: Set<string>): { p: Pt; snapped: boolean } => {
    const r = px(10);
    let best: Pt | null = null;
    let bd = r;
    for (const run of runs) {
      if (skip?.has(run.wall.id)) continue;
      for (const q of [run.a, run.b]) {
        const d = dist(p, q);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
    if (best) return { p: best, snapped: true };
    if (from) {
      const ang = Math.atan2(p[1] - from[1], p[0] - from[0]);
      const len = dist(from, p);
      const stepDeg = shift ? 45 : 90;
      const snapTo = Math.round(deg(ang) / stepDeg) * stepDeg;
      if (shift || Math.abs(deg(ang) - snapTo) < 7) {
        const a = (snapTo * Math.PI) / 180;
        p = [from[0] + Math.cos(a) * len, from[1] + Math.sin(a) * len];
      }
    }
    for (const run of runs) {
      if (skip?.has(run.wall.id)) continue;
      const pr = project(p, run.a, run.b);
      if (pr.d < bd) {
        bd = pr.d;
        best = pr.p;
      }
    }
    return best ? { p: best, snapped: true } : { p, snapped: false };
  };

  const nearestWall = (p: Pt, maxPx = 12) => {
    let best: { run: (typeof runs)[number]; s: number; d: number } | null = null;
    for (const run of runs) {
      const pr = project(p, run.a, run.b);
      const lim = Math.max(px(maxPx), run.wall.t / 2 + px(3));
      if (pr.d <= lim && (!best || pr.d < best.d)) best = { run, s: pr.t * run.len, d: pr.d };
    }
    return best;
  };

  // ── Geometry edits ────────────────────────────────────────────────────────
  const commit = (g: LevelGeometry) => void geoApi.commit(g);
  const addWall = (a: Pt, b: Pt) => {
    if (dist(a, b) < 0.05) return;
    const w: Wall = { id: newId("w"), a: toF(a, f), b: toF(b, f), t: WALL_THICKNESS[wallKind], kind: wallKind, h: null };
    commit({ ...geo, walls: [...geo.walls, w] });
  };
  const openingKind = tool === "door" ? doorKind : windowKind;
  const openingPreview = (p: Pt | null) => {
    if (!p || (tool !== "door" && tool !== "window")) return null;
    const hit = nearestWall(p, 16);
    if (!hit) return null;
    const w = Math.min(OPENING_WIDTH[openingKind], hit.run.len);
    const s = Math.max(w / 2, Math.min(hit.run.len - w / 2, hit.s));
    return { run: hit.run, s, w };
  };
  const deletePick = () => {
    if (!pick) return;
    if (pick.kind === "wall") commit({ walls: geo.walls.filter((w) => w.id !== pick.id), openings: geo.openings.filter((o) => o.wall !== pick.id) });
    else if (pick.kind === "opening") commit({ ...geo, openings: geo.openings.filter((o) => o.id !== pick.id) });
    else {
      const c = cameras.find((x) => x.id === pick.id);
      if (c) void t.deleteCamera(c);
    }
    onPick(null);
  };

  const finishChain = () => {
    setChain([]);
    setTyped("");
  };
  const chooseTool = (k: Tool) => {
    finishChain();
    setMeasure([]);
    setAiming(null);
    setTool(k);
  };

  useEffect(() => {
    if (toolRequest) chooseTool(toolRequest.tool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolRequest?.n]);

  // Keyboard: tool letters, Esc, Enter, Delete, undo/redo, typed lengths.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || document.querySelector('[aria-modal="true"]')) return;
      if (!viewport.current?.isConnected) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? geoApi.redo() : geoApi.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        geoApi.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (tool === "wall" && chain.length && /^[0-9.]$/.test(e.key)) {
        setTyped((v) => (v + e.key).slice(0, 8));
        e.preventDefault();
        return;
      }
      if (tool === "wall" && typed && e.key === "Backspace") {
        setTyped((v) => v.slice(0, -1));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && tool === "wall" && chain.length) {
        const len = Number(typed);
        if (typed && len > 0 && hover) {
          const from = chain[chain.length - 1]!;
          const ang = Math.atan2(hover[1] - from[1], hover[0] - from[0]);
          const to: Pt = [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len];
          addWall(from, to);
          setChain([...chain, to]);
          setTyped("");
        } else finishChain();
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (chain.length || typed) finishChain();
        else if (aiming != null) setAiming(null);
        else if (measure.length) setMeasure([]);
        else if (tool !== "select") chooseTool("select");
        else onPick(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && pick) {
        e.preventDefault();
        deletePick();
        return;
      }
      const def = ALL_TOOLS.find((x) => x.key1.toLowerCase() === e.key.toLowerCase());
      if (def) chooseTool(def.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Pointer ───────────────────────────────────────────────────────────────
  const hitTest = (p: Pt): Pick | "end" | null => {
    for (const c of cams) if (dist(p, [c.x, c.y]) <= px(12)) return { kind: "camera", id: c.id };
    for (const run of runs)
      for (const g of run.gaps) {
        const mid = (g.s0 + g.s1) / 2;
        const c: Pt = [run.a[0] + run.dir[0] * mid, run.a[1] + run.dir[1] * mid];
        if (dist(p, c) <= Math.max(px(9), (g.s1 - g.s0) / 2)) {
          const pr = project(p, run.a, run.b);
          if (pr.d <= Math.max(px(9), run.wall.t)) return { kind: "opening", id: g.opening.id };
        }
      }
    const hit = nearestWall(p, 8);
    return hit ? { kind: "wall", id: hit.run.wall.id } : null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      setDrag({ kind: "pan", x: e.clientX, y: e.clientY, px: pan[0], py: pan[1], moved: false });
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = toPlan(e.clientX, e.clientY);
    const fr: Pt = [clamp01(p[0] / f.W), clamp01(p[1] / f.D)];
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    if (tool === "wall") {
      const from = chain[chain.length - 1] ?? null;
      const s = snapPoint(p, from, e.shiftKey).p;
      if (!from) setChain([s]);
      else {
        addWall(from, s);
        // Clicking back on the first corner closes the room.
        if (chain.length > 1 && dist(s, chain[0]!) < 0.01) finishChain();
        else setChain([...chain, s]);
      }
      setTyped("");
      return;
    }
    if (tool === "door" || tool === "window") {
      const pv = openingPreview(p);
      if (pv) {
        const o = { id: newId("o"), wall: pv.run.wall.id, at: pv.s / pv.run.len, w: pv.w, kind: openingKind };
        commit({ ...geo, openings: [...geo.openings, o] });
        onPick({ kind: "opening", id: o.id });
      }
      return;
    }
    if (tool === "measure") {
      const s = snapPoint(p, measure.length === 1 ? measure[0]! : null, e.shiftKey).p;
      setMeasure(measure.length === 1 ? [measure[0]!, s] : [s]);
      setRealLen("");
      return;
    }
    if (tool === "camera") {
      if (aiming != null) {
        const c = cameras.find((x) => x.id === aiming);
        if (c && aimYaw != null) void t.updateCamera(c, { yaw: Math.round(aimYaw) });
        setAiming(null);
        setAimYaw(null);
        setTool("select");
        return;
      }
      void t.addCamera(site, level?.id ?? null, { x: fr[0], y: fr[1] }).then((id) => {
        if (id != null) {
          setAiming(id);
          onPick({ kind: "camera", id });
        }
      });
      return;
    }
    if (tool === "zone") {
      setDrag({ kind: "zone", x0: fr[0], y0: fr[1], x1: fr[0], y1: fr[1] });
      return;
    }
    if (tool === "asset" || tool === "entry") {
      t.addElement(site, tool, { levelId: level?.id ?? null, x: fr[0], y: fr[1], zoneId: zoneAt(fr[0], fr[1])?.id ?? null });
      setTool("select");
      return;
    }

    // Select tool: aim handle, wall ends, then whatever is under the pointer.
    if (pick?.kind === "camera") {
      const c = cams.find((x) => x.id === pick.id);
      if (c && dist(p, aimHandle(c)) <= px(10)) {
        setDrag({ kind: "aim", id: c.id, yaw: c.yaw });
        return;
      }
    }
    if (pick?.kind === "wall") {
      const run = runs.find((r) => r.wall.id === pick.id);
      if (run) {
        for (const end of ["a", "b"] as const) {
          const q = end === "a" ? run.a : run.b;
          if (dist(p, q) <= px(9)) {
            const others = runs.flatMap((r) => (r.wall.id === run.wall.id ? [] : (["a", "b"] as const).filter((k) => dist(k === "a" ? r.a : r.b, q) < 0.02).map((k) => ({ wall: r.wall.id, end: k }))));
            setDrag({ kind: "end", wall: run.wall.id, end, others, p: q });
            return;
          }
        }
      }
    }
    const hit = hitTest(p);
    if (hit && hit !== "end") {
      onPick(hit);
      onSelect(null);
      if (hit.kind === "camera") {
        const c = cams.find((x) => x.id === hit.id)!;
        setDrag({ kind: "camera", id: c.id, x: c.x, y: c.y, dx: p[0] - c.x, dy: p[1] - c.y, moved: false });
      } else if (hit.kind === "wall") setDrag({ kind: "wall", wall: hit.id, from: p, d: [0, 0] });
      else {
        const o = geo.openings.find((x) => x.id === hit.id)!;
        setDrag({ kind: "opening", id: o.id, at: o.at });
      }
      return;
    }
    onPick(null);
    onSelect(null);
    setDrag({ kind: "pan", x: e.clientX, y: e.clientY, px: pan[0], py: pan[1], moved: false });
  };

  const aimHandle = (c: PlacedCamera): Pt => {
    const r = Math.max(px(46), 1.5);
    const a = (c.yaw * Math.PI) / 180;
    return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r];
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag?.kind === "pan") {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (zoom > 1 || e.buttons === 4) setPan([drag.px + dx, drag.py + dy]);
      if (Math.abs(dx) + Math.abs(dy) > 3 && !drag.moved) setDrag({ ...drag, moved: true });
      return;
    }
    if (!canvas.current) return;
    const p = toPlan(e.clientX, e.clientY);
    if (tool === "wall" || tool === "measure") {
      const from = tool === "wall" ? chain[chain.length - 1] ?? null : measure.length === 1 ? measure[0]! : null;
      setHover(snapPoint(p, from, e.shiftKey).p);
    } else setHover(p);
    if (aiming != null) {
      const c = cams.find((x) => x.id === aiming);
      if (c) setAimYaw(deg(Math.atan2(p[1] - c.y, p[0] - c.x)));
    }
    if (!drag) return;
    if (drag.kind === "end") setDrag({ ...drag, p: snapPoint(p, null, false, new Set([drag.wall, ...drag.others.map((o) => o.wall)])).p });
    else if (drag.kind === "wall") setDrag({ ...drag, d: [p[0] - drag.from[0], p[1] - drag.from[1]] });
    else if (drag.kind === "opening") {
      const o = geo.openings.find((x) => x.id === drag.id)!;
      const run = runs.find((r) => r.wall.id === o.wall);
      if (run) {
        const s = project(p, run.a, run.b).t * run.len;
        setDrag({ ...drag, at: Math.max(o.w / 2, Math.min(run.len - o.w / 2, s)) / run.len });
      }
    } else if (drag.kind === "camera") setDrag({ ...drag, x: Math.max(0, Math.min(f.W, p[0] - drag.dx)), y: Math.max(0, Math.min(f.D, p[1] - drag.dy)), moved: true });
    else if (drag.kind === "aim") {
      const c = cams.find((x) => x.id === drag.id);
      if (c) setDrag({ ...drag, yaw: deg(Math.atan2(p[1] - c.y, p[0] - c.x)) });
    } else if (drag.kind === "el") setDrag({ ...drag, x: clamp01(p[0] / f.W - drag.dx), y: clamp01(p[1] / f.D - drag.dy) });
    else if (drag.kind === "zone") setDrag({ ...drag, x1: clamp01(p[0] / f.W), y1: clamp01(p[1] / f.D) });
  };

  const onUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "end") {
      const fp = toF(d.p, f);
      const move = new Map<string, ("a" | "b")[]>([[d.wall, [d.end]]]);
      for (const o of d.others) move.set(o.wall, [...(move.get(o.wall) ?? []), o.end]);
      commit({ ...geo, walls: geo.walls.map((w) => (move.has(w.id) ? { ...w, ...Object.fromEntries(move.get(w.id)!.map((k) => [k, fp])) } : w)) });
    } else if (d.kind === "wall" && Math.hypot(d.d[0], d.d[1]) > px(3)) {
      const shift = (q: Pt): Pt => toF([toM(q, f)[0] + d.d[0], toM(q, f)[1] + d.d[1]], f);
      commit({ ...geo, walls: geo.walls.map((w) => (w.id === d.wall ? { ...w, a: shift(w.a), b: shift(w.b) } : w)) });
    } else if (d.kind === "opening") {
      const o = geo.openings.find((x) => x.id === d.id);
      if (o && Math.abs(o.at - d.at) > 1e-4) commit({ ...geo, openings: geo.openings.map((x) => (x.id === d.id ? { ...x, at: d.at } : x)) });
    } else if (d.kind === "camera" && d.moved) {
      const c = cameras.find((x) => x.id === d.id);
      if (c) void t.updateCamera(c, { x: clamp01(d.x / f.W), y: clamp01(d.y / f.D) });
    } else if (d.kind === "aim") {
      const c = cameras.find((x) => x.id === d.id);
      if (c) void t.updateCamera(c, { yaw: Math.round(d.yaw) });
    } else if (d.kind === "el") {
      const el = elements.find((k) => k.id === d.id)!;
      if (Math.abs((el.x ?? 0) - d.x) > 0.002 || Math.abs((el.y ?? 0) - d.y) > 0.002) {
        const zone = el.kind === "zone" ? undefined : zoneAt(d.x, d.y);
        void t.placeElement(el, { x: d.x, y: d.y, ...(zone && zone.id !== el.zoneId ? { zoneId: zone.id } : {}) });
      }
    } else if (d.kind === "zone") {
      const x = Math.min(d.x0, d.x1);
      const y = Math.min(d.y0, d.y1);
      const w = Math.abs(d.x1 - d.x0);
      const h = Math.abs(d.y1 - d.y0);
      if (w > 0.02 && h > 0.02) {
        t.addElement(site, "zone", { levelId: level?.id ?? null, x, y, w, h });
        setTool("select");
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = viewport.current!.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    } else if (zoom > 1) setPan([pan[0] - e.deltaX, pan[1] - e.deltaY]);
  };
  // Ctrl/⌘-wheel and pinch zoom the plan, not the page.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || zoom > 1) e.preventDefault();
    };
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, [zoom]);

  const zoneAt = (x: number, y: number) =>
    onLevel
      .filter((z) => z.kind === "zone" && z.w && z.h && x >= z.x! && x <= z.x! + z.w && y >= z.y! && y <= z.y! + z.h)
      .sort((a, b) => a.w! * a.h! - b.w! * b.h!)[0];
  const startElDrag = (e: React.PointerEvent, el: TmElement) => {
    if (tool !== "select") return;
    // A zone is a large area: a wall, door or camera inside it takes the click.
    if (el.kind === "zone" && hitTest(toPlan(e.clientX, e.clientY))) return;
    e.stopPropagation();
    onSelect(el.id);
    onPick(null);
    const p = toPlan(e.clientX, e.clientY);
    canvas.current?.setPointerCapture?.(e.pointerId);
    setDrag({ kind: "el", id: el.id, dx: p[0] / f.W - (el.x ?? 0), dy: p[1] / f.D - (el.y ?? 0), x: el.x ?? 0, y: el.y ?? 0 });
  };
  const elPos = (el: TmElement) => (drag?.kind === "el" && drag.id === el.id ? { x: drag.x, y: drag.y } : { x: el.x ?? 0, y: el.y ?? 0 });

  // Uploads go through the importer: a drawing with several levels offers to split them.
  const upload = async (fl: File | undefined) => {
    if (!fl) return;
    if (level) {
      setImporting({ kind: "file", file: fl });
      return;
    }
    // A site with no levels: the drawing starts the first one (the importer renames it from the drawing's title).
    setPending(fl);
    try {
      await send("POST", `/sites/${site.id}/levels`, { name: "Ground floor", order: 0, heightM: 3.6, widthM: 40 });
      await refresh();
    } catch (err) {
      setPending(null);
      toast({ title: "Couldn't add a level for the plan", desc: (err as Error).message, kind: "breach" });
    }
  };
  useEffect(() => {
    if (!pending || !level) return;
    setImporting({ kind: "file", file: pending });
    setPending(null);
  }, [pending, level]);

  // Walls as drawn while an end or the whole wall is being dragged.
  const shownRuns = useMemo(() => {
    if (drag?.kind !== "end" && drag?.kind !== "wall" && drag?.kind !== "opening") return runs;
    const walls = geo.walls.map((w) => {
      if (drag.kind === "end") {
        const hit = drag.wall === w.id ? [drag.end] : drag.others.filter((o) => o.wall === w.id).map((o) => o.end);
        return hit.length ? { ...w, ...Object.fromEntries(hit.map((k) => [k, toF(drag.p, f)])) } : w;
      }
      if (drag.kind === "wall" && drag.wall === w.id) {
        const sh = (q: Pt): Pt => toF([toM(q, f)[0] + drag.d[0], toM(q, f)[1] + drag.d[1]], f);
        return { ...w, a: sh(w.a), b: sh(w.b) };
      }
      return w;
    });
    const openings = drag.kind === "opening" ? geo.openings.map((o) => (o.id === drag.id ? { ...o, at: drag.at } : o)) : geo.openings;
    return walls.map((w) => wallRun(w, openings, f));
  }, [runs, drag, geo, f.W, f.D]);

  const from = chain[chain.length - 1] ?? null;
  const rubber = tool === "wall" && from && hover ? hover : null;
  const typedLen = Number(typed);
  const rubberEnd: Pt | null = rubber && from ? (typed && typedLen > 0 ? [from[0] + ((rubber[0] - from[0]) / (dist(from, rubber) || 1)) * typedLen, from[1] + ((rubber[1] - from[1]) / (dist(from, rubber) || 1)) * typedLen] : rubber) : null;
  const preview = openingPreview(hover);
  const measured = measure.length === 2 ? dist(measure[0]!, measure[1]!) : measure.length === 1 && hover && tool === "measure" ? dist(measure[0]!, hover) : null;
  const scaleNote = level && !level.scaleSet;
  const cursor = drag?.kind === "pan" && drag.moved ? "grabbing" : tool === "select" ? "default" : "crosshair";

  return (
    <div className="pt-risk-plan">
      <div className="pt-pl-bar" role="toolbar" aria-label="Plan tools">
        <span className="pt-pl-group" aria-label="Build">
          {BUILD.map(({ key, label, icon: Icon, key1 }) => (
            <button key={key} className={`pt-risk-tool${tool === key ? " is-on" : ""}`} aria-pressed={tool === key} title={`${label} (${key1})`} onClick={() => chooseTool(key)}>
              <Icon size={14} /> <span className="pt-pl-label">{label}</span>
            </button>
          ))}
        </span>
        <span className="pt-pl-group" aria-label="Security">
          {SECURITY.map(({ key, label, icon: Icon, key1 }) => (
            <button key={key} className={`pt-risk-tool${tool === key ? " is-on" : ""}`} aria-pressed={tool === key} title={`${label} (${key1})`} onClick={() => chooseTool(key)}>
              <Icon size={14} /> <span className="pt-pl-label">{label}</span>
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        {plan && (
          <button className={`pt-risk-tool pt-pl-detect${detecting ? " is-on" : ""}`} onClick={() => setDetecting((v) => !v)} aria-pressed={detecting} title="Find walls, doors and windows on the plan">
            <Wand2 size={14} /> Detect walls
          </button>
        )}
      </div>

      <div className="pt-pl-status">
        <p className="pt-pl-hint" title={hint}>
          {tool === "wall" && chain.length > 0 && typed ? (
            <>
              Length <b className="pt-mono">{typed} m</b> · Enter to place
            </>
          ) : (
            hint
          )}
        </p>
        <span className="pt-pl-opts">
          {tool === "wall" && (
            <div className="pt-select pt-select--sm">
              <select value={wallKind} onChange={(e) => setWallKind(e.target.value as WallKind)} aria-label="Wall type">
                {WALL_KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l} · {Math.round(WALL_THICKNESS[k] * 1000)} mm
                  </option>
                ))}
              </select>
            </div>
          )}
          {(tool === "door" || tool === "window") && (
            <div className="pt-select pt-select--sm">
              <select value={openingKind} onChange={(e) => (tool === "door" ? setDoorKind : setWindowKind)(e.target.value as OpeningKind)} aria-label="Opening type">
                {OPENING_KINDS.filter(([k]) => (tool === "door" ? k !== "window" && k !== "opening" : k === "window" || k === "opening")).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l} · {OPENING_WIDTH[k]} m
                  </option>
                ))}
              </select>
            </div>
          )}
          {tool === "measure" && measured != null && (
            <span className="pt-pl-measure">
              <b className="pt-mono">{fmtM(measured)}</b>
              {measure.length === 2 && level && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const real = Number(realLen);
                    if (real > 0 && measured > 0) {
                      void t.setScale(level, (f.W * real) / measured);
                      setMeasure([]);
                      setRealLen("");
                    }
                  }}
                >
                  <label>
                    is really
                    <input value={realLen} onChange={(e) => setRealLen(e.target.value)} inputMode="decimal" placeholder="e.g. 6.0" aria-label="Real length in metres" autoFocus />m
                  </label>
                  <button className="sds-btn sds-btn--sm sds-btn--primary" disabled={!(Number(realLen) > 0)}>
                    Set scale
                  </button>
                </form>
              )}
            </span>
          )}
        </span>
        <span className="pt-pl-right">
          {scaleNote && tool !== "measure" && (
            <span className="pt-pl-scale-wrap">
              <button className="pt-pl-scale" onClick={() => chooseTool("measure")} title="Measure a wall you know the length of">
                <Ruler size={12} /> Scale not set
              </button>
              <Term k="scale" />
            </span>
          )}
          <GuideButton topic="site" label="Help" />
          <span className="pt-meta pt-pl-save" aria-live="polite">
            {geoApi.saving ? "Saving…" : geo.walls.length ? "Saved" : ""}
          </span>
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={geoApi.undo} disabled={!geoApi.canUndo} aria-label="Undo" title="Undo (Ctrl Z)">
            <Undo2 size={14} />
          </button>
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={geoApi.redo} disabled={!geoApi.canRedo} aria-label="Redo" title="Redo (Ctrl Shift Z)">
            <Redo2 size={14} />
          </button>
        </span>
      </div>

      {detecting && plan && level && (
        <DetectPanel
          onSplit={() => {
            setDetecting(false);
            setProposal(null);
            setImporting({ kind: "plan", url: `/api/plans/${plan.fileId}`, name: level.name });
          }}
          level={level}
          frame={f}
          geo={geo}
          onPreview={setProposal}
          onAccept={(g) => {
            commit(g);
            setDetecting(false);
            setProposal(null);
          }}
          onClose={() => {
            setDetecting(false);
            setProposal(null);
          }}
        />
      )}

      <div
        ref={viewport}
        className={`pt-pl-viewport${plan ? "" : " is-blank"}${over ? " is-over" : ""}`}
        // At fit with the select tool, a finger scrolls the page; zoomed or drawing, it works the plan.
        style={{ height: box.vh, touchAction: zoom === 1 && tool === "select" ? "pan-y" : "none" }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
        onWheel={onWheel}
      >
        <div
          ref={canvas}
          className={`pt-risk-plan__canvas pt-pl-canvas pt-risk-plan__stage--${tool}`}
          style={{
            width: box.bw,
            height: box.bh,
            transform: `translate(${base[0] + pan[0]}px, ${base[1] + pan[1]}px) scale(${zoom})`,
            cursor,
            touchAction: zoom === 1 && tool === "select" ? "pan-y" : "none",
            ["--iz" as string]: String(1 / zoom),
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={() => tool === "wall" && finishChain()}
          data-testid="plan-canvas"
        >
          {plan && planLayer !== "hidden" ? (
            <img className={`pt-risk-plan__img${planLayer === "faded" ? " is-faded" : ""}`} src={`/api/plans/${plan.fileId}`} alt={`${level?.name} floor plan`} draggable={false} />
          ) : null}
          <canvas ref={covCanvas} className="pt-pl-coverage" hidden={!showCoverage || !cams.length} aria-hidden />
          <svg className="pt-pl-svg" viewBox={`0 0 ${f.W} ${f.D}`} preserveAspectRatio="none" aria-hidden>
            {!plan && <Grid f={f} />}
            {/* Camera views: the floor each camera sees, stopped by walls. */}
            {views.map((v) =>
              v.poly.length > 2 ? (
                <polygon key={v.id} className={`pt-pl-view${pick?.kind === "camera" && pick.id === v.id ? " is-sel" : ""}`} points={v.poly.map((q) => q.join(",")).join(" ")} vectorEffect="non-scaling-stroke" />
              ) : null
            )}
            {shownRuns.map((r) => (
              <WallShape key={r.wall.id} run={r} sel={pick?.kind === "wall" && pick.id === r.wall.id} pickOpening={pick?.kind === "opening" ? pick.id : null} px={px} />
            ))}
            {proposal?.walls.map((w, i) => (
              <line key={i} className="pt-pl-proposal" x1={w.a[0] * f.W} y1={w.a[1] * f.D} x2={w.b[0] * f.W} y2={w.b[1] * f.D} strokeWidth={Math.max(w.t, px(2))} />
            ))}
            {proposal?.openings.map((o, i) => (
              <circle key={i} className={`pt-pl-proposal-o pt-pl-proposal-o--${o.kind}`} cx={o.c[0] * f.W} cy={o.c[1] * f.D} r={px(4)} />
            ))}
            {pick?.kind === "wall" &&
              shownRuns
                .filter((r) => r.wall.id === pick.id)
                .map((r) => (
                  <g key="handles">
                    {[r.a, r.b].map((q, i) => (
                      <circle key={i} className="pt-pl-handle" cx={q[0]} cy={q[1]} r={px(6)} vectorEffect="non-scaling-stroke" />
                    ))}
                    <Label at={[(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2]} px={px} text={fmtM(r.len)} />
                  </g>
                ))}
            {preview && <OpeningPreview run={preview.run} s={preview.s} w={preview.w} px={px} />}
            {tool === "wall" && chain.length > 0 && (
              <polyline className="pt-pl-chain" points={chain.map((q) => q.join(",")).join(" ")} strokeWidth={WALL_THICKNESS[wallKind]} />
            )}
            {rubberEnd && from && (
              <g>
                <line className="pt-pl-rubber" x1={from[0]} y1={from[1]} x2={rubberEnd[0]} y2={rubberEnd[1]} strokeWidth={WALL_THICKNESS[wallKind]} />
                <Label at={[(from[0] + rubberEnd[0]) / 2, (from[1] + rubberEnd[1]) / 2]} px={px} text={(scaleNote ? "≈ " : "") + fmtM(dist(from, rubberEnd))} />
              </g>
            )}
            {tool === "wall" && hover && !chain.length && <circle className="pt-pl-cursor" cx={hover[0]} cy={hover[1]} r={px(4)} vectorEffect="non-scaling-stroke" />}
            {tool === "measure" && measure.length > 0 && (
              <g>
                <line className="pt-pl-measure-line" x1={measure[0]![0]} y1={measure[0]![1]} x2={(measure[1] ?? hover ?? measure[0]!)[0]} y2={(measure[1] ?? hover ?? measure[0]!)[1]} vectorEffect="non-scaling-stroke" />
                {[measure[0]!, measure[1] ?? hover].filter(Boolean).map((q, i) => (
                  <circle key={i} className="pt-pl-handle" cx={q![0]} cy={q![1]} r={px(4)} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}
            {cams.map((c) => (
              <CameraMark key={c.id} c={c} sel={pick?.kind === "camera" && pick.id === c.id} px={px} handle={pick?.kind === "camera" && pick.id === c.id ? aimHandle(c) : null} />
            ))}
          </svg>

          {onLevel
            .filter((z) => z.kind === "zone")
            .map((z) => {
              const p = elPos(z);
              return (
                <div
                  key={z.id}
                  className={`pt-risk-zone ${hueClass(ZONE_HUE[z.subtype] ?? "slate")}${selected === z.id ? " is-sel" : ""}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${(z.w ?? 0.1) * 100}%`, height: `${(z.h ?? 0.1) * 100}%` }}
                  onPointerDown={(e) => startElDrag(e, z)}
                  data-el={z.id}
                >
                  <span className="pt-risk-zone__label">{z.name}</span>
                </div>
              );
            })}
          {onLevel
            .filter((e) => e.kind !== "zone")
            .map((e) => {
              const p = elPos(e);
              const hue = risk.get(e.id);
              return (
                <button
                  key={e.id}
                  className={`pt-risk-mark pt-risk-mark--${e.kind} ${hueClass(hue ?? (e.kind === "entry" ? "harbour" : "slate"))}${selected === e.id ? " is-sel" : ""}${hue ? " is-risk" : ""}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onPointerDown={(ev) => startElDrag(ev, e)}
                  onDoubleClick={() => t.editElement(e)}
                  aria-label={`${e.kind === "entry" ? "Entry" : "Asset"}: ${e.name}`}
                  title={e.name}
                  data-el={e.id}
                >
                  <span className="pt-risk-mark__shape" />
                  <span className="pt-risk-mark__label">{e.name}</span>
                </button>
              );
            })}
          {drag?.kind === "zone" && (
            <div
              className="pt-risk-zone pt-risk-zone--draft pt-hue-brass"
              style={{
                left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
              }}
            />
          )}
        </div>

        {!plan && (
          <div className="pt-pl-empty">
            <b>{busy ? "Reading the plan…" : "No floor plan on this level yet"}</b>
            <span>Drop a PDF or image of the plan here, or draw walls straight onto the grid. PDFs from architects give the sharpest result.</span>
            <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => file.current?.click()} disabled={busy}>
              <Upload size={14} /> Upload plan
            </button>
          </div>
        )}

        <div className="pt-pl-zoom">
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out" disabled={zoom <= 1}>
            <ZoomOut size={14} />
          </button>
          <button className="pt-pl-zoom__pct pt-mono" onClick={fitView} title="Fit to view">
            {Math.round(zoom * 100)}%
          </button>
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => zoomAt(1.4)} aria-label="Zoom in" disabled={zoom >= 12}>
            <ZoomIn size={14} />
          </button>
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={fitView} aria-label="Fit plan to view">
            <Maximize size={13} />
          </button>
        </div>
        <ScaleBar ppm={ppm} note={!!scaleNote} />
      </div>

      {importing && level && <PlanImport site={site} level={level} source={importing} onClose={() => setImporting(null)} />}

      <div className="pt-pl-foot">
        <span className="pt-pl-layers">
          {plan && (
            <label>
              Plan
              <span className="pt-select pt-select--sm">
                <select value={planLayer} onChange={(e) => setPlanLayer(e.target.value as typeof planLayer)} aria-label="Plan image">
                  <option value="show">Shown</option>
                  <option value="faded">Faded</option>
                  <option value="hidden">Hidden</option>
                </select>
              </span>
            </label>
          )}
          {cams.length > 0 && (
            <label className="pt-pl-check">
              <input type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} /> Camera coverage
            </label>
          )}
          {cams.length > 0 && showCoverage && (
            <>
              <DoriLegend />
              <Term k="dori" />
            </>
          )}
        </span>
        <span className="pt-pl-upload">
          <input
            ref={file}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              // Picking the same file again still counts as a change.
              e.target.value = "";
            }}
          />
          <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => file.current?.click()} disabled={busy}>
            <Upload size={14} /> {busy ? "Uploading…" : plan ? "Replace plan" : "Upload plan"}
          </button>
          {plan && (
            <button className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link" onClick={() => level && void t.removePlan(level)}>
              Remove plan
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function DoriLegend() {
  return (
    <span className="pt-pl-legend" aria-label="Camera detail levels">
      {DORI.map((d, i) => (
        <span key={d.key} title={`${d.hint} (${d.ppm} px/m or more)`}>
          <i style={{ background: `rgba(${DORI_RGB[i]!.slice(0, 3).join(",")},${Math.min(1, DORI_RGB[i]![3] + 0.3)})` }} />
          {d.label}
        </span>
      ))}
    </span>
  );
}

function Grid({ f }: { f: Frame }) {
  const lines: JSX.Element[] = [];
  for (let x = 0; x <= f.W; x += 1) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={f.D} className={x % 5 === 0 ? "pt-pl-grid pt-pl-grid--major" : "pt-pl-grid"} vectorEffect="non-scaling-stroke" />);
  for (let y = 0; y <= f.D; y += 1) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={f.W} y2={y} className={y % 5 === 0 ? "pt-pl-grid pt-pl-grid--major" : "pt-pl-grid"} vectorEffect="non-scaling-stroke" />);
  return <g>{f.W <= 400 && f.D <= 400 ? lines : null}</g>;
}

function Label({ at, text, px }: { at: Pt; text: string; px: (n: number) => number }) {
  const w = px(text.length * 6.4 + 10);
  const h = px(17);
  return (
    <g className="pt-pl-tag" transform={`translate(${at[0]},${at[1]})`}>
      <rect x={-w / 2} y={-h - px(6)} width={w} height={h} rx={0} />
      <text x={0} y={-px(10)} fontSize={px(11)} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

/** A wall drawn to scale, with its doors and windows in plan symbols. */
function WallShape({ run, sel, pickOpening, px }: { run: ReturnType<typeof wallRun>; sel: boolean; pickOpening: string | null; px: (n: number) => number }) {
  const { a, dir, len, wall } = run;
  const n: Pt = [-dir[1], dir[0]];
  const half = wall.t / 2;
  const at = (s: number, o: number): string => `${a[0] + dir[0] * s + n[0] * o},${a[1] + dir[1] * s + n[1] * o}`;
  const pieces = run.solid.map((p) => {
    // Square the wall's own ends so corners close; leave door and window jambs flush.
    const s0 = p.s0 === 0 ? -half : p.s0;
    const s1 = Math.abs(p.s1 - len) < 1e-6 ? len + half : p.s1;
    return `${at(s0, -half)} ${at(s1, -half)} ${at(s1, half)} ${at(s0, half)}`;
  });
  return (
    <g className={`pt-pl-wall pt-pl-wall--${wall.kind}${sel ? " is-sel" : ""}`}>
      {wall.kind === "fence" ? (
        <line x1={a[0]} y1={a[1]} x2={run.b[0]} y2={run.b[1]} className="pt-pl-fence" vectorEffect="non-scaling-stroke" />
      ) : (
        pieces.map((pts, i) => <polygon key={i} points={pts} />)
      )}
      {run.gaps.map((g) => {
        const w = g.s1 - g.s0;
        const o = g.opening;
        const on = pickOpening === o.id;
        const hingeA: Pt = [a[0] + dir[0] * g.s0, a[1] + dir[1] * g.s0];
        const hingeB: Pt = [a[0] + dir[0] * g.s1, a[1] + dir[1] * g.s1];
        const swing = (h: Pt, r: number, sign: 1 | -1, towards: 1 | -1): string => {
          const leaf: Pt = [h[0] + n[0] * r * towards, h[1] + n[1] * r * towards];
          const tip: Pt = [h[0] + dir[0] * r * sign, h[1] + dir[1] * r * sign];
          const sweep = (sign === 1) === (towards === 1) ? 1 : 0;
          return `M${h[0]},${h[1]} L${leaf[0]},${leaf[1]} A${r},${r} 0 0 ${sweep} ${tip[0]},${tip[1]}`;
        };
        return (
          <g key={o.id} className={`pt-pl-open pt-pl-open--${o.kind}${on ? " is-sel" : ""}`}>
            {(o.kind === "door" || o.kind === "double") && (
              <path d={o.kind === "door" ? swing(hingeA, w, 1, 1) : `${swing(hingeA, w / 2, 1, 1)} ${swing(hingeB, w / 2, -1, 1)}`} vectorEffect="non-scaling-stroke" />
            )}
            {o.kind === "roller" && <line x1={hingeA[0]} y1={hingeA[1]} x2={hingeB[0]} y2={hingeB[1]} className="pt-pl-roller" vectorEffect="non-scaling-stroke" />}
            {o.kind === "window" && (
              <>
                <polygon points={`${at(g.s0, -half)} ${at(g.s1, -half)} ${at(g.s1, half)} ${at(g.s0, half)}`} className="pt-pl-glass" />
                <line x1={hingeA[0]} y1={hingeA[1]} x2={hingeB[0]} y2={hingeB[1]} vectorEffect="non-scaling-stroke" />
              </>
            )}
            {on && <polygon className="pt-pl-open-sel" points={`${at(g.s0, -half - px(4))} ${at(g.s1, -half - px(4))} ${at(g.s1, half + px(4))} ${at(g.s0, half + px(4))}`} vectorEffect="non-scaling-stroke" />}
          </g>
        );
      })}
    </g>
  );
}

function OpeningPreview({ run, s, w, px }: { run: ReturnType<typeof wallRun>; s: number; w: number; px: (n: number) => number }) {
  const n: Pt = [-run.dir[1], run.dir[0]];
  const half = run.wall.t / 2 + px(3);
  const p = (d: number, o: number) => `${run.a[0] + run.dir[0] * d + n[0] * o},${run.a[1] + run.dir[1] * d + n[1] * o}`;
  return <polygon className="pt-pl-open-preview" points={`${p(s - w / 2, -half)} ${p(s + w / 2, -half)} ${p(s + w / 2, half)} ${p(s - w / 2, half)}`} vectorEffect="non-scaling-stroke" />;
}

function CameraMark({ c, sel, px, handle }: { c: PlacedCamera; sel: boolean; px: (n: number) => number; handle: Pt | null }) {
  const r = px(7);
  const a = (c.yaw * Math.PI) / 180;
  const nose: Pt = [c.x + Math.cos(a) * r * 1.9, c.y + Math.sin(a) * r * 1.9];
  const side = (k: number): Pt => [c.x + Math.cos(a + k) * r, c.y + Math.sin(a + k) * r];
  return (
    <g className={`pt-pl-cam${sel ? " is-sel" : ""}`}>
      {handle && <line className="pt-pl-aim" x1={c.x} y1={c.y} x2={handle[0]} y2={handle[1]} vectorEffect="non-scaling-stroke" />}
      {c.kind !== "fisheye" && <polygon points={`${nose.join(",")} ${side(1.1).join(",")} ${side(-1.1).join(",")}`} />}
      <circle cx={c.x} cy={c.y} r={r} vectorEffect="non-scaling-stroke" />
      {handle && <circle className="pt-pl-handle pt-pl-handle--aim" cx={handle[0]} cy={handle[1]} r={px(6)} vectorEffect="non-scaling-stroke" />}
    </g>
  );
}

/** A 1-2-5 scale bar, so distances read at any zoom. */
function ScaleBar({ ppm, note }: { ppm: number; note: boolean }) {
  const target = 110 / ppm;
  const pow = 10 ** Math.floor(Math.log10(target));
  const m = [1, 2, 5, 10].map((k) => k * pow).filter((v) => v <= target).pop() ?? pow;
  return (
    <div className={`pt-pl-scalebar${note ? " is-unset" : ""}`} title={note ? "Scale not set: distances are estimates" : undefined}>
      <i style={{ width: m * ppm }} />
      <span className="pt-mono">
        {note ? "≈ " : ""}
        {m >= 1 ? m : m.toFixed(1)} m
      </span>
    </div>
  );
}
