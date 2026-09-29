/**
 * Building geometry for a level: walls and the openings in them.
 *
 * Points are fractions of the level's plan (x of its width, y of its depth,
 * origin top-left), like the positions of zones and assets, so setting the
 * plan's scale later moves nothing. Thicknesses and widths are in metres.
 */

export type Pt = [number, number];

export const WALL_KINDS = [
  ["wall", "Wall"],
  ["partition", "Partition"],
  ["glass", "Glazed wall"],
  ["fence", "Fence"],
] as const;
export type WallKind = (typeof WALL_KINDS)[number][0];

export const OPENING_KINDS = [
  ["door", "Door"],
  ["double", "Double door"],
  ["roller", "Roller door"],
  ["window", "Window"],
  ["opening", "Opening"],
] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number][0];

/** Typical clear widths in metres. */
export const OPENING_WIDTH: Record<OpeningKind, number> = { door: 0.9, double: 1.8, roller: 3.6, window: 1.2, opening: 1.2 };
/** Sill and head heights in metres (a sill of 0 is a doorway). */
export const OPENING_HEIGHTS: Record<OpeningKind, { sill: number; head: number }> = {
  door: { sill: 0, head: 2.1 },
  double: { sill: 0, head: 2.1 },
  roller: { sill: 0, head: 3.2 },
  window: { sill: 0.9, head: 2.1 },
  opening: { sill: 0, head: 2.4 },
};
export const WALL_THICKNESS: Record<WallKind, number> = { wall: 0.2, partition: 0.1, glass: 0.05, fence: 0.05 };
/** Fences stop at head height; everything else runs to the ceiling. */
export const FENCE_HEIGHT = 2.4;

export interface Wall {
  id: string;
  a: Pt;
  b: Pt;
  /** Thickness in metres. */
  t: number;
  kind: WallKind;
  /** Height in metres when it differs from the level's ceiling. */
  h: number | null;
}

export interface Opening {
  id: string;
  wall: string;
  /** Centre of the opening along its wall, 0 (at a) to 1 (at b). */
  at: number;
  /** Clear width in metres. */
  w: number;
  kind: OpeningKind;
}

export interface LevelGeometry {
  walls: Wall[];
  openings: Opening[];
}

export const EMPTY_GEOMETRY: LevelGeometry = { walls: [], openings: [] };
export const GEOMETRY_LIMITS = { walls: 4000, openings: 3000 };

/** A level's plan in metres: W across, D deep. */
export interface Frame {
  W: number;
  D: number;
}

export function frameOf(level: { widthM: number; plan: { w: number; h: number } | null }): Frame {
  const W = level.widthM;
  return { W, D: level.plan && level.plan.w > 0 ? (W * level.plan.h) / level.plan.w : W * 0.625 };
}

export const toM = (p: Pt, f: Frame): Pt => [p[0] * f.W, p[1] * f.D];
export const toF = (p: Pt, f: Frame): Pt => [p[0] / f.W, p[1] / f.D];
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Ceiling height used for walls: the floor-to-floor height less a slab. */
export const ceilingOf = (levelHeightM: number) => Math.max(2.4, levelHeightM - 0.3);

export interface Piece {
  /** Distances along the wall in metres. */
  s0: number;
  s1: number;
}

export interface WallRun {
  wall: Wall;
  a: Pt;
  b: Pt;
  len: number;
  /** Unit direction a → b. */
  dir: Pt;
  /** Solid lengths between openings. */
  solid: Piece[];
  /** Openings, clipped to the wall. */
  gaps: (Piece & { opening: Opening })[];
}

/** A wall in metres with its openings cut out. Overlapping openings merge into the wider span. */
export function wallRun(wall: Wall, openings: Opening[], f: Frame): WallRun {
  const a = toM(wall.a, f);
  const b = toM(wall.b, f);
  const len = dist(a, b);
  const dir: Pt = len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  const gaps = openings
    .filter((o) => o.wall === wall.id)
    .map((o) => {
      const c = o.at * len;
      return { s0: Math.max(0, c - o.w / 2), s1: Math.min(len, c + o.w / 2), opening: o };
    })
    .filter((g) => g.s1 - g.s0 > 0.01)
    .sort((x, y) => x.s0 - y.s0);
  const solid: Piece[] = [];
  let s = 0;
  for (const g of gaps) {
    if (g.s0 > s + 0.005) solid.push({ s0: s, s1: g.s0 });
    s = Math.max(s, g.s1);
  }
  if (len > s + 0.005) solid.push({ s0: s, s1: len });
  return { wall, a, b, len, dir, solid, gaps };
}

export const along = (r: WallRun, s: number): Pt => [r.a[0] + r.dir[0] * s, r.a[1] + r.dir[1] * s];

/** Closest point on segment ab to p, with its parameter (0–1) and distance. */
export function project(p: Pt, a: Pt, b: Pt): { t: number; p: Pt; d: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { t, p: q, d: dist(p, q) };
}

/** Where segments p→q and a→b cross, as the parameter along p→q (0–1), or null. */
export function crossAt(p: Pt, q: Pt, a: Pt, b: Pt): number | null {
  const rx = q[0] - p[0];
  const ry = q[1] - p[1];
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const ax = a[0] - p[0];
  const ay = a[1] - p[1];
  const t = (ax * sy - ay * sx) / den;
  const u = (ax * ry - ay * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

let seq = 0;
/** Short ids for walls and openings; unique within a level. */
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Drops openings whose wall is gone and keeps each opening inside its wall. */
export function tidy(g: LevelGeometry): LevelGeometry {
  const ids = new Set(g.walls.map((w) => w.id));
  return { walls: g.walls, openings: g.openings.filter((o) => ids.has(o.wall)).map((o) => ({ ...o, at: Math.max(0, Math.min(1, o.at)) })) };
}

/** Parses stored geometry, tolerating an empty or damaged value. */
export function parseGeometry(raw: string | null | undefined): LevelGeometry {
  if (!raw) return EMPTY_GEOMETRY;
  try {
    const g = JSON.parse(raw) as Partial<LevelGeometry>;
    return tidy({ walls: Array.isArray(g.walls) ? g.walls : [], openings: Array.isArray(g.openings) ? g.openings : [] });
  } catch {
    return EMPTY_GEOMETRY;
  }
}
