import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A small "i" beside a term that explains it in a sentence or two. Opens on
 * hover or keyboard focus, and on tap for touch screens; Esc or a tap
 * elsewhere closes it.
 */
export function Hint({ text, title, label = "What does this mean?" }: { text: ReactNode; title?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const h = pop.current?.offsetHeight ?? 80;
    const below = r.top < h + 16;
    setPos({ left, top: below ? r.bottom + 8 : r.top - h - 8, below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && (btn.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node))) return;
      setOpen(false);
      setPinned(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`pt-hint${open ? " is-open" : ""}`}
        aria-label={title ? `${label} ${title}` : label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
      >
        i
      </button>
      {open &&
        createPortal(
          <div ref={pop} id={id} role="tooltip" className={`pt-hint__pop${pos?.below ? " is-below" : ""}`} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
            {title && <b>{title}</b>}
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
