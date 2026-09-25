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
  name: string;
  role: string;
}

export interface ClientDeal {
  name: string;
  value: string;
  stage: string;
  review: string;
}

export interface ClientActivity {
  date: string;
  text: string;
}

export interface Client {
  id: number;
  org: string;
  sector: string;
  sites: number;
  value: string;
  owner: string;
  status: string;
  kind: StatusKind;
  meta: string;
  contacts: ClientContact[];
  deal: ClientDeal | null;
  activity: ClientActivity[];
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
  status: string;
  kind: StatusKind;
  counts: number[];
}

export interface Candidate {
  id: number;
  roleId: number;
  stage: number;
  name: string;
  lic: string;
  ok: boolean;
  source: string;
  days: number;
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

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: "create" | "update" | "delete" | "move";
  entity: string;
  entityId: string | null;
  summary: string;
}

export interface PortalData {
  me: { email: string };
  /** Today's date in Sydney, ISO YYYY-MM-DD — the portal's reference "now". */
  today: string;
  metrics: Metric[];
  employees: Employee[];
  clients: Client[];
  opsColumns: OpsColumn[];
  roles: Role[];
  candidates: Candidate[];
  regions: Region[];
  feed: IntelItem[];
  audit: AuditEntry[];
}

/** Recruitment pipeline stages, in order; Candidate.stage indexes this list. */
export const STAGES = ["Applied", "Screened", "Interview", "Licence check", "Offer"] as const;

export const EMPLOYEE_STATUSES = [
  ["On shift", "secure"],
  ["Rostered", "info"],
  ["Leave", "neutral"],
  ["Stood down", "breach"],
] as const satisfies readonly (readonly [string, StatusKind])[];

export const CLIENT_STATUSES = [
  ["Prospect", "info"],
  ["Proposal", "advisory"],
  ["Active", "secure"],
  ["Dormant", "neutral"],
] as const satisfies readonly (readonly [string, StatusKind])[];

export const ROLE_STATUSES = [
  ["New", "info"],
  ["Open", "secure"],
  ["Shortlisting", "advisory"],
  ["On hold", "neutral"],
  ["Filled", "neutral"],
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
