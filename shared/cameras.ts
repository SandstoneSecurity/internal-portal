/**
 * CCTV cameras: lens and sensor maths, and coverage of a floor with walls in
 * the way.
 *
 * Pixel density follows IEC 62676-4 (DORI): the pixels a camera puts across
 * one metre of scene at a given distance. Detection needs 25 px/m, observation
 * 62.5, recognition of a known person 125, and identification of a stranger
 * 250.
 */
import { crossAt, wallRun, type Frame, type LevelGeometry, type Pt } from "./geometry";

export const CAMERA_KINDS = [
  ["fixed", "Fixed"],
  ["ptz", "PTZ"],
  ["fisheye", "360° fisheye"],
] as const;
export type CameraKind = (typeof CAMERA_KINDS)[number][0];

export interface CameraSpec {
  kind: CameraKind;
  /** Mounting height in metres. */
  heightM: number;
  /** Direction in degrees, clockwise from plan east (right). */
  yaw: number;
  /** Degrees below horizontal; 90 looks straight down. */
  tilt: number;
  /** Horizontal field of view in degrees. */
  hfov: number;
  resW: number;
  resH: number;
  /** Useful range in metres (IR or lighting); 0 = limited only by resolution. */
  rangeM: number;
}

export const DORI = [
  { key: "identify", label: "Identify", ppm: 250, hint: "Enough detail to identify a stranger" },
  { key: "recognise", label: "Recognise", ppm: 125, hint: "Recognise someone you know" },
  { key: "observe", label: "Observe", ppm: 62.5, hint: "See what someone is doing" },
  { key: "detect", label: "Detect", ppm: 25, hint: "Tell that someone is there" },
] as const;
export type DoriKey = (typeof DORI)[number]["key"];

/** 0 = identify … 3 = detect, 4 = not covered. */
export function doriLevel(ppm: number): number {
  const i = DORI.findIndex((d) => ppm >= d.ppm);
  return i < 0 ? DORI.length : i;
}

/** Lenses by focal length on a typical 1/2.8" sensor, with their horizontal view. */
export const LENSES = [
  { label: "2.8 mm wide (≈ 103°)", hfov: 103 },
  { label: "4 mm (≈ 85°)", hfov: 85 },
  { label: "6 mm (≈ 54°)", hfov: 54 },
  { label: "8 mm (≈ 40°)", hfov: 40 },
  { label: "12 mm (≈ 27°)", hfov: 27 },
  { label: "25 mm tele (≈ 13°)", hfov: 13 },
] as const;

export const RESOLUTIONS = [
  { label: "2 MP (1920 × 1080)", w: 1920, h: 1080 },
  { label: "4 MP (2560 × 1440)", w: 2560, h: 1440 },
  { label: "5 MP (2592 × 1944)", w: 2592, h: 1944 },
  { label: "8 MP 4K (3840 × 2160)", w: 3840, h: 2160 },
  { label: "12 MP fisheye (4000 × 3000)", w: 4000, h: 3000 },
] as const;

export const DEFAULT_CAMERA: CameraSpec = { kind: "fixed", heightM: 3, yaw: 0, tilt: 25, hfov: 85, resW: 2560, resH: 1440, rangeM: 30 };

const rad = (d: number) => (d * Math.PI) / 180;

export const isFisheye = (c: Pick<CameraSpec, "kind">) => c.kind === "fisheye";

/** Vertical field of view in degrees from the sensor's aspect ratio. */
export function vfovOf(c: Pick<CameraSpec, "hfov" | "resW" | "resH" | "kind">): number {
  if (isFisheye(c)) return c.hfov;
  return (2 * Math.atan(Math.tan(rad(Math.min(c.hfov, 170)) / 2) * (c.resH / c.resW)) * 180) / Math.PI;
}

/** Pixels per metre at `depth` metres in front of the camera. */
export function ppmAt(c: CameraSpec, depth: number): number {
  if (depth <= 0) return Infinity;
  if (isFisheye(c)) return Math.min(c.resW, c.resH) / (rad(c.hfov) * depth);
  return c.resW / (2 * depth * Math.tan(rad(Math.min(c.hfov, 170)) / 2));
}

