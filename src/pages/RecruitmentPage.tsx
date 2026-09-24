import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import { CircleCheck, CircleAlert, Plus } from "lucide-react";
import { STAGES } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard } from "../components/DragCard";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu, SectionHead } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { list, row, tween, DUR } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";
import { pad2 } from "../lib/format";

const COLS = "minmax(0,2fr) repeat(5, 76px) 118px 34px";

export function RecruitmentPage() {
  const d = usePortal();
  const actions = useActions();
  const [roleParam, setRole] = useSelection("role");
  const [over, setOver] = useState<string | null>(null);
  const roleId = d.roles.some((r) => r.id === roleParam) ? roleParam : d.roles[0]?.id ?? null;
  const role = d.roles.find((r) => r.id === roleId);
  const pool = d.candidates.filter((c) => c.roleId === roleId);

  if (d.roles.length === 0)
    return (
      <Empty
        index="00"
        title="No open positions."
        body="Post a role to start a pipeline. Candidates move through application, screening, interview, SLED licence check and offer — drag them from stage to stage."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.postRole}>
            Post a role
          </button>
        }
      />
    );

  return (
    <>
      <SectionHead title="Open positions" meta={`${d.roles.length} roles · ${d.candidates.length} candidates`} />
      <div className="pt-reg">
        <div className="pt-reg__head" style={{ gridTemplateColumns: COLS }}>
          <span>Role</span>
          {STAGES.map((s) => (
            <span key={s} style={{ textAlign: "center" }} className="pt-hide-sm">
              {s}
            </span>
          ))}
          <span>Status</span>
          <span />
        </div>
        <motion.div variants={list} initial="initial" animate="animate">
          {d.roles.map((r) => {
            const max = Math.max(1, ...r.counts);
            return (
              <motion.div
                key={r.id}
                variants={row}
                className="pt-reg__row"
                style={{ gridTemplateColumns: COLS }}
                aria-selected={r.id === roleId}
                tabIndex={0}
                onClick={() => setRole(r.id)}
                onKeyDown={(e) => registerKeys(e, () => setRole(r.id))}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="pt-reg__name">{r.title}</div>
                  <div className="pt-reg__sub">{r.meta || "—"}</div>
                </div>
                {r.counts.map((n, i) => (
                  <div key={i} className="pt-funnel pt-hide-sm" title={`${n} at ${STAGES[i]}`}>
                    <span className="pt-funnel__n">{n}</span>
                    <span className="pt-funnel__bar">
                      <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: n / max, transition: tween(DUR.reveal, 0.1 + i * 0.04) }} />
                    </span>
                  </div>
                ))}
                <span>
                  <Badge kind={r.kind} label={r.status} />
                </span>
                <RowMenu
                  items={[
                    { label: "Add candidate", onSelect: () => actions.addCandidate({ roleId: r.id }) },
                    { label: "Edit role", onSelect: () => actions.editRole(r) },
                    { label: "Withdraw role", onSelect: () => void actions.withdrawRole(r), danger: true },
                  ]}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div style={{ marginTop: 40 }}>
        <SectionHead
          title={`Pipeline — ${role?.title ?? ""}`}
          meta={`${pad2(pool.length)} candidates · drag between stages`}
          action={
            <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.addCandidate({ roleId: roleId ?? undefined })}>
              Add candidate
            </button>
          }
        />
        <LayoutGroup>
          <div className="pt-board" style={{ marginTop: 16, gridAutoColumns: "minmax(214px, 1fr)" }}>
            {STAGES.map((label, stage) => {
              const cards = pool.filter((c) => c.stage === stage);
              return (
                <section
                  key={label}
                  className={`pt-col${stage === STAGES.length - 1 ? " pt-col--done" : ""}${over === String(stage) ? " pt-col--over" : ""}`}
                  style={{ borderTopWidth: 1 }}
                  data-drop={stage}
                  aria-label={`${label}, ${cards.length} candidates`}
                >
                  <div className="pt-col__head">
                    <span className="pt-meta" style={{ marginLeft: 0, color: "var(--text-secondary)" }}>
                      {pad2(stage + 1)} · {label}
                    </span>
                    <span className="pt-meta">{pad2(cards.length)}</span>
                    <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Add candidate at ${label}`} onClick={() => actions.addCandidate({ roleId: roleId ?? undefined, stage })}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="pt-col__cards">
                    {cards.map((c) => (
                      <DragCard
                        key={c.id}
                        id={`cand-${c.id}`}
                        label={`${c.name}, ${label}. Drag to another stage, or press Enter to edit.`}
                        className="pt-card"
                        onHover={setOver}
                        onDrop={(t) => void actions.moveCandidate(c, Number(t))}
                        onOpen={() => actions.editCandidate(c)}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                        <div
                          className="pt-mono"
                          style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, color: c.ok ? "var(--status-secure-fg)" : "var(--status-advisory-fg)" }}
                          title={c.ok ? "Licence verified as current" : "Licence needs checking"}
                        >
                          {c.ok ? <CircleCheck size={12} /> : <CircleAlert size={12} />}
                          {c.lic}
                        </div>
                        <div className="pt-card__foot" style={{ marginTop: 10 }}>
                          <span className="pt-card__site" style={{ marginTop: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.source}
                          </span>
                          <span className="pt-mono pt-dim" title="Days at this stage">
                            {c.days}D
                          </span>
                        </div>
                      </DragCard>
                    ))}
                    {cards.length === 0 && <div className="pt-col__drop">No candidates</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
    </>
  );
}
