// Finds where an intelligence item happened from the suburb named in it: the place given when it was
// logged, or failing that a suburb named in the report itself ("…at the Lakemba shops…").
import { NSW_SUBURBS } from "./nswSuburbs";

export interface Suburb {
  name: string;
  lat: number;
  lng: number;
}

let index: Map<string, Suburb[]> | null = null;
function suburbs(): Map<string, Suburb[]> {
  if (index) return index;
  index = new Map();
  for (const row of NSW_SUBURBS.split(";")) {
    const [name, lat, lng] = row.split("|");
    const key = name!.toLowerCase();
    index.set(key, [...(index.get(key) ?? []), { name: name!, lat: Number(lat), lng: Number(lng) }]);
  }
  return index;
}

/** Places whose names are everyday words in reports: "the City", "in March". */
const SKIP = new Set(["city", "march"]);

/** No suburb name runs past five words. */
const MAX_WORDS = 5;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));

/**
 * The suburb a piece of text names. In a report only proper names count ("Lakemba", not "lakemba"), and a
 * name used in several places resolves to the one nearest the item's region; a match far from its region
 * (over 400 km) is ignored as a coincidence.
 */
export function findSuburb(text: string, near: { lat: number; lng: number } | null, properNamesOnly: boolean): Suburb | null {
  const words = [...text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => m[0]);
  const idx = suburbs();
  let best: { s: Suburb; len: number; at: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1; n--) {
      const slice = words.slice(i, i + n);
      if (properNamesOnly && !slice.every((w) => /^[A-Z]/.test(w))) continue;
      const key = slice.join(" ").toLowerCase().replace(/’/g, "'");
      const found = SKIP.has(key) ? undefined : idx.get(key);
      if (!found) continue;
      const len = slice.join(" ").length;
      const s = near ? found.reduce((a, b) => (km(a, near) <= km(b, near) ? a : b)) : found[0]!;
      if (near && km(s, near) > 400) continue;
      // The longest, most specific name wins ("Barangaroo, Sydney" is Barangaroo); then the first.
      if (!best || len > best.len) best = { s, len, at: i };
      break;
    }
  }
  return best?.s ?? null;
}
