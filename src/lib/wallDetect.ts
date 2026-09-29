/**
 * Finds walls, doors and windows in a raster floor plan.
 *
 * 1. Ink: pixels darker than an Otsu threshold.
 * 2. Walls are the thickest consistent strokes. The stroke-width spectrum
 *    (a distance transform's ridge values) gives the typical wall thickness;
 *    plans drawn with outlined walls (two thin lines) are closed first.
 * 3. A morphological opening at about a third of that thickness removes
 *    text, dimensions, hatching and furniture.
 * 4. What's left is read as straight runs: horizontal and vertical bands,
 *    then any remaining elongated blobs as diagonal walls.
 * 5. Collinear runs separated by a door-sized gap become one wall with an
 *    opening; a swing arc beside the gap marks a door, thin lines inside it
 *    a window.
 * 6. Ends are snapped onto the centreline of the wall they meet.
 *
 * Everything is in image pixels; the caller converts to plan fractions.
 * Pure TypeScript, so it runs in a browser, a worker, or a test.
 */

export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DetectOptions {
  /** "outline" for walls drawn as two thin lines; "auto" decides from the image. */
  style?: "auto" | "solid" | "outline";
  /** Multiplies the stroke width treated as a wall: above 1 keeps only heavier walls. */
  sensitivity?: number;
  /** Known scale, used to size door gaps. */
  pxPerM?: number | null;
}

export interface DetectedWall {
  a: [number, number];
  b: [number, number];
  /** Thickness in pixels. */
  t: number;
}

export interface DetectedOpening {
  wall: number;
  /** Centre along the wall, 0–1. */
  at: number;
  /** Width in pixels. */
  w: number;
  kind: "door" | "window" | "opening";
}

export interface DetectResult {
  walls: DetectedWall[];
  openings: DetectedOpening[];
  /** Typical wall thickness in pixels. */
  thickness: number;
  style: "solid" | "outline";
  /** Scale suggested from door widths (a door is about 0.9 m), when there are enough doors. */
  pxPerMSuggest: number | null;
}

const INF = 1e9;

/** Chamfer (3-4) distance from every pixel to the nearest seed pixel, in pixels. */
function distanceFrom(seed: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1]! + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w]! + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1]! + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + 4);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1]! + 4);
      }
      d[i] = v;
    }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

function not(m: Uint8Array): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] ? 0 : 1;
  return out;
}
function threshold(d: Float32Array, test: (v: number) => boolean): Uint8Array {
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = test(d[i]!) ? 1 : 0;
  return out;
}

/** Pixels within r of the mask. */
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return threshold(distanceFrom(m, w, h), (v) => v <= r);
}
/** Mask pixels more than r from its edge. */
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return threshold(distanceFrom(not(m), w, h), (v) => v > r);
}

function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const g of gray) hist[g]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  return thr;
}

/** Stroke widths (twice the distance-transform ridge value) and how often each occurs. */
function strokeSpectrum(mask: Uint8Array, w: number, h: number): number[] {
  const d = distanceFrom(not(mask), w, h);
  const hist = new Array<number>(64).fill(0);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = d[i]!;
      if (v <= 0) continue;
      if (v >= d[i - 1]! && v >= d[i + 1]! && v >= d[i - w]! && v >= d[i + w]!) {
        // Ridge pixel: the stroke is about 2v - 1 wide here.
        const width = Math.min(63, Math.max(1, Math.round(2 * v - 1)));
        hist[width]!++;
      }
    }
  return hist;
}

interface Band {
  horizontal: boolean;
  /** Centreline across the band (y for horizontal). */
  c: number;
  /** Extent along the band. */
  s0: number;
  s1: number;
  t: number;
}

