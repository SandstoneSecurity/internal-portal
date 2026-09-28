/**
 * Risk quantification in the style of FAIR (Factor Analysis of Information Risk):
 *   annual loss = Σ over scenarios of (events a year) × (loss per event)
 * with both factors uncertain. Frequency is a PERT range on the Poisson rate,
 * loss per event a PERT range in AUD. A Monte Carlo run gives the distribution
 * of annual loss (the loss exceedance curve); means are also computed exactly.
 *
 * Pure functions, no DOM: runs in the browser and in tests.
 */
import {
  CONTROL_BY_KEY,
  THREAT_BY_KEY,
  sizeBand,
  type ControlDef,
  type Domain,
  type Range,
  type SiteKind,
  type ThreatDef,
} from "./threatLibrary";

// ── Sampling ────────────────────────────────────────────────────────────────
/** Small, fast, seedable PRNG so results are repeatable for the same model. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Marsaglia–Tsang gamma sampler (shape k > 0, scale 1). */
function gamma(k: number, rand: () => number): number {
  if (k < 1) return gamma(k + 1, rand) * Math.pow(rand() || 1e-12, 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** PERT shape parameters (λ = 4). */
function pertShape(r: Range) {
  const span = r.high - r.low;
  if (span <= 0) return null;
  return { a: 1 + (4 * (r.typical - r.low)) / span, b: 1 + (4 * (r.high - r.typical)) / span };
}

export function samplePert(r: Range, rand: () => number): number {
  const s = pertShape(r);
  if (!s) return r.typical;
  const x = gamma(s.a, rand);
  const y = gamma(s.b, rand);
  return r.low + (x / (x + y)) * (r.high - r.low);
}

export const pertMean = (r: Range) => (r.low + 4 * r.typical + r.high) / 6;

function poisson(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

// ── Model inputs ────────────────────────────────────────────────────────────
export type ControlStatus = "In place" | "Planned" | "Proposed";
export const CONTROL_STATUSES: readonly ControlStatus[] = ["In place", "Planned", "Proposed"];

/** Which controls count: the model as it stands, as it will stand once planned work lands, or with everything proposed. */
export type Posture = "inherent" | "current" | "planned" | "target";
const COUNTS: Record<Posture, ControlStatus[]> = { inherent: [], current: ["In place"], planned: ["In place", "Planned"], target: ["In place", "Planned", "Proposed"] };

export interface OrgProfile {
  staff: number;
  /** Annual revenue in AUD, 0 when unknown. */
  revenue: number;
  /** Years of incident history the logged incidents cover. */
  historyYears: number;
}

export interface SiteProfile {
  id: number;
  kind: SiteKind;
  occupants: number;
  /** Local crime relative to the state average (1 = average), set by hand. */
  crimeFactor: number;
  /**
   * Per-threat factors from recorded crime at the site's location (LGA rate ÷
   * state rate). When present they replace the hand-set crime factor; threats
   * with no measuring offence (terrorism, protest, cyber) take 1.
   */
  locationFactors?: Partial<Record<string, number>>;
}

export interface ScenarioInput {
  id: number;
  threatKey: string;
  /** null = organisation-wide. */
  siteId: number | null;
  name?: string;
  domain?: Domain;
  /** Value of the asset the scenario is aimed at, 0 if none. */
  assetValue?: number;
  rate?: Partial<Range> | null;
  loss?: Partial<Range> | null;
}

export interface AppliedControl {
  id: number;
  controlKey: string;
  siteId: number | null;
  status: ControlStatus;
  /** How well it's implemented, 0–1 (1 = as designed). */
  effectiveness: number;
  capex: number;
  opex: number;
}

export interface Incident {
  threatKey: string;
  siteId: number | null;
  occurredOn: string;
  loss: number;
}

/** A scenario with every factor resolved to numbers. */
export interface ResolvedScenario {
  id: number;
  threat: ThreatDef | null;
  name: string;
  domain: Domain;
  siteId: number | null;
  /** Reference rate after exposure, before calibration. */
  referenceRate: Range;
  /** Rate after blending with observed incidents. */
  rate: Range;
  loss: Range;
  calibration: { observed: number; years: number; factor: number } | null;
  rateSource: "library" | "calibrated" | "override";
  lossSource: "library" | "override";
}

const clampRange = (r: Range): Range => {
  const low = Math.max(0, Math.min(r.low, r.typical, r.high));
  const high = Math.max(r.low, r.typical, r.high, 0);
  return { low, typical: Math.min(Math.max(r.typical, low), high), high };
};
const scaleRange = (r: Range, f: number): Range => ({ low: r.low * f, typical: r.typical * f, high: r.high * f });
const merge = (base: Range, o?: Partial<Range> | null): Range | null => {
  if (!o || (o.low == null && o.typical == null && o.high == null)) return null;
  return clampRange({ low: o.low ?? base.low, typical: o.typical ?? base.typical, high: o.high ?? base.high });
};

/** How many exposure units a scenario has: sites count once, staff in hundreds. */
export function exposureUnits(threat: ThreatDef, site: SiteProfile | null, org: OrgProfile): number {
  const kindFactor = site ? threat.kindFactor?.[site.kind] ?? 1 : 1;
  const location = site?.locationFactors ? site.locationFactors[threat.key] ?? 1 : null;
  if (threat.exposure === "site") return site ? kindFactor * (location ?? site.crimeFactor) : 0;
  if (threat.exposure === "staff100") return ((site ? site.occupants : org.staff) / 100) * kindFactor * (location ?? 1);
  return 1;
}

/**
 * Gamma–Poisson credibility: the library rate acts as a prior worth `priorYears`
 * of observation, and the client's own incidents over `years` update it.
 * posterior mean = (λ₀·w + n) ÷ (w + T)
 */
export function calibrate(rate: Range, observed: number, years: number, priorYears = 3) {
  const lambda0 = pertMean(rate);
  if (lambda0 <= 0 || years <= 0) return { rate, factor: 1 };
  const posterior = (lambda0 * priorYears + observed) / (priorYears + years);
  const factor = posterior / lambda0;
  return { rate: scaleRange(rate, factor), factor };
}

export function resolveScenario(s: ScenarioInput, sites: Map<number, SiteProfile>, org: OrgProfile, incidents: Incident[], today: string): ResolvedScenario {
  const threat = THREAT_BY_KEY.get(s.threatKey) ?? null;
  const site = s.siteId != null ? sites.get(s.siteId) ?? null : null;
  const band = sizeBand(org.staff);
  let referenceRate: Range = threat ? scaleRange(threat.rate, exposureUnits(threat, site, org)) : { low: 0, typical: 0, high: 0 };
  let loss: Range = threat ? threat.loss[band] : { low: 0, typical: 0, high: 0 };
  if (threat?.assetBound && s.assetValue && s.assetValue > 0)
    loss = clampRange({ low: Math.min(loss.low, s.assetValue), typical: Math.min(loss.typical, s.assetValue), high: Math.min(loss.high, s.assetValue) });

  let rate = referenceRate;
  let calibration: ResolvedScenario["calibration"] = null;
  let rateSource: ResolvedScenario["rateSource"] = "library";
  const override = merge(referenceRate, s.rate);
  if (override) {
    rate = override;
    rateSource = "override";
  } else if (threat) {
    const since = shiftYears(today, -org.historyYears);
    const observed = incidents.filter((i) => i.threatKey === s.threatKey && i.siteId === s.siteId && i.occurredOn >= since && i.occurredOn <= today).length;
    if (observed > 0 || org.historyYears > 0) {
      const c = calibrate(referenceRate, observed, org.historyYears);
      if (observed > 0 || Math.abs(c.factor - 1) > 1e-9) {
        rate = c.rate;
        calibration = { observed, years: org.historyYears, factor: c.factor };
        rateSource = "calibrated";
      }
    }
  }
  const lossOverride = merge(loss, s.loss);
  if (!threat) referenceRate = rate;
  return {
    id: s.id,
    threat,
    name: s.name || threat?.name || "Custom scenario",
    domain: threat?.domain ?? s.domain ?? "physical",
    siteId: s.siteId,
    referenceRate,
    rate,
    loss: lossOverride ?? loss,
    calibration,
    rateSource,
    lossSource: lossOverride ? "override" : "library",
  };
}

function shiftYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Multipliers a posture's controls apply to a scenario's frequency and loss.
 * Site controls act on scenarios at that site; organisation controls act everywhere.
 * Several controls combine multiplicatively: each removes its share of what's left.
 */
export function controlEffect(s: ResolvedScenario, controls: AppliedControl[], posture: Posture, except?: number) {
  let freq = 1;
  let loss = 1;
  const statuses = COUNTS[posture];
  for (const c of controls) {
    if (c.id === except || !statuses.includes(c.status)) continue;
    if (!appliesTo(c, s)) continue;
    const def = CONTROL_BY_KEY.get(c.controlKey);
    const hit = def?.mitigates.find((x) => x.threat === s.threat?.key);
    if (!hit) continue;
    const e = Math.max(0, Math.min(1, c.effectiveness));
    freq *= 1 - hit.freq * e;
    loss *= 1 - hit.loss * e;
  }
  return { freq, loss };
}

function appliesTo(c: AppliedControl, s: ResolvedScenario): boolean {
  const def = CONTROL_BY_KEY.get(c.controlKey);
  if (!def) return false;
  // An organisation-wide control covers every site; a site control covers its own site only.
  return c.siteId == null || c.siteId === s.siteId;
}

/** Expected annual loss (ALE) for one scenario under a posture — exact, no sampling. */
export function scenarioAle(s: ResolvedScenario, controls: AppliedControl[], posture: Posture, except?: number): number {
  const e = controlEffect(s, controls, posture, except);
  return pertMean(s.rate) * e.freq * pertMean(s.loss) * e.loss;
}

// ── Ratings ─────────────────────────────────────────────────────────────────
export const LIKELIHOOD = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"] as const;
export const CONSEQUENCE = ["Insignificant", "Minor", "Moderate", "Major", "Severe"] as const;
export const RATING = ["Low", "Medium", "High", "Extreme"] as const;
export type Rating = (typeof RATING)[number];

/** Chance of at least one event in a year. */
export const annualProbability = (rate: number) => 1 - Math.exp(-Math.max(0, rate));

export function likelihoodLevel(p: number): number {
  return p < 0.05 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : p < 0.9 ? 3 : 4;
}

/** Consequence of a typical event: relative to revenue when known, otherwise in dollars. */
export function consequenceLevel(loss: number, revenue: number): number {
  const t = revenue > 0 ? [0.001, 0.005, 0.02, 0.05].map((f) => f * revenue) : [10_000, 50_000, 250_000, 1_000_000];
  return loss < t[0]! ? 0 : loss < t[1]! ? 1 : loss < t[2]! ? 2 : loss < t[3]! ? 3 : 4;
}

export function rating(l: number, c: number): Rating {
  const score = (l + 1) * (c + 1);
  return score <= 4 ? "Low" : score <= 9 ? "Medium" : score <= 15 ? "High" : "Extreme";
}

export interface RatedScenario {
  s: ResolvedScenario;
  inherentAle: number;
  currentAle: number;
  targetAle: number;
  /** Chance of at least one loss event this year, after current controls. */
  probability: number;
  likelihood: number;
  consequence: number;
  rating: Rating;
}

export function rateScenario(s: ResolvedScenario, controls: AppliedControl[], org: OrgProfile): RatedScenario {
  const cur = controlEffect(s, controls, "current");
  const probability = annualProbability(pertMean(s.rate) * cur.freq);
  const likelihood = likelihoodLevel(probability);
  const consequence = consequenceLevel(s.loss.typical * cur.loss, org.revenue);
  return {
    s,
    inherentAle: scenarioAle(s, controls, "inherent"),
    currentAle: scenarioAle(s, controls, "current"),
    targetAle: scenarioAle(s, controls, "target"),
    probability,
    likelihood,
    consequence,
    rating: rating(likelihood, consequence),
  };
}

// ── Simulation ──────────────────────────────────────────────────────────────
export interface Simulation {
  trials: number;
  /** Annual losses, ascending. */
  losses: Float64Array;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  /** Share of simulated years with no loss at all. */
  zeroShare: number;
}

export function simulate(scenarios: ResolvedScenario[], controls: AppliedControl[], posture: Posture, trials = 4000, seed = 20260928): Simulation {
  const rand = mulberry32(seed);
  const effects = scenarios.map((s) => controlEffect(s, controls, posture));
  const lossStats = scenarios.map((s) => {
    const mean = pertMean(s.loss);
    // PERT variance: (μ − a)(b − μ) ÷ 7
    return { mean, sd: Math.sqrt(Math.max(0, ((mean - s.loss.low) * (s.loss.high - mean)) / 7)) };
  });
  const losses = new Float64Array(trials);
  for (let t = 0; t < trials; t++) {
    let year = 0;
    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i]!;
      const e = effects[i]!;
      const lambda = samplePert(s.rate, rand) * e.freq;
      const n = poisson(lambda, rand);
      if (n > 24) {
        // Many small events (shoplifting): their sum is close to normal, so draw it directly.
        const st = lossStats[i]!;
        year += Math.max(0, n * st.mean + Math.sqrt(n) * st.sd * normal(rand)) * e.loss;
      } else for (let k = 0; k < n; k++) year += samplePert(s.loss, rand) * e.loss;
    }
    losses[t] = year;
  }
  losses.sort();
  const q = (p: number) => losses[Math.min(trials - 1, Math.floor(p * trials))] ?? 0;
  let sum = 0;
  let zeros = 0;
  for (const v of losses) {
    sum += v;
    if (v === 0) zeros++;
  }
  return { trials, losses, mean: sum / trials, p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), zeroShare: zeros / trials };
}

