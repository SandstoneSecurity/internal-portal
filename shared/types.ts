export type StatusKind = "secure" | "advisory" | "breach" | "info" | "neutral";

export interface Metric {
  label: string;
  value: string;
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
  exp: string;
  expirySoon: boolean;
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

export interface OpsCard {
  ref: string;
  title: string;
  site: string;
  line: string;
  due: string;
  late: boolean;
  who: string;
}

export interface OpsColumn {
  label: string;
  done: boolean;
  cards: OpsCard[];
}

export interface GanttTask {
  name: string;
  s: number;
  e: number;
  k: "done" | "active" | "plan";
}

export interface GanttSection {
  num: string;
  name: string;
  tasks: GanttTask[];
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

export interface PortalData {
  metrics: Metric[];
  employees: Employee[];
  clients: Client[];
  opsColumns: OpsColumn[];
  gantt: GanttSection[];
  roles: Role[];
  candidates: Candidate[];
  regions: Region[];
  feed: IntelItem[];
}
