import { Hono } from "hono";
import { OFFENCES, normaliseArea, type CrimeData, type CrimeRate, type OffenceKey } from "../shared/crime";
import { nowIso } from "./dates";
import { BadRequest, handleApiError, type Env } from "./writes";

/**
 * NSW crime statistics from BOCSAR. The Worker fetches the "Local area
 * rankings" workbook (rates per 100,000 by LGA) on a schedule, or takes an
 * uploaded copy, parses it and stores the rates in D1. Every attempt records
 * what it saw (sheets, header rows, matched columns) in crime_meta.detail so
 * a change in BOCSAR's layout can be diagnosed without guessing.
 */
export const PARSER_VERSION = 3;
export const BOCSAR_URLS = [
  "https://bocsar.nsw.gov.au/documents/open-datasets/LGA_ranking_for_violent_and_property_offences.xlsx",
  "https://www.bocsar.nsw.gov.au/documents/open-datasets/LGA_ranking_for_violent_and_property_offences.xlsx",
  "https://bocsarblob.blob.core.windows.net/bocsar-open-data/LGA_ranking_for_violent_and_property_offences.xlsx",
];
const FRESH_DAYS = 7;
const RETRY_HOURS = 6;
const MAX_BYTES = 40 * 1024 * 1024;

// ── Zip ──────────────────────────────────────────────────────────────────────
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a zip's central directory and returns a lazy reader for its entries. */
export function openZip(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end of central directory).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    entries.set(dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    async text(name: string): Promise<string | null> {
      const e = entries.get(name);
      if (!e) return null;
      const lh = e.offset;
      if (dv.getUint32(lh, true) !== 0x04034b50) throw new Error(`Corrupt zip entry ${name}.`);
      const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      const raw = buf.subarray(start, start + e.size);
      const bytes = e.method === 0 ? raw : e.method === 8 ? await inflate(raw) : null;
      if (!bytes) throw new Error(`Unsupported zip compression ${e.method}.`);
      return dec.decode(bytes);
    },
  };
}

// ── XLSX ─────────────────────────────────────────────────────────────────────
const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}
const rowIndex = (ref: string) => Number(ref.replace(/[A-Z]+/gi, "")) - 1;

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

export async function readXlsx(buf: Uint8Array): Promise<Sheet[]> {
  const zip = openZip(buf);
  const workbook = await zip.text("xl/workbook.xml");
  if (!workbook) throw new Error("Not an Excel workbook (no xl/workbook.xml).");
  const rels = (await zip.text("xl/_rels/workbook.xml.rels")) ?? "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1] ?? "", /Target="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const sharedXml = (await zip.text("xl/sharedStrings.xml")) ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? "";
    let path = target.get(rid) ?? "";
    path = path.startsWith("/") ? path.slice(1) : `xl/${path.replace(/^\.\//, "")}`;
    const xml = await zip.text(path);
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const inner = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: Cell = null;
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? null;
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" || type === "e") value = v !== undefined ? unescapeXml(v) : null;
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined && v !== "") value = Number(v);
      const r = rowIndex(ref);
      (rows[r] ??= [])[colIndex(ref)] = value;
    }
    // Merged header cells: repeat the value across the merged range.
    for (const mc of xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
      const r0 = rowIndex(mc[1]!);
      const c0 = colIndex(mc[1]!);
      const r1 = rowIndex(mc[2]!);
      const c1 = colIndex(mc[2]!);
      const v = rows[r0]?.[c0] ?? null;
      if (v === null || r1 - r0 > 5) continue;
      for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) (rows[r] ??= [])[cc] ??= v;
    }
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name, rows });
  }
  return sheets;
}