/** Distance at which pixel density falls to `ppm`. */
export function reachFor(c: CameraSpec, ppm: number): number {
  const d = isFisheye(c) ? Math.min(c.resW, c.resH) / (rad(c.hfov) * ppm) : c.resW / (2 * ppm * Math.tan(rad(Math.min(c.hfov, 170)) / 2));
  return c.rangeM > 0 ? Math.min(d, c.rangeM) : d;
}

/** Camera basis vectors (plan x right, y down, z up). */
export function basis(c: CameraSpec) {
  const y = rad(c.yaw);
  const t = rad(c.tilt);
  const f = [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), -Math.sin(t)] as const;
  const r = [-Math.sin(y), Math.cos(y), 0] as const;
  // u = r × f
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] as const;
  return { f, r, u };
}

/**
 * Pixel density the camera at (cx, cy) gets on a point (px, py, pz), all in
 * metres, or 0 if the point is outside its view or range. Walls are not checked.
 */
export function densityAt(c: CameraSpec, cx: number, cy: number, px: number, py: number, pz = 0): number {
  const v = [px - cx, py - cy, pz - c.heightM] as const;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return 0;
  if (c.rangeM > 0 && len > c.rangeM) return 0;
  const { f, r, u } = basis(c);
  const fx = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (isFisheye(c)) {
    const ang = Math.acos(Math.max(-1, Math.min(1, fx / len)));
    return ang <= rad(c.hfov) / 2 ? ppmAt(c, len) : 0;
  }
  if (fx <= 0) return 0;
  const rx = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
  const ux = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  if (Math.abs(rx / fx) > Math.tan(rad(Math.min(c.hfov, 170)) / 2)) return 0;
  if (Math.abs(ux / fx) > Math.tan(rad(vfovOf(c)) / 2)) return 0;
  return ppmAt(c, fx);
}

export type Segment = [Pt, Pt];

/**
 * Wall runs a camera can't see through, in metres. Walls, partitions and
 * closed doors block; glass, fences, windows and open doorways don't.
 */
export function blockersOf(g: LevelGeometry, f: Frame): Segment[] {
  const out: Segment[] = [];
  for (const w of g.walls) {
    if (w.kind === "glass" || w.kind === "fence") continue;
    const run = wallRun(w, g.openings, f);
    const spans = [...run.solid, ...run.gaps.filter((x) => x.opening.kind === "door" || x.opening.kind === "double" || x.opening.kind === "roller")];
    for (const s of spans) {
      out.push([
        [run.a[0] + run.dir[0] * s.s0, run.a[1] + run.dir[1] * s.s0],
        [run.a[0] + run.dir[0] * s.s1, run.a[1] + run.dir[1] * s.s1],
      ]);
    }
  }
  return out;
}

export interface PlacedCamera extends CameraSpec {
  id: number;
  /** Position in metres on the level. */
  x: number;
  y: number;
}

export interface Coverage {
  cols: number;
  rows: number;
  /** Cell size in metres. */
  cell: number;
  /** Best pixel density per cell across all cameras (row-major). */
  ppm: Float32Array;
  /** How many cameras see each cell. */
  count: Uint8Array;
}

/** True when nothing in `walls` crosses the line of sight from (cx, cy) to (px, py). */
export function clearView(walls: Segment[], cx: number, cy: number, px: number, py: number): boolean {
  const len = Math.hypot(px - cx, py - cy);
  if (len < 1e-6) return true;
  // A camera mounted on a wall sits on that wall's line: ignore crossings right beside it.
  const skip = Math.min(0.5, 0.2 / len);
  for (const [a, b] of walls) {
    const t = crossAt([cx, cy], [px, py], a, b);
    if (t !== null && t > skip && t < 1 - 1e-6) return false;
  }
  return true;
}

/**
 * Coverage of a level's floor (at `targetZ` metres above it) by its cameras,
 * with walls blocking the view. Each camera only visits cells within the
 * distance its resolution still reaches detection density.
 */
