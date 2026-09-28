import { useMemo } from "react";
import {
  controlValue,
  exceedance,
  pertMean,
  rateScenario,
  recommend,
  resolveScenario,
  simulate,
  type AppliedControl,
  type OrgProfile,
  type RatedScenario,
  type ScenarioInput,
  type Simulation,
  type SiteProfile,
} from "../../shared/risk";
import { CONTROL_BY_KEY, DOMAINS, THREAT_BY_KEY, type Domain, type Range, type SiteKind } from "../../shared/threatLibrary";
import type { Client, ClientSite, PortalData, RangeOverride, TmControl, TmElement, TmIncident } from "../../shared/types";
import type { Hue } from "./hues";
import { usePortal } from "./DataProvider";

export const DOMAIN_HUE: Record<Domain, Hue> = { physical: "harbour", personnel: "jacaranda", cyber: "slate" };
export const RATING_HUE: Record<string, Hue> = { Low: "euc", Medium: "ochre", High: "clay", Extreme: "clay" };
export const STATUS_HUE: Record<TmControl["status"], Hue> = { "In place": "euc", Planned: "harbour", Proposed: "slate" };

/** "$840", "$8.4k", "$84k", "$1.24M" — dollars at a glance. */
export function compactAud(n: number): string {
  const v = Math.max(0, n);
  const trim = (s: string) => s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  if (v >= 1_000_000_000) return `$${trim((v / 1_000_000_000).toFixed(2))}B`;
  if (v >= 1_000_000) return `$${trim((v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2))}M`;
  if (v >= 10_000) return `$${Math.round(v / 1_000)}k`;
  if (v >= 1_000) return `$${trim((v / 1_000).toFixed(1))}k`;
  return `$${Math.round(v)}`;
}

/** How often, in words people use: "3.2 a year", "about yearly", "1 in 40 years". */
export function frequencyLabel(rate: number): string {
  if (rate <= 0) return "never";
  if (rate >= 1.5) return `${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} a year`;
  if (rate >= 0.75) return "about yearly";
  const years = 1 / rate;
  // Two significant figures: "1 in 1,400 years", not "1 in 1410 years".
  const rounded = years >= 100 ? Number(years.toPrecision(2)) : Math.round(years);
  return `1 in ${rounded.toLocaleString("en-AU")} years`;
}

