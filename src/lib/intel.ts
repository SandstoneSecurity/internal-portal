import { Newspaper, ShieldAlert, TrendingUp, type LucideIcon } from "lucide-react";
import type { IntelItem, StatusKind } from "../../shared/types";

/** The three kinds of intelligence item, in the order they're shown. */
export const INTEL_KINDS: { kind: StatusKind; label: string; short: string; plural: string; icon: LucideIcon }[] = [
  { kind: "breach", label: "Incident", short: "Incidents", plural: "incidents", icon: ShieldAlert },
  { kind: "info", label: "News", short: "News", plural: "news items", icon: Newspaper },
  { kind: "secure", label: "Opportunity", short: "Opportunities", plural: "opportunities", icon: TrendingUp },
];

export const intelKind = (kind: StatusKind) => INTEL_KINDS.find((k) => k.kind === kind) ?? INTEL_KINDS[1]!;

/** Where an item goes on the map (the server works it out: pinned spot, named suburb, or region). */
export const pinOf = (item: IntelItem) => item.pin;
