// Investigations: cases opened on a client's request, with the evidence register, link chart, timeline
// and map that support them. Shared so the Worker and the portal speak the same vocabulary and run the
// same timeline tests.
import type { StatusKind } from "./types";

export const CASE_KINDS = [
  "Fraud",
  "Workplace misconduct",
  "Due diligence",
  "Asset trace",
  "Insurance claim",
  "Locate",
  "Litigation support",
  "Surveillance",
  "Other",
] as const;

export const CASE_STATUSES = [
  ["Intake", "neutral"],
  ["Active", "secure"],
  ["On hold", "advisory"],
  ["Reporting", "info"],
  ["Closed", "neutral"],
] as const satisfies readonly (readonly [string, StatusKind])[];
export type CaseStatus = (typeof CASE_STATUSES)[number][0];

export const EVIDENCE_KINDS = ["Document", "Photo", "Video", "Audio", "Web capture", "Record search", "Statement", "Physical item", "Other"] as const;

/** Admiralty grading: how far the source can be relied on... */
export const RELIABILITY = [
  ["A", "Completely reliable"],
  ["B", "Usually reliable"],
  ["C", "Fairly reliable"],
  ["D", "Not usually reliable"],
  ["E", "Unreliable"],
  ["F", "Reliability cannot be judged"],
] as const;
/** ...and how far this piece of information is borne out. */
export const CREDIBILITY = [
  ["1", "Confirmed by other sources"],
  ["2", "Probably true"],
  ["3", "Possibly true"],
  ["4", "Doubtful"],
  ["5", "Improbable"],
  ["6", "Truth cannot be judged"],
] as const;

export const ENTITY_KINDS = ["Person", "Company", "Account", "Address", "Phone", "Email", "Vehicle", "Event", "Other"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Say exactly what joins two things; these are the usual ones, and any other wording is allowed. */
export const LINK_LABELS = [
  "director of",
  "shareholder of",
  "employed by",
  "owns",
  "lives at",
  "registered at",
  "account holder of",
  "paid",
  "communicated with",
  "appeared alongside",
  "attended",
  "uses",
  "related to",
] as const;

/** Whether a timeline entry is borne out by evidence, or is what someone says happened. */
export const EVENT_BASES = ["Documented", "Claimed"] as const;
export type EventBasis = (typeof EVENT_BASES)[number];

export interface CaseSummary {
  id: number;
  ref: string;
  title: string;
  kind: string;
  clientId: number | null;
  client: string;
  status: CaseStatus;
  statusKind: StatusKind;
  lead: string;
  dueDate: string | null;
  late: boolean;
  createdAt: string;
  closedAt: string | null;
  evidence: number;
  /** Only the people on its access list (and whoever opened it) can see it. */
  restricted: boolean;
}

export interface CaseFile {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
}

export interface Evidence {
  id: number;
  /** EV-001, numbered within the case and never reused. */
  ref: string;
  title: string;
  kind: string;
  source: string;
  sourceUrl: string;
  obtainedAt: string | null;
  obtainedBy: string;
  reliability: string;
  credibility: string;
  notes: string;
  file: CaseFile | null;
  /** For a web capture: what the server saw when it fetched the page. */
  capture: { url: string; finalUrl: string; status: number; contentType: string; fetchedAt: string } | null;
  createdBy: string;
  createdAt: string;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  name: string;
  detail: string;
  /** Where it sits on the link chart; null until placed. */
  x: number | null;
  y: number | null;
}

export interface Link {
  id: number;
  fromId: number;
  toId: number;
  label: string;
  evidenceId: number | null;
  note: string;
}

export interface CaseEvent {
  id: number;
  /** Local (Sydney) date and time, "YYYY-MM-DDTHH:MM". */
  startsAt: string;
  endsAt: string | null;
  title: string;
  detail: string;
  basis: EventBasis;
  place: string;
  /** Given, or found from the suburb in `place`. */
  lat: number | null;
  lng: number | null;
  located: "given" | "suburb" | null;
  evidenceId: number | null;
  entityIds: number[];
}

export interface Report {
  id: number;
  version: number;
  title: string;
  summary: string;
  file: CaseFile | null;
  createdBy: string;
  createdAt: string;
}

export interface LogEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface CaseDetail extends CaseSummary {
  instructions: string;
  legalBasis: string;
  requestedAt: string | null;
  requestedBy: string;
  access: string[];
  createdBy: string;
  evidenceItems: Evidence[];
  entities: Entity[];
  links: Link[];
  events: CaseEvent[];
  reports: Report[];
  log: LogEntry[];
}

export const caseRef = (id: number) => `INV-${String(id).padStart(4, "0")}`;
export const evidenceRef = (seq: number) => `EV-${String(seq).padStart(3, "0")}`;

// ── Timeline tests ──────────────────────────────────────────────────────────

const minutes = (t: string) => Date.parse(`${t}:00Z`) / 60_000;
const endOf = (e: Pick<CaseEvent, "startsAt" | "endsAt">) => (e.endsAt && e.endsAt > e.startsAt ? e.endsAt : e.startsAt);
export const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
};

