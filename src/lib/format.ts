const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function toUtc(iso: string): number {
  const p = parts(iso);
  return p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN;
}

export function addDays(iso: string, days: number): string {
  const t = toUtc(iso);
  return Number.isNaN(t) ? iso : new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** "2026-09-04" → "04 SEP" */
export function dayMonth(iso: string): string {
  const p = parts(iso);
  return p ? `${String(p[2]).padStart(2, "0")} ${MONTHS[p[1] - 1]}` : iso;
}

/** "2026-09-24" → "Thursday 24 September 2026" */
export function longDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const d = new Date(toUtc(iso));
  return `${DAYS[d.getUTCDay()]} ${p[2]} ${MONTH_NAMES[p[1] - 1]} ${p[0]}`;
}

/** ISO-8601 week number. */
export function isoWeek(iso: string): number {
  const d = new Date(toUtc(iso));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export function greeting(now = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(now)
  );
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function sydneyTime(now = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** "william.chan@x.com" → "William"; "tereza@x" → "Tereza" */
export function firstName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]+/)[0] ?? "";
  return first ? first[0]!.toUpperCase() + first.slice(1) : "";
}

export function initialsOf(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0]! : nameOrEmail;
  return base
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function moneyValue(v: string): number {
  return Number(v.replace(/[^0-9.]/g, "") || 0);
}

export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Relative time for audit entries: "just now", "12 min ago", "3 h ago", "21 SEP 14:05". */
export function relativeTime(isoTs: string, now = Date.now()): string {
  const t = Date.parse(isoTs);
  if (Number.isNaN(t)) return isoTs;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 6 * 3600) return `${Math.round(s / 3600)} h ago`;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(t));
  return `${dayMonth(date)} ${sydneyTime(new Date(t))}`;
}

/** Case-insensitive match of every whitespace-separated term somewhere in the haystack. */
export function matches(query: string, ...haystack: (string | number | undefined | null)[]): boolean {
  const hay = haystack.filter((h) => h !== undefined && h !== null).join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Task-style date relative to `today`: "Today", "Tomorrow", "Yesterday", "3 Oct", "3 Oct 27". */
export function friendlyDate(iso: string, today: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const base = `${p[2]} ${SHORT_MONTHS[p[1] - 1]}`;
  return p[0] === Number(today.slice(0, 4)) ? base : `${base} ${String(p[0]).slice(2)}`;
}

/** "3 – 9 Oct", "28 Sep – 3 Oct", or just the due date when there is no start. */
export function dateRange(start: string | null, due: string | null, today: string): string {
  if (!due) return start ? `From ${friendlyDate(start, today)}` : "";
  if (!start || start === due) return friendlyDate(due, today);
  const s = parts(start), d = parts(due);
  if (s && d && s[0] === d[0] && s[1] === d[1] && daysBetween(today, start) > 1 && daysBetween(today, due) > 1)
    return `${s[2]} – ${d[2]} ${SHORT_MONTHS[d[1] - 1]}`;
  return `${friendlyDate(start, today)} – ${friendlyDate(due, today)}`;
}

/** How a due date should read: past due, due soon (today/tomorrow), or neither. */
export function dueTone(due: string | null, today: string, done: boolean): "late" | "soon" | "none" {
  if (!due || done) return "none";
  const diff = daysBetween(today, due);
  return diff < 0 ? "late" : diff <= 1 ? "soon" : "none";
}

/** Full dollar amount: 840000 → "$840,000". */
export function aud(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
