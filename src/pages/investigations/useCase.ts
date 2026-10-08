import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseDetail } from "../../../shared/investigations";
import { ApiError } from "../../lib/api";
import { usePortalData } from "../../lib/DataProvider";
import { useToast } from "../../components/ui/Toast";

/**
 * One case, loaded on its own (cases can be large and are access-controlled). `act` runs a change, then
 * re-reads the case and the portal so the register's counts follow.
 */
export function useCase(id: number | null) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = usePortalData();
  const toast = useToast();
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (id === null) return;
    const mine = ++seq.current;
    try {
      const res = await fetch(`/api/investigations/${id}`, { credentials: "same-origin" });
      if (!res.ok) throw new ApiError(res.status === 404 ? "This case doesn't exist, or you're not on its access list." : `Couldn't load the case (${res.status}).`, res.status);
      const json = (await res.json()) as CaseDetail;
      if (mine === seq.current) {
        setData(json);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    void reload();
  }, [reload]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, ok?: { title: string; desc?: string }) => {
      try {
        await fn();
        await Promise.all([reload(), refresh()]);
        if (ok) toast({ ...ok, kind: "secure" });
        return true;
      } catch (err) {
        toast({ title: "Change not saved", desc: (err as Error).message, kind: "breach" });
        return false;
      }
    },
    [reload, refresh, toast]
  );

  return { data, error, reload, act };
}
