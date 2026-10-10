/**
 * Physical security items placed on a level: plopped at a point (a card reader, a sensor, a bollard) or
 * drawn as a run between two points (a bollard line, a vehicle barrier, an IR beam). Kept in the level's
 * geometry with its walls, so they share its undo history and are saved with it.
 */
import type { Pt } from "./geometry";

export const DEVICE_GROUPS = ["Perimeter", "Access", "Detection", "Alarm", "Lighting", "Guarding"] as const;
export type DeviceGroup = (typeof DEVICE_GROUPS)[number];

export interface DeviceDef {
  key: string;
  label: string;
  /** Short mark on the plan. */
  code: string;
  group: DeviceGroup;
  /** Plopped at a point, or drawn from one point to another. */
  shape: "point" | "line";
  /** Height of the item (or its mounting height) in metres. */
  mount: number;
  /** For sensors and lights: how far they reach (m) and how wide (degrees; 360 all round). */
  range?: number;
  angle?: number;
  hint: string;
}

export const DEVICES: readonly DeviceDef[] = [
  { key: "bollard", label: "Bollard", group: "Perimeter", code: "B", shape: "point", mount: 1.0, hint: "A single anti-ram or traffic bollard." },
  { key: "bollards", label: "Bollard run", group: "Perimeter", code: "B", shape: "line", mount: 1.0, hint: "Draw the run; bollards go every 1.4 m." },
  { key: "barrier", label: "Vehicle barrier", group: "Perimeter", code: "VB", shape: "line", mount: 0.8, hint: "Concrete or hostile-vehicle barrier, drawn along its length." },
  { key: "gate", label: "Sliding gate", group: "Perimeter", code: "G", shape: "line", mount: 2.1, hint: "Draw across the opening it closes." },
  { key: "boom", label: "Boom gate", group: "Perimeter", code: "BG", shape: "line", mount: 1.0, hint: "Draw from the post along the arm." },
  { key: "turnstile", label: "Turnstile", group: "Access", code: "T", shape: "point", mount: 1.0, hint: "Full-height or waist-high turnstile." },
  { key: "reader", label: "Card reader", group: "Access", code: "CR", shape: "point", mount: 1.1, hint: "Place beside the door it controls." },
  { key: "keypad", label: "Keypad", group: "Access", code: "KP", shape: "point", mount: 1.2, hint: "PIN pad or alarm keypad." },
  { key: "intercom", label: "Intercom", group: "Access", code: "IC", shape: "point", mount: 1.4, hint: "Door or gate intercom." },
  { key: "lock", label: "Electric lock", group: "Access", code: "EL", shape: "point", mount: 2.0, hint: "Mag-lock or electric strike on a door." },
  { key: "pir", label: "Motion sensor", group: "Detection", code: "M", shape: "point", mount: 2.4, range: 12, angle: 90, hint: "PIR detector; point it into the room. Its reach shows on the plan and in 3D." },
  { key: "beam", label: "IR beam", group: "Detection", code: "IR", shape: "line", mount: 0.6, hint: "Draw from transmitter to receiver." },
  { key: "glass", label: "Glass-break sensor", group: "Detection", code: "GB", shape: "point", mount: 2.4, range: 7.5, angle: 360, hint: "Hears breaking glass within its range." },
  { key: "duress", label: "Duress button", group: "Alarm", code: "D", shape: "point", mount: 0.8, hint: "Hold-up or panic button." },
  { key: "panel", label: "Alarm panel", group: "Alarm", code: "AP", shape: "point", mount: 1.5, hint: "Control panel for the alarm system." },
  { key: "siren", label: "Siren / strobe", group: "Alarm", code: "S", shape: "point", mount: 3.0, hint: "External siren and strobe." },
  { key: "light", label: "Floodlight", group: "Lighting", code: "L", shape: "point", mount: 5.0, range: 15, angle: 100, hint: "Security lighting; point it where it lights. Its reach shows on the plan and in 3D." },
  { key: "guard", label: "Guard post", group: "Guarding", code: "GP", shape: "point", mount: 2.6, hint: "Gatehouse or guard booth." },
  { key: "safe", label: "Safe", group: "Guarding", code: "SF", shape: "point", mount: 1.0, hint: "Safe or secure cabinet." },
  { key: "sign", label: "Warning sign", group: "Guarding", code: "!", shape: "point", mount: 2.0, hint: "Deterrence signage." },
];

/** Palette hue for each group, shared by the plan and the 3D model. */
export const GROUP_HUE: Record<DeviceGroup, "slate" | "harbour" | "jacaranda" | "clay" | "ochre" | "euc"> = {
  Perimeter: "slate",
  Access: "harbour",
  Detection: "jacaranda",
  Alarm: "clay",
  Lighting: "ochre",
  Guarding: "euc",
};

export const deviceDef = (key: string): DeviceDef => DEVICES.find((d) => d.key === key) ?? DEVICES[0]!;
export const DEVICE_KEYS = DEVICES.map((d) => d.key) as [string, ...string[]];

export interface Device {
  id: string;
  kind: string;
  /** Where it is (a point item) or where it starts (a line item), as plan fractions. */
  a: Pt;
  /** Where a line item ends; null for a point item. */
  b: Pt | null;
  /** Which way it faces, degrees clockwise from plan east (like a camera's yaw). */
  rot: number;
  label: string;
  /** Reach in metres when it differs from the usual for its kind (sensors and lights). */
  range: number | null;
}

/** A photo of the site, placed where it was taken and pointing the way it looks. */
export interface Photo {
  id: string;
  /** The stored image (site file id). */
  file: number;
  at: Pt;
  yaw: number;
  caption: string;
  /** Pixel size, for its shape in the 3D model. */
  w: number;
  h: number;
}

/** Spacing of bollards along a run, in metres. */
export const BOLLARD_SPACING = 1.4;

/** How far a sensor or light reaches, and how wide. */
export const reachOf = (d: Device) => {
  const def = deviceDef(d.kind);
  return def.range ? { range: d.range ?? def.range, angle: def.angle ?? 360 } : null;
};

/** The floor a sensor or light covers, as a fan (or circle) of points in metres. */
export function fanOf(d: Device, at: Pt, steps = 28): Pt[] {
  const r = reachOf(d);
  if (!r) return [];
  if (r.angle >= 360) return Array.from({ length: steps }, (_, i) => [at[0] + Math.cos((i / steps) * Math.PI * 2) * r.range, at[1] + Math.sin((i / steps) * Math.PI * 2) * r.range] as Pt);
  const a0 = ((d.rot - r.angle / 2) * Math.PI) / 180, a1 = ((d.rot + r.angle / 2) * Math.PI) / 180;
  const pts: Pt[] = [at];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([at[0] + Math.cos(a) * r.range, at[1] + Math.sin(a) * r.range]);
  }
  return pts;
}
