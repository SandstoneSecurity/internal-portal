/**
 * Reading a drawing that may show more than one level: every page of a PDF,
 * and every separate plan on a sheet (a ground floor and a first floor drawn
 * side by side). Each becomes a candidate level, named and ordered from the
 * titles printed on the drawing where it has them.
 */
import type { LevelGeometry, OpeningKind, Pt } from "../../shared/geometry";
import { detectWalls, type DetectResult } from "./wallDetect";

export interface Label {
  text: string;
  /** Box in sheet pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  canvas: HTMLCanvasElement;
  /** Text on the page, for PDFs (images carry none). */
  labels: Label[];
  page: number;
}

/** Most pages read from one PDF: a drawing set, not a whole tender pack. */
export const MAX_PAGES = 12;
/** Resolution the sheet is read at for finding plans and walls. */
const READ_EDGE = 2200;

/** Where pdf.js finds its image decoders, colour profiles and standard fonts (copied there at build; see vite.config.ts). */
const PDFJS_ASSETS = { wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", standardFontDataUrl: "/pdfjs/standard_fonts/" };

/** Renders each page of a PDF (with its text) or reads an image, at up to `longEdge` pixels. */
export async function readSheets(file: File, longEdge: number, onPage?: (n: number, of: number) => void): Promise<{ sheets: Sheet[]; pages: number }> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Upload the floor plan as a PDF, PNG, JPEG or WebP.");
    const bitmap = await createImageBitmap(file);
    const k = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(16, Math.round(bitmap.width * k));
    canvas.height = Math.max(16, Math.round(bitmap.height * k));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { sheets: [{ canvas, labels: [], page: 1 }], pages: 1 };
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: PdfWorker } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker");
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...PDFJS_ASSETS });
  const doc = await task.promise;
  try {
    const sheets: Sheet[] = [];
    const n = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= n; i++) {
      onPage?.(i, n);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: longEdge / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const text = await page.getTextContent();
      const labels: Label[] = [];
      for (const item of text.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const t = pdfjs.Util.transform(viewport.transform, item.transform);
        const h = Math.hypot(t[2]!, t[3]!);
        labels.push({ text: item.str.trim(), x: t[4]!, y: t[5]! - h, w: item.width * viewport.scale, h });
      }
      sheets.push({ canvas, labels, page: i });
    }
    return { sheets, pages: doc.numPages };
  } finally {
    void task.destroy();
  }
}

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * A level title in drawing text: "GROUND FLOOR PLAN", "Level 2", "FIRST FLOOR",
 * "BASEMENT 1", "MEZZANINE", "ROOF PLAN". Rank orders levels bottom to top.
 */
export function levelOf(text: string): { name: string; rank: number } | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 60) return null;
  let m = t.match(/\b(lower|upper)\s+ground\b/i);
  if (m) return { name: `${titleCase(m[1]!)} ground floor`, rank: m[1]!.toLowerCase() === "lower" ? -0.5 : 0.5 };
  m = t.match(/\bbasement(?:\s*(?:level)?\s*(\d{1,2}))?\b/i);
  if (m) return { name: m[1] ? `Basement ${m[1]}` : "Basement", rank: -(Number(m[1] ?? 1)) };
  if (/\bground\s*(floor|level)?\b/i.test(t) && !/\bground\s*(line|level\s*rl|rl)\b/i.test(t)) return { name: "Ground floor", rank: 0 };
  if (/\bmezz(anine)?\b/i.test(t)) return { name: "Mezzanine", rank: 0.6 };
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(floor|level)\b/i);
  if (m) return { name: `${titleCase(m[1]!)} floor`, rank: ORDINAL[m[1]!.toLowerCase()]! };
  m = t.match(/\b(?:level|lvl|floor)\s*[-.]?\s*(\d{1,2})\b/i) ?? t.match(/\bL(\d{1,2})\b/);
  if (m) return { name: `Level ${Number(m[1])}`, rank: Number(m[1]) };
  if (/\broof\s*(plan|level|top)?\b/i.test(t)) return { name: "Roof", rank: 99 };
  return null;
}

/** Elevations, sections and details look like plans to a wall detector; they're offered unticked. */
const NOT_A_PLAN = /\b(elevation|section|detail|site\s+plan|location\s+plan|schedule)\b/i;

export interface Candidate {
  id: string;
  sheet: number;
  /** Crop in sheet pixels. */
  box: [number, number, number, number];
  name: string;
  /** Order bottom to top; null when the drawing doesn't say. */
  rank: number | null;
  include: boolean;
  note: string | null;
  /** Walls found, in crop fractions (thickness in crop pixels). */
  detected: DetectResult;
  /** Scale of the sheet from its door widths, in sheet pixels per metre. */
  pxPerM: number | null;
  /** Thumbnail as a data URL. */
  thumb: string;
}

