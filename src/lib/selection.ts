import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * The selected record lives in the URL (?id=12), so the command palette,
 * toasts and links can deep-link straight to it and Back works as expected.
 */
export function useSelection(key: string): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const set = useCallback(
    (id: number | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (id === null) next.delete(key);
          else next.set(key, String(id));
          return next;
        },
        { replace: true }
      ),
    [key, setParams]
  );
  return [value, set];
}

/** Arrow-key movement through a register; Enter/Space select. */
export function registerKeys(e: React.KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSelect();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const sib = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
  (sib as HTMLElement | null)?.focus();
}
