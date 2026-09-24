import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Light is the house default ("limestone"). Night is Sandstone's operations mode
 * — Ironbark grounds for a control room after dark. The choice is remembered
 * per browser; the first visit follows the OS preference.
 */
export type Theme = "light" | "night";

const KEY = "sandstone.theme";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void } | null>(null);

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "night") return stored;
  } catch {
    // Storage blocked; fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "night" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not persisted; still applied for this session.
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "night" : "light")), []);
  return <ThemeContext.Provider value={{ theme, toggle, set: setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