export function coverage(cams: PlacedCamera[], walls: Segment[], f: Frame, opts: { cell?: number; targetZ?: number } = {}): Coverage {
  const cell = opts.cell ?? Math.min(1, Math.max(0.15, Math.max(f.W, f.D) / 240));
  const cols = Math.max(1, Math.ceil(f.W / cell));
  const rows = Math.max(1, Math.ceil(f.D / cell));
  const ppm = new Float32Array(cols * rows);
  const count = new Uint8Array(cols * rows);
  const z = opts.targetZ ?? 0;
  for (const c of cams) {
    const reach = Math.sqrt(Math.max(0, reachFor(c, DORI[DORI.length - 1]!.ppm) ** 2 - (c.heightM - z) ** 2));
    if (!(reach > 0)) continue;
    const x0 = Math.max(0, Math.floor((c.x - reach) / cell));
    const x1 = Math.min(cols - 1, Math.ceil((c.x + reach) / cell));
    const y0 = Math.max(0, Math.floor((c.y - reach) / cell));
    const y1 = Math.min(rows - 1, Math.ceil((c.y + reach) / cell));
    // Only walls inside this camera's reach can block it.
    const near = walls.filter(
      ([a, b]) => Math.max(a[0], b[0]) >= c.x - reach && Math.min(a[0], b[0]) <= c.x + reach && Math.max(a[1], b[1]) >= c.y - reach && Math.min(a[1], b[1]) <= c.y + reach
    );
    for (let j = y0; j <= y1; j++) {
      const py = (j + 0.5) * cell;
      for (let i = x0; i <= x1; i++) {
        const px = (i + 0.5) * cell;
        const d = densityAt(c, c.x, c.y, px, py, z);
        if (d < DORI[DORI.length - 1]!.ppm) continue;
        if (!clearView(near, c.x, c.y, px, py)) continue;
        const k = j * cols + i;
        if (d > ppm[k]!) ppm[k] = d;
        if (count[k]! < 255) count[k]!++;
      }
    }
  }
  return { cols, rows, cell, ppm, count };
}

/** Share of a rectangle (metres) at each DORI level or better: [identify, recognise, observe, detect]. */
export function coverageIn(cov: Coverage, x: number, y: number, w: number, h: number): number[] {
  const i0 = Math.max(0, Math.floor(x / cov.cell));
  const i1 = Math.min(cov.cols - 1, Math.ceil((x + w) / cov.cell) - 1);
  const j0 = Math.max(0, Math.floor(y / cov.cell));
  const j1 = Math.min(cov.rows - 1, Math.ceil((y + h) / cov.cell) - 1);
  const hits = [0, 0, 0, 0];
  let n = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      n++;
      const lvl = doriLevel(cov.ppm[j * cov.cols + i]!);
      for (let k = lvl; k < 4; k++) hits[k]!++;
    }
  return hits.map((v) => (n ? v / n : 0));
}

/** Best pixel density at a point (metres). */
export function coverageAt(cov: Coverage, x: number, y: number): number {
  const i = Math.floor(x / cov.cell);
  const j = Math.floor(y / cov.cell);
  if (i < 0 || j < 0 || i >= cov.cols || j >= cov.rows) return 0;
  return cov.ppm[j * cov.cols + i]!;
}

/**
 * The outline of what a camera sees on the floor, as a polygon in metres,
 * traced by casting rays across its horizontal view and stopping each at the
 * first wall, the floor edge of its view, or its reach.
 */
export function viewPolygon(c: PlacedCamera, walls: Segment[], rays = 90): Pt[] {
  const reach = Math.sqrt(Math.max(0, reachFor(c, DORI[DORI.length - 1]!.ppm) ** 2 - c.heightM ** 2));
  if (!(reach > 0)) return [];
  const pts: Pt[] = isFisheye(c) ? [] : [[c.x, c.y]];
  const span = isFisheye(c) ? 360 : Math.min(c.hfov, 170);
  const start = isFisheye(c) ? 0 : c.yaw - span / 2;
  const n = isFisheye(c) ? rays * 2 : rays;
  for (let k = 0; k <= n; k++) {
    const a = rad(start + (span * k) / n);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Walk out along the ray to the farthest point the camera can see on the floor.
    let far = 0;
    const steps = 60;
    for (let s = 1; s <= steps; s++) {
      const d = (reach * s) / steps;
      if (densityAt(c, c.x, c.y, c.x + dx * d, c.y + dy * d) >= DORI[DORI.length - 1]!.ppm) far = d;
    }
    let end = far;
    const tip: Pt = [c.x + dx * far, c.y + dy * far];
    for (const [a0, b0] of walls) {
      const t = crossAt([c.x, c.y], tip, a0, b0);
      if (t !== null && t * far > 0.2 && t * far < end) end = t * far;
    }
    pts.push([c.x + dx * end, c.y + dy * end]);
  }
  return pts;
}
