import { useState } from "react";
import { usePortalData } from "../lib/DataProvider";

const WEEKS = ["03 AUG", "10 AUG", "17 AUG", "24 AUG", "31 AUG", "07 SEP", "14 SEP", "21 SEP", "28 SEP"];
const BAR_STYLE: Record<string, [string, string]> = {
  done: ["var(--sand-300)", "var(--sand-300)"],
  active: ["var(--bark-700)", "var(--bark-700)"],
  plan: ["#ffffff", "var(--bark-300)"],
};
const TIMELINE_BG =
  "linear-gradient(to right,transparent calc(42.86% - 1px),var(--brass-600) calc(42.86% - 1px),var(--brass-600) calc(42.86% + 1px),transparent calc(42.86% + 1px)),repeating-linear-gradient(to right,var(--sand-200),var(--sand-200) 1px,transparent 1px,transparent 11.111%)";

export function OperationsPage() {
  const { data } = usePortalData();
  const [tab, setTab] = useState<"board" | "timeline">("board");
  if (!data) return null;
  const { opsColumns, gantt } = data;
  const totalOpen = opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0);

  return (
    <>
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border-subtle)", marginBottom: 24 }}>
        {(["board", "timeline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px 10px",
              background: "none",
              border: 0,
              borderBottom: `2px solid ${tab === t ? "var(--brass-600)" : "transparent"}`,
              marginBottom: -1,
              fontFamily: "var(--font-text)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
            }}
          >
            {t === "board" ? "Board" : "Timeline"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          ORDER BOOK · WK 35 · {totalOpen} ITEMS OPEN
        </span>
      </div>

      {tab === "board" && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", overflowX: "auto", paddingBottom: 16 }}>
          {opsColumns.map((c) => (
            <div key={c.label} style={{ width: 284, flex: "none" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "2px solid var(--bark-800)", padding: "10px 2px 12px" }}>
                <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-secondary)" }}>
                  {c.label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
                  {String(c.cards.length).padStart(2, "0")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {c.cards.map((k) => (
                  <div
                    key={k.ref}
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "14px 16px",
                      boxShadow: "var(--shadow-hair)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{k.ref}</span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-default)",
                          padding: "1px 6px",
                          borderRadius: 2,
                        }}
                      >
                        {k.line}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.45 }}>{k.title}</div>
                    <div style={{ marginTop: 4, font: "var(--type-small)", color: "var(--text-tertiary)" }}>{k.site}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: k.late ? "var(--clay-600)" : "var(--text-tertiary)" }}>{k.due}</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          width: 22,
                          height: 22,
                          borderRadius: "var(--radius-sm)",
                          background: "var(--sand-200)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--bark-600)",
                        }}
                      >
                        {k.who}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "timeline" && (
        <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderBottom: "2px solid var(--bark-800)" }}>
            <div style={{ padding: "12px 18px", font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-secondary)" }}>
              Programme
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(9,1fr)", height: "100%" }}>
                {WEEKS.map((w) => (
                  <div key={w} style={{ padding: "12px 0 12px 8px", borderLeft: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                    {w}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {gantt.map((s) => (
            <div key={s.num}>
              <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ padding: "9px 18px", display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--brass-700)" }}>{s.num}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span>
                </div>
                <div style={{ backgroundImage: TIMELINE_BG }} />
              </div>
              {s.tasks.map((t) => {
                const [bg, border] = BAR_STYLE[t.k];
                return (
                  <div key={t.name} style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ padding: "10px 18px 10px 41px", fontSize: 13, color: "var(--text-secondary)" }}>{t.name}</div>
                    <div style={{ position: "relative", backgroundImage: TIMELINE_BG }}>
                      <div
                        title={t.name}
                        style={{
                          position: "absolute",
                          top: "50%",
                          transform: "translateY(-50%)",
                          height: 16,
                          left: `${((t.s / 63) * 100).toFixed(2)}%`,
                          width: `${(((t.e - t.s + 1) / 63) * 100).toFixed(2)}%`,
                          background: bg,
                          border: `1px solid ${border}`,
                          borderRadius: 1,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "260px 1fr" }}>
            <div style={{ padding: "10px 18px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>03 AUG — 04 OCT 2026</div>
            <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "10px 0" }}>
              <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                <span style={{ width: 14, height: 8, background: "var(--sand-300)", border: "1px solid var(--sand-300)" }} />COMPLETE
              </span>
              <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                <span style={{ width: 14, height: 8, background: "var(--bark-700)" }} />IN PROGRESS
              </span>
              <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                <span style={{ width: 14, height: 8, background: "#fff", border: "1px solid var(--bark-300)" }} />SCHEDULED
              </span>
              <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--brass-700)" }}>
                <span style={{ width: 2, height: 12, background: "var(--brass-600)" }} />TODAY 30 AUG
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
