/**
 * The Intelligence map's look: OpenFreeMap's Positron style (vector tiles from OpenStreetMap, no key needed),
 * recoloured to Sandstone. Tiles, fonts and icons load through the portal (/api/map, worker/mapTiles.ts). Limestone by day, ironbark for operations mode; the state border is brass.
 */
import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import positron from "./positron.json";

type Palette = Record<
  "bg" | "park" | "residential" | "water" | "waterLine" | "building" | "buildingLine" | "minor" | "casing" | "inner" | "subtle" | "rail" | "boundary" | "state" | "label" | "labelStrong" | "labelWater" | "halo",
  string
>;

const LIGHT: Palette = {
  bg: "#F6F4F0", // sand-50
  park: "#ECE9E0",
  residential: "#EFECE5", // sand-100
  water: "#D3DCDE",
  waterLine: "#BFCDD2",
  building: "#E6E1D7",
  buildingLine: "#DAD4C8",
  minor: "#E4DFD4",
  casing: "#D3CCBE",
  inner: "#FBFAF7",
  subtle: "#E3DED3", // sand-200
  rail: "#D8D2C5",
  boundary: "#AFA695", // sand-400
  state: "#B0925F", // brass-400
  label: "#786F5E", // sand-600
  labelStrong: "#2E2A23", // sand-900
  labelWater: "#3F6E82", // harbour-400
  halo: "#F6F4F0",
};

const NIGHT: Palette = {
  bg: "#1A1B19", // bark-800
  park: "#1E201C",
  residential: "#1D1E1B",
  water: "#121A1D",
  waterLine: "#1B272C",
  building: "#22231F",
  buildingLine: "#2A2B27",
  minor: "#292A26",
  casing: "#31322D",
  inner: "#3B3C36",
  subtle: "#262724", // bark-700
  rail: "#2D2E29",
  boundary: "#4A4B46", // bark-500
  state: "#7C603A", // brass-600
  label: "#8C8B84", // bark-300
  labelStrong: "#DCDAD5", // bark-100
  labelWater: "#6E95A6",
  halo: "#1A1B19",
};

/** Which colour each Positron layer takes. */
function roleOf(id: string): { fill?: keyof Palette; line?: keyof Palette; outline?: keyof Palette; text?: keyof Palette; hide?: boolean } {
  if (id === "background") return { fill: "bg" };
  if (id === "park" || id === "landcover_wood" || id.startsWith("landcover_")) return { fill: "park" };
  if (id === "landuse_residential") return { fill: "residential" };
  if (id === "water") return { fill: "water" };
  if (id === "waterway") return { line: "waterLine" };
  if (id === "building") return { fill: "building", outline: "buildingLine" };
  if (id === "road_area_pier" || id === "road_pier" || id.endsWith("_dashline")) return { fill: "bg", line: "bg" };
  if (id === "aeroway-area" || id === "aeroway-runway") return { fill: "inner", line: "inner" };
  if (id.startsWith("aeroway")) return { line: "minor" };
  if (id.endsWith("_casing")) return { line: "casing" };
  if (id.endsWith("_inner") || id === "highway_path") return { line: "inner" };
  if (id.endsWith("_subtle")) return { line: "subtle" };
  if (id === "highway_minor") return { line: "minor" };
  if (id.startsWith("railway")) return { line: "rail" };
  // boundary_3 is states (admin levels 3–4): NSW's border, drawn in brass.
  if (id === "boundary_3") return { line: "state" };
  if (id.startsWith("boundary")) return { line: "boundary" };
  // Shields are bright sprites that fight the palette; road names carry the same information.
  if (id.includes("shield")) return { hide: true };
  if (id.startsWith("water")) return { text: "labelWater" };
  if (id === "label_city" || id === "label_city_capital" || id === "label_state" || id.startsWith("label_country")) return { text: "labelStrong" };
  return { text: "label" };
}

export function mapStyle(theme: "light" | "night"): StyleSpecification {
  const c = theme === "night" ? NIGHT : LIGHT;
  // Through the portal rather than straight from the tile host.
  const here = `${window.location.origin}/api/map`;
  const base = JSON.parse(JSON.stringify(positron).replaceAll("https://tiles.openfreemap.org", here)) as StyleSpecification;
  base.layers = base.layers.map((layer): LayerSpecification => {
    const role = roleOf(layer.id);
    const l = { ...layer, paint: { ...(layer as { paint?: Record<string, unknown> }).paint } } as LayerSpecification & { paint: Record<string, unknown>; layout?: Record<string, unknown> };
    if (role.hide) return { ...l, layout: { ...l.layout, visibility: "none" } } as LayerSpecification;
    if (l.type === "background" && role.fill) l.paint["background-color"] = c[role.fill];
    if (l.type === "fill") {
      if (role.fill) l.paint["fill-color"] = c[role.fill];
      if (role.outline) l.paint["fill-outline-color"] = c[role.outline];
      else delete l.paint["fill-outline-color"];
    }
    if (l.type === "line" && (role.line ?? role.fill)) l.paint["line-color"] = c[(role.line ?? role.fill)!];
    if (l.type === "symbol") {
      l.paint["text-color"] = c[role.text ?? "label"];
      l.paint["text-halo-color"] = c.halo;
      l.paint["text-halo-width"] = 1.2;
    }
    return l;
  });
  return base;
}

/** Where tiles and labels come from, for the attribution line. */
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · Data <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> contributors';
