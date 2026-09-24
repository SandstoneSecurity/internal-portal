import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DUR, tween } from "../../lib/motion";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Esc to close, Tab kept inside, focus restored to the opener on close. */
function useModalFocus(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // Focus at once so keys typed straight after opening land in the field;
    // retry after a frame in case the panel mounted late.
    const focusFirst = () => {
      const el = panel.current;
      if (!el || el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    };
    focusFirst();
    const t = window.setTimeout(focusFirst, 30);
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog responds (a confirm opened over a drawer, say).
      const stack = document.querySelectorAll('[aria-modal="true"]');
      if (stack[stack.length - 1] !== panel.current) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab" && panel.current) {
        const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, panel]);
}

/** Right-hand sheet for records and forms. */
export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(open, onClose, panel);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="pt-overlay" key="drawer">
          <motion.div
            className="pt-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tween(DUR.base) }}
            exit={{ opacity: 0, transition: tween(DUR.fast) }}
          />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : eyebrow}
            className="pt-drawer"
            style={{ width: `min(${width}px, 100vw)` }}
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: tween(DUR.slow) }}
            exit={{ x: 24, opacity: 0, transition: tween(DUR.base) }}
          >
            <header className="pt-drawer__head">
              <div>
                {eyebrow && <div className="pt-eyebrow">{eyebrow}</div>}
                <h2 className="pt-drawer__title">{title}</h2>
              </div>
              <button className="pt-iconbtn" aria-label="Close" onClick={onClose}>
                <X size={16} />
              </button>
            </header>
            <div className="pt-drawer__body">{children}</div>
            {footer && <footer className="pt-drawer__foot">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Centred dialog — confirmations and the command palette. */
export function Modal({
  open,
  onClose,
  children,
  label,
  className = "",
  top = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  top?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(open, onClose, panel);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`pt-overlay pt-overlay--center${top ? " pt-overlay--top" : ""}`} key="modal">
          <motion.div
            className="pt-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tween(DUR.base) }}
            exit={{ opacity: 0, transition: tween(DUR.fast) }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`pt-modal ${className}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}
            exit={{ opacity: 0, y: 6, transition: tween(DUR.fast) }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
