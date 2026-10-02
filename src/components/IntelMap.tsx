import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize } from "lucide-react";
import { mapStyle } from "../lib/map/style";
import { useTheme } from "../lib/theme";

/** New South Wales, with the ACT. */
const NSW: LngLatBoundsLike = [
  [140.95, -37.55],
  [153.65, -28.15],
];

/** Room for the labels, which run right of their dots. */
const FIT = { top: 36, bottom: 36, left: 36, right: 120 };

export interface MapMarker {
  key: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  worst?: "breach" | "advisory" | "info";
  on: boolean;
  /** Which side of the dot the label sits. */
  anchor: "start" | "end";
}

/**
 * A real, pannable map of NSW with the monitored regions on it. Drag to move; scroll, pinch or the buttons
 * to zoom. `focus` moves the view: a region key flies there, null shows the whole state; bump `n`
 * to repeat a move.
 */
export default function IntelMap({ markers, focus, onRegion }: { markers: MapMarker[]; focus: { key: string | null; n: number }; onRegion: (key: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const { theme } = useTheme();
  const [, setFrame] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);
  const shownTheme = useRef(theme);

  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: box.current!,
        style: mapStyle(theme),
        bounds: NSW,
        fitBoundsOptions: { padding: FIT },
        minZoom: 3.5,
        maxZoom: 16,
        maxBounds: [
          [125, -46],
          [170, -18],
        ],
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
    } catch {
      setNoWebGl(true);
      return;
    }
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Markers are drawn over the canvas and follow it.
    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrame((f) => f + 1));
    };
    m.on("move", redraw);
    m.on("resize", redraw);
    m.on("load", redraw);
    m.on("error", (e) => {
      // Tiles, labels or the tile index not reachable (offline, blocked): the regions still work.
      if (/fetch|load|status|network|AJAXError/i.test(String((e as { error?: Error }).error?.message ?? e.error))) setTilesFailed(true);
    });
    m.on("data", (e) => {
      if ((e as { dataType?: string }).dataType === "source" && (e as { isSourceLoaded?: boolean }).isSourceLoaded) setTilesFailed(false);
    });
    map.current = m;
    redraw();
    return () => {
      cancelAnimationFrame(raf);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Day and night palettes follow the portal's theme.
  useEffect(() => {
    if (!map.current || shownTheme.current === theme) return;
    shownTheme.current = theme;
    map.current.setStyle(mapStyle(theme));
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    if (!m || focus.n === 0) return;
    const r = markers.find((x) => x.key === focus.key);
    if (r) m.easeTo({ center: [r.lng, r.lat], zoom: Math.max(m.getZoom(), 7.5), duration: 700 });
    else m.fitBounds(NSW, { padding: FIT, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.n]);

  const m = map.current;
  const w = box.current?.clientWidth ?? 0;
  const h = box.current?.clientHeight ?? 0;

  return (
    <div className="pt-imap">
      <div ref={box} className="pt-imap__canvas" role="region" aria-label="Map of New South Wales. Drag to move; scroll or use the zoom buttons to zoom." />
      {noWebGl ? (
        <div className="pt-imap__notice">This browser can't draw the map (WebGL is off). The feed still filters by region.</div>
      ) : (
        <>
          {/* Inside the map's own element, so a drag or scroll that starts on a marker still moves the map. */}
          {m &&
            createPortal(
              <div className="pt-imap__markers">
                {markers.map((r) => {
                  const p = m.project([r.lng, r.lat]);
                  if (p.x < -40 || p.y < -20 || p.x > w + 40 || p.y > h + 20) return null;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={`pt-imap__marker is-${r.worst ?? "none"}${r.on ? " is-on" : ""}${r.anchor === "end" ? " is-end" : ""}`}
                      style={{ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }}
                      aria-pressed={r.on}
                      aria-label={`${r.label}: ${r.count} ${r.count === 1 ? "item" : "items"}. ${r.on ? "Showing only this region." : "Filter the feed to this region."}`}
                      onClick={() => onRegion(r.key)}
                    >
                      {r.worst === "breach" && <span className="pt-imap__ping" aria-hidden />}
                      <span className="pt-imap__dot" aria-hidden />
                      <span className="pt-imap__label" aria-hidden>
                        {r.label.toUpperCase()}
                        {r.count > 0 && <span className="pt-dim"> · {r.count}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>,
              m.getCanvasContainer()
            )}
          <button type="button" className="pt-imap__reset" onClick={() => m?.fitBounds(NSW, { padding: FIT, duration: 700 })} title="Show all of NSW" aria-label="Show all of NSW">
            <Maximize size={13} /> NSW
          </button>
          {tilesFailed && <div className="pt-imap__notice pt-imap__notice--soft">Map tiles couldn't load. Regions still filter the feed.</div>}
        </>
      )}
    </div>
  );
}
