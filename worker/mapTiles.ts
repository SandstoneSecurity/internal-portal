// The Intelligence map's tiles, labels and icons, served from the portal's own address. The browser never
// talks to the tile host, so an ad blocker, a corporate web filter or a privacy setting that blocks
// third-party map hosts can't leave the map blank; Cloudflare caches what it fetches.
import { Hono } from "hono";
import type { AuthVariables } from "./auth";

export interface MapEnv {
  /** Tile host (OpenFreeMap); only tests change it. */
  MAP_UPSTREAM?: string;
}

type Env = { Bindings: MapEnv; Variables: AuthVariables };

const upstreamOf = (env: MapEnv) => (env.MAP_UPSTREAM || "https://tiles.openfreemap.org").replace(/\/$/, "");

/** What the map may ask for: the tile index, versioned vector tiles, label fonts and the icon sprite. */
const ALLOWED = /^(planet|planet\/[\w.-]+\/\d{1,2}\/\d{1,7}\/\d{1,7}\.pbf|fonts\/[\w %,.-]+\/\d{1,6}-\d{1,6}\.pbf|sprites\/[\w.-]+\/[\w.@-]+\.(json|png))$/;

export const mapTiles = new Hono<Env>();

mapTiles.get("/map/*", async (c) => {
  const path = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/api\/map\//, ""));
  if (!ALLOWED.test(path)) return c.json({ error: "Not found." }, 404);
  const upstream = upstreamOf(c.env);
  const isIndex = path === "planet";
  let res: Response;
  try {
    res = await fetch(`${upstream}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      // Tiles under a dated path never change; the index moves on when the tiles are rebuilt.
      cf: { cacheEverything: true, cacheTtl: isIndex ? 3600 : 86400 * 7 },
    } as RequestInit);
  } catch (err) {
    console.error(`map: ${path}: ${(err as Error).message}`);
    return c.json({ error: "The map host couldn't be reached." }, 502);
  }
  if (!res.ok) {
    console.error(`map: ${path}: upstream ${res.status}`);
    return c.json({ error: `The map host answered ${res.status}.` }, res.status === 404 ? 404 : 502);
  }
  const headers = new Headers({
    "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": isIndex ? "public, max-age=3600" : "public, max-age=604800, immutable",
  });
  // fetch hands back the body decoded, so it goes out without the host's Content-Encoding.
  if (!isIndex) return new Response(res.body, { headers });
  // The index lists tile URLs on the tile host: point them back here.
  const index = (await res.json()) as { tiles?: string[] } & Record<string, unknown>;
  const here = `${new URL(c.req.url).origin}/api/map`;
  index.tiles = (index.tiles ?? []).map((t) => (t.startsWith(upstream) ? here + t.slice(upstream.length) : t));
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(index), { headers });
});
