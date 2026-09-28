/**
 * NSW location risk from BOCSAR recorded crime statistics.
 *
 * BOCSAR's "Local area rankings" dataset gives, for each Local Government
 * Area (LGA), the rate of recorded incidents per 100,000 population for a set
 * of offences, alongside the NSW rate. A site's location factor for an
 * offence is its LGA rate ÷ the NSW rate: 2.0 means twice the state rate.
 * Threats in the library are tied to the offence that best measures them.
 */

export const OFFENCES = [
  { key: "bne-nondwelling", label: "Break and enter non-dwelling", short: "Break-in (non-dwelling)", match: /break\s*(and|&)\s*enter\W*non[-\s]?dwelling/i },
  { key: "bne-dwelling", label: "Break and enter dwelling", short: "Break-in (dwelling)", match: /break\s*(and|&)\s*enter\W*dwelling/i },
  { key: "retail", label: "Steal from retail store", short: "Retail theft", match: /steal\w*\s*from\s*retail/i },
  { key: "robbery", label: "Robbery", short: "Robbery", match: /robbery/i },
  { key: "damage", label: "Malicious damage to property", short: "Malicious damage", match: /malicious\s*damage/i },
  { key: "mvt", label: "Motor vehicle theft", short: "Vehicle theft", match: /motor\s*vehicle\s*theft/i },
  { key: "steal-mv", label: "Steal from motor vehicle", short: "Theft from vehicles", match: /steal\w*\s*from\s*(a\s*)?motor\s*vehicle/i },
  { key: "assault-ndv", label: "Non-domestic assault", short: "Assault (non-domestic)", match: /assault\W*non[-\s]?domestic|non[-\s]?domestic\W*(violence\W*related\W*)?assault/i },
  { key: "other-theft", label: "Other theft", short: "Other theft", match: /other\s*theft/i },
  { key: "trespass", label: "Trespass", short: "Trespass", match: /trespass/i },
  { key: "fraud", label: "Fraud", short: "Fraud", match: /fraud/i },
] as const;
export type OffenceKey = (typeof OFFENCES)[number]["key"];
export const OFFENCE_LABEL = Object.fromEntries(OFFENCES.map((o) => [o.key, o.label])) as Record<OffenceKey, string>;

/** Offence that measures each threat, by site type where it differs. The first one with data wins. */
export function offencesFor(threatKey: string, siteKind: string): OffenceKey[] {
  switch (threatKey) {
    case "break-in":
      return siteKind === "residential" ? ["bne-dwelling", "bne-nondwelling"] : ["bne-nondwelling"];
    case "retail-theft":
      return ["retail"];
    case "robbery":
      return ["robbery"];
    case "vandalism":
    case "arson":
      return ["damage"];
    case "vehicle-theft":
      return ["mvt"];
    case "equipment-theft":
      return ["other-theft", "steal-mv", "bne-nondwelling"];
    case "device-theft":
      return ["bne-nondwelling", "steal-mv"];
    case "trespass":
      return ["trespass", "bne-nondwelling"];
    case "occupational-violence":
    case "psych-violence":
      return ["assault-ndv"];
    default:
      return [];
  }
}

export interface CrimeRate {
  /** Incidents per 100,000 population. */
  rate: number;
  count: number | null;
  rank: number | null;
}

export interface CrimeData {
  meta: { source: string; period: string; fetchedAt: string | null; status: string; message: string } | null;
  /** LGA names, sorted. */
  areas: string[];
  /** rates[area][offence]; the state row is "NSW". */
  rates: Record<string, Partial<Record<OffenceKey, CrimeRate>>>;
}

/** Rates are per resident, so commercial centres with few residents read very high; factors are held within this band. */
export const FACTOR_MIN = 0.25;
export const FACTOR_MAX = 6;

export function locationFactor(data: CrimeData | null, lga: string, offence: OffenceKey): { factor: number; raw: number; lgaRate: number; nswRate: number; rank: number | null } | null {
  if (!data || !lga) return null;
  const area = data.rates[lga]?.[offence];
  const nsw = data.rates.NSW?.[offence];
  if (!area || !nsw || nsw.rate <= 0) return null;
  const raw = area.rate / nsw.rate;
  return { factor: Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, raw)), raw, lgaRate: area.rate, nswRate: nsw.rate, rank: area.rank };
}

/** Location factor for a threat at a site: the first measuring offence with data, or null. */
export function threatLocation(data: CrimeData | null, lga: string, threatKey: string, siteKind: string) {
  for (const o of offencesFor(threatKey, siteKind)) {
    const f = locationFactor(data, lga, o);
    if (f) return { offence: o, ...f };
  }
  return null;
}

/** "Parramatta (C)" and "Parramatta" should both find Parramatta. */
export const normaliseArea = (s: string) =>
  s
    .replace(/\s*\((A|C|S|M|RC)\)\s*$/i, "")
    .replace(/[*^#†‡]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
