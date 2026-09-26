export type StatusKind = "secure" | "advisory" | "breach" | "info" | "neutral";

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: string;
  note: string;
  noteKind: StatusKind;
}

export interface EmployeeShift {
  date: string;
  span: string;
  site: string;
}

export interface Employee {
  id: number;
  name: string;
  role: string;
  cls: string;
  /** Display label, e.g. "14 OCT 26". */
  exp: string;
  /** ISO date when known (rows written through the API); null for legacy rows. */
  expDate: string | null;
  /** Licence expires within 90 days (or already has). */
  expirySoon: boolean;
  expired: boolean;
  site: string;
  status: string;
  kind: StatusKind;
  since: string;
  firstAid: string;
  mobile: string;
  employmentType: string;
  shifts: EmployeeShift[];
}

export interface ClientContact {
  id: number;
  name: string;
  /** Job title. */
  role: string;
  email: string;
  phone: string;
}

export const ENGAGEMENT_KINDS = ["note", "email", "call", "meeting", "task"] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];
export const CALL_OUTCOMES = ["Connected", "Left voicemail", "No answer", "Wrong number"] as const;

/** Something logged against a company: a note, email, call, meeting or task. */
export interface Engagement {
  id: number;
  clientId: number;
  kind: EngagementKind;
  subject: string;
  body: string;
  /** When it happened (or is scheduled for, for meetings): ISO date or timestamp. */
  at: string;
  /** Who logged it (Access email); "" for legacy rows. */
  actor: string;
  /** Call outcome. */
  outcome: string;
  /** Tasks: due date and whether it's done. */
  dueDate: string | null;
  done: boolean;
  contactId: number | null;
}

export interface Client {
  id: number;
  org: string;
  /** Industry. */
  sector: string;
  sites: number;
  /** Annual contract value, display form ("$840,000"). */
  value: string;
  valueNum: number;
  owner: string;
  /** Lifecycle stage. */
  status: string;
  kind: StatusKind;
  /** Description. */
  meta: string;
  domain: string;
  phone: string;
  city: string;
  createdAt: string | null;
  /** Latest engagement date, ISO. */
  lastActivity: string | null;
  contacts: ClientContact[];
  activity: Engagement[];
}

/** Deal pipeline stages with win probability, in order. */
export const DEAL_STAGES = [
  ["Enquiry", 10],
  ["Site survey", 25],
  ["Proposal sent", 50],
  ["Negotiation", 75],
  ["Closed won", 100],
  ["Closed lost", 0],
] as const satisfies readonly (readonly [string, number])[];
export type DealStage = (typeof DEAL_STAGES)[number][0];

export interface Deal {
  id: number;
  clientId: number;
  name: string;
  amount: number;
  stage: DealStage;
  closeDate: string | null;
  owner: string;
  createdAt: string;
  closedAt: string | null;
}

export const PRIORITIES = ["None", "Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface OpsSubtask {
  id: number;
  cardId: number;
  title: string;
  done: boolean;
  /** Owner initials; "" when unassigned. */
  who: string;
  startDate: string | null;
  dueDate: string | null;
  late: boolean;
}

export interface OpsCard {
  id: number;
  columnId: number;
  ref: string;
  title: string;
  /** Client / site; "" when not set. */
  site: string;
  line: string;
  description: string;
  priority: Priority;
  /** Display label, e.g. "DUE 04 SEP"; "" when there is no due date. */
  due: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  late: boolean;
  /** Owner initials; "" when unassigned. */
  who: string;
  /** A milestone has one date (its due date) and is drawn as a diamond. */
  milestone: boolean;
  /** Ids of the tasks this one waits on. */
  blockedBy: number[];
  subtasks: OpsSubtask[];
}

export interface OpsColumn {
  id: number;
  label: string;
  done: boolean;
  cards: OpsCard[];
}

export interface Role {
  id: number;
  title: string;
  meta: string;
  /** Job state: Draft, Published, On hold, Closed. */
  status: string;
  kind: StatusKind;
  /** Active (not disqualified) candidates per pipeline stage. */
  counts: number[];
  disqualified: number;
  department: string;
  location: string;
  employmentType: string;
  openings: number;
  description: string;
  hiringManager: string;
  createdAt: string | null;
}

