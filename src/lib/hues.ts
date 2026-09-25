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

/**
 * Progress colours, shared by the board sections and the timeline bars so a
 * task reads the same everywhere: to do jacaranda, in progress harbour,
 * waiting on another task ochre, past due clay, complete eucalypt.
 */
export type ProgressState = "todo" | "doing" | "waiting" | "late" | "done";
export const PROGRESS_HUE: Record<ProgressState, Hue> = { todo: "jacaranda", doing: "harbour", waiting: "ochre", late: "clay", done: "euc" };
export const PROGRESS_LABEL: Record<ProgressState, string> = {
  todo: "To do",
  doing: "In progress",
  waiting: "Waiting on another task",
  late: "Past due",
  done: "Complete",
};

const COLUMN_HUES: Hue[] = ["jacaranda", "harbour", "slate", "brass"];
export function columnHue(index: number, done: boolean): Hue {
  return done ? "euc" : COLUMN_HUES[index % COLUMN_HUES.length]!;
}

/** Where a task stands: complete, past due, blocked by an unfinished task, or by its section. */
export function progressOf(o: { done: boolean; late: boolean; waiting: boolean; columnIndex: number }): ProgressState {
  if (o.done) return "done";
  if (o.late) return "late";
  if (o.waiting) return "waiting";
  return o.columnIndex === 0 ? "todo" : "doing";
}

const PEOPLE: Hue[] = ["harbour", "jacaranda", "euc", "clay", "ochre", "brass", "slate"];
/** A stable colour per person, so the same initials always read the same. */
export function personHue(initials: string): Hue {
  let h = 0;
  for (const ch of initials) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEOPLE[h % PEOPLE.length]!;
}

export const hueClass = (h: Hue) => `pt-hue-${h}`;
