import { useRef, useState } from "react";
import { DoorOpen, Hand, Package, Square, Upload } from "lucide-react";
import type { ClientSite, SiteLevel, TmElement } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { hueClass, type Hue } from "../../lib/hues";

export type Tool = "select" | "zone" | "asset" | "entry";
const TOOLS: { key: Tool; label: string; icon: typeof Hand; hint: string }[] = [
  { key: "select", label: "Select", icon: Hand, hint: "Drag to move; click to inspect" },
  { key: "zone", label: "Zone", icon: Square, hint: "Drag a rectangle to draw a zone" },
  { key: "asset", label: "Asset", icon: Package, hint: "Click where the asset is" },
  { key: "entry", label: "Entry", icon: DoorOpen, hint: "Click an entry point: door, gate, dock" },
];

export const ZONE_HUE: Record<string, Hue> = { Public: "euc", Reception: "harbour", Operational: "ochre", Restricted: "jacaranda", Secure: "clay" };
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function PlanView({
  site,
  level,
  elements,
  risk,
  selected,
  onSelect,
}: {
  site: ClientSite;
  level: SiteLevel | null;
  elements: TmElement[];
  /** Rating hue for each element with scenarios aimed at it. */
  risk: Map<number, Hue>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const t = useThreatActions();
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; dx: number; dy: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const plan = level?.plan ?? null;
  const aspect = plan ? plan.w / plan.h : 16 / 10;
  const onLevel = elements.filter((e) => (level ? e.levelId === level.id : true) && e.x != null && e.y != null);

  const at = (e: React.PointerEvent | PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const upload = async (f: File | undefined) => {
    if (!f || !level) return;
    setBusy(true);
    await t.uploadPlan(level, f);
    setBusy(false);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = at(e);
    if (tool === "zone") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool === "asset" || tool === "entry") {
      t.addElement(site, tool, { levelId: level?.id ?? null, x: p.x, y: p.y, zoneId: zoneAt(p.x, p.y)?.id ?? null });
      setTool("select");
    } else onSelect(null);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = at(e);
    if (draft) setDraft({ ...draft, x1: p.x, y1: p.y });
    else if (drag) setDrag({ ...drag, x: clamp(p.x - drag.dx), y: clamp(p.y - drag.dy) });
  };
  const onUp = () => {
    if (draft) {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      setDraft(null);
      if (w > 0.02 && h > 0.02) {
        t.addElement(site, "zone", { levelId: level?.id ?? null, x, y, w, h });
        setTool("select");
      }
    }
    if (drag) {
      const el = elements.find((k) => k.id === drag.id)!;
      if (Math.abs((el.x ?? 0) - drag.x) > 0.002 || Math.abs((el.y ?? 0) - drag.y) > 0.002) {
        // Dropping an asset or entry inside another zone moves it into that zone.
        const zone = el.kind === "zone" ? undefined : zoneAt(drag.x, drag.y);
        void t.placeElement(el, { x: drag.x, y: drag.y, ...(zone && zone.id !== el.zoneId ? { zoneId: zone.id } : {}) });
      }
      setDrag(null);
    }
  };
  const zoneAt = (x: number, y: number) =>
    onLevel
      .filter((z) => z.kind === "zone" && z.w && z.h && x >= z.x! && x <= z.x! + z.w && y >= z.y! && y <= z.y! + z.h)
      .sort((a, b) => a.w! * a.h! - b.w! * b.h!)[0];

  const startDrag = (e: React.PointerEvent, el: TmElement) => {
    // With a drawing tool active, clicks go through to the canvas: you can place inside a zone.
    if (tool !== "select") return;
    e.stopPropagation();
    onSelect(el.id);
    const p = at(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id: el.id, dx: p.x - (el.x ?? 0), dy: p.y - (el.y ?? 0), x: el.x ?? 0, y: el.y ?? 0 });
  };
  const pos = (el: TmElement) => (drag?.id === el.id ? { x: drag.x, y: drag.y } : { x: el.x ?? 0, y: el.y ?? 0 });

  return (
    <div className="pt-risk-plan">
      <div className="pt-risk-plan__tools" role="toolbar" aria-label="Plan tools">
        {TOOLS.map(({ key, label, icon: Icon, hint }) => (
          <button key={key} className={`pt-risk-tool${tool === key ? " is-on" : ""}`} aria-pressed={tool === key} title={hint} onClick={() => setTool(key)}>
            <Icon size={14} /> {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {level && (
          <>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
            <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => file.current?.click()} disabled={busy}>
              <Upload size={14} /> {plan ? "Replace plan" : "Upload plan"}
            </button>
            {plan && (
              <button className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link" onClick={() => void t.removePlan(level)}>
                Remove
              </button>
            )}
          </>
        )}
      </div>
      <p className="pt-risk-plan__hint pt-meta">{TOOLS.find((x) => x.key === tool)!.hint}</p>
      {!plan && (
        <div className="pt-risk-plan__drop">
          {busy ? "Uploading…" : "No floor plan for this level yet. Drop a PNG, JPEG or WebP here, use Upload plan, or model on the grid."}
        </div>
      )}
      <div
        className={`pt-risk-plan__stage${plan ? "" : " is-blank"}${over ? " is-over" : ""} pt-risk-plan__stage--${tool}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
      >
        <div
          ref={box}
          className="pt-risk-plan__canvas"
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-testid="plan-canvas"
        >
          {plan ? <img className="pt-risk-plan__img" src={`/api/plans/${plan.fileId}`} alt={`${level?.name} floor plan`} draggable={false} /> : null}
          {onLevel
            .filter((z) => z.kind === "zone")
            .map((z) => {
              const p = pos(z);
              return (
                <div
                  key={z.id}
                  className={`pt-risk-zone ${hueClass(ZONE_HUE[z.subtype] ?? "slate")}${selected === z.id ? " is-sel" : ""}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${(z.w ?? 0.1) * 100}%`, height: `${(z.h ?? 0.1) * 100}%` }}
                  onPointerDown={(e) => startDrag(e, z)}
                  data-el={z.id}
                >
                  <span className="pt-risk-zone__label">{z.name}</span>
                </div>
              );
            })}
          {onLevel
            .filter((e) => e.kind !== "zone")
            .map((e) => {
              const p = pos(e);
              const hue = risk.get(e.id);
              return (
                <button
                  key={e.id}
                  className={`pt-risk-mark pt-risk-mark--${e.kind} ${hueClass(hue ?? (e.kind === "entry" ? "harbour" : "slate"))}${selected === e.id ? " is-sel" : ""}${hue ? " is-risk" : ""}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onPointerDown={(ev) => startDrag(ev, e)}
                  onDoubleClick={() => t.editElement(e)}
                  aria-label={`${e.kind === "entry" ? "Entry" : "Asset"}: ${e.name}`}
                  title={e.name}
                  data-el={e.id}
                >
                  <span className="pt-risk-mark__shape" />
                  <span className="pt-risk-mark__label">{e.name}</span>
                </button>
              );
            })}
          {draft && (
            <div
              className="pt-risk-zone pt-risk-zone--draft pt-hue-brass"
              style={{
                left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