// ── Layout detection ─────────────────────────────────────────────────────────
const str = (c: Cell) => (c === null || c === undefined ? "" : String(c).trim());
const num = (c: Cell): number | null => {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const s = str(c).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const isArea = /^(lga|local government area|local government area \(lga\)|area)$/i;
const isState = /^(nsw|new south wales)(\s+total|\s*\(total\))?$/i;
const skipArea = /^(total|unknown|in custody|no fixed (place of )?abode|lga not known|—|-)$/i;

export interface ParseResult {
  period: string;
  rates: Map<string, Map<OffenceKey, CrimeRate>>;
  notes: string[];
  sheets: { name: string; header: number | null; sample: string[][]; columns: string[] }[];
}

/**
 * Finds, in any sheet, a header row naming the LGA column, builds a label for
 * every column from the header rows above it, and reads either a wide table
 * (one "rate" column per offence) or a long one (one row per LGA and offence).
 */
export function parseRankings(sheets: Sheet[]): ParseResult {
  const out: ParseResult = { period: "", rates: new Map(), notes: [], sheets: [] };
  const years = new Set<number>();
  const put = (area: string, offence: OffenceKey, v: CrimeRate) => {
    const m = out.rates.get(area) ?? new Map<OffenceKey, CrimeRate>();
    const prev = m.get(offence);
    // Robbery comes in several kinds; their rates add up.
    m.set(offence, prev && offence === "robbery" ? { rate: prev.rate + v.rate, count: (prev.count ?? 0) + (v.count ?? 0) || null, rank: null } : prev ?? v);
    out.rates.set(area, m);
  };

  for (const sheet of sheets) {
    const rows = sheet.rows;
    const diag = { name: sheet.name, header: null as number | null, sample: rows.slice(0, 10).map((r) => r.slice(0, 14).map((c) => str(c).slice(0, 40))), columns: [] as string[] };
    out.sheets.push(diag);
    let h = -1;
    let areaCol = -1;
    for (let r = 0; r < Math.min(40, rows.length) && h < 0; r++)
      rows[r]!.forEach((c, i) => {
        if (h < 0 && isArea.test(str(c))) {
          h = r;
          areaCol = i;
        }
      });
    if (h < 0) continue;
    // Header block: the rows above the LGA header that carry text, plus sub-header rows under it without an area name.
    let top = h;
    while (top > 0 && rows[top - 1]!.some((c) => str(c) !== "") && h - top < 4) top--;
    let bottom = h;
    while (bottom + 1 < rows.length && !str(rows[bottom + 1]![areaCol] ?? null) && rows[bottom + 1]!.some((c) => str(c) !== "")) bottom++;
    diag.header = h;
    const width = Math.max(...rows.slice(top, bottom + 1).map((r) => r.length), 0);
    const labels: string[] = [];
    for (let col = 0; col < width; col++) {
      const parts: string[] = [];
      for (let r = top; r <= bottom; r++) {
        // A blank header cell continues the group header to its left (merged or centred across).
        let c = col;
        while (c > 0 && !str(rows[r]![c] ?? null) && r < h) c--;
        const v = str(rows[r]![c] ?? null);
        if (v && !parts.includes(v)) parts.push(v);
      }
      labels[col] = parts.join(" | ");
    }
    diag.columns = labels.map((l, i) => `${i}: ${l}`).slice(0, 80);
    for (const l of labels) for (const y of l.match(/\b(19|20)\d{2}\b/g) ?? []) years.add(Number(y));
    const periodCells = rows
      .slice(0, top + 1)
      .flat()
      .map(str)
      .filter((s) => /\b(19|20)\d{2}\b/.test(s));
    if (!out.period && periodCells.length) out.period = periodOf(periodCells[0]!);

    const offenceCol = labels.findIndex((l) => /^offen[cs]e/i.test(l) || /\boffence\b/i.test(l.split(" | ").pop() ?? ""));
    const rateCols = labels.map((l, i) => ({ l, i })).filter((x) => /rate/i.test(x.l) && x.i !== areaCol);
    const data = rows.slice(bottom + 1);

    if (offenceCol >= 0 && rateCols.length) {
      // Long table: LGA | Offence | … | Rate | Rank
      const rateCol = latest(rateCols).i;
      const rankCol = labels.findIndex((l) => /rank/i.test(l));
      const countCol = labels.findIndex((l) => /(incidents|count|number)/i.test(l) && !/rate|rank/i.test(l));
      let area = "";
      for (const row of data) {
        area = normaliseArea(str(row[areaCol] ?? null)) || area;
        const label = str(row[offenceCol] ?? null);
        const offence = OFFENCES.find((o) => o.match.test(label));
        const rate = num(row[rateCol] ?? null);
        if (!area || skipArea.test(area) || !offence || rate === null) continue;
        put(isState.test(area) ? "NSW" : area, offence.key, { rate, count: countCol >= 0 ? num(row[countCol] ?? null) : null, rank: rankCol >= 0 ? num(row[rankCol] ?? null) : null });
      }
      out.notes.push(`${sheet.name}: long table, rate column "${labels[rateCol]}"`);
      continue;
    }

    // Wide table: offence named in the column's header path, one rate (and maybe rank/count) column per offence.
    let found = 0;
    for (const o of OFFENCES) {
      const cols = rateCols.filter((x) => o.match.test(x.l));
      if (!cols.length) continue;
      // Robbery kinds are separate columns; keep one per kind, the latest period of each.
      const groups = new Map<string, { l: string; i: number }[]>();
      for (const c of cols) {
        const kind = c.l.replace(/\b(19|20)\d{2}\b.*$/, "").replace(/rate.*$/i, "").trim();
        groups.set(kind, [...(groups.get(kind) ?? []), c]);
      }
      for (const group of groups.values()) {
        const rateCol = latest(group).i;
        const stem = labels[rateCol]!.replace(/rate.*$/i, "");
        const rankCol = labels.findIndex((l, i) => i > rateCol && i < rateCol + 4 && /rank/i.test(l) && l.startsWith(stem.slice(0, 20)));
        const countCol = labels.findIndex((l, i) => i < rateCol && i > rateCol - 4 && /(incidents|count|number)/i.test(l) && l.startsWith(stem.slice(0, 20)));
        for (const row of data) {
          const area = normaliseArea(str(row[areaCol] ?? null));
          const rate = num(row[rateCol] ?? null);
          if (!area || skipArea.test(area) || rate === null) continue;
          put(isState.test(area) ? "NSW" : area, o.key, { rate, count: countCol >= 0 ? num(row[countCol] ?? null) : null, rank: rankCol >= 0 ? num(row[rankCol] ?? null) : null });
        }
        found++;
        out.notes.push(`${sheet.name}: ${o.label} ← "${labels[rateCol]}"`);
      }
    }
    if (!found) out.notes.push(`${sheet.name}: LGA header at row ${h + 1} but no rate columns matched`);
  }
  if (!out.period && years.size) out.period = String(Math.max(...years));

  // No state row: derive NSW from counts and rates (population = count ÷ rate × 100,000).
  if (!out.rates.has("NSW")) {
    const nsw = new Map<OffenceKey, CrimeRate>();
    for (const o of OFFENCES) {
      let count = 0;
      let pop = 0;
      for (const m of out.rates.values()) {
        const v = m.get(o.key);
        if (v?.count && v.rate > 0) {
          count += v.count;
          pop += (v.count / v.rate) * 100_000;
        }
      }
      if (pop > 0) nsw.set(o.key, { rate: (count / pop) * 100_000, count, rank: null });
    }
    if (nsw.size) {
      out.rates.set("NSW", nsw);
      out.notes.push("NSW rates derived from LGA counts and rates (no state row found)");
    }
  }
  return out;
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
/** "NSW Recorded Crime … January 2025 to December 2025" → "January 2025 to December 2025". */
export function periodOf(text: string): string {
  const range = new RegExp(`(${MONTH}\\s+)?(19|20)\\d{2}\\s*(?:to|-|–|—)\\s*(${MONTH}\\s+)?(19|20)\\d{2}`, "i").exec(text);
  if (range) return range[0].replace(/\s+/g, " ");
  const months = new RegExp(`${MONTH}\\s*(?:-|–|—|to)\\s*${MONTH}\\s+(19|20)\\d{2}`, "i").exec(text);
  if (months) return months[0].replace(/\s+/g, " ");
  const year = new RegExp(`(year to|year ending)?\\s*(${MONTH}\\s+)?(19|20)\\d{2}`, "i").exec(text);
  return (year ? year[0] : text).trim().slice(0, 60);
}

/** Of several rate columns, the one for the most recent period (highest year in its label), else the last. */
function latest(cols: { l: string; i: number }[]) {
  const year = (l: string) => Math.max(0, ...(l.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
  return [...cols].sort((a, b) => year(b.l) - year(a.l) || b.i - a.i)[0]!;
}

// ── Storage ──────────────────────────────────────────────────────────────────
async function store(db: D1Database, parsed: ParseResult, source: string) {
  const rows: [string, string, number, number | null, number | null][] = [];
  for (const [area, m] of parsed.rates) for (const [offence, v] of m) rows.push([area, offence, v.rate, v.count, v.rank]);
  const stmts: D1PreparedStatement[] = [db.prepare(`DELETE FROM crime_rates`)];
  // 20 rows × 5 values stays inside D1's 100 bound-parameter limit.
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    stmts.push(db.prepare(`INSERT INTO crime_rates (area, offence, rate, count, rank) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}`).bind(...chunk.flat()));
  }
  const now = nowIso();
  stmts.push(
    db
      .prepare(`INSERT INTO crime_meta (id, source, period, fetched_at, attempted_at, status, message, detail, parser_version) VALUES (1, ?, ?, ?, ?, 'ok', ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET source = excluded.source, period = excluded.period, fetched_at = excluded.fetched_at, attempted_at = excluded.attempted_at,
               status = 'ok', message = excluded.message, detail = excluded.detail, parser_version = excluded.parser_version`)
      .bind(source, parsed.period, now, now, `${parsed.rates.size - (parsed.rates.has("NSW") ? 1 : 0)} LGAs, ${rows.length} rates`, JSON.stringify({ notes: parsed.notes, sheets: parsed.sheets }).slice(0, 60_000), PARSER_VERSION)
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return rows.length;
}

async function fail(db: D1Database, message: string, detail: unknown) {
  await db
    .prepare(`INSERT INTO crime_meta (id, attempted_at, status, message, detail, parser_version) VALUES (1, ?, 'error', ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET attempted_at = excluded.attempted_at, status = 'error', message = excluded.message, detail = excluded.detail, parser_version = excluded.parser_version`)
    .bind(nowIso(), message.slice(0, 500), JSON.stringify(detail).slice(0, 60_000), PARSER_VERSION)
    .run();
}

/** Parses a workbook and stores it; throws with a readable message when nothing usable was found. */
export async function importWorkbook(db: D1Database, bytes: Uint8Array, source: string) {
  let parsed: ParseResult;
  try {
    parsed = parseRankings(await readXlsx(bytes));
  } catch (err) {
    await fail(db, `Couldn't read the workbook: ${(err as Error).message}`, { source });
    throw new BadRequest(`Couldn't read that file as an Excel workbook: ${(err as Error).message}`);
  }
  const lgas = [...parsed.rates.keys()].filter((a) => a !== "NSW").length;
  if (lgas < 20 || !parsed.rates.has("NSW")) {
    await fail(db, `Found ${lgas} LGAs${parsed.rates.has("NSW") ? "" : " and no NSW rates"} — the layout wasn't recognised.`, { source, notes: parsed.notes, sheets: parsed.sheets });
    throw new BadRequest(`That workbook's layout wasn't recognised (found ${lgas} LGAs). Use BOCSAR's Local area rankings file.`);
  }
  const n = await store(db, parsed, source);
  return { lgas, rates: n, period: parsed.period };
}

/** Fetches from BOCSAR, trying each known address. */
export async function refreshFromBocsar(db: D1Database) {
  const tried: { url: string; status: number | string; bytes?: number }[] = [];
  for (const url of BOCSAR_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; SandstonePortal/1.0; +https://sandstonesecurity.com)" } });
      clearTimeout(timer);
      if (!res.ok) {
        tried.push({ url, status: res.status });
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      tried.push({ url, status: res.status, bytes: bytes.length });
      if (bytes.length > MAX_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) continue;
      return await importWorkbook(db, bytes, `BOCSAR Local area rankings (${new URL(url).hostname})`);
    } catch (err) {
      if (err instanceof BadRequest) throw err;
      tried.push({ url, status: (err as Error).message.slice(0, 120) });
    }
  }
  await fail(db, "Couldn't download the BOCSAR workbook from any known address.", { tried });
  throw new BadRequest("Couldn't download the BOCSAR workbook. Download it from BOCSAR (Local area rankings) and upload it here instead.");
}

/** The scheduled refresh: weekly when healthy, every six hours after a failure, at once after a parser change. */
export async function scheduledRefresh(db: D1Database) {
  const meta = await db.prepare(`SELECT status, fetched_at, attempted_at, parser_version FROM crime_meta WHERE id = 1`).first<{ status: string; fetched_at: string | null; attempted_at: string | null; parser_version: number | null }>();
  const now = Date.now();
  const age = (iso: string | null) => (iso ? (now - Date.parse(iso)) / 36e5 : Infinity);
  const parserChanged = (meta?.parser_version ?? 0) !== PARSER_VERSION;
  if (meta && !parserChanged) {
    if (meta.status === "ok" && age(meta.fetched_at) < FRESH_DAYS * 24) return "fresh";
    if (meta.status !== "ok" && age(meta.attempted_at) < RETRY_HOURS) return "waiting";
  }
  try {
    await refreshFromBocsar(db);
    return "refreshed";
  } catch (err) {
    return `failed: ${(err as Error).message}`;
  }
}

export async function getCrime(db: D1Database): Promise<CrimeData> {
  const [meta, { results }] = await Promise.all([
    db.prepare(`SELECT source, period, fetched_at, status, message FROM crime_meta WHERE id = 1`).first<{ source: string | null; period: string | null; fetched_at: string | null; status: string; message: string | null }>(),
    db.prepare(`SELECT area, offence, rate, count, rank FROM crime_rates`).all<{ area: string; offence: OffenceKey; rate: number; count: number | null; rank: number | null }>(),
  ]);
  const rates: CrimeData["rates"] = {};
  for (const r of results) (rates[r.area] ??= {})[r.offence] = { rate: r.rate, count: r.count, rank: r.rank };
  return {
    meta: meta ? { source: meta.source ?? "", period: meta.period ?? "", fetchedAt: meta.fetched_at, status: meta.status, message: meta.message ?? "" } : null,
    areas: Object.keys(rates)
      .filter((a) => a !== "NSW")
      .sort((a, b) => a.localeCompare(b)),
    rates,
  };
}

export const crime = new Hono<Env>();
crime.onError(handleApiError);

crime.post("/crime/refresh", async (c) => c.json(await refreshFromBocsar(c.env.DB)));

// The same parser on a workbook downloaded by hand from BOCSAR.
crime.put("/crime/import", async (c) => {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!bytes.length) throw new BadRequest("The file is empty.");
  if (bytes.length > MAX_BYTES) throw new BadRequest("That file is larger than 40 MB.");
  const name = (c.req.query("name") ?? "uploaded workbook").slice(0, 120);
  return c.json(await importWorkbook(c.env.DB, bytes, `BOCSAR Local area rankings (uploaded: ${name})`), 201);
});