/** Points on the loss exceedance curve: the chance a year's losses exceed each amount. */
export function exceedance(sim: Simulation, points = 60): { loss: number; p: number }[] {
  const max = sim.losses[sim.losses.length - 1] ?? 0;
  const min = Math.max(1_000, sim.losses.find((v) => v > 0) ?? 1_000);
  if (max <= min) return [];
  const out: { loss: number; p: number }[] = [];
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  let j = 0;
  for (let i = 0; i <= points; i++) {
    const loss = Math.pow(10, lo + ((hi - lo) * i) / points);
    while (j < sim.losses.length && sim.losses[j]! <= loss) j++;
    out.push({ loss, p: (sim.losses.length - j) / sim.losses.length });
  }
  return out;
}

// ── Control value ───────────────────────────────────────────────────────────
/** Annualised cost: capital spread over five years plus running cost. */
export const annualCost = (c: { capex: number; opex: number }) => c.capex / 5 + c.opex;

export interface ControlValue {
  /** Reduction in expected annual loss this control delivers on top of the others counted in the posture. */
  benefit: number;
  cost: number;
  /** Return on security investment: (benefit − cost) ÷ cost. */
  rosi: number | null;
}

export function controlValue(control: AppliedControl, scenarios: ResolvedScenario[], all: AppliedControl[]): ControlValue {
  const withIt: AppliedControl[] = all.some((c) => c.id === control.id) ? all.map((c) => (c.id === control.id ? { ...c, status: "In place" } : c)) : [...all, { ...control, status: "In place" }];
  let benefit = 0;
  for (const s of scenarios) benefit += scenarioAle(s, withIt, "current", control.id) - scenarioAle(s, withIt, "current");
  const cost = annualCost(control);
  return { benefit, cost, rosi: cost > 0 ? (benefit - cost) / cost : null };
}

