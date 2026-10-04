import type { IntelItem, Region } from "./types";

/** Includes clearly labelled opportunities logged before the category existed. */
export function isOpportunity(item: IntelItem): boolean {
  return item.sev === "Opportunity" || /^OPPORTUNITY\b/i.test(item.headline);
}

export function intelCategory(item: IntelItem): string {
  return isOpportunity(item) ? "Opportunity" : item.sev;
}

/** Pins represent regional coverage, never the precise location of an incident. */
export function intelRegions(items: IntelItem[], regions: Region[]) {
  return regions.flatMap((region) => {
    const records = items.filter((item) => item.regionKey === region.key);
    return records.length && Number.isFinite(region.lat) && Number.isFinite(region.lng)
      && Math.abs(region.lat) <= 90 && Math.abs(region.lng) <= 180
      ? [{ region, records, opportunities: records.filter(isOpportunity).length }]
      : [];
  });
}
