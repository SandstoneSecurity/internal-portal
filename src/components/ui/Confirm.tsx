import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Overlay";

interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} label={opts?.title ?? "Confirm"} className="pt-confirm">
        {opts && (
          <>
            <div className="pt-confirm__body">
              <div className="pt-eyebrow">Confirm</div>
              <h2 className="pt-confirm__title">{opts.title}</h2>
              <div className="pt-confirm__text">{opts.body}</div>
            </div>
            <div className="pt-confirm__foot">
              <button className="sds-btn sds-btn--md sds-btn--ghost" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                data-autofocus
                className={`sds-btn sds-btn--md ${opts.danger ? "sds-btn--danger" : "sds-btn--primary"}`}
                onClick={() => close(true)}
              >
                {opts.confirmLabel}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm outside ConfirmProvider");
  return ctx;
}
