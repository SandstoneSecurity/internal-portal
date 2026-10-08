import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CaseDetail, CaseEvent } from "../../../shared/investigations";
import { mapStyle } from "../../lib/map/style";
import { useTheme } from "../../lib/theme";

const ms = (t: string) => Date.parse(`${t}:00Z`);
const fmt = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

/**
 * Where and when: each located event as a numbered pin in time order, with the documented movements
 * joined up. The window narrows the map to a stretch of time, so you can watch the case unfold.
 */
export default function CaseMap({ d, onOpen }: { d: CaseDetail; onOpen: (e: CaseEvent) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);

  const located = useMemo(() => d.events.filter((e) => e.lat !== null && e.lng !== null).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [d.events]);
  const t0 = located.length ? ms(located[0]!.startsAt) : 0;
  const t1 = located.length ? Math.max(...located.map((e) => ms(e.endsAt ?? e.startsAt))) : 0;
  const [win, setWin] = useState<[number, number]>([t0, t1]);
  useEffect(() => setWin([t0, t1]), [t0, t1]);
  const shown = located.filter((e) => ms(e.endsAt ?? e.startsAt) >= win[0] && ms(e.startsAt) <= win[1]);

  useEffect(() => {
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: box.current!,
        style: mapStyle(theme),
        bounds: [
          [140.95, -37.55],
          [153.65, -28.15],
        ],
        fitBoundsOptions: { padding: 30 },
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      });
    } catch {
      setNoWebGl(true);
      return;
    }
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const addPath = () => {
      if (m.getSource("path")) return;
      m.addSource("path", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "path", type: "line", source: "path", paint: { "line-color": "#96774C", "line-width": 2, "line-dasharray": [2, 1.5] } });
      setReady(true);
    };
    m.on("load", addPath);
    m.on("styledata", () => m.isStyleLoaded() && addPath());
    map.current = m;
    return () => {
      for (const k of markers.current) k.remove();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map.current) {
      setReady(false);
      map.current.setStyle(mapStyle(theme));
    }
  }, [theme]);

  // Pins and path for the events in the window.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const k of markers.current) k.remove();
    markers.current = shown.map((e) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `pt-cmap__pin is-${e.basis.toLowerCase()}`;
      el.textContent = String(located.indexOf(e) + 1);
      el.title = `${e.startsAt.replace("T", " ")} · ${e.basis} · ${e.title}${e.place ? ` · ${e.place}` : ""}${e.located === "suburb" ? " (placed at the suburb)" : ""}`;
      el.setAttribute("aria-label", el.title);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onOpen(e);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([e.lng!, e.lat!]).addTo(m);
    });
    const path = shown.filter((e) => e.basis === "Documented");
    (m.getSource("path") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: path.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path.map((e) => [e.lng!, e.lat!]) } }] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((e) => e.id).join(), ready]);

  // Frame what's on the map when the case loads.
  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || framed.current || !located.length) return;
    framed.current = true;
    const b = new maplibregl.LngLatBounds();
    for (const e of located) b.extend([e.lng!, e.lat!]);
    m.fitBounds(b, { padding: 70, maxZoom: 14, duration: 0 });
  }, [located]);

  return (
    <div className="pt-cmap">
      <div className="pt-cmap__map">
        <div ref={box} className="pt-cmap__canvas" role="region" aria-label="Map of the case's events" />
        {noWebGl && <div className="pt-imap__notice">This browser can't draw the map (WebGL is off).</div>}
        {!located.length && <div className="pt-cmap__none">Events with a suburb, address or coordinates appear here.</div>}
        <div className="pt-cmap__legend" aria-hidden>
          <span>
            <i className="pt-cmap__key is-documented" /> documented
          </span>
          <span>
            <i className="pt-cmap__key is-claimed" /> claimed
          </span>
          <span>
            <i className="pt-cmap__key is-path" /> documented movements
          </span>
        </div>
      </div>
      {located.length > 1 && t1 > t0 && (
        <div className="pt-cmap__time">
          <div className="pt-cmap__range">
            <label>
              <span>From</span>
              <input type="range" min={t0} max={t1} step={60_000} value={win[0]} onChange={(e) => setWin([Math.min(Number(e.target.value), win[1]), win[1]])} aria-label="Window start" />
              <b>{fmt(win[0])}</b>
            </label>
            <label>
              <span>To</span>
              <input type="range" min={t0} max={t1} step={60_000} value={win[1]} onChange={(e) => setWin([win[0], Math.max(Number(e.target.value), win[0])])} aria-label="Window end" />
              <b>{fmt(win[1])}</b>
            </label>
          </div>
          <span className="pt-dim">
            {shown.length} of {located.length} located events
          </span>
          {(win[0] !== t0 || win[1] !== t1) && (
            <button className="pt-addlink" onClick={() => setWin([t0, t1])}>
              Show all
            </button>
          )}
        </div>
      )}
      <p className="pt-cmap__note">Map only what was public, consented or otherwise lawfully obtained. Pins placed from a suburb are approximate.</p>
    </div>
  );
}
