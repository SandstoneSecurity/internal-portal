import { useEffect, useRef, useState } from "react";
import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize } from "lucide-react";
import { mapStyle } from "../lib/map/style";
import { useTheme } from "../lib/theme";
import type { IntelItem, Region } from "../../shared/types";
import { intelCategory, intelRegions } from "../../shared/intelligence";

/** New South Wales, with the ACT. */
const NSW: LngLatBoundsLike = [
  [140.95, -37.55],
  [153.65, -28.15],
];

/** Margin around NSW when the whole state is shown. */
const FIT = 36;

/** A real, pannable map of NSW. Drag to move; scroll, pinch or the buttons to zoom. */
export default function IntelMap({ items, regions, selectedId, onSelect }: {
  items: IntelItem[];
  regions: Region[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const { theme } = useTheme();
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
    m.on("error", (e) => {
      // Tiles, labels or the tile index not reachable (offline, blocked).
      if (/fetch|load|status|network|AJAXError/i.test(String((e as { error?: Error }).error?.message ?? e.error))) setTilesFailed(true);
    });
    m.on("data", (e) => {
      if ((e as { dataType?: string }).dataType === "source" && (e as { isSourceLoaded?: boolean }).isSourceLoaded) setTilesFailed(false);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DOM markers survive style changes and are rebuilt when data or filters change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = intelRegions(items, regions).map(({ region, records, opportunities }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pt-imap__marker";
      button.dataset.selected = String(records.some((item) => item.id === selectedId));
      button.textContent = `${region.label} · ${records.length}`;
      button.setAttribute("aria-label", `${region.label}: ${records.length} items, ${opportunities} opportunities. Approximate regional marker.`);

      const content = document.createElement("div");
      content.className = "pt-imap__popup";
      const heading = document.createElement("strong");
      heading.textContent = `${region.label} · regional location only`;
      content.append(heading);
      for (const item of records) {
        const entry = document.createElement("button");
        entry.type = "button";
        entry.textContent = `${intelCategory(item)} · ${item.headline}`;
        entry.addEventListener("click", () => {
          onSelect(item.id);
          popup.remove();
        });
        content.append(entry);
      }
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: "340px" }).setDOMContent(content);
      popup.on("open", () => content.querySelector("button")?.focus());
      const marker = new maplibregl.Marker({ element: button }).setLngLat([region.lng, region.lat]).setPopup(popup).addTo(m);
      return marker;
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [items, regions, selectedId, onSelect]);

  // Day and night palettes follow the portal's theme.
  useEffect(() => {
    if (!map.current || shownTheme.current === theme) return;
    shownTheme.current = theme;
    map.current.setStyle(mapStyle(theme));
  }, [theme]);

  return (
    <div className="pt-imap">
      <div ref={box} className="pt-imap__canvas" role="region" aria-label="Map of New South Wales. Drag to move; scroll or use the zoom buttons to zoom." />
      {noWebGl ? (
        <div className="pt-imap__notice">This browser can't draw the map (WebGL is off).</div>
      ) : (
        <>
          <button type="button" className="pt-imap__reset" onClick={() => map.current?.fitBounds(NSW, { padding: FIT, duration: 700 })} title="Show all of NSW" aria-label="Show all of NSW">
            <Maximize size={13} /> NSW
          </button>
          {tilesFailed && <div className="pt-imap__notice pt-imap__notice--soft">Map tiles couldn't load.</div>}
        </>
      )}
    </div>
  );
}
