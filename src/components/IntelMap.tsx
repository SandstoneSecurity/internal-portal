import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize, X } from "lucide-react";
import type { StatusKind } from "../../shared/types";
import { intelKind } from "../lib/intel";
import { mapStyle } from "../lib/map/style";
import { useTheme } from "../lib/theme";

/** New South Wales, with the ACT. */
const NSW: LngLatBoundsLike = [
  [140.95, -37.55],
  [153.65, -28.15],
];

/** Margin around NSW when the whole state is shown. */
const FIT = 36;
/** Pins closer than this (px) fan out around their shared spot so each stays clickable. */
const CROWD = 16;

export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  kind: StatusKind;
  title: string;
}

/**
 * A real, pannable map of NSW with a pin for each feed item. Drag to move; scroll, pinch or the buttons
 * to zoom. `focus` brings an item's pin into view (bump `n` to repeat). While `placing`, a click on the
 * map reports where.
 */
export default function IntelMap({
  pins,
  selectedId,
  onSelect,
  focus,
  placing,
  onPlace,
  onCancelPlace,
}: {
  pins: MapPin[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focus: { id: number | null; n: number };
  placing: string | null;
  onPlace: (lat: number, lng: number) => void;
  onCancelPlace: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const { theme } = useTheme();
  const [, setFrame] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);
  const shownTheme = useRef(theme);
  const place = useRef({ placing, onPlace });
  place.current = { placing, onPlace };

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
    // Pins are drawn over the canvas and follow it.
    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrame((f) => f + 1));
    };
    m.on("move", redraw);
    m.on("resize", redraw);
    m.on("load", redraw);
    m.on("click", (e) => {
      if (place.current.placing) place.current.onPlace(e.lngLat.lat, e.lngLat.lng);
    });
    m.on("error", (e) => {
      // Tiles, labels or the tile index not reachable (offline, blocked): the pins still work.
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

  // Bring a pin into view: pan only if it's off screen or hard to make out.
  useEffect(() => {
    const m = map.current;
    if (!m || focus.n === 0) return;
    const pin = pins.find((p) => p.id === focus.id);
    if (!pin) return;
    const p = m.project([pin.lng, pin.lat]);
    const c = m.getContainer();
    const inside = p.x > 40 && p.y > 40 && p.x < c.clientWidth - 40 && p.y < c.clientHeight - 40;
    if (!inside) m.easeTo({ center: [pin.lng, pin.lat], duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.n]);

  useEffect(() => {
    if (!placing) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancelPlace();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [placing, onCancelPlace]);

  const m = map.current;
  const w = box.current?.clientWidth ?? 0;
  const h = box.current?.clientHeight ?? 0;

  // Project, then fan out pins that land on top of each other.
  const placed: { pin: MapPin; x: number; y: number }[] = [];
  if (m) {
    const pts = pins.map((pin) => ({ pin, ...m.project([pin.lng, pin.lat]) }));
    const groups: (typeof pts)[] = [];
    for (const p of pts) {
      const g = groups.find((g) => Math.hypot(g[0]!.x - p.x, g[0]!.y - p.y) < CROWD);
      if (g) g.push(p);
      else groups.push([p]);
    }
    for (const g of groups) {
      const r = g.length > 1 ? 10 + 2.5 * g.length : 0;
      g.forEach((p, i) => {
        const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
        placed.push({ pin: p.pin, x: g[0]!.x + r * Math.cos(a), y: g[0]!.y + r * Math.sin(a) });
      });
    }
  }
  // The selected pin draws last, on top.
  placed.sort((a, b) => Number(a.pin.id === selectedId) - Number(b.pin.id === selectedId));

  return (
    <div className={`pt-imap${placing ? " is-placing" : ""}`}>
      <div ref={box} className="pt-imap__canvas" role="region" aria-label="Map of New South Wales. Drag to move; scroll or use the zoom buttons to zoom." />
      {noWebGl ? (
        <div className="pt-imap__notice">This browser can't draw the map (WebGL is off). The feed still lists every item.</div>
      ) : (
        <>
          {/* Inside the map's own element, so a drag or scroll that starts on a pin still moves the map. */}
          {m &&
            createPortal(
              <div className="pt-imap__pins">
                {placed.map(({ pin, x, y }) => {
                  if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return null;
                  const k = intelKind(pin.kind);
                  const Icon = k.icon;
                  const on = pin.id === selectedId;
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      className={`pt-imap__pin is-${pin.kind}${on ? " is-on" : ""}`}
                      style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
                      title={`${k.label} · ${pin.title}`}
                      aria-label={`${k.label}: ${pin.title}`}
                      aria-pressed={on}
                      onClick={() => !placing && onSelect(pin.id)}
                    >
                      {pin.kind === "breach" && <span className="pt-imap__ping" aria-hidden />}
                      <span className="pt-imap__shape" aria-hidden />
                      <Icon size={12} strokeWidth={2.25} aria-hidden />
                    </button>
                  );
                })}
              </div>,
              m.getCanvasContainer()
            )}
          <button type="button" className="pt-imap__reset" onClick={() => m?.fitBounds(NSW, { padding: FIT, duration: 700 })} title="Show all of NSW" aria-label="Show all of NSW">
            <Maximize size={13} /> NSW
          </button>
          {placing && (
            <div className="pt-imap__placing" role="status">
              <span>
                Click the map where <b>{placing}</b> happened
              </span>
              <button type="button" className="pt-iconbtn pt-iconbtn--sm" onClick={onCancelPlace} aria-label="Cancel">
                <X size={13} />
              </button>
            </div>
          )}
          {tilesFailed && <div className="pt-imap__notice pt-imap__notice--soft">Map tiles couldn't load.</div>}
        </>
      )}
    </div>
  );
}
