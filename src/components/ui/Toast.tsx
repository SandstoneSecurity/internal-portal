import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { tween, DUR } from "../../lib/motion";

type ToastKind = "secure" | "advisory" | "breach" | "info";
interface ToastItem {
  id: number;
  title: string;
  desc?: string;
  kind: ToastKind;
}

const ToastContext = createContext<((t: Omit<ToastItem, "id" | "kind"> & { kind?: ToastKind }) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, "id" | "kind"> & { kind?: ToastKind }) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-3), { id, kind: "secure", ...t }]);
      window.setTimeout(() => dismiss(id), t.kind === "breach" ? 7000 : 4200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pt-toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout="position"
              className={`pt-toast pt-toast--${t.kind}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}
              exit={{ opacity: 0, x: 16, transition: tween(DUR.fast) }}
            >
              <div className="pt-toast__body">
                <div className="pt-toast__title">{t.title}</div>
                {t.desc && <div className="pt-toast__desc">{t.desc}</div>}
              </div>
              <button className="pt-iconbtn pt-iconbtn--inverse" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
