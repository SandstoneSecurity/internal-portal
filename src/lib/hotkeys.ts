import { useEffect, useRef } from "react";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard shortcut. `combo` is e.g. "mod+k" (⌘ on Mac, Ctrl elsewhere),
 * "/" or "n". Plain-key shortcuts never fire while typing in a field or when a
 * dialog is open (anything with aria-modal).
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const wantsMod = combo.startsWith("mod+");
    const key = (wantsMod ? combo.slice(4) : combo).toLowerCase();
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      const mod = e.metaKey || e.ctrlKey;
      if (wantsMod !== mod || e.altKey) return;
      if (!wantsMod && (typing(e.target) || document.querySelector("[aria-modal='true']"))) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, enabled]);
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
