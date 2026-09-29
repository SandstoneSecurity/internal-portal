import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_GEOMETRY, tidy, type LevelGeometry } from "../../shared/geometry";
import type { SiteLevel } from "../../shared/types";
import { send } from "./api";
import { usePortalData } from "./DataProvider";

/**
 * Undo history and ordered saving for each level's walls and openings. The
 * portal data stays the source of truth: a change is applied to it at once
 * and saved in the background. Saves for a level run one after another so a
 * slow request can never overwrite a newer one. History lives for the session.
 */
const history = new Map<number, { undo: LevelGeometry[]; redo: LevelGeometry[] }>();
const queues = new Map<number, Promise<unknown>>();
const pending = new Map<number, number>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const HISTORY = 100;

export function useGeometry(level: SiteLevel | null) {
  const { mutate } = usePortalData();
  useSyncExternalStore(subscribe, () => version);
  const id = level?.id ?? -1;
  const geo = level?.geometry ?? EMPTY_GEOMETRY;
  const h = history.get(id) ?? { undo: [], redo: [] };

  const save = useCallback(
    (next: LevelGeometry) => {
      if (!level) return Promise.resolve();
      const clean = tidy(next);
      pending.set(level.id, (pending.get(level.id) ?? 0) + 1);
      notify();
      const run = (queues.get(level.id) ?? Promise.resolve()).catch(() => undefined).then(() => send("PUT", `/levels/${level.id}/geometry`, clean));
      queues.set(level.id, run);
      return mutate(
        (d) => ({ ...d, sites: d.sites.map((s) => (s.id !== level.siteId ? s : { ...s, levels: s.levels.map((l) => (l.id === level.id ? { ...l, geometry: clean } : l)) })) }),
        () => run
      ).finally(() => {
        pending.set(level.id, (pending.get(level.id) ?? 1) - 1);
        notify();
      });
    },
    [level, mutate]
  );

  /** Applies a change and records the previous state for undo. */
  const commit = useCallback(
    (next: LevelGeometry) => {
      if (!level) return Promise.resolve();
      const rec = history.get(level.id) ?? { undo: [], redo: [] };
      rec.undo = [...rec.undo.slice(-(HISTORY - 1)), level.geometry];
      rec.redo = [];
      history.set(level.id, rec);
      return save(next);
    },
    [level, save]
  );

  const undo = useCallback(() => {
    if (!level) return;
    const rec = history.get(level.id);
    const prev = rec?.undo.pop();
    if (!rec || !prev) return;
    rec.redo.push(level.geometry);
    void save(prev);
  }, [level, save]);

  const redo = useCallback(() => {
    if (!level) return;
    const rec = history.get(level.id);
    const next = rec?.redo.pop();
    if (!rec || !next) return;
    rec.undo.push(level.geometry);
    void save(next);
  }, [level, save]);

  return { geo, commit, undo, redo, canUndo: h.undo.length > 0, canRedo: h.redo.length > 0, saving: (pending.get(id) ?? 0) > 0 };
}

export type GeometryApi = ReturnType<typeof useGeometry>;
