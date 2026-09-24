import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { layoutTween } from "../lib/motion";

/** Finds the drop column under the pointer: any element carrying data-drop="<value>". */
function dropAt(e: MouseEvent | TouchEvent | PointerEvent): string | null {
  const p = "changedTouches" in e ? e.changedTouches[0] : e;
  if (!p) return null;
  for (const el of document.elementsFromPoint(p.clientX, p.clientY)) {
    const v = (el as HTMLElement).dataset?.drop;
    if (v !== undefined) return v;
  }
  return null;
}

/**
 * A card you can pick up and drop on another column. Columns mark themselves
 * with data-drop. The card glides to its new slot via a shared layout id —
 * a weighted tween, never a spring. Click (without dragging) or Enter opens it.
 */
export function DragCard({
  id,
  className,
  onDrop,
  onHover,
  onOpen,
  label,
  children,
}: {
  id: string;
  className: string;
  onDrop: (target: string) => void;
  onHover: (target: string | null) => void;
  onOpen: () => void;
  label: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);
  return (
    <motion.div
      layoutId={id}
      layout="position"
      transition={layoutTween}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.08}
      whileDrag={{ zIndex: 60, cursor: "grabbing" }}
      onDragStart={() => {
        dragged.current = true;
        setDragging(true);
      }}
      onDrag={(e) => onHover(dropAt(e))}
      onDragEnd={(e) => {
        setDragging(false);
        onHover(null);
        const target = dropAt(e);
        if (target !== null) onDrop(target);
        window.setTimeout(() => (dragged.current = false), 0);
      }}
      onClick={() => {
        if (!dragged.current) onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      data-record={id}
      aria-label={label}
      className={`${className}${dragging ? " pt-card--dragging" : ""}`}
    >
      {children}
    </motion.div>
  );
}