export const pct = (p: number) => (p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

const clean = (r: RangeOverride): Partial<Range> | null =>
  r.low == null && r.typical == null && r.high == null ? null : { low: r.low ?? undefined, typical: r.typical ?? undefined, high: r.high ?? undefined };

export interface ClientModel {
  client: Client;
  org: OrgProfile;
  sites: ClientSite[];
  elements: TmElement[];
  incidents: TmIncident[];
  controls: AppliedControl[];
  rows: RatedScenario[];
  byId: Map<number, RatedScenario>;
  sims: { inherent: Simulation; current: Simulation; target: Simulation };
  curves: { inherent: { loss: number; p: number }[]; current: { loss: number; p: number }[]; target: { loss: number; p: number }[] };
  byDomain: Record<Domain, { inherent: number; current: number; target: number; count: number }>;
  bySite: Map<number | null, { current: number; count: number }>;
  controlValues: Map<number, ReturnType<typeof controlValue>>;
  recommendations: ReturnType<typeof recommend>;
  totals: { inherent: number; current: number; target: number; spend: number };
}

export function buildModel(d: PortalData, clientId: number, trials = 4000): ClientModel | null {
  const client = d.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const org: OrgProfile = { staff: client.staff, revenue: client.revenue, historyYears: client.historyYears };
  const sites = d.sites.filter((s) => s.clientId === clientId);
  const siteIds = new Set(sites.map((s) => s.id));
  const profiles = new Map<number, SiteProfile>(sites.map((s) => [s.id, { id: s.id, kind: s.kind as SiteKind, occupants: s.occupants, crimeFactor: s.crimeFactor }]));
  const elements = d.tmElements.filter((e) => siteIds.has(e.siteId));
  const elementById = new Map(elements.map((e) => [e.id, e]));
  const incidents = d.tmIncidents.filter((i) => i.clientId === clientId);
  const controls: AppliedControl[] = d.tmControls
    .filter((c) => c.clientId === clientId)
    .map((c) => ({ id: c.id, controlKey: c.controlKey, siteId: c.siteId, status: c.status, effectiveness: c.effectiveness, capex: c.capex, opex: c.opex }));
  const inputs: ScenarioInput[] = d.tmScenarios
    .filter((s) => s.clientId === clientId)
    .map((s) => ({
      id: s.id,
      threatKey: s.threatKey,
      siteId: s.siteId,
      name: s.name,
      domain: (DOMAINS as readonly string[]).includes(s.domain) ? (s.domain as Domain) : undefined,
      assetValue: s.elementId ? elementById.get(s.elementId)?.value ?? 0 : 0,
      rate: clean(s.rate),
      loss: clean(s.loss),
    }));
  const resolved = inputs.map((s) =>
    resolveScenario(
      s,
      profiles,
      org,
      incidents.map((i) => ({ threatKey: i.threatKey, siteId: i.siteId, occurredOn: i.occurredOn, loss: i.loss })),
      d.today
    )
  );
  const rows = resolved.map((s) => rateScenario(s, controls, org)).sort((a, b) => b.currentAle - a.currentAle);
  const sims = {
    inherent: simulate(resolved, controls, "inherent", trials),
    current: simulate(resolved, controls, "current", trials),
    target: simulate(resolved, controls, "target", trials),
  };
  const byDomain = Object.fromEntries(DOMAINS.map((k) => [k, { inherent: 0, current: 0, target: 0, count: 0 }])) as ClientModel["byDomain"];
  const bySite = new Map<number | null, { current: number; count: number }>();
  for (const r of rows) {
    const b = byDomain[r.s.domain];
    b.inherent += r.inherentAle;
    b.current += r.currentAle;
    b.target += r.targetAle;
    b.count++;
    const s = bySite.get(r.s.siteId) ?? { current: 0, count: 0 };
    s.current += r.currentAle;
    s.count++;
    bySite.set(r.s.siteId, s);
  }
  const controlValues = new Map(controls.map((c) => [c.id, controlValue(c, resolved, controls)]));
  const totals = {
    inherent: rows.reduce((n, r) => n + r.inherentAle, 0),
    current: rows.reduce((n, r) => n + r.currentAle, 0),
    target: rows.reduce((n, r) => n + r.targetAle, 0),
    spend: controls.filter((c) => c.status === "In place").reduce((n, c) => n + c.capex / 5 + c.opex, 0),
  };
  return {
    client,
    org,
    sites,
    elements,
    incidents,
    controls,
    rows,
    byId: new Map(rows.map((r) => [r.s.id, r])),
    sims,
    curves: { inherent: exceedance(sims.inherent), current: exceedance(sims.current), target: exceedance(sims.target) },
    byDomain,
    bySite,
    controlValues,
    recommendations: recommend(resolved, controls, 8),
    totals,
  };
}

export function useClientModel(clientId: number | null): ClientModel | null {
  const d = usePortal();
  return useMemo(() => (clientId ? buildModel(d, clientId) : null), [d, clientId]);
}

/** Expected annual loss per client without running a simulation (for the portfolio). */
export function portfolioRow(d: PortalData, client: Client) {
  const model = buildModel(d, client.id, 800);
  return model;
}

export const threatName = (key: string, fallback = "Custom scenario") => THREAT_BY_KEY.get(key)?.name ?? fallback;
export const controlName = (key: string) => CONTROL_BY_KEY.get(key)?.name ?? key;
export const meanOf = pertMean;
