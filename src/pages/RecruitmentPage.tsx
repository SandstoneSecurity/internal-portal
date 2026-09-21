import { useState } from "react";
import { usePortalData } from "../lib/DataProvider";
import { statusColors } from "../lib/status";

const STAGES = ["Applied", "Screened", "Interview", "Licence check", "Offer"];

export function RecruitmentPage() {
  const { data } = usePortalData();
  const [roleId, setRoleId] = useState<number | null>(null);
  if (!data) return null;
  const { roles, candidates } = data;
  const activeRoleId = roleId ?? roles[0]?.id;
  const roleSel = roles.find((r) => r.id === activeRoleId);
  const pool = candidates.filter((c) => c.roleId === activeRoleId);
  const totalCandidates = candidates.length;

  return (
    <>
      <div style={{ borderBottom: "2px solid var(--bark-800)", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="sds-eyebrow">Open positions</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {roles.length} ROLES · {totalCandidates} CANDIDATES
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(5,86px) 110px", gap: 14, padding: "10px 0 8px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>ROLE</span>
        {STAGES.map((h) => (
          <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)", textAlign: "center" }}>
            {h.toUpperCase()}
          </span>
        ))}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>STATUS</span>
      </div>
      {roles.map((r) => {
        const on = r.id === activeRoleId;
        const { bg: stBg, fg: stFg, dot: stDot } = statusColors(r.kind);
        return (
          <div
            key={r.id}
            onClick={() => setRoleId(r.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr repeat(5,86px) 110px",
              gap: 14,
              alignItems: "center",
              padding: "13px 0",
              borderBottom: "1px solid var(--border-subtle)",
              cursor: "pointer",
              background: on ? "var(--sand-100)" : "transparent",
              borderLeft: `2px solid ${on ? "var(--brass-500)" : "transparent"}`,
              paddingLeft: on ? 14 : 0,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</div>
              <div style={{ font: "var(--type-small)", color: "var(--text-tertiary)", marginTop: 2 }}>{r.meta}</div>
            </div>
            {r.counts.map((c, i) => (
              <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 13, textAlign: "center", color: "var(--text-secondary)" }}>
                {c}
              </span>
            ))}
            <span
              style={{
                justifySelf: "start",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                background: stBg,
                color: stFg,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 2,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: stDot }} />
              {r.status}
            </span>
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 36, borderTop: "2px solid var(--bark-800)", paddingTop: 12 }}>
        <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-secondary)" }}>
          Pipeline — {roleSel?.title}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {String(pool.length).padStart(2, "0")} CANDIDATES
        </span>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", overflowX: "auto", marginTop: 16, paddingBottom: 16 }}>
        {STAGES.map((label, i) => {
          const cards = pool.filter((c) => c.stage === i);
          return (
            <div key={label} style={{ width: 238, flex: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px 10px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                  {label.toUpperCase()}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{String(cards.length).padStart(2, "0")}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cards.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "13px 15px",
                      boxShadow: "var(--shadow-hair)",
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: p.ok ? "var(--euc-700)" : "var(--ochre-600)", marginTop: 6 }}>{p.lic}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, font: "var(--type-small)", color: "var(--text-tertiary)" }}>
                      <span>{p.source}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{p.days}D</span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{ border: "1px dashed var(--border-default)", padding: 14, font: "var(--type-small)", color: "var(--text-tertiary)", textAlign: "center" }}>
                    No candidates at this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
