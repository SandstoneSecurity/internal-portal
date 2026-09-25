import { motion, useDragControls } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { layoutTween } from "../lib/motion";

export interface DropPoint {
  /** The data-drop value of the column under the pointer. */
  target: string;
  /** Insertion index among that column's other cards (0 = top). */
  index: number;
}

/**
 * Finds the drop column under the pointer (any element carrying data-drop)
 * and where in it the card would land, measured against the midpoints of the
 * column's other cards (elements carrying data-card).
 */
function dropAt(e: MouseEvent | TouchEvent | PointerEvent, selfId: string): DropPoint | null {
  const p = "changedTouches" in e ? e.changedTouches[0] : e;
  if (!p) return null;
  for (const el of document.elementsFromPoint(p.clientX, p.clientY)) {
    const target = (el as HTMLElement).dataset?.drop;
    if (target === undefined) continue;
    let index = 0;
    for (const card of el.querySelectorAll<HTMLElement>("[data-card]")) {
      if (card.dataset.card === selfId) continue;
      const r = card.getBoundingClientRect();
      if (r.top + r.height / 2 < p.clientY) index++;
    }
    return { target, index };
  }
  return null;
}

/**
 * A card you can pick up and drop on a column, at a position within it. The
 * card glides to its new slot via a shared layout id — a weighted tween,
 * never a spring. Click (without dragging) or Enter opens it. Anything inside
 * marked data-nodrag (a checkbox, a toggle) stays clickable and never starts a drag.
 */
export function DragCard({
  id,
  className,
  onDrop,
  onHover,
  onOpen,
  onDragState,
  label,
  children,
}: {
  id: string;
  className: string;
  onDrop: (p: DropPoint) => void;
  onHover: (p: DropPoint | null) => void;
  onOpen: () => void;
  onDragState?: (dragging: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);
  const last = useRef<string>("");
  const controls = useDragControls();
  return (
    <motion.div
      layoutId={id}
      layout="position"
      transition={layoutTween}
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.08}
      whileDrag={{ zIndex: 60, cursor: "grabbing", rotate: 1.2, scale: 1.02 }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-nodrag], input, textarea, select")) return;
        controls.start(e);
      }}
      onDragStart={() => {
        dragged.current = true;
        setDragging(true);
        onDragState?.(true);
      }}
      onDrag={(e) => {
        const p = dropAt(e, id);
        const key = p ? `${p.target}:${p.index}` : "";
        if (key !== last.current) {
          last.current = key;
          onHover(p);
        }
      }}
      onDragEnd={(e) => {
        setDragging(false);
        onDragState?.(false);
        onHover(null);
        last.current = "";
        const p = dropAt(e, id);
        if (p) onDrop(p);
        window.setTimeout(() => (dragged.current = false), 0);
      }}
      onClick={() => {
        if (!dragged.current) onOpen();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      data-record={id}
      data-card={id}
      aria-label={label}
      className={`${className}${dragging ? " is-dragging" : ""}`}
    >
      {children}
    </motion.div>
  );
}
