import { CircleAlert, Info, ShieldAlert, TrendingUp, type LucideIcon } from "lucide-react";
import type { IntelItem, Region, StatusKind } from "../../shared/types";

/** The four kinds of intelligence item, in the order they're shown. Opportunity is stored as "secure". */
export const INTEL_KINDS: { kind: StatusKind; label: string; short: string; plural: string; icon: LucideIcon }[] = [
  { kind: "breach", label: "Breach", short: "Breach", plural: "breaches", icon: ShieldAlert },
  { kind: "advisory", label: "Advisory", short: "Advisory", plural: "advisories", icon: CircleAlert },
  { kind: "info", label: "Information", short: "Info", plural: "information items", icon: Info },
  { kind: "secure", label: "Opportunity", short: "Opportunity", plural: "opportunities", icon: TrendingUp },
];

export const intelKind = (kind: StatusKind) => INTEL_KINDS.find((k) => k.kind === kind) ?? INTEL_KINDS[2]!;

/** Where an item goes on the map: its own point, else its region's. */
export function pinOf(item: IntelItem, regions: Region[]): { lat: number; lng: number; exact: boolean } | null {
  if (item.lat !== null && item.lng !== null) return { lat: item.lat, lng: item.lng, exact: true };
  const r = regions.find((x) => x.key === item.regionKey);
  return r ? { lat: r.lat, lng: r.lng, exact: false } : null;
}