/**
 * Library controls not yet applied, ranked by the loss they would remove per
 * dollar. Site controls are proposed per site that has a matching scenario.
 */
export function recommend(scenarios: ResolvedScenario[], applied: AppliedControl[], limit = 8) {
  const out: { def: ControlDef; siteId: number | null; value: ControlValue }[] = [];
  const keys = new Set(scenarios.map((s) => s.threat?.key).filter(Boolean));
  let fakeId = -1;
  for (const def of CONTROL_BY_KEY.values()) {
    if (!def.mitigates.some((x) => keys.has(x.threat))) continue;
    const scopes = def.scope === "org" ? [null] : [...new Set(scenarios.filter((s) => s.siteId != null && def.mitigates.some((x) => x.threat === s.threat?.key)).map((s) => s.siteId))];
    for (const siteId of scopes) {
      if (applied.some((a) => a.controlKey === def.key && (a.siteId === siteId || a.siteId == null))) continue;
      const candidate: AppliedControl = { id: fakeId--, controlKey: def.key, siteId, status: "Proposed", effectiveness: 1, capex: def.capex, opex: def.opex };
      const value = controlValue(candidate, scenarios, applied);
      if (value.benefit > 0) out.push({ def, siteId, value });
    }
  }
  return out.sort((a, b) => b.value.benefit / Math.max(1, b.value.cost) - a.value.benefit / Math.max(1, a.value.cost)).slice(0, limit);
}
