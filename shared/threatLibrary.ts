/**
 * Threat and control library for the threat-modelling module.
 *
 * Every threat carries a reference annual rate and a loss range, each labelled
 * "anchored" (derived from a cited Australian figure, with the arithmetic shown)
 * or "estimated" (an analyst starting point). Estimated values are meant to be
 * replaced as a client's own incidents are logged: the engine in risk.ts blends
 * the reference rate with observed incidents (a Gamma–Poisson update), so a
 * model moves towards the evidence as it accumulates.
 *
 * Ranges are PERT (low, most likely, high). Where a source gives an average
 * loss, the most-likely value is fitted so the PERT mean equals that average.
 */

export type Domain = "physical" | "personnel" | "cyber";
export const DOMAINS: readonly Domain[] = ["physical", "personnel", "cyber"];
export const DOMAIN_LABEL: Record<Domain, string> = { physical: "Physical", personnel: "Personnel", cyber: "Cyber" };

/** What the reference rate counts: events per site, per organisation, or per 100 staff, each per year. */
export type Exposure = "site" | "org" | "staff100";
export const EXPOSURE_LABEL: Record<Exposure, string> = { site: "per site a year", org: "per organisation a year", staff100: "per 100 staff a year" };

export type SizeBand = "small" | "medium" | "large";
/** ABS business size by employees: small under 20, medium 20–199, large 200 or more. */
export const sizeBand = (staff: number): SizeBand => (staff >= 200 ? "large" : staff >= 20 ? "medium" : "small");
export const SIZE_LABEL: Record<SizeBand, string> = { small: "Small (under 20 staff)", medium: "Medium (20–199 staff)", large: "Large (200+ staff)" };

export const SITE_KINDS = [
  ["office", "Office"],
  ["retail", "Retail"],
  ["warehouse", "Warehouse & logistics"],
  ["data-centre", "Data centre"],
  ["venue", "Venue & hospitality"],
  ["healthcare", "Healthcare"],
  ["education", "Education"],
  ["industrial", "Industrial & manufacturing"],
  ["residential", "Residential & strata"],
  ["construction", "Construction site"],
  ["government", "Government"],
] as const;
export type SiteKind = (typeof SITE_KINDS)[number][0];

export const ASSET_TYPES = [
  ["people", "People"],
  ["cash", "Cash"],
  ["stock", "Stock & goods"],
  ["equipment", "Equipment & plant"],
  ["it", "IT hardware"],
  ["data", "Data & systems"],
  ["facility", "Building & fit-out"],
  ["reputation", "Reputation"],
] as const;
export type AssetType = (typeof ASSET_TYPES)[number][0];

export const ZONE_CLASSES = ["Public", "Reception", "Operational", "Restricted", "Secure"] as const;
export const ENTRY_TYPES = ["Door", "Roller door", "Gate", "Window", "Loading dock", "Roof access", "Car park", "Network", "Remote access"] as const;

export interface Range {
  low: number;
  typical: number;
  high: number;
}

export interface Evidence {
  source: string;
  figure: string;
  /** How the figure became the rate or loss used here. */
  derivation?: string;
}

export interface ThreatDef {
  key: string;
  domain: Domain;
  category: string;
  name: string;
  description: string;
  actors: string[];
  exposure: Exposure;
  /** Events per exposure unit per year. */
  rate: Range;
  rateBasis: "anchored" | "estimated";
  /** Multiplier on the rate by site kind; a kind that isn't listed uses 1. A 0 means "doesn't apply". */
  kindFactor?: Partial<Record<SiteKind, number>>;
  /** Loss per event in AUD, by organisation size. */
  loss: Record<SizeBand, Range>;
  lossBasis: "anchored" | "estimated";
  /** Asset types the threat acts on; used to suggest scenarios and to cap losses at an asset's value. */
  targets: AssetType[];
  /** True when a single event can't lose more than the asset it's aimed at (theft, damage). */
  assetBound?: boolean;
  evidence: Evidence[];
}

export interface Mitigation {
  threat: string;
  /** Fraction by which the control cuts how often the threat succeeds. */
  freq: number;
  /** Fraction by which it cuts the loss when it does. */
  loss: number;
}

export interface ControlDef {
  key: string;
  domain: Domain;
  name: string;
  description: string;
  /** Australian standard or framework the control is built to. */
  standard?: string;
  scope: "site" | "org";
  /** Indicative Sydney market cost in AUD (edit to the quote when applying). */
  capex: number;
  opex: number;
  mitigates: Mitigation[];
}

const flat = (r: Range): Record<SizeBand, Range> => ({ small: r, medium: r, large: r });
const scaled = (small: Range, medium: Range, large: Range): Record<SizeBand, Range> => ({ small, medium, large });

// ── Shared sources ──────────────────────────────────────────────────────────
const ASD: Evidence = {
  source: "ASD Annual Cyber Threat Report 2024–25",
  figure: "84,700+ cybercrime reports (one every 6 minutes); average self-reported cost per business report: small $56,600, medium $97,200, large $202,700 ($80,850 across all businesses).",
  derivation: "Loss ranges are PERT curves whose mean equals ASD's average cost for that business size.",
};
const OAIC: Evidence = {
  source: "OAIC Notifiable Data Breaches statistics, 2025",
  figure: "1,205 notifications in 2025, a record; 59% attributed to malicious or criminal attacks.",
};
const IBM: Evidence = {
  source: "IBM Cost of a Data Breach Report 2025 (Australia)",
  figure: "Average cost of a data breach in Australia AUD 4.22 million.",
  derivation: "Large-organisation loss is a PERT curve with mean AUD 4.22M; smaller bands are scaled down.",
};
const SWA_MENTAL: Evidence = {
  source: "Safe Work Australia, Key WHS Statistics Australia 2025",
  figure: "17,600 serious mental-health claims in 2023–24; causes include harassment/bullying 33.2% and exposure to violence 15.7%. Median compensation for mental-health serious claims $67,400 (2022–23), against $16,300 across all serious claims.",
};
const ABS_BUSINESSES: Evidence = {
  source: "ABS Counts of Australian Businesses, June 2025",
  figure: "2,729,648 actively trading businesses, of which 999,161 employ staff.",
};
const PWC_FRAUD: Evidence = {
  source: "PwC Global Economic Crime and Fraud Survey 2020 (Australia)",
  figure: "35% of Australian organisations experienced fraud in the previous 24 months; about 60% of economic crime was committed by insiders or known parties (employees, customers, suppliers).",
  derivation: "Annual rate λ = −ln(1 − 0.35) ÷ 2 ≈ 0.215 fraud events per organisation a year; the internal share (about half of the 60%) gives ≈ 0.065–0.13.",
};