export type CandidateEventKind = "created" | "stage" | "comment" | "evaluation" | "disqualified" | "requalified";

export interface CandidateEvent {
  id: number;
  at: string;
  actor: string;
  kind: CandidateEventKind;
  body: string;
  /** Evaluations: 1–5 and a verdict. */
  score: number | null;
  verdict: string | null;
}

/** A file sent with an application (usually the CV), served by GET /api/files/:id. */
export interface CandidateFile {
  id: number;
  filename: string;
  mime: string;
  /** Bytes. */
  size: number;
  uploadedAt: string;
}

export interface Candidate {
  id: number;
  roleId: number;
  stage: number;
  name: string;
  lic: string;
  ok: boolean;
  source: string;
  /** Days in the current stage. */
  days: number;
  email: string;
  phone: string;
  location: string;
  headline: string;
  disqualified: boolean;
  disqualifyReason: string;
  appliedAt: string | null;
  /** Average scorecard score, 1–5, or null when nobody has evaluated yet. */
  rating: number | null;
  events: CandidateEvent[];
  /** Newest first; the first is treated as the CV. */
  files: CandidateFile[];
}

export interface Region {
  key: string;
  label: string;
  x: number;
  y: number;
  anchor: "start" | "end";
  dx: number;
  dy: number;
}

export interface IntelItem {
  id: number;
  time: string;
  sev: string;
  kind: StatusKind;
  region: string;
  regionKey: string;
  headline: string;
  source: string;
}

export interface PortalData {
  me: { email: string };
  /** Today's date in Sydney, ISO YYYY-MM-DD — the portal's reference "now". */
  today: string;
  metrics: Metric[];
  employees: Employee[];
  clients: Client[];
  deals: Deal[];
  opsColumns: OpsColumn[];
  roles: Role[];
  candidates: Candidate[];
  regions: Region[];
  feed: IntelItem[];
}

/** Recruitment pipeline stages, in order; Candidate.stage indexes this list. */
export const STAGES = ["Sourced", "Applied", "Phone screen", "Licence check", "Interview", "Offer", "Hired"] as const;
export const HIRED_STAGE = STAGES.length - 1;

export const EMPLOYMENT_TYPES = ["Full time", "Part time", "Casual", "Contract"] as const;
export const DEPARTMENTS = ["Ops", "Protective", "Advisory", "Tech", "Training", "Head office"] as const;
export const DISQUALIFY_REASONS = [
  "Licence not current",
  "Failed reference check",
  "Not the right fit",
  "Withdrew",
  "Accepted another offer",
  "No response",
] as const;
export const VERDICTS = ["Strong hire", "Hire", "No hire"] as const;

export const EMPLOYEE_STATUSES = [
  ["On shift", "secure"],
  ["Rostered", "info"],
  ["Leave", "neutral"],
  ["Stood down", "breach"],
] as const satisfies readonly (readonly [string, StatusKind])[];

/** Company lifecycle stages. */
export const CLIENT_STATUSES = [
  ["Lead", "info"],
  ["Opportunity", "advisory"],
  ["Customer", "secure"],
  ["Former customer", "neutral"],
] as const satisfies readonly (readonly [string, StatusKind])[];

/** Job states. */
export const ROLE_STATUSES = [
  ["Draft", "info"],
  ["Published", "secure"],
  ["On hold", "advisory"],
  ["Closed", "neutral"],
] as const satisfies readonly (readonly [string, StatusKind])[];

export const INTEL_SEVERITIES = [
  ["Breach", "breach"],
  ["Advisory", "advisory"],
  ["Information", "info"],
] as const satisfies readonly (readonly [string, StatusKind])[];

export const SERVICE_LINES = ["Ops", "Protective", "Advisory", "Tech", "Training"] as const;

export function kindFor(table: readonly (readonly [string, StatusKind])[], label: string): StatusKind {
  return table.find(([l]) => l === label)?.[1] ?? "neutral";
}
