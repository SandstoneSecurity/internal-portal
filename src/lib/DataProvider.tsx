import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PortalData } from "../../shared/types";
import { fetchPortal } from "./api";

interface DataState {
  data: PortalData | null;
  loading: boolean;
  error: string | null;
  /** Re-reads everything from the Worker. Resolves once the new data is in state. */
  refresh: () => Promise<void>;
  /**
   * Applies `optimistic` to the local copy immediately, runs `commit`, then refreshes.
   * If `commit` throws, the local copy is rolled back and the error rethrown.
   */
  mutate: (optimistic: (d: PortalData) => PortalData, commit: () => Promise<unknown>) => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<PortalData | null>(null);
  latest.current = data;

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPortal();
      setData(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const mutate = useCallback<DataState["mutate"]>(
    async (optimistic, commit) => {
      const before = latest.current;
      if (before) setData(optimistic(before));
      try {
        await commit();
      } catch (err) {
        if (before) setData(before);
        throw err;
      }
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
    // Keep a long-open control room current: refetch when the tab comes back.
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return <DataContext.Provider value={{ data, loading, error, refresh, mutate }}>{children}</DataContext.Provider>;
}

export function usePortalData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("usePortalData outside DataProvider");
  return ctx;
}

/** For pages rendered inside the loaded shell, where data is guaranteed. */
export function usePortal(): PortalData {
  const { data } = usePortalData();
  if (!data) throw new Error("usePortal before data loaded");
  return data;
}