/** Straight bands of the mask running along x (horizontal) or y. */
function bands(mask: Uint8Array, w: number, h: number, horizontal: boolean, minLen: number, maxT: number): Band[] {
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const at = horizontal ? (i: number, o: number) => mask[o * w + i]! : (i: number, o: number) => mask[i * w + o]!;
  type Open = { r0: number; r1: number; first: number; last: number; sum0: number; sum1: number; n: number };
  let open: Open[] = [];
  const out: Band[] = [];
  const close = (b: Open) => {
    const s0 = b.sum0 / b.n;
    const s1 = b.sum1 / b.n;
    const t = b.last - b.first + 1;
    if (s1 - s0 >= minLen && t <= maxT && (s1 - s0) / t >= 2.5) out.push({ horizontal, c: (b.first + b.last + 1) / 2, s0, s1, t });
  };
  for (let o = 0; o <= outer; o++) {
    const runs: [number, number][] = [];
    if (o < outer) {
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        const on = i < inner && at(i, o) === 1;
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          if (i - start >= minLen) runs.push([start, i]);
          start = -1;
        }
      }
    }
    const next: Open[] = [];
    const used = new Set<Open>();
    for (const [r0, r1] of runs) {
      const match = open.find((b) => !used.has(b) && Math.min(r1, b.r1) - Math.max(r0, b.r0) >= 0.7 * Math.min(r1 - r0, b.r1 - b.r0));
      if (match) {
        used.add(match);
        next.push({ r0, r1, first: match.first, last: o, sum0: match.sum0 + r0, sum1: match.sum1 + r1, n: match.n + 1 });
      } else next.push({ r0, r1, first: o, last: o, sum0: r0, sum1: r1, n: 1 });
    }
    for (const b of open) if (!used.has(b)) close(b);
    open = next;
  }
  return out;
}

function toWall(b: Band): DetectedWall {
  return b.horizontal ? { a: [b.s0, b.c], b: [b.s1, b.c], t: b.t } : { a: [b.c, b.s0], b: [b.c, b.s1], t: b.t };
}

/** Elongated blobs left after the straight bands: diagonal walls. */
function diagonals(mask: Uint8Array, covered: Uint8Array, w: number, h: number, minLen: number, maxT: number): DetectedWall[] {
  const seen = new Uint8Array(w * h);
  const out: DetectedWall[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || covered[s] || seen[s]) continue;
    const px: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      px.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && !covered[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (px.length < minLen * 2) continue;
    let mx = 0;
    let my = 0;
    for (const i of px) {
      mx += i % w;
      my += Math.floor(i / w);
    }
    mx /= px.length;
    my /= px.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const i of px) {
      const dx = (i % w) - mx;
      const dy = Math.floor(i / w) - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    let lo = Infinity;
    let hi = -Infinity;
    let spread = 0;
    for (const i of px) {
      const dx = (i % w) - mx;
      const dy = Math.floor(i / w) - my;
      const p = dx * ux + dy * uy;
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
      spread = Math.max(spread, Math.abs(-dx * uy + dy * ux));
    }
    const len = hi - lo;
    const t = px.length / Math.max(1, len);
    // A wall is a straight bar: every pixel lies close to its axis (a ring or an L doesn't).
    if (len < minLen || t > maxT || len / t < 4 || spread > t * 0.75 + 2) continue;
    out.push({ a: [mx + ux * lo, my + uy * lo], b: [mx + ux * hi, my + uy * hi], t });
  }
  return out;
}

/** Ink beside a gap: a door's swing arc and leaf, drawn in thin lines. */
function inkNear(ink: Uint8Array, wallMask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
      const i = y * w + x;
      if (ink[i] && !wallMask[i]) n++;
    }
  return n;
}

