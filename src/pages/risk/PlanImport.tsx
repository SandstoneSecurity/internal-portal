import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Layers, X } from "lucide-react";
import { newId } from "../../../shared/geometry";
import type { ClientSite, SiteLevel } from "../../../shared/types";
import { Modal } from "../../components/ui/Overlay";
import { useToast } from "../../components/ui/Toast";
import { putPlan, send } from "../../lib/api";
import { usePortalData } from "../../lib/DataProvider";
import { MAX_PAGES, cropBlob, findCandidates, levelsOnSheet, readSheets, toGeometry, type Candidate, type Sheet } from "../../lib/planImport";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Largest edge a plan is stored at (matches single uploads). */
const PLAN_EDGE = 3200;

export type ImportSource = { kind: "file"; file: File } | { kind: "plan"; url: string; name: string };

/**
 * Reads an uploaded drawing and, when it shows more than one level (pages of
 * a PDF, or plans side by side on one sheet), offers to make each its own
 * level: named from the drawing's titles, ordered bottom to top, cropped, and
 * with the walls found already in place. A drawing with one plan is simply
 * uploaded to the current level.
 */
export function PlanImport({ site, level, source, onClose }: { site: ClientSite; level: SiteLevel; source: ImportSource; onClose: () => void }) {
  const { refresh } = usePortalData();
  const toast = useToast();
  const [status, setStatus] = useState("Reading the drawing…");
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [walls, setWalls] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState(1);
  const sheets = useRef<Sheet[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let read: { sheets: Sheet[]; pages: number };
        if (source.kind === "file") {
          read = await readSheets(source.file, PLAN_EDGE, (n, of) => live && setStatus(of > 1 ? `Reading page ${n} of ${of}…` : "Reading the drawing…"));
        } else {
          const img = new Image();
          img.src = source.url;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d")!.drawImage(img, 0, 0);
          read = { sheets: [{ canvas: c, labels: [], page: 1 }], pages: 1 };
        }
        if (!live) return;
        sheets.current = read.sheets;
        setPages(read.pages);
        const all = await findCandidates(read.sheets, (n, of) => live && setStatus(of > 1 ? `Looking for plans on page ${n} of ${of}…` : "Looking for plans…"));
        if (!live) return;
        // Pages are levels; plans side by side on one sheet only when they look like floors, not separate buildings.
        const found = read.sheets.length > 1 ? all : levelsOnSheet(all);
        if (found.length <= 1 && read.sheets.length === 1) {
          if (source.kind === "file") await uploadWhole();
          else toast({ title: "Only one plan on this sheet", desc: "Nothing to split.", kind: "info" });
          onClose();
          return;
        }
        setItems([...found].sort((a, b) => (a.rank ?? 1000 + a.sheet) - (b.rank ?? 1000 + b.sheet)));
      } catch (err) {
        if (!live) return;
        toast({ title: "Couldn't read that drawing", desc: (err as Error).message, kind: "breach" });
        onClose();
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One plan: the whole first sheet goes onto the current level, as before. */
  const uploadWhole = async () => {
    const s = sheets.current[0]!;
    const { blob, w, h } = await cropBlob(s.canvas, [0, 0, s.canvas.width, s.canvas.height]);
    await putPlan(level.id, blob, w, h, fileName(0));
    await refresh();
    toast({
      title: "Floor plan uploaded",
      desc: pages > 1 ? `Used page 1 of ${pages}.` : level.scaleSet ? `${level.name} · ${w}×${h}` : "Next: set the scale by measuring a wall you know the length of.",
      kind: "secure",
    });
  };

  const fileName = (i: number) => {
    const base = source.kind === "file" ? source.file.name.replace(/\.[^.]+$/, "") : source.name;
    return `${base}${i ? `-${i + 1}` : ""}`;
  };

  const chosen = items?.filter((c) => c.include) ?? [];

  const create = async () => {
    if (!items || !chosen.length) return;
    setBusy(true);
    try {
      // Match titles to levels the site already has; the first unmatched plan takes the current level.
      const byName = new Map(site.levels.map((l) => [l.name.trim().toLowerCase(), l]));
      const used = new Set<number>();
      const plan = chosen.map((c) => {
        const same = byName.get(c.name.trim().toLowerCase());
        if (same && !used.has(same.id)) {
          used.add(same.id);
          return { c, target: same as SiteLevel | null };
        }
        return { c, target: null as SiteLevel | null };
      });
      const free = plan.find((p) => !p.target);
      if (free && !used.has(level.id)) {
        free.target = level;
        used.add(level.id);
      }
      const base = Math.min(...site.levels.map((l) => l.order), 0);
      for (const [i, { c, target }] of plan.entries()) {
        setStatus(`Creating ${c.name} (${i + 1} of ${plan.length})…`);
        const sheet = sheets.current[c.sheet]!;
        const { blob, w, h } = await cropBlob(sheet.canvas, c.box);
        // Scale: from this sheet's doors, else the current level's width across the sheet.
        const mPerPx = c.pxPerM ? 1 / c.pxPerM : level.widthM / sheet.canvas.width;
        const widthM = Math.max(2, Math.min(2000, Math.round(w * mPerPx * 100) / 100));
        let id = target?.id;
        if (!id) {
          const r = await send<{ id: number }>("POST", `/sites/${site.id}/levels`, { name: c.name.slice(0, 40), order: base + i, heightM: 3.6, widthM });
          id = r.id;
        } else {
          await send("PATCH", `/levels/${id}`, { name: c.name.slice(0, 40), order: base + i, widthM, scaleSet: false });
        }
        await putPlan(id, blob, w, h, `${fileName(0)}-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
        if (walls && c.detected.walls.length) await send("PUT", `/levels/${id}/geometry`, toGeometry(c.detected, w, h, mPerPx, newId));
      }
      await refresh();
      toast({ title: `${plan.length} levels set up from the drawing`, desc: "Check each level's scale by measuring a known wall.", kind: "secure" });
      onClose();
    } catch (err) {
      await refresh();
      toast({ title: "Couldn't finish setting up the levels", desc: (err as Error).message, kind: "breach" });
      setBusy(false);
    }
  };

  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      if (!list) return list;
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const patch = (id: string, p: Partial<Candidate>) => setItems((list) => list?.map((c) => (c.id === id ? { ...c, ...p } : c)) ?? list);
  const replacesCurrent = !!(level.plan || level.geometry.walls.length);

  return (
    <Modal open onClose={busy ? () => undefined : onClose} label="Levels in this drawing" className="pt-tp pt-pi">
      <header className="pt-tp__head">
        <div className="pt-tp__title">
          <div className="pt-eyebrow">Floor plans</div>
          <h2>{items ? `This drawing shows ${items.length} plans` : "Reading the drawing"}</h2>
          {items && (
            <p>
              Each ticked plan becomes a level, named and ordered from the titles on the drawing. Check the names and order (bottom floor first), then create them.
              {pages > MAX_PAGES ? ` Only the first ${MAX_PAGES} of ${pages} pages were read.` : ""}
            </p>
          )}
        </div>
        {!busy && (
          <button className="pt-iconbtn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        )}
      </header>
      <div className="pt-tp__body">
        {!items || busy ? (
          <div className="pt-pi__status" aria-live="polite">
            <span className="pt-pi__spinner" aria-hidden />
            {status}
          </div>
        ) : (
          <ol className="pt-pi__list">
            {items.map((c, i) => (
              <li key={c.id} className={`pt-pi__item${c.include ? "" : " is-off"}`}>
                <label className="pt-pi__thumb">
                  <img src={c.thumb} alt={`Plan ${i + 1}`} />
                </label>
                <div className="pt-pi__fields">
                  <label className="pt-pi__check">
                    <input type="checkbox" checked={c.include} onChange={(e) => patch(c.id, { include: e.target.checked })} />
                    <span>Include</span>
                  </label>
                  <input className="pt-bi-text pt-pi__name" value={c.name} maxLength={40} onChange={(e) => patch(c.id, { name: e.target.value })} aria-label={`Name for plan ${i + 1}`} />
                  <span className="pt-meta">
                    {pages > 1 ? `Page ${c.sheet + 1} · ` : ""}
                    {count(c.detected.walls.length, "wall")} · {count(c.detected.openings.filter((o) => o.kind !== "window").length, "door")} ·{" "}
                    {count(c.detected.openings.filter((o) => o.kind === "window").length, "window")}
                    {c.rank === null ? " · no level title found" : ""}
                  </span>
                  {c.note && <span className="pt-pi__note">{c.note}</span>}
                </div>
                <span className="pt-pi__order">
                  <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move to a lower level">
                    <ArrowUp size={13} />
                  </button>
                  <span className="pt-mono">{String(i + 1).padStart(2, "0")}</span>
                  <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move to a higher level">
                    <ArrowDown size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {items && !busy && (
        <footer className="pt-tp__foot">
          <label className="pt-pl-check">
            <input type="checkbox" checked={walls} onChange={(e) => setWalls(e.target.checked)} /> Add the walls, doors and windows found
          </label>
          <span className="pt-tp__actions">
            {source.kind === "file" && (
              <button
                className="sds-btn sds-btn--md sds-btn--ghost"
                onClick={() => {
                  setBusy(true);
                  void uploadWhole().then(onClose);
                }}
              >
                Use as one plan
              </button>
            )}
            <button className="sds-btn sds-btn--md sds-btn--primary" disabled={!chosen.length} onClick={() => void create()}>
              <Layers size={14} /> Create {chosen.length} {chosen.length === 1 ? "level" : "levels"}
            </button>
          </span>
          {replacesCurrent && <span className="pt-meta pt-pi__warn">A plan titled like an existing level replaces that level's plan and walls; otherwise the first replaces {level.name}'s.</span>}
        </footer>
      )}
    </Modal>
  );
}
