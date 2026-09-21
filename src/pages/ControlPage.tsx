import { useNavigate } from "react-router-dom";
import { usePortalData } from "../lib/DataProvider";
import { statusColors } from "../lib/status";

const NOTE_COLOR = {
  neutral: "var(--text-tertiary)",
  breach: "var(--clay-600)",
  advisory: "var(--ochre-600)",
  secure: "var(--euc-700)",
  info: "var(--slate-600)",
};

const BRIEF_COLOR = {
  breach: "var(--clay-400)",
  advisory: "var(--ochre-400)",
  info: "var(--slate-400)",
  secure: "var(--euc-500)",
  neutral: "var(--bark-300)",
};

export function ControlPage() {
  const { data } = usePortalData();
  const navigate = useNavigate();
  if (!data) return null;
  const { metrics, opsColumns, employees, feed } = data;

  const raised = opsColumns[0]?.cards ?? [];
  const inPrep = opsColumns[1]?.cards.slice(0, 1) ?? [];
  const raisedRows = [...raised, ...inPrep].map((c) => ({
    ...c,
    status: c.late ? "Past due" : "Raised",
    ...statusColors(c.late ? "breach" : "neutral"),
  }));

  const expiries = employees.filter((e) => e.expirySoon);
  const brief = feed.slice(0, 3);

  return (
    <>
      <div style={{ display: "flex", gap: 1, background: "var(--border-subtle)", border: "1px solid var(--border-subtle)" }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ flex: 1, padding: "22px 26px", background: "var(--surface-raised)" }}>
            <div style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>
              {m.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", lineHeight: 1 }}>{m.value}</span>
              <span style={{ font: "var(--type-small)", color: "var(--text-tertiary)" }}>{m.unit}</span>
            </div>
            <div style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: NOTE_COLOR[m.noteKind] }}>{m.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 28, marginTop: 32, alignItems: "flex-start" }}>
        <div style={{ flex: 1.6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--bark-800)", paddingBottom: 10 }}>
            <span className="sds-eyebrow">Work raised — week 35</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>REVIEWED 30 AUG 2026</span>
          </div>
          {raisedRows.map((r) => (
            <div
              key={r.ref}
              onClick={() => navigate("/operations")}
              style={{
                display: "grid",
                gridTemplateColumns: "74px 1fr 180px 110px",
                gap: 16,
                alignItems: "center",
                padding: "14px 0",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{r.ref}</span>
              <span style={{ fontSize: 13.5 }}>{r.title}</span>
              <span style={{ font: "var(--type-small)", color: "var(--text-tertiary)" }}>{r.site}</span>
              <span
                style={{
                  justifySelf: "start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  background: r.bg,
                  color: r.fg,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderRadius: 2,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: r.dot }} />
                {r.status}
              </span>
            </div>
          ))}
        </div>

        <div style={{ width: 330, flex: "none", display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderTop: "2px solid var(--brass-500)", padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-secondary)" }}>
                Licence expiries
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>NEXT 90 DAYS</span>
            </div>
            {expiries.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ flex: 1, fontSize: 13 }}>{e.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{e.cls}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ochre-600)" }}>{e.exp}</span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => navigate("/employees")} className="sds-btn sds-btn--sm sds-btn--secondary">
                Open employee register
              </button>
            </div>
          </div>

          <div style={{ background: "var(--surface-inverse)", padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--brass-300)" }}>
                Intelligence — 24 h
              </span>
            </div>
            {brief.map((f) => (
              <div key={f.id} onClick={() => navigate("/intelligence")} style={{ padding: "12px 0", borderBottom: "1px solid var(--border-inverse)", cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bark-300)" }}>{f.time}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: BRIEF_COLOR[f.kind] }}>
                    {f.sev.toUpperCase()}
                  </span>
                </div>
                <div style={{ marginTop: 5, fontSize: 13, color: "var(--sand-100)", lineHeight: 1.45 }}>{f.headline.split(".")[0]}.</div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => navigate("/intelligence")} className="sds-btn sds-btn--sm sds-btn--outline-inverse">
                Open intelligence
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
