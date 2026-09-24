import { motion } from "motion/react";
import { usePortal } from "../lib/DataProvider";
import { dayMonth, initialsOf, relativeTime } from "../lib/format";
import { list, row } from "../lib/motion";
import { Empty } from "./ui/Bits";
import { Drawer } from "./ui/Overlay";

const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });

/** The record every change leaves: who, when, what — newest first, grouped by day. */
export function ActivityLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { audit, today } = usePortal();
  const groups: { day: string; entries: typeof audit }[] = [];
  for (const a of audit) {
    const day = dayOf.format(new Date(a.at));
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.entries.push(a);
    else groups.push({ day, entries: [a] });
  }
  const label = (day: string) => (day === today ? "Today" : dayMonth(day));

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Audit" title="Activity log" width={460}>
      {audit.length === 0 ? (
        <Empty index="00" title="Nothing recorded yet." body="Every change made in the portal — who made it and when — is kept here." compact />
      ) : (
        <motion.div variants={list} initial="initial" animate="animate">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="pt-log__day">{label(g.day)}</div>
              {g.entries.map((a) => (
                <motion.div key={a.id} variants={row} className="pt-log__row">
                  <span className="pt-log__time">{relativeTime(a.at).replace(" ago", "")}</span>
                  <div>
                    <div className="pt-log__summary">{a.summary}</div>
                    <div className="pt-log__by">
                      <span className="pt-owner">{initialsOf(a.actor)}</span>
                      {a.actor}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ))}
        </motion.div>
      )}
    </Drawer>
  );
}
