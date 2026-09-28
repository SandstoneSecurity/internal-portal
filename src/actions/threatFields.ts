import { ASSET_TYPES, ENTRY_TYPES, SITE_KINDS, ZONE_CLASSES } from "../../shared/threatLibrary";
import type { ClientSite } from "../../shared/types";
import type { FieldSpec, FormValues } from "../components/ui/FormDrawer";

export const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

export const siteFields = (clients?: { id: number; org: string }[], areas: string[] = []): FieldSpec[] => [
  ...(clients ? [{ name: "clientId", label: "Client", type: "select" as const, required: true, options: clients.map((c) => ({ value: String(c.id), label: c.org })) }] : []),
  { name: "name", label: "Site name", required: true, max: 80, placeholder: "e.g. Mascot distribution centre" },
  { name: "kind", label: "Site type", type: "select", required: true, half: true, options: SITE_KINDS.map(([value, label]) => ({ value, label })) },
  { name: "occupants", label: "People on site", type: "number", half: true, hint: "Staff and contractors on a typical day" },
  { name: "address", label: "Street address", max: 160, placeholder: "e.g. 12 Coward Street" },
  { name: "suburb", label: "Suburb", max: 60, half: true },
  { name: "postcode", label: "Postcode", max: 4, half: true, mono: true },
  { name: "state", label: "State", type: "select", required: true, half: true, options: opts(STATES) },
  { name: "hours", label: "Operating hours", max: 40, half: true, placeholder: "e.g. 24/7" },
  areas.length
    ? {
        name: "lga",
        label: "Council area (LGA)",
        type: "select",
        options: areas.map((a) => ({ value: a, label: a })),
        hint: "Sets the site's crime profile from BOCSAR's recorded crime rates for this LGA against the NSW rate.",
      }
    : { name: "lga", label: "Council area (LGA)", max: 80, placeholder: "e.g. Parramatta", hint: "NSW crime statistics aren't loaded yet; the name is matched once they are." },
  {
    name: "crimeFactor",
    label: "Local crime vs state average (manual)",
    type: "number",
    step: 0.1,
    half: true,
    hint: "Scales crime-driven threats (break-ins, theft, damage) where no LGA crime statistics apply: outside NSW, or before they load. 1 = average.",
  },
  { name: "notes", label: "Notes", type: "textarea", max: 1000 },
];

export const siteInitial = (s?: ClientSite, clientId?: number): FormValues => ({
  ...(clientId !== undefined ? { clientId: String(clientId) } : {}),
  name: s?.name ?? "",
  kind: s?.kind ?? "office",
  occupants: s?.occupants ?? 0,
  address: s?.address ?? "",
  suburb: s?.suburb ?? "",
  postcode: s?.postcode ?? "",
  state: s?.state ?? "NSW",
  hours: s?.hours ?? "Business hours",
  crimeFactor: s?.crimeFactor ?? 1,
  lga: s?.lga ?? "",
  notes: s?.notes ?? "",
});

export const SUBTYPES: Record<"zone" | "asset" | "entry", { value: string; label: string }[]> = {
  zone: opts(ZONE_CLASSES),
  asset: ASSET_TYPES.map(([value, label]) => ({ value, label })),
  entry: opts(ENTRY_TYPES),
};

/** The LGA a suburb or site name points at, when it's also a council name (Parramatta, Blacktown, Wollongong…). */
export function guessArea(areas: string[], ...hints: unknown[]): string {
  for (const h of hints) {
    const t = String(h ?? "").trim().toLowerCase();
    if (!t) continue;
    const hit = areas.find((a) => a.toLowerCase() === t);
    if (hit) return hit;
  }
  return "";
}
