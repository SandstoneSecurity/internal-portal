// Date helpers. The business runs on Sydney time, so "today" and "late" are
// judged there, not in UTC. Stored dates are ISO (YYYY-MM-DD).

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function todaySydney(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(now);
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "2026-10-14" → "14 OCT 26" */
export function shortDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${String(p[2]).padStart(2, "0")} ${MONTHS[p[1] - 1]} ${String(p[0]).slice(2)}`;
}

/** "2026-09-04" → "04 SEP" */
export function dayMonth(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${String(p[2]).padStart(2, "0")} ${MONTHS[p[1] - 1]}`;
}

export function addDays(iso: string, days: number): string {
  const p = parts(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return 0;
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86_400_000);
}