/** Finds the separate plans across all sheets, with names from the nearest level title. */
export async function findCandidates(sheets: Sheet[], onSheet?: (n: number, of: number) => void): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const [si, sheet] of sheets.entries()) {
    onSheet?.(si + 1, sheets.length);
    // Let the progress paint before the synchronous read.
    await new Promise((r) => setTimeout(r, 20));
    const { canvas } = sheet;
    const k = Math.min(1, READ_EDGE / Math.max(canvas.width, canvas.height));
    const w = Math.round(canvas.width * k);
    const h = Math.round(canvas.height * k);
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const ctx = small.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, w, h);
    const res = detectWalls({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h });
    const plans = res.plans.length ? res.plans : [{ walls: res.walls.map((_, i) => i), bbox: [0, 0, w, h] as [number, number, number, number], total: 0 }];
    const pageTitle = sheet.labels.map((l) => levelOf(l.text)).find(Boolean) ?? null;
    for (const [pi, plan] of plans.entries()) {
      // Crop with a margin, in full-size sheet pixels.
      const m = 0.04 * Math.max(plan.bbox[2] - plan.bbox[0], plan.bbox[3] - plan.bbox[1]);
      const box: [number, number, number, number] = [
        Math.max(0, (plan.bbox[0] - m) / k),
        Math.max(0, (plan.bbox[1] - m) / k),
        Math.min(canvas.width, (plan.bbox[2] + m) / k),
        Math.min(canvas.height, (plan.bbox[3] + m) / k),
      ];
      // The title nearest the plan: inside it, or just below or above.
      let best: { l: Label; d: number } | null = null;
      for (const l of sheet.labels) {
        if (!levelOf(l.text) && !NOT_A_PLAN.test(l.text)) continue;
        const cx = l.x + l.w / 2;
        const cy = l.y + l.h / 2;
        const dx = Math.max(box[0] - cx, 0, cx - box[2]);
        const dy = Math.max(box[1] - cy, 0, cy - box[3]);
        const d = Math.hypot(dx, dy * 1.5);
        if (d < 0.35 * Math.max(canvas.width, canvas.height) && (!best || d < best.d)) best = { l, d };
      }
      const titled = best ? levelOf(best.l.text) : plans.length === 1 ? pageTitle : null;
      const odd = best && NOT_A_PLAN.test(best.l.text) && !levelOf(best.l.text);
      // Read each plan again on its own, at the sheet's full resolution, for its walls and openings.
      const sub = res.plans.length > 1 ? detectCrop(canvas, box) : detectedFor(res, plan.walls, [plan.bbox[0] - m, plan.bbox[1] - m], k, box);
      out.push({
        id: `${si}-${pi}`,
        sheet: si,
        box,
        name: titled?.name ?? "",
        rank: titled?.rank ?? null,
        include: !odd,
        note: odd ? `Looks like ${best!.l.text.toLowerCase()}, not a floor plan` : null,
        detected: sub,
        pxPerM: sub.pxPerMSuggest ?? (res.pxPerMSuggest ? res.pxPerMSuggest / k : null),
        thumb: thumbOf(canvas, box),
      });
    }
  }
  // Untitled plans are named in reading order after the titled ones.
  let n = 1;
  for (const c of out) if (!c.name) c.name = `Plan ${n++}`;
  return out;
}

