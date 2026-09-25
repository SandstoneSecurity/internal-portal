/**
 * The task board's secondary palette. The status colours (eucalypt, ochre,
 * clay, slate) are joined by two more earth tones in the same register —
 * harbour blue and jacaranda — plus brass. Each hue exposes --hue (solid),
 * --hue-bg (tint) and --hue-fg (text on the tint) through a .pt-hue-* class.
 */
export type Hue = "brass" | "clay" | "ochre" | "euc" | "harbour" | "jacaranda" | "slate";

export const LINE_HUE: Record<string, Hue> = {
  Ops: "brass",
  Protective: "clay",
  Advisory: "ochre",
  Tech: "harbour",
  Training: "jacaranda",
};

export const PRIORITY_HUE: Record<string, Hue> = { High: "clay", Medium: "ochre", Low: "euc" };

const COLUMN_HUES: Hue[] = ["slate", "harbour", "jacaranda", "ochre"];
export function columnHue(index: number, done: boolean): Hue {
  return done ? "euc" : COLUMN_HUES[index % COLUMN_HUES.length]!;
}

const PEOPLE: Hue[] = ["harbour", "jacaranda", "euc", "clay", "ochre", "brass", "slate"];
/** A stable colour per person, so the same initials always read the same. */
export function personHue(initials: string): Hue {
  let h = 0;
  for (const ch of initials) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEOPLE[h % PEOPLE.length]!;
}

export const hueClass = (h: Hue) => `pt-hue-${h}`;