export function detectWalls(img: RasterImage, opts: DetectOptions = {}): DetectResult {
  const { width: w, height: h, data } = img;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]! / 255;
    const l = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    gray[i] = Math.round(l * a + 255 * (1 - a));
  }
  const thr = Math.max(60, Math.min(200, otsu(gray)));
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = gray[i]! < thr ? 1 : 0;
  const minDim = Math.min(w, h);
  const minWidth = Math.max(3, Math.round(minDim / 500));

  // Walls are the commonest heavy stroke; text and furniture are thinner.
  const spectrum = (m: Uint8Array) => {
    const hist = strokeSpectrum(m, w, h);
    let best = 0;
    let mode = 0;
    let heavy = 0;
    for (let s = minWidth; s < hist.length; s++) {
      heavy += hist[s]!;
      if (hist[s]! > best) {
        best = hist[s]!;
        mode = s;
      }
    }
    // The thinnest stroke still common enough to be a wall class (partitions beside thick external walls).
    let thin = mode;
    for (let s = minWidth; s < mode; s++)
      if (hist[s]! >= best * 0.15) {
        thin = s;
        break;
      }
    return { mode, heavy, thin };
  };
  const sens = opts.sensitivity ?? 1;
  const margin = minDim * 0.015;

  /** One reading of the plan: which pixels are walls, and the straight runs among them. */
  const read = (mask: Uint8Array, style: "solid" | "outline") => {
    const { mode, thin } = spectrum(mask);
    const T = Math.max(minWidth, mode || minWidth);
    const r = Math.max(1, Math.round(0.35 * Math.max(minWidth, thin || T) * sens));
    const walls = dilate(erode(mask, w, h, r), w, h, r + 0.5);
    const minLen = Math.max(12, 4 * T);
    const maxT = 4 * T;
    const all: Band[] = [...bands(walls, w, h, true, minLen, maxT), ...bands(walls, w, h, false, minLen, maxT)];
    // Drop a drawing frame: long straight ink hugging the image edge.
    const found = all.filter((b) => {
      const edge = b.horizontal ? b.c < margin || b.c > h - margin : b.c < margin || b.c > w - margin;
      const span = (b.s1 - b.s0) / (b.horizontal ? w : h);
      return !(edge && span > 0.6);
    });
    // Long straight runs are what walls look like; lettering and symbols make short ones.
    const score = found.reduce((n, b) => n + (b.s1 - b.s0 >= 8 * T ? b.s1 - b.s0 : 0), 0);
    return { style, mask, T, walls, minLen, maxT, all, found, score };
  };

  /** Outlined walls: close the paper between each wall's two lines so the wall reads as solid. */
  const closedInk = () => {
    // The widest common narrow stretch of paper between two lines: thick external walls as well as partitions.
    const paper = strokeSpectrum(not(ink), w, h);
    const top = Math.min(paper.length, Math.max(8, minDim / 40));
    let most = 0;
    for (let g = 3; g < top; g++) most = Math.max(most, paper[g]!);
    let gap = 0;
    for (let g = 3; g < top; g++) if (paper[g]! >= most * 0.25) gap = g;
    const rc = Math.max(2, Math.ceil((gap || minDim / 110) / 2) + 1);
    return erode(dilate(ink, w, h, rc), w, h, rc);
  };

  const candidates =
    opts.style === "solid" ? [read(ink, "solid")] : opts.style === "outline" ? [read(closedInk(), "outline")] : [read(ink, "solid"), read(closedInk(), "outline")];
  // Closing also bridges windows in solid plans, so the outlined reading must win clearly.
  const pick = candidates.reduce((x, y) => (y.score > x.score * 1.8 ? y : x));
  const { style, T, walls, minLen, maxT, all } = pick;
  let found = pick.found;
  found = found.sort((x, y) => y.s1 - y.s0 - (x.s1 - x.s0));

  // Pixels the straight bands explain; whatever long shape remains is diagonal.
  const covered = new Uint8Array(w * h);
  for (const b of all) {
    const half = b.t / 2 + 2;
    const [xa, xb, ya, yb] = b.horizontal ? [b.s0 - 2, b.s1 + 2, b.c - half, b.c + half] : [b.c - half, b.c + half, b.s0 - 2, b.s1 + 2];
    for (let y = Math.max(0, Math.floor(ya)); y < Math.min(h, Math.ceil(yb)); y++) for (let x = Math.max(0, Math.floor(xa)); x < Math.min(w, Math.ceil(xb)); x++) covered[y * w + x] = 1;
  }
  const diag = diagonals(walls, covered, w, h, minLen, maxT);

  // Join collinear runs; a door-sized gap between them becomes an opening.
  const pxPerM = opts.pxPerM ?? null;
  // A gap with a swing arc or glazing lines can be wide; a bare one must be door-sized to count.
  const gapMin = pxPerM ? 0.55 * pxPerM : 2.2 * T;
  const gapMax = pxPerM ? 5 * pxPerM : 30 * T;
  const bareMax = pxPerM ? 1.4 * pxPerM : 8 * T;
  const out: DetectedWall[] = [];
  // Openings keep their centre point until the walls are snapped, then take their place along the wall.
  const gapsFound: { wall: number; x: number; y: number; w: number; kind: DetectedOpening["kind"] }[] = [];
  /** What a gap in a wall is: a swing arc beside it marks a door, glazing lines inside it a window. */
  const classify = (horizontal: boolean, band: Band, g0: number, g1: number): DetectedOpening["kind"] => {
    const gw = g1 - g0;
    const half = band.t / 2;
    const c = band.c;
    const [ax0, ax1, ay0, ay1, bx0, bx1, by0, by1, ix0, ix1, iy0, iy1] = horizontal
      ? [g0, g1, c - half - gw, c - half - 1, g0, g1, c + half + 1, c + half + gw, g0 + 1, g1 - 1, c - half, c + half]
      : [c - half - gw, c - half - 1, g0, g1, c + half + 1, c + half + gw, g0, g1, c - half, c + half, g0 + 1, g1 - 1];
    const side = Math.max(inkNear(ink, walls, w, h, ax0, ay0, ax1, ay1), inkNear(ink, walls, w, h, bx0, by0, bx1, by1));
    const inside = inkNear(ink, walls, w, h, ix0, iy0, ix1, iy1);
    return side >= 1.2 * gw ? "door" : inside >= 0.8 * gw ? "window" : "opening";
  };
  for (const horizontal of [true, false]) {
    const list = found.filter((b) => b.horizontal === horizontal).sort((a, b) => a.c - b.c || a.s0 - b.s0);
    const lines: Band[][] = [];
    for (const b of list) {
      const line = lines.find((l) => Math.abs(l[0]!.c - b.c) <= Math.max(2, 0.5 * Math.min(l[0]!.t, b.t)));
      if (line) line.push(b);
      else lines.push([b]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.s0 - b.s0);
      let cur: Band = { ...line[0]! };
      let gaps: [number, number, DetectedOpening["kind"]][] = [];
      const flush = () => {
        const idx = out.length;
        out.push(toWall(cur));
        for (const [g0, g1, kind] of gaps) {
          const mid = (g0 + g1) / 2;
          gapsFound.push({ wall: idx, x: horizontal ? mid : cur.c, y: horizontal ? cur.c : mid, w: g1 - g0, kind });
        }
        gaps = [];
      };
      for (const b of line.slice(1)) {
        const gap = b.s0 - cur.s1;
        const sameWall = Math.abs(cur.t - b.t) <= Math.max(3, 0.5 * Math.max(cur.t, b.t));
        const kind = gap >= gapMin && gap <= gapMax && sameWall ? classify(horizontal, cur, cur.s1, b.s0) : null;
        if (gap <= Math.max(2, 0.6 * T)) {
          cur = { ...cur, s1: Math.max(cur.s1, b.s1), t: Math.max(cur.t, b.t), c: (cur.c + b.c) / 2 };
        } else if (kind && (kind !== "opening" || gap <= bareMax)) {
          gaps.push([cur.s1, b.s0, kind]);
          cur = { ...cur, s1: b.s1, c: (cur.c + b.c) / 2 };
        } else {
          flush();
          cur = { ...b };
        }
      }
      flush();
    }
  }
  out.push(...diag);

  // Snap ends onto the centreline of a wall they butt into, so corners and tees close.
  for (const a of out) {
    for (const end of ["a", "b"] as const) {
      const p = a[end];
      let best: { d: number; q: [number, number] } | null = null;
      for (const b of out) {
        if (b === a) continue;
        const ux = b.b[0] - b.a[0];
        const uy = b.b[1] - b.a[1];
        const len = Math.hypot(ux, uy);
        if (len < 1) continue;
        const cosAng = Math.abs(((a.b[0] - a.a[0]) * ux + (a.b[1] - a.a[1]) * uy) / (len * Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]) || 1));
        if (cosAng > 0.94) continue;
        const s = ((p[0] - b.a[0]) * ux + (p[1] - b.a[1]) * uy) / len;
        if (s < -b.t || s > len + b.t) continue;
        const q: [number, number] = [b.a[0] + (ux / len) * s, b.a[1] + (uy / len) * s];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d <= (a.t + b.t) * 0.9 + 2 && (!best || d < best.d)) best = { d, q };
      }
      if (best) a[end] = best.q;
    }
  }

  // Real walls join up into a building. Small clusters of short strokes (lettering, symbols) don't.
  const parent = out.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const touches = (a: DetectedWall, b: DetectedWall) => {
    const lim = (a.t + b.t) * 0.75 + 3;
    const near = (p: [number, number], q: DetectedWall) => {
      const ux = q.b[0] - q.a[0];
      const uy = q.b[1] - q.a[1];
      const l2 = ux * ux + uy * uy || 1;
      const t0 = Math.max(0, Math.min(1, ((p[0] - q.a[0]) * ux + (p[1] - q.a[1]) * uy) / l2));
      return Math.hypot(p[0] - (q.a[0] + ux * t0), p[1] - (q.a[1] + uy * t0)) <= lim;
    };
    return near(a.a, b) || near(a.b, b) || near(b.a, a) || near(b.b, a);
  };
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (touches(out[i]!, out[j]!)) parent[find(i)] = find(j);
  const lenOf = (x: DetectedWall) => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]);
  const groups = new Map<number, { total: number; longest: number; n: number }>();
  out.forEach((x, i) => {
    const g = groups.get(find(i)) ?? { total: 0, longest: 0, n: 0 };
    g.total += lenOf(x);
    g.longest = Math.max(g.longest, lenOf(x));
    g.n++;
    groups.set(find(i), g);
  });
  const biggest = Math.max(0, ...[...groups.values()].map((g) => g.total));
  const keep = out.map((_, i) => {
    const g = groups.get(find(i))!;
    // A wall on its own (a line of fused lettering looks like one) has to be long to count.
    return (g.n > 1 && g.total >= biggest * 0.12) || g.longest >= (g.n > 1 ? 15 : 25) * T;
  });
  const index = new Map<number, number>();
  const kept: DetectedWall[] = [];
  out.forEach((x, i) => {
    if (keep[i]) {
      index.set(i, kept.length);
      kept.push(x);
    }
  });
  out.length = 0;
  out.push(...kept);
  const survivors = gapsFound.filter((g) => index.has(g.wall)).map((g) => ({ ...g, wall: index.get(g.wall)! }));
  gapsFound.length = 0;
  gapsFound.push(...survivors);

  const openings: DetectedOpening[] = gapsFound.map((g) => {
    const wl = out[g.wall]!;
    const ux = wl.b[0] - wl.a[0];
    const uy = wl.b[1] - wl.a[1];
    const l2 = ux * ux + uy * uy || 1;
    return { wall: g.wall, at: Math.max(0, Math.min(1, ((g.x - wl.a[0]) * ux + (g.y - wl.a[1]) * uy) / l2)), w: g.w, kind: g.kind };
  });
  const doors = openings.filter((o) => o.kind === "door").map((o) => o.w).sort((x, y) => x - y);
  const pxPerMSuggest = doors.length >= 2 ? doors[Math.floor(doors.length / 2)]! / 0.9 : null;
  return { walls: out, openings, thickness: T, style, pxPerMSuggest };
}