const CYBER_COST = scaled(
  { low: 5_000, typical: 21_000, high: 250_000 },
  { low: 10_000, typical: 31_000, high: 450_000 },
  { low: 20_000, typical: 74_000, high: 900_000 }
);

export const THREATS: ThreatDef[] = [
  // ── Physical ────────────────────────────────────────────────────────────
  {
    key: "break-in",
    domain: "physical",
    category: "Property crime",
    name: "Commercial break-in",
    description: "Forced or covert entry to non-residential premises after hours to steal goods, cash or equipment.",
    actors: ["Opportunistic criminal", "Organised theft group"],
    exposure: "site",
    rate: { low: 0.01, typical: 0.025, high: 0.08 },
    rateBasis: "anchored",
    kindFactor: { retail: 1.6, warehouse: 1.4, construction: 2.5, industrial: 1.2, venue: 1.2, education: 1.2, office: 0.8, healthcare: 0.8, residential: 0.6, government: 0.5, "data-centre": 0.3 },
    loss: scaled({ low: 2_000, typical: 12_000, high: 60_000 }, { low: 5_000, typical: 25_000, high: 150_000 }, { low: 8_000, typical: 40_000, high: 300_000 }),
    lossBasis: "estimated",
    targets: ["stock", "equipment", "it", "cash", "facility"],
    assetBound: true,
    evidence: [
      {
        source: "NSW BOCSAR Recorded Crime Statistics, 12 months to September 2025",
        figure: "7,971 break and enter (non-dwelling) incidents recorded in NSW; down 4.3% over the two years to December 2025.",
        derivation: "7,971 ÷ ≈320,000 NSW employing businesses (NSW ≈ 32% of the ABS national 999,161) ≈ 0.025 per business a year. Recorded crime understates unreported entries, so the high end allows ×3.",
      },
      ABS_BUSINESSES,
    ],
  },
  {
    key: "retail-theft",
    domain: "physical",
    category: "Property crime",
    name: "Shoplifting & organised retail crime",
    description: "Theft of stock by customers or organised groups, including repeat offenders and refund fraud.",
    actors: ["Opportunistic shoplifter", "Organised retail crime group"],
    exposure: "site",
    rate: { low: 10, typical: 40, high: 200 },
    rateBasis: "estimated",
    kindFactor: { retail: 1, office: 0, warehouse: 0, "data-centre": 0, venue: 0.1, healthcare: 0, education: 0, industrial: 0, residential: 0, construction: 0, government: 0 },
    loss: flat({ low: 40, typical: 180, high: 3_000 }),
    lossBasis: "estimated",
    targets: ["stock"],
    assetBound: true,
    evidence: [
      { source: "Australian Retailers Association / National Retail Association, 2025", figure: "About 800,000 retail crime incidents reported nationally in a year; shrinkage averages 3.7% of turnover." },
      { source: "Griffith University, ANZ Retail Crime Study 2024", figure: "Retail crime cost the sector about A$7.79 billion in 2023–24." },
      { source: "NSW BOCSAR, quarterly update December 2025", figure: "Steal from retail store up 9.3% over two years; up 13.5% in Greater Sydney." },
    ],
  },
  {
    key: "robbery",
    domain: "physical",
    category: "Violent crime",
    name: "Robbery",
    description: "Theft with force or threat of force, typically targeting cash, phones, tobacco or high-value stock during trading hours.",
    actors: ["Armed offender", "Opportunistic offender"],
    exposure: "site",
    rate: { low: 0.001, typical: 0.004, high: 0.03 },
    rateBasis: "estimated",
    kindFactor: { retail: 3, venue: 2, healthcare: 0.6, office: 0.3, warehouse: 0.3, "data-centre": 0.1, education: 0.3, industrial: 0.3, residential: 0.4, construction: 0.2, government: 0.4 },
    loss: flat({ low: 3_000, typical: 15_000, high: 120_000 }),
    lossBasis: "estimated",
    targets: ["cash", "stock", "people"],
    evidence: [{ source: "NSW BOCSAR, quarterly update December 2025", figure: "Robbery down 8.9% over the two years to December 2025." }],
  },
  {
    key: "vandalism",
    domain: "physical",
    category: "Property crime",
    name: "Malicious damage & graffiti",
    description: "Deliberate damage to glazing, signage, vehicles, fences and fit-out.",
    actors: ["Opportunistic offender", "Disgruntled individual"],
    exposure: "site",
    rate: { low: 0.05, typical: 0.15, high: 0.6 },
    rateBasis: "estimated",
    kindFactor: { education: 1.6, construction: 1.5, retail: 1.2, venue: 1.3, residential: 1.2, "data-centre": 0.3, government: 1.2 },
    loss: flat({ low: 500, typical: 3_000, high: 25_000 }),
    lossBasis: "estimated",
    targets: ["facility", "equipment"],
    assetBound: true,
    evidence: [{ source: "NSW BOCSAR, quarterly update December 2025", figure: "Malicious damage to property down 6.5% over the two years to December 2025." }],
  },
  {
    key: "arson",
    domain: "physical",
    category: "Property crime",
    name: "Arson",
    description: "Deliberately lit fire, including fires set to cover a break-in.",
    actors: ["Opportunistic offender", "Disgruntled individual", "Extortionist"],
    exposure: "site",
    rate: { low: 0.0005, typical: 0.002, high: 0.01 },
    rateBasis: "estimated",
    kindFactor: { construction: 2, education: 1.5, warehouse: 1.3, "data-centre": 0.4 },
    loss: scaled({ low: 20_000, typical: 150_000, high: 1_500_000 }, { low: 50_000, typical: 400_000, high: 5_000_000 }, { low: 100_000, typical: 900_000, high: 20_000_000 }),
    lossBasis: "estimated",
    targets: ["facility", "stock", "equipment", "people"],
    evidence: [],
  },
  {
    key: "crowded-place-attack",
    domain: "physical",
    category: "Terrorism & extremism",
    name: "Attack on a crowded place",
    description: "Terrorist or politically motivated violence at or near the site: edged weapon, vehicle or improvised device.",
    actors: ["Lone actor", "Extremist group"],
    exposure: "site",
    rate: { low: 0.00005, typical: 0.0003, high: 0.003 },
    rateBasis: "estimated",
    kindFactor: { venue: 5, government: 3, education: 2, retail: 2, healthcare: 1.2, office: 1, warehouse: 0.2, industrial: 0.2, "data-centre": 0.3, residential: 0.3, construction: 0.1 },
    loss: scaled({ low: 100_000, typical: 800_000, high: 10_000_000 }, { low: 200_000, typical: 2_000_000, high: 30_000_000 }, { low: 500_000, typical: 5_000_000, high: 80_000_000 }),
    lossBasis: "estimated",
    targets: ["people", "facility", "reputation"],
    evidence: [
      {
        source: "ASIO, National Terrorism Threat Level",
        figure: "PROBABLE since August 2024: a greater than 50% chance of an onshore attack or attack planning in the next 12 months (nationally, not per site).",
      },
    ],
  },
  {
    key: "equipment-theft",
    domain: "physical",
    category: "Property crime",
    name: "Theft of plant, tools & equipment",
    description: "Theft of tools, plant, fuel and materials from yards, compounds and open sites.",
    actors: ["Opportunistic criminal", "Organised theft group", "Insider"],
    exposure: "site",
    rate: { low: 0.03, typical: 0.1, high: 0.5 },
    rateBasis: "estimated",
    kindFactor: { construction: 4, industrial: 1.5, warehouse: 1.2, office: 0.3, retail: 0.3, "data-centre": 0.2, healthcare: 0.3, education: 0.5, residential: 0.4, venue: 0.4, government: 0.5 },
    loss: flat({ low: 2_000, typical: 15_000, high: 150_000 }),
    lossBasis: "estimated",
    targets: ["equipment"],
    assetBound: true,
    evidence: [],
  },
  {
    key: "vehicle-theft",
    domain: "physical",
    category: "Property crime",
    name: "Fleet vehicle theft",
    description: "Theft of company vehicles from car parks and depots, often with keys taken in a break-in.",
    actors: ["Opportunistic criminal", "Organised theft group"],
    exposure: "site",
    rate: { low: 0.01, typical: 0.03, high: 0.12 },
    rateBasis: "estimated",
    kindFactor: { warehouse: 1.5, construction: 1.5, industrial: 1.3, "data-centre": 0.3 },
    loss: flat({ low: 5_000, typical: 25_000, high: 90_000 }),
    lossBasis: "estimated",
    targets: ["equipment"],
    assetBound: true,
    evidence: [],
  },
  {
    key: "trespass",
    domain: "physical",
    category: "Unauthorised access",
    name: "Unauthorised entry & tailgating",
    description: "Someone entering a restricted area without authority, by tailgating, propped doors or social pretext. Often the first step of theft or harm.",
    actors: ["Opportunistic intruder", "Pretexter", "Former employee"],
    exposure: "site",
    rate: { low: 0.3, typical: 1.5, high: 6 },
    rateBasis: "estimated",
    kindFactor: { office: 1.2, healthcare: 1.5, education: 1.5, "data-centre": 0.4, residential: 1.3, venue: 1.2 },
    loss: flat({ low: 0, typical: 500, high: 20_000 }),
    lossBasis: "estimated",
    targets: ["people", "it", "data", "stock"],
    evidence: [],
  },
  {
    key: "protest",
    domain: "physical",
    category: "Disruption",
    name: "Protest, occupation or blockade",
    description: "Activist action that blocks access, occupies premises or damages property to draw attention to a cause.",
    actors: ["Activist group"],
    exposure: "site",
    rate: { low: 0.002, typical: 0.02, high: 0.15 },
    rateBasis: "estimated",
    kindFactor: { government: 4, industrial: 2, venue: 2, office: 1, "data-centre": 0.8, residential: 0.3, retail: 0.8 },
    loss: scaled({ low: 2_000, typical: 20_000, high: 200_000 }, { low: 5_000, typical: 50_000, high: 600_000 }, { low: 10_000, typical: 120_000, high: 2_000_000 }),
    lossBasis: "estimated",
    targets: ["facility", "reputation", "people"],
    evidence: [],
  },
  {
    key: "device-theft",
    domain: "physical",
    category: "Property crime",
    name: "Theft of laptops & devices holding data",
    description: "Laptops, phones and drives stolen from the site or vehicles; the loss includes any breach response for unencrypted data.",
    actors: ["Opportunistic criminal", "Insider"],
    exposure: "site",
    rate: { low: 0.03, typical: 0.1, high: 0.4 },
    rateBasis: "estimated",
    kindFactor: { office: 1.3, healthcare: 1.3, education: 1.3, "data-centre": 0.5, construction: 0.8 },
    loss: scaled({ low: 2_000, typical: 8_000, high: 150_000 }, { low: 3_000, typical: 15_000, high: 400_000 }, { low: 3_000, typical: 20_000, high: 1_000_000 }),
    lossBasis: "estimated",
    targets: ["it", "data"],
    evidence: [OAIC],
  },

  // ── Personnel ───────────────────────────────────────────────────────────
  {
    key: "occupational-violence",
    domain: "personnel",
    category: "Violence & aggression",
    name: "Assault on staff by the public",
    description: "Physical assault of workers by customers, patients, patrons or members of the public, resulting in a compensable injury.",
    actors: ["Aggressive customer", "Intoxicated patron", "Person in crisis"],
    exposure: "staff100",
    rate: { low: 0.02, typical: 0.036, high: 0.4 },
    rateBasis: "anchored",
    kindFactor: { healthcare: 5, retail: 3, venue: 3, education: 2, government: 2, residential: 1.5, office: 0.5, "data-centre": 0.3, warehouse: 0.6, industrial: 0.6, construction: 0.6 },
    loss: flat({ low: 4_000, typical: 7_250, high: 80_000 }),
    lossBasis: "anchored",
    targets: ["people"],
    evidence: [
      {
        source: "Safe Work Australia, work-related violence and aggression data",
        figure: "53,139 accepted workers' compensation claims for being assaulted by a person or persons over 10 years; serious assault claims up 177% since 2000–01.",
        derivation: "≈5,300 claims a year ÷ ≈14.6 million employed Australians ≈ 0.036 claims per 100 workers a year. Frontline sectors run many times higher (kind factors). Loss per claim is fitted so its median is the $16,300 median across serious claims.",
      },
      SWA_MENTAL,
    ],
  },
  {
    key: "psych-violence",
    domain: "personnel",
    category: "Violence & aggression",
    name: "Psychological injury from violence",
    description: "Mental-health injury after exposure to violence, threats or traumatic incidents at work.",
    actors: ["Aggressive customer", "Offender", "Traumatic incident"],
    exposure: "staff100",
    rate: { low: 0.01, typical: 0.019, high: 0.2 },
    rateBasis: "anchored",
    kindFactor: { healthcare: 4, retail: 2.5, venue: 2.5, government: 2, education: 1.5, office: 0.5 },
    loss: flat({ low: 15_000, typical: 45_000, high: 250_000 }),
    lossBasis: "anchored",
    targets: ["people"],
    evidence: [{ ...SWA_MENTAL, derivation: "17,600 × 15.7% ≈ 2,760 claims a year ÷ ≈14.6M workers ≈ 0.019 per 100 workers. Loss per claim is fitted so its median is the $67,400 median for mental-health claims." }],
  },
  {
    key: "bullying",
    domain: "personnel",
    category: "Psychosocial",
    name: "Workplace bullying & harassment",
    description: "Repeated unreasonable behaviour or harassment between workers, leading to a psychological injury claim.",
    actors: ["Co-worker", "Supervisor"],
    exposure: "staff100",
    rate: { low: 0.02, typical: 0.04, high: 0.15 },
    rateBasis: "anchored",
    loss: flat({ low: 15_000, typical: 45_000, high: 250_000 }),
    lossBasis: "anchored",
    targets: ["people", "reputation"],
    evidence: [{ ...SWA_MENTAL, derivation: "17,600 × 33.2% ≈ 5,840 claims a year ÷ ≈14.6M workers ≈ 0.04 per 100 workers. Loss per claim is fitted so its median is the $67,400 median for mental-health claims." }],
  },
  {
    key: "internal-fraud",
    domain: "personnel",
    category: "Insider threat",
    name: "Internal fraud & employee theft",
    description: "Payroll, procurement, expense or refund fraud, and theft of cash or stock by staff.",
    actors: ["Employee", "Contractor", "Colluding supplier"],
    exposure: "org",
    rate: { low: 0.04, typical: 0.1, high: 0.25 },
    rateBasis: "anchored",
    loss: scaled({ low: 1_000, typical: 8_000, high: 80_000 }, { low: 3_000, typical: 30_000, high: 400_000 }, { low: 10_000, typical: 120_000, high: 2_000_000 }),
    lossBasis: "estimated",
    targets: ["cash", "stock", "data"],
    evidence: [PWC_FRAUD],
  },
  {
    key: "insider-exfiltration",
    domain: "personnel",
    category: "Insider threat",
    name: "Malicious insider: data theft or sabotage",
    description: "A current or departing staff member copies client lists, IP or credentials, or deliberately damages systems.",
    actors: ["Departing employee", "Disgruntled employee", "Contractor"],
    exposure: "org",
    rate: { low: 0.01, typical: 0.03, high: 0.1 },
    rateBasis: "estimated",
    loss: scaled({ low: 10_000, typical: 40_000, high: 400_000 }, { low: 20_000, typical: 120_000, high: 1_500_000 }, { low: 50_000, typical: 400_000, high: 5_000_000 }),
    lossBasis: "estimated",
    targets: ["data", "reputation"],
    evidence: [PWC_FRAUD],
  },
  {
    key: "unvetted-personnel",
    domain: "personnel",
    category: "Vetting",
    name: "Unlicensed or unvetted personnel",
    description: "Staff or contractors working without a current licence, right-to-work or background check; exposes the business to penalties, void insurance and misconduct.",
    actors: ["Applicant misrepresenting history", "Subcontractor"],
    exposure: "staff100",
    rate: { low: 0.1, typical: 0.4, high: 2 },
    rateBasis: "estimated",
    loss: flat({ low: 2_000, typical: 11_000, high: 150_000 }),
    lossBasis: "estimated",
    targets: ["reputation", "people"],
    evidence: [],
  },
  {
    key: "lone-worker",
    domain: "personnel",
    category: "Safety",
    name: "Lone-worker incident",
    description: "Injury, medical event or assault while working alone, made worse by a delayed response.",
    actors: ["Offender", "Medical event", "Accident"],
    exposure: "staff100",
    rate: { low: 0.01, typical: 0.05, high: 0.3 },
    rateBasis: "estimated",
    kindFactor: { construction: 2, industrial: 1.5, warehouse: 1.5, residential: 1.5, "data-centre": 1.2, office: 0.4 },
    loss: flat({ low: 10_000, typical: 50_000, high: 1_000_000 }),
    lossBasis: "estimated",
    targets: ["people"],
    evidence: [],
  },
  {
    key: "targeted-threat",
    domain: "personnel",
    category: "Targeted threats",
    name: "Threat to executives: stalking, extortion, kidnap",
    description: "Fixated persons, extortion attempts and threats against executives or high-profile staff, on or off site.",
    actors: ["Fixated person", "Extortionist", "Activist"],
    exposure: "org",
    rate: { low: 0.001, typical: 0.005, high: 0.05 },
    rateBasis: "estimated",
    loss: scaled({ low: 10_000, typical: 60_000, high: 1_000_000 }, { low: 20_000, typical: 150_000, high: 3_000_000 }, { low: 50_000, typical: 300_000, high: 10_000_000 }),
    lossBasis: "estimated",
    targets: ["people", "reputation"],
    evidence: [],
  },
  {
    key: "pretexting",
    domain: "personnel",
    category: "Social engineering",
    name: "In-person or phone pretexting",
    description: "Impersonation of a contractor, courier or colleague to gain entry, information or a password reset.",
    actors: ["Social engineer", "Organised crime"],
    exposure: "org",
    rate: { low: 0.05, typical: 0.3, high: 1.5 },
    rateBasis: "estimated",
    loss: flat({ low: 0, typical: 3_000, high: 100_000 }),
    lossBasis: "estimated",
    targets: ["data", "it", "people"],
    evidence: [],
  },

  // ── Cyber ───────────────────────────────────────────────────────────────
  {
    key: "bec",
    domain: "cyber",
    category: "Fraud",
    name: "Business email compromise fraud",
    description: "A compromised or spoofed mailbox redirects an invoice or payroll payment to a criminal's account.",
    actors: ["Organised cybercrime"],
    exposure: "org",
    rate: { low: 0.04, typical: 0.12, high: 0.5 },
    rateBasis: "estimated",
    loss: CYBER_COST,
    lossBasis: "anchored",
    targets: ["cash", "data"],
    evidence: [{ ...ASD, figure: `${ASD.figure} Business email compromise fraud is 15% of business-related cybercrime; email compromise without direct loss a further 19%.` }],
  },
  {
    key: "phishing",
    domain: "cyber",
    category: "Account compromise",
    name: "Credential phishing & account takeover",
    description: "Staff credentials captured by phishing and used to access email, files or finance systems; the cost is response, lockout and cleanup.",
    actors: ["Organised cybercrime", "Initial access broker"],
    exposure: "org",
    rate: { low: 0.1, typical: 0.3, high: 1.2 },
    rateBasis: "estimated",
    loss: scaled({ low: 1_000, typical: 6_000, high: 60_000 }, { low: 2_000, typical: 12_000, high: 120_000 }, { low: 5_000, typical: 25_000, high: 300_000 }),
    lossBasis: "estimated",
    targets: ["data", "it"],
    evidence: [ASD],
  },
  {
    key: "ransomware",
    domain: "cyber",
    category: "Extortion",
    name: "Ransomware",
    description: "Systems encrypted and data stolen for extortion; the loss covers downtime, recovery, response and any data-breach obligations.",
    actors: ["Ransomware affiliate", "Organised cybercrime"],
    exposure: "org",
    rate: { low: 0.01, typical: 0.03, high: 0.12 },
    rateBasis: "estimated",
    loss: scaled({ low: 20_000, typical: 80_000, high: 1_000_000 }, { low: 50_000, typical: 250_000, high: 3_000_000 }, { low: 200_000, typical: 1_000_000, high: 15_000_000 }),
    lossBasis: "estimated",
    targets: ["data", "it"],
    evidence: [{ ...ASD, figure: "ASD describes ransomware as the most disruptive cyber threat to Australian organisations." }, IBM],
  },
  {
    key: "data-breach",
    domain: "cyber",
    category: "Data breach",
    name: "Malicious data breach",
    description: "Personal or commercial data stolen by an external attacker, triggering notification under the Notifiable Data Breaches scheme.",
    actors: ["Organised cybercrime", "Hacktivist", "State actor"],
    exposure: "org",
    rate: { low: 0.005, typical: 0.02, high: 0.08 },
    rateBasis: "estimated",
    loss: scaled({ low: 30_000, typical: 90_000, high: 1_200_000 }, { low: 100_000, typical: 400_000, high: 4_000_000 }, { low: 500_000, typical: 2_460_000, high: 15_000_000 }),
    lossBasis: "anchored",
    targets: ["data", "reputation"],
    evidence: [OAIC, IBM],
  },
  {
    key: "accidental-disclosure",
    domain: "cyber",
    category: "Data breach",
    name: "Accidental disclosure",
    description: "Personal information sent to the wrong recipient, published or left exposed through human error.",
    actors: ["Employee error"],
    exposure: "org",
    rate: { low: 0.02, typical: 0.06, high: 0.25 },
    rateBasis: "estimated",
    loss: scaled({ low: 2_000, typical: 15_000, high: 150_000 }, { low: 5_000, typical: 40_000, high: 500_000 }, { low: 10_000, typical: 90_000, high: 1_500_000 }),
    lossBasis: "estimated",
    targets: ["data", "reputation"],
    evidence: [{ ...OAIC, figure: `${OAIC.figure} Human error is the second-largest source of notified breaches.` }],
  },
  {
    key: "identity-fraud",
    domain: "cyber",
    category: "Fraud",
    name: "Identity fraud against the business",
    description: "Criminals impersonate the business or open accounts in its name: fake invoices, credit applications, ABN misuse.",
    actors: ["Organised cybercrime"],
    exposure: "org",
    rate: { low: 0.02, typical: 0.06, high: 0.2 },
    rateBasis: "estimated",
    loss: CYBER_COST,
    lossBasis: "anchored",
    targets: ["cash", "reputation"],
    evidence: [{ ...ASD, figure: `${ASD.figure} Identity fraud, BEC and ransomware are the top threats to businesses.` }],
  },
  {
    key: "supply-chain",
    domain: "cyber",
    category: "Third party",
    name: "Supplier or managed-service compromise",
    description: "An attacker reaches the business through an IT provider, software update or shared platform.",
    actors: ["Organised cybercrime", "State actor"],
    exposure: "org",
    rate: { low: 0.01, typical: 0.03, high: 0.1 },
    rateBasis: "estimated",
    loss: scaled({ low: 10_000, typical: 50_000, high: 600_000 }, { low: 20_000, typical: 150_000, high: 2_000_000 }, { low: 50_000, typical: 400_000, high: 6_000_000 }),
    lossBasis: "estimated",
    targets: ["data", "it"],
    evidence: [ASD],
  },
  {
    key: "ddos",
    domain: "cyber",
    category: "Availability",
    name: "Denial of service",
    description: "Websites, booking or ordering systems taken offline by traffic floods.",
    actors: ["Hacktivist", "Extortionist"],
    exposure: "org",
    rate: { low: 0.005, typical: 0.02, high: 0.1 },
    rateBasis: "estimated",
    loss: scaled({ low: 1_000, typical: 8_000, high: 80_000 }, { low: 5_000, typical: 30_000, high: 300_000 }, { low: 10_000, typical: 80_000, high: 1_000_000 }),
    lossBasis: "estimated",
    targets: ["it", "reputation"],
    evidence: [],
  },
  {
    key: "ot-compromise",
    domain: "cyber",
    category: "Cyber-physical",
    name: "Compromise of building & security systems",
    description: "Access control, CCTV, alarm or building-management systems reached over the network and used to disable protection or spy.",
    actors: ["Organised crime", "Hacktivist", "State actor"],
    exposure: "site",
    rate: { low: 0.002, typical: 0.01, high: 0.05 },
    rateBasis: "estimated",
    kindFactor: { "data-centre": 2, government: 1.5, healthcare: 1.3, industrial: 1.5 },
    loss: scaled({ low: 5_000, typical: 30_000, high: 400_000 }, { low: 10_000, typical: 80_000, high: 1_000_000 }, { low: 20_000, typical: 150_000, high: 3_000_000 }),
    lossBasis: "estimated",
    targets: ["facility", "data", "it"],
    evidence: [{ ...ASD, figure: "ASD reports a 111% rise in cyber attacks on critical infrastructure in 2024–25." }],
  },
];