/** Wall detection on one crop of a sheet, in the crop's full-size pixels. */
function detectCrop(canvas: HTMLCanvasElement, box: [number, number, number, number]): DetectResult {
  const cw = box[2] - box[0];
  const ch = box[3] - box[1];
  const k = Math.min(1, READ_EDGE / Math.max(cw, ch));
  const w = Math.max(16, Math.round(cw * k));
  const h = Math.max(16, Math.round(ch * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, box[0], box[1], cw, ch, 0, 0, w, h);
  const r = detectWalls({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h });
  const up = (p: [number, number]): [number, number] => [p[0] / k, p[1] / k];
  return {
    ...r,
    walls: r.walls.map((x) => ({ a: up(x.a), b: up(x.b), t: x.t / k })),
    openings: r.openings.map((o) => ({ ...o, w: o.w / k })),
    thickness: r.thickness / k,
    pxPerMSuggest: r.pxPerMSuggest ? r.pxPerMSuggest / k : null,
  };
}

/** The walls and openings of one plan, re-expressed in its crop's pixels. */
function detectedFor(res: DetectResult, ids: number[], origin: [number, number], k: number, box: [number, number, number, number]): DetectResult {
  const keep = new Map(ids.map((id, i) => [id, i]));
  const ox = Math.max(0, origin[0]);
  const oy = Math.max(0, origin[1]);
  const shift = (p: [number, number]): [number, number] => [(p[0] - ox) / k, (p[1] - oy) / k];
  return {
    walls: ids.map((id) => {
      const wl = res.walls[id]!;
      return { a: shift(wl.a), b: shift(wl.b), t: wl.t / k };
    }),
    openings: res.openings.filter((o) => keep.has(o.wall)).map((o) => ({ ...o, wall: keep.get(o.wall)!, w: o.w / k })),
    thickness: res.thickness / k,
    style: res.style,
    pxPerMSuggest: res.pxPerMSuggest ? res.pxPerMSuggest / k : null,
    plans: [{ walls: ids.map((_, i) => i), bbox: [0, 0, box[2] - box[0], box[3] - box[1]], total: 0 }],
  };
}

function thumbOf(canvas: HTMLCanvasElement, box: [number, number, number, number]): string {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const k = Math.min(1, 360 / Math.max(w, h));
  const t = document.createElement("canvas");
  t.width = Math.max(1, Math.round(w * k));
  t.height = Math.max(1, Math.round(h * k));
  const ctx = t.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(canvas, box[0], box[1], w, h, 0, 0, t.width, t.height);
  return t.toDataURL("image/png");
}

/** Largest plan file the server takes is 8 MB; this leaves room. */
const PLAN_BYTES = 7.5 * 1024 * 1024;

/**
 * A crop of a sheet as an image file for upload: WebP where the browser can write it, else PNG. A dense scan
 * that comes out too big is sent as JPEG, then smaller, until it fits.
 */
export async function cropBlob(canvas: HTMLCanvasElement, box: [number, number, number, number]): Promise<{ blob: Blob; w: number; h: number }> {
  const cw = Math.max(16, Math.round(box[2] - box[0]));
  const ch = Math.max(16, Math.round(box[3] - box[1]));
  const encode = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
  for (let k = 1; ; k *= 0.8) {
    const w = Math.max(16, Math.round(cw * k));
    const h = Math.max(16, Math.round(ch * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, box[0], box[1], cw, ch, 0, 0, w, h);
    const webp = await encode(c, "image/webp", 0.92);
    let blob = webp && webp.type === "image/webp" ? webp : await encode(c, "image/png");
    if (blob && blob.size > PLAN_BYTES) blob = await encode(c, "image/jpeg", 0.88);
    if (!blob) throw new Error("Couldn't prepare that plan.");
    if (blob.size <= PLAN_BYTES || w < 800) return { blob, w, h };
  }
}

/** Detected walls (image pixels) as level geometry: points as fractions of the image, sizes in metres. */
/** Walls and openings only: saving them leaves a level's devices and photos as they are. */
export function toGeometry(r: DetectResult, w: number, h: number, mPerPx: number, newId: (p: string) => string): Pick<LevelGeometry, "walls" | "openings"> {
  const ids = r.walls.map(() => newId("w"));
  const walls = r.walls.map((x, i) => {
    const tm = Math.max(0.05, Math.min(0.6, x.t * mPerPx));
    return { id: ids[i]!, a: [x.a[0] / w, x.a[1] / h] as Pt, b: [x.b[0] / w, x.b[1] / h] as Pt, t: Math.round(tm * 100) / 100, kind: tm >= 0.15 ? ("wall" as const) : ("partition" as const), h: null };
  });
  const openings = r.openings.map((o) => {
    const wm = Math.max(0.5, Math.min(8, o.w * mPerPx));
    const kind: OpeningKind = o.kind === "window" ? "window" : o.kind === "opening" ? "opening" : wm > 2.4 ? "roller" : wm > 1.4 ? "double" : "door";
    return { id: newId("o"), wall: ids[o.wall]!, at: o.at, w: Math.round(wm * 100) / 100, kind };
  });
  return { walls, openings };
}

const areaOf = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);

/**
 * Whether separate plans on one sheet are different levels rather than
 * separate buildings on one site: they carry different level titles, or
 * they're floors of one building (similar footprints). A gatehouse beside a
 * warehouse is neither.
 */
export function levelsOnSheet(cands: Candidate[]): Candidate[] {
  if (cands.length < 2) return [];
  const titles = new Set(cands.filter((c) => c.rank !== null).map((c) => c.name));
  if (titles.size >= 2) return cands;
  const big = Math.max(...cands.map((c) => areaOf(c.box)));
  const alike = cands.filter((c) => areaOf(c.box) >= big * 0.45);
  return alike.length >= 2 ? alike : [];
}

/** The same test on a detection result's plan outlines. */
export function sheetHasLevels(plans: { bbox: [number, number, number, number] }[]): boolean {
  if (plans.length < 2) return false;
  const big = Math.max(...plans.map((p) => areaOf(p.bbox)));
  return plans.filter((p) => areaOf(p.bbox) >= big * 0.45).length >= 2;
}