/** A stretch with nothing documented that's long enough to ask about. */
export const GAP_MINUTES = 60;
/** A claim and a documented event this close in time are compared. */
export const CLAIM_WINDOW_MINUTES = 30;
/** Faster than this between two places needs explaining. */
export const MAX_KMH = 130;

export type TimelineFinding =
  | { type: "overlap"; a: number; b: number }
  | { type: "gap"; after: number; before: number; minutes: number }
  | { type: "conflict"; claim: number; documented: number; km: number }
  | { type: "travel"; from: number; to: number; km: number; minutes: number; kmh: number };

/** Two events are about the same people or things if they share one, or if either names none. */
const related = (a: CaseEvent, b: CaseEvent) => !a.entityIds.length || !b.entityIds.length || a.entityIds.some((id) => b.entityIds.includes(id));

/**
 * Tests the timeline:
 * - overlap: two events of the same basis about the same people or things that run into each other;
 * - gap: a stretch with nothing documented;
 * - conflict: a claim that puts someone somewhere other than the evidence does, at the same time;
 * - travel: one person or thing documented in two places too far apart for the time between them.
 */
export function analyseTimeline(events: CaseEvent[]): TimelineFinding[] {
  const out: TimelineFinding[] = [];
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);

  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!, b = sorted[j]!;
      if (b.startsAt > endOf(a)) break;
      // Only events with some length overlap; two instants at the same minute are simply simultaneous.
      if ((a.endsAt || b.endsAt) && a.basis === b.basis && related(a, b)) out.push({ type: "overlap", a: a.id, b: b.id });
    }

  const documented = sorted.filter((e) => e.basis === "Documented");
  let reach = documented[0] ? endOf(documented[0]) : "";
  for (let i = 1; i < documented.length; i++) {
    const prev = documented[i - 1]!, next = documented[i]!;
    const gap = minutes(next.startsAt) - minutes(reach);
    if (gap >= GAP_MINUTES) out.push({ type: "gap", after: prev.id, before: next.id, minutes: Math.round(gap) });
    if (endOf(next) > reach) reach = endOf(next);
  }

  for (const c of sorted.filter((e) => e.basis === "Claimed" && e.lat !== null && e.lng !== null))
    for (const d of documented) {
      if (d.lat === null || d.lng === null || !related(c, d)) continue;
      const near = minutes(c.startsAt) - CLAIM_WINDOW_MINUTES <= minutes(endOf(d)) && minutes(d.startsAt) <= minutes(endOf(c)) + CLAIM_WINDOW_MINUTES;
      if (!near) continue;
      const km = kmBetween({ lat: c.lat!, lng: c.lng! }, { lat: d.lat, lng: d.lng });
      if (km > 1) out.push({ type: "conflict", claim: c.id, documented: d.id, km: Math.round(km * 10) / 10 });
    }

  // Each person or thing's own documented movements, in order.
  const seen = new Set<string>();
  const ids = [...new Set(documented.flatMap((e) => e.entityIds))];
  for (const id of ids) {
    const path = documented.filter((e) => e.entityIds.includes(id) && e.lat !== null && e.lng !== null);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      const key = `${a.id}-${b.id}`;
      if (seen.has(key)) continue;
      const km = kmBetween({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! });
      const mins = Math.max(0, minutes(b.startsAt) - minutes(endOf(a)));
      const kmh = mins === 0 ? Infinity : km / (mins / 60);
      if (km > 5 && kmh > MAX_KMH) {
        seen.add(key);
        out.push({ type: "travel", from: a.id, to: b.id, km: Math.round(km), minutes: Math.round(mins), kmh: Number.isFinite(kmh) ? Math.round(kmh) : -1 });
      }
    }
  }
  return out;
}

/** "3 h 20 m", "45 m", "2 d 4 h". */
export function duration(mins: number): string {
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = Math.round(mins % 60);
  return d ? `${d} d${h ? ` ${h} h` : ""}` : h ? `${h} h${m ? ` ${m} m` : ""}` : `${m} m`;
}