export const THREAT_BY_KEY = new Map(THREATS.map((t) => [t.key, t]));

const m = (threat: string, freq: number, loss = 0): Mitigation => ({ threat, freq, loss });

export const CONTROLS: ControlDef[] = [
  // ── Physical ────────────────────────────────────────────────────────────
  {
    key: "intrusion-alarm",
    domain: "physical",
    name: "Monitored intrusion alarm",
    description: "Detectors on entries and internal spaces, monitored by a Grade A control room with patrol response.",
    standard: "AS/NZS 2201.1, AS 2201.2",
    scope: "site",
    capex: 6_000,
    opex: 1_200,
    mitigates: [m("break-in", 0.35, 0.45), m("equipment-theft", 0.2, 0.3), m("device-theft", 0.2, 0.2), m("arson", 0, 0.2), m("vehicle-theft", 0.15, 0.2)],
  },
  {
    key: "cctv",
    domain: "physical",
    name: "CCTV with recording & analytics",
    description: "Coverage of entries, cash points and perimeters with retained, reviewable footage and alerting.",
    standard: "AS 4806.1–4",
    scope: "site",
    capex: 15_000,
    opex: 2_000,
    mitigates: [m("break-in", 0.2, 0.1), m("retail-theft", 0.15, 0.1), m("vandalism", 0.3), m("robbery", 0.15), m("trespass", 0.2), m("equipment-theft", 0.15), m("protest", 0, 0.1), m("vehicle-theft", 0.15)],
  },
  {
    key: "access-control",
    domain: "physical",
    name: "Electronic access control",
    description: "Card or mobile credentials on perimeter and internal doors, with audit trails and time schedules.",
    standard: "AS 60839.11.1",
    scope: "site",
    capex: 20_000,
    opex: 2_500,
    mitigates: [m("trespass", 0.6), m("break-in", 0.15), m("device-theft", 0.3), m("internal-fraud", 0.05), m("pretexting", 0.3)],
  },
  {
    key: "static-guard",
    domain: "physical",
    name: "Static security officer",
    description: "A licensed officer on site during trading hours: presence, access, incident response and reporting.",
    standard: "NSW Security Industry Act 1997 (Class 1A)",
    scope: "site",
    capex: 0,
    opex: 120_000,
    mitigates: [m("trespass", 0.5), m("robbery", 0.3, 0.2), m("retail-theft", 0.3, 0.2), m("occupational-violence", 0.2, 0.3), m("psych-violence", 0.1, 0.2), m("protest", 0, 0.3), m("vandalism", 0.2), m("crowded-place-attack", 0, 0.1)],
  },
  {
    key: "mobile-patrol",
    domain: "physical",
    name: "After-hours mobile patrol & alarm response",
    description: "Randomised patrols, lock-up checks and a guaranteed response time to alarms.",
    scope: "site",
    capex: 0,
    opex: 12_000,
    mitigates: [m("break-in", 0.15, 0.3), m("vandalism", 0.2), m("arson", 0.1, 0.15), m("equipment-theft", 0.15, 0.2), m("vehicle-theft", 0.1)],
  },
  {
    key: "perimeter",
    domain: "physical",
    name: "Perimeter fencing & gates",
    description: "Anti-climb fencing, secured gates and controlled vehicle entry around yards and compounds.",
    standard: "AS 1725",
    scope: "site",
    capex: 40_000,
    opex: 1_000,
    mitigates: [m("break-in", 0.25), m("trespass", 0.3), m("equipment-theft", 0.35), m("vandalism", 0.25), m("vehicle-theft", 0.3), m("protest", 0.1)],
  },
  {
    key: "lighting",
    domain: "physical",
    name: "Security lighting & CPTED",
    description: "Lighting, sightlines and landscaping designed so offenders are seen (crime prevention through environmental design).",
    scope: "site",
    capex: 8_000,
    opex: 1_000,
    mitigates: [m("vandalism", 0.2), m("break-in", 0.1), m("robbery", 0.1), m("trespass", 0.1)],
  },
  {
    key: "hvm",
    domain: "physical",
    name: "Hostile vehicle mitigation",
    description: "Rated bollards and planters that stop a vehicle reaching crowds or entrances.",
    standard: "IWA 14-1 / PAS 68",
    scope: "site",
    capex: 150_000,
    opex: 2_000,
    mitigates: [m("crowded-place-attack", 0.1, 0.4)],
  },
  {
    key: "cash-handling",
    domain: "physical",
    name: "Rated safe, time-delay locks & cash procedures",
    description: "Minimal cash on hand, time-delay safes, drop safes and varied banking routines.",
    scope: "site",
    capex: 5_000,
    opex: 500,
    mitigates: [m("robbery", 0.2, 0.6), m("break-in", 0, 0.15), m("internal-fraud", 0.1, 0.2)],
  },
  {
    key: "eas",
    domain: "physical",
    name: "Electronic article surveillance",
    description: "Tagged stock, gates at exits and locked cabinets for high-theft lines.",
    scope: "site",
    capex: 12_000,
    opex: 2_000,
    mitigates: [m("retail-theft", 0.35, 0.1)],
  },
  {
    key: "duress",
    domain: "physical",
    name: "Duress alarms & body-worn cameras",
    description: "Fixed and mobile duress buttons tied to monitored response; body-worn cameras for frontline staff.",
    scope: "site",
    capex: 6_000,
    opex: 1_500,
    mitigates: [m("occupational-violence", 0.15, 0.3), m("robbery", 0, 0.2), m("lone-worker", 0, 0.5), m("psych-violence", 0.05, 0.1)],
  },
  {
    key: "visitor-management",
    domain: "physical",
    name: "Visitor management & reception screening",
    description: "Sign-in with ID, host escort, visible passes and a reception that challenges.",
    scope: "site",
    capex: 3_000,
    opex: 1_200,
    mitigates: [m("trespass", 0.3), m("pretexting", 0.4), m("targeted-threat", 0.1)],
  },
  {
    key: "fire-protection",
    domain: "physical",
    name: "Fire detection & suppression",
    description: "Detection, sprinklers or gas suppression, maintained and monitored.",
    standard: "AS 1670.1, AS 2118",
    scope: "site",
    capex: 25_000,
    opex: 2_000,
    mitigates: [m("arson", 0, 0.6)],
  },
  {
    key: "key-control",
    domain: "physical",
    name: "Restricted master key system & key register",
    description: "Patented restricted keys, issued against a register and recovered at exit.",
    standard: "AS 4145",
    scope: "site",
    capex: 4_000,
    opex: 500,
    mitigates: [m("break-in", 0.1), m("internal-fraud", 0.05), m("trespass", 0.15), m("vehicle-theft", 0.2)],
  },
  {
    key: "secure-room",
    domain: "physical",
    name: "Secure room or cage for high-value items",
    description: "A hardened room or cage for servers, stock and records, with its own access and alarm.",
    standard: "SCEC-endorsed products",
    scope: "site",
    capex: 20_000,
    opex: 500,
    mitigates: [m("device-theft", 0.5), m("break-in", 0, 0.3), m("internal-fraud", 0.1), m("equipment-theft", 0.2)],
  },
  {
    key: "crowded-places-plan",
    domain: "physical",
    name: "Emergency & crowded-places plan",
    description: "Emergency plan, lockdown and evacuation drills, and a crowded-places self-assessment.",
    standard: "AS 3745; Australia's Strategy for Protecting Crowded Places from Terrorism",
    scope: "site",
    capex: 0,
    opex: 5_000,
    mitigates: [m("crowded-place-attack", 0, 0.25), m("protest", 0, 0.2), m("occupational-violence", 0, 0.1), m("arson", 0, 0.1)],
  },

  // ── Personnel ───────────────────────────────────────────────────────────
  {
    key: "screening",
    domain: "personnel",
    name: "Pre-employment screening",
    description: "Identity, right-to-work, police and reference checks before start, repeated for sensitive roles.",
    standard: "AS 4811",
    scope: "org",
    capex: 0,
    opex: 3_000,
    mitigates: [m("internal-fraud", 0.3), m("insider-exfiltration", 0.25), m("unvetted-personnel", 0.7)],
  },
  {
    key: "licence-verification",
    domain: "personnel",
    name: "Licence & credential verification",
    description: "Checks of security licences, first aid and trade tickets against the issuing register, with expiry alerts.",
    scope: "org",
    capex: 0,
    opex: 1_000,
    mitigates: [m("unvetted-personnel", 0.6)],
  },
  {
    key: "ov-training",
    domain: "personnel",
    name: "Occupational-violence & de-escalation training",
    description: "Recognising escalation, de-escalating, safe exits and post-incident support.",
    scope: "org",
    capex: 0,
    opex: 8_000,
    mitigates: [m("occupational-violence", 0.25, 0.15), m("psych-violence", 0.2), m("robbery", 0, 0.1)],
  },
  {
    key: "psychosocial",
    domain: "personnel",
    name: "Psychosocial risk management & EAP",
    description: "Risk assessment under the psychosocial hazards Code of Practice, an employee assistance program and trauma debriefs.",
    standard: "Managing psychosocial hazards at work Code of Practice",
    scope: "org",
    capex: 0,
    opex: 10_000,
    mitigates: [m("psych-violence", 0, 0.3), m("bullying", 0.3, 0.3)],
  },
  {
    key: "whistleblower",
    domain: "personnel",
    name: "Whistleblower & fraud hotline",
    description: "An independent, anonymous reporting line with a documented investigation process.",
    standard: "Corporations Act Part 9.4AAA; AS ISO 37002",
    scope: "org",
    capex: 0,
    opex: 6_000,
    mitigates: [m("internal-fraud", 0.2, 0.4), m("bullying", 0.1), m("insider-exfiltration", 0, 0.2)],
  },
  {
    key: "segregation",
    domain: "personnel",
    name: "Segregation of duties & dual payment approval",
    description: "No one person can create a supplier, approve and release a payment; two approvers above a threshold.",
    standard: "AS 8001 Fraud and corruption control",
    scope: "org",
    capex: 0,
    opex: 2_000,
    mitigates: [m("internal-fraud", 0.35, 0.3), m("bec", 0.2, 0.3)],
  },
  {
    key: "callback",
    domain: "personnel",
    name: "Call-back verification of bank-detail changes",
    description: "Any change to supplier or payroll bank details is confirmed by phone on a number already on file.",
    scope: "org",
    capex: 0,
    opex: 500,
    mitigates: [m("bec", 0.6), m("identity-fraud", 0.2)],
  },
  {
    key: "lone-worker-monitoring",
    domain: "personnel",
    name: "Lone-worker monitoring",
    description: "App or device check-ins with man-down and escalation to a monitored centre.",
    scope: "org",
    capex: 0,
    opex: 4_000,
    mitigates: [m("lone-worker", 0.1, 0.5)],
  },
  {
    key: "executive-protection",
    domain: "personnel",
    name: "Executive protection & travel risk program",
    description: "Threat assessment, protective intelligence, secure travel and residential reviews for exposed executives.",
    scope: "org",
    capex: 0,
    opex: 30_000,
    mitigates: [m("targeted-threat", 0.3, 0.5)],
  },
  {
    key: "offboarding",
    domain: "personnel",
    name: "Joiner–mover–leaver access control",
    description: "Access, keys and accounts granted by role and removed on the day someone moves or leaves.",
    scope: "org",
    capex: 0,
    opex: 2_000,
    mitigates: [m("insider-exfiltration", 0.3), m("trespass", 0.1), m("internal-fraud", 0.1)],
  },
  {
    key: "awareness",
    domain: "personnel",
    name: "Security awareness training",
    description: "Regular phishing simulations and pretexting awareness, with reporting made easy.",
    scope: "org",
    capex: 0,
    opex: 4_000,
    mitigates: [m("phishing", 0.35), m("bec", 0.3), m("pretexting", 0.35), m("ransomware", 0.15), m("identity-fraud", 0.1), m("accidental-disclosure", 0.2)],
  },

  // ── Cyber (Essential Eight and beyond) ──────────────────────────────────
  {
    key: "e8-mfa",
    domain: "cyber",
    name: "Multi-factor authentication",
    description: "Phishing-resistant MFA on email, remote access and privileged accounts.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 2_000,
    opex: 3_000,
    mitigates: [m("phishing", 0.6), m("bec", 0.4), m("data-breach", 0.25), m("ransomware", 0.2), m("supply-chain", 0.1)],
  },
  {
    key: "e8-patch-apps",
    domain: "cyber",
    name: "Patch applications",
    description: "Internet-facing and office applications patched within ASD timeframes.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 0,
    opex: 4_000,
    mitigates: [m("ransomware", 0.2), m("data-breach", 0.15), m("supply-chain", 0.1)],
  },
  {
    key: "e8-patch-os",
    domain: "cyber",
    name: "Patch operating systems",
    description: "Operating systems patched and unsupported versions replaced.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 0,
    opex: 3_000,
    mitigates: [m("ransomware", 0.15), m("data-breach", 0.1), m("ot-compromise", 0.1)],
  },
  {
    key: "e8-app-control",
    domain: "cyber",
    name: "Application control",
    description: "Only approved programs can run on workstations and servers.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 5_000,
    opex: 3_000,
    mitigates: [m("ransomware", 0.35), m("insider-exfiltration", 0.1)],
  },
  {
    key: "e8-macros",
    domain: "cyber",
    name: "Restrict Office macros",
    description: "Macros blocked unless from trusted, signed sources.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 0,
    opex: 500,
    mitigates: [m("ransomware", 0.15), m("phishing", 0.1)],
  },
  {
    key: "e8-hardening",
    domain: "cyber",
    name: "User application hardening",
    description: "Browsers and office apps configured to block ads, Java and risky content.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 0,
    opex: 1_000,
    mitigates: [m("phishing", 0.1), m("ransomware", 0.1)],
  },
  {
    key: "e8-admin",
    domain: "cyber",
    name: "Restrict administrative privileges",
    description: "Admin rights limited, separated from everyday accounts and reviewed.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 0,
    opex: 2_000,
    mitigates: [m("ransomware", 0.1, 0.3), m("data-breach", 0, 0.25), m("insider-exfiltration", 0.2)],
  },
  {
    key: "e8-backups",
    domain: "cyber",
    name: "Regular, tested, offline backups",
    description: "Backups of important data and configuration, kept offline and restored in regular tests.",
    standard: "ASD Essential Eight",
    scope: "org",
    capex: 3_000,
    opex: 3_000,
    mitigates: [m("ransomware", 0, 0.6), m("insider-exfiltration", 0, 0.2)],
  },
  {
    key: "edr",
    domain: "cyber",
    name: "Managed endpoint detection & response",
    description: "EDR on every endpoint with a 24/7 monitored response service.",
    scope: "org",
    capex: 0,
    opex: 15_000,
    mitigates: [m("ransomware", 0.3, 0.3), m("data-breach", 0, 0.2), m("insider-exfiltration", 0, 0.2), m("supply-chain", 0.1, 0.2)],
  },
  {
    key: "email-security",
    domain: "cyber",
    name: "Email filtering & DMARC",
    description: "Filtering of malicious mail, and SPF, DKIM and DMARC to stop spoofing of the business's domain.",
    scope: "org",
    capex: 0,
    opex: 3_000,
    mitigates: [m("phishing", 0.4), m("bec", 0.35), m("identity-fraud", 0.1)],
  },
  {
    key: "dlp",
    domain: "cyber",
    name: "Encryption & data loss prevention",
    description: "Full-disk encryption on devices, encrypted storage and rules that stop bulk data leaving.",
    scope: "org",
    capex: 5_000,
    opex: 6_000,
    mitigates: [m("data-breach", 0, 0.3), m("device-theft", 0, 0.8), m("insider-exfiltration", 0.3, 0.3), m("accidental-disclosure", 0.4)],
  },
  {
    key: "ir-plan",
    domain: "cyber",
    name: "Incident response plan & retainer",
    description: "A tested plan, a pre-agreed forensic retainer and breach notification playbook.",
    scope: "org",
    capex: 0,
    opex: 8_000,
    mitigates: [m("ransomware", 0, 0.3), m("data-breach", 0, 0.3), m("bec", 0, 0.2), m("accidental-disclosure", 0, 0.2)],
  },
  {
    key: "cyber-insurance",
    domain: "cyber",
    name: "Cyber insurance",
    description: "Transfers part of the loss from cyber events to an insurer, subject to excess and exclusions.",
    scope: "org",
    capex: 0,
    opex: 6_000,
    mitigates: [m("ransomware", 0, 0.5), m("data-breach", 0, 0.5), m("bec", 0, 0.3), m("ddos", 0, 0.3)],
  },
  {
    key: "vendor-risk",
    domain: "cyber",
    name: "Third-party security assessments",
    description: "Security due diligence and contract clauses for IT providers and data processors.",
    scope: "org",
    capex: 0,
    opex: 4_000,
    mitigates: [m("supply-chain", 0.3)],
  },
  {
    key: "ddos-protection",
    domain: "cyber",
    name: "DDoS protection",
    description: "A CDN or upstream scrubbing service in front of public systems.",
    scope: "org",
    capex: 0,
    opex: 3_000,
    mitigates: [m("ddos", 0.7)],
  },
  {
    key: "ot-segmentation",
    domain: "cyber",
    name: "Segment building & security systems",
    description: "Access control, CCTV, alarm and BMS on their own network, patched, with vendor remote access controlled.",
    scope: "site",
    capex: 8_000,
    opex: 1_500,
    mitigates: [m("ot-compromise", 0.5, 0.4)],
  },
];

export const CONTROL_BY_KEY = new Map(CONTROLS.map((c) => [c.key, c]));

/** Threats a site of this kind is exposed to (kind factor above zero), plus every organisation-wide threat. */
export function threatsFor(kind: SiteKind | null): ThreatDef[] {
  return THREATS.filter((t) => (kind === null ? t.exposure !== "site" : t.exposure === "site" && (t.kindFactor?.[kind] ?? 1) > 0));
}

/** Controls that act on a threat. */
export const controlsFor = (threatKey: string) => CONTROLS.filter((c) => c.mitigates.some((x) => x.threat === threatKey));
