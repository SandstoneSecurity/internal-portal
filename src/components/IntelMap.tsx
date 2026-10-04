import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl, { type LngLatBoundsLike, type Map as MlMap, type Marker } from "maplibre-gl";
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
 * A real, pannable map of NSW with a pin for each feed item. Pins are MapLibre markers, so they move in
 * the same frame as the map. Drag to move; scroll, pinch or the buttons to zoom. `focus` brings an item's
 * pin into view (bump `n` to repeat). While `placing`, a click on the map reports where.
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
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState<string | null>(null);
  const [noWebGl, setNoWebGl] = useState(false);
  const shownTheme = useRef(theme);
  const latest = useRef({ placing, onPlace, onSelect });
  latest.current = { placing, onPlace, onSelect };
  // One marker per pin, kept across renders; React fills each marker's element through a portal.
  const markers = useRef(new Map<number, { marker: Marker; el: HTMLDivElement }>());
  const [, setMarkerSet] = useState(0);

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
    m.on("click", (e) => {
      if (latest.current.placing) latest.current.onPlace(e.lngLat.lat, e.lngLat.lng);
    });
    m.on("error", (e) => {
      // Only a failed tile or tile index counts; a missing icon or label font doesn't blank the map.
      const ev = e as { sourceId?: string; tile?: unknown; error?: { status?: number; message?: string; url?: string } };
      if (ev.sourceId || ev.tile || /\/api\/map\/planet/.test(ev.error?.url ?? "")) {
        console.warn("Map tiles failed:", ev.error?.status ?? "", ev.error?.message ?? ev.error);
        setTilesFailed(ev.error?.status ? `the tile server answered ${ev.error.status}` : "the tile server couldn't be reached");
      }
    });
    m.on("data", (e) => {
      if ((e as { dataType?: string }).dataType === "source" && (e as { isSourceLoaded?: boolean }).isSourceLoaded) setTilesFailed(null);
    });
    // Fanned-out pins regroup once a zoom settles.
    m.on("zoomend", () => setMarkerSet((n) => n + 1));
    map.current = m;
    setReady(true);
    const ms = markers.current;
    return () => {
      for (const { marker } of ms.values()) marker.remove();
      ms.clear();
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

  // Add, move and remove markers to match the pins; fan out the ones that share a spot.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ms = markers.current;
    const ids = new Set(pins.map((p) => p.id));
    for (const [id, { marker }] of ms) {
      if (!ids.has(id)) {
        marker.remove();
        ms.delete(id);
      }
    }
    let added = false;
    for (const p of pins) {
      let entry = ms.get(p.id);
      if (!entry) {
        const el = document.createElement("div");
        el.className = "pt-imap__marker";
        entry = { marker: new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(m), el };
        ms.set(p.id, entry);
        added = true;
      } else entry.marker.setLngLat([p.lng, p.lat]);
    }
    // Fan out: group by projected position at the current zoom, then offset around the group's spot.
    const pts = pins.map((p) => ({ p, at: m.project([p.lng, p.lat]) }));
    const groups: (typeof pts)[] = [];
    for (const pt of pts) {
      const g = groups.find((g) => Math.hypot(g[0]!.at.x - pt.at.x, g[0]!.at.y - pt.at.y) < CROWD);
      if (g) g.push(pt);
      else groups.push([pt]);
    }
    for (const g of groups) {
      const r = g.length > 1 ? 10 + 2.5 * g.length : 0;
      g.forEach((pt, i) => {
        const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
        const base = g[0]!.at;
        ms.get(pt.p.id)!.marker.setOffset([base.x - pt.at.x + r * Math.cos(a), base.y - pt.at.y + r * Math.sin(a)]);
      });
    }
    if (added) setMarkerSet((n) => n + 1);
  });

  // Bring a pin into view: pan only if it's off screen or near the edge.
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

  // The selected pin sits above the rest.
  useEffect(() => {
    for (const [id, { el }] of markers.current) el.style.zIndex = id === selectedId ? "3" : "";
  });

  return (
    <div className={`pt-imap${placing ? " is-placing" : ""}`}>
      <div ref={box} className="pt-imap__canvas" role="region" aria-label="Map of New South Wales. Drag to move; scroll or use the zoom buttons to zoom." />
      {noWebGl ? (
        <div className="pt-imap__notice">This browser can't draw the map (WebGL is off). The feed still lists every item.</div>
      ) : (
        <>
          {ready &&
            pins.map((pin) => {
              const el = markers.current.get(pin.id)?.el;
              if (!el) return null;
              const k = intelKind(pin.kind);
              const Icon = k.icon;
              const on = pin.id === selectedId;
              return createPortal(
                <button
                  type="button"
                  className={`pt-imap__pin is-${pin.kind}${on ? " is-on" : ""}`}
                  title={`${k.label} · ${pin.title}`}
                  aria-label={`${k.label}: ${pin.title}`}
                  aria-pressed={on}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!latest.current.placing) latest.current.onSelect(pin.id);
                  }}
                >
                  {pin.kind === "breach" && <span className="pt-imap__ping" aria-hidden />}
                  <span className="pt-imap__shape" aria-hidden />
                  <Icon size={12} strokeWidth={2.25} aria-hidden />
                </button>,
                el,
                String(pin.id)
              );
            })}
          <button type="button" className="pt-imap__reset" onClick={() => map.current?.fitBounds(NSW, { padding: FIT, duration: 700 })} title="Show all of NSW" aria-label="Show all of NSW">
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
          {tilesFailed && <div className="pt-imap__notice pt-imap__notice--soft">Map tiles couldn't load: {tilesFailed}.</div>}
        </>
      )}
    </div>
  );
}
