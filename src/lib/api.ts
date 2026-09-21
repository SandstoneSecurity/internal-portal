import type { Candidate, Client, Employee, GanttSection, IntelItem, Metric, OpsColumn, Region, Role } from "../../shared/types";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PortalDataBundle {
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

export async function fetchPortalData(): Promise<PortalDataBundle> {
  const [metrics, employees, clients, opsColumns, gantt, roles, candidates, regions, feed] = await Promise.all([
    getJSON<Metric[]>("/api/metrics"),
    getJSON<Employee[]>("/api/employees"),
    getJSON<Client[]>("/api/clients"),
    getJSON<OpsColumn[]>("/api/ops/board"),
    getJSON<GanttSection[]>("/api/ops/gantt"),
    getJSON<Role[]>("/api/recruitment/roles"),
    getJSON<Candidate[]>("/api/recruitment/candidates"),
    getJSON<Region[]>("/api/intel/regions"),
    getJSON<IntelItem[]>("/api/intel/feed"),
  ]);
  return { metrics, employees, clients, opsColumns, gantt, roles, candidates, regions, feed };
}
