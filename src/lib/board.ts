import type { OpsCard, OpsColumn } from "../../shared/types";
import { progressOf, type ProgressState } from "./hues";

export interface CardInfo {
  card: OpsCard;
  column: OpsColumn;
  columnIndex: number;
  done: boolean;
  /** Unfinished tasks this one waits on. */
  waitingOn: OpsCard[];
  /** Tasks that wait on this one. */
  blocking: OpsCard[];
  progress: ProgressState;
}

/** Looks up every task with its section, dependency state and progress colour. */
export function indexBoard(columns: OpsColumn[]): Map<number, CardInfo> {
  const base = new Map<number, { card: OpsCard; column: OpsColumn; columnIndex: number; done: boolean }>();
  columns.forEach((column, columnIndex) => column.cards.forEach((card) => base.set(card.id, { card, column, columnIndex, done: column.done })));
  const blocking = new Map<number, OpsCard[]>();
  for (const { card } of base.values())
    for (const pre of card.blockedBy) blocking.set(pre, [...(blocking.get(pre) ?? []), card]);
  const out = new Map<number, CardInfo>();
  for (const [id, b] of base) {
    const waitingOn = b.card.blockedBy.map((p) => base.get(p)).filter((p): p is NonNullable<typeof p> => !!p && !p.done).map((p) => p.card);
    out.set(id, {
      ...b,
      waitingOn,
      blocking: blocking.get(id) ?? [],
      progress: progressOf({ done: b.done, late: b.card.late, waiting: waitingOn.length > 0, columnIndex: b.columnIndex }),
    });
  }
  return out;
}
