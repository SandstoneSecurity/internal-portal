import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchPortalData, type PortalDataBundle } from "./api";

interface DataState {
  data: PortalDataBundle | null;
  loading: boolean;
  error: string | null;
}

const DataContext = createContext<DataState>({ data: null, loading: true, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchPortalData()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function usePortalData(): DataState {
  return useContext(DataContext);
}
