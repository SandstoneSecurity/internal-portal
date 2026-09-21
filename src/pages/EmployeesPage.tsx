import { useState } from "react";
import { usePortalData } from "../lib/DataProvider";
import { statusColors } from "../lib/status";

export function EmployeesPage() {
  const { data } = usePortalData();
  const [empId, setEmpId] = useState<number | null>(null);
  if (!data) return null;
  const { employees } = data;
  const selId = empId ?? employees[0]?.id;
  const sel = employees.find((e) => e.id === selId);

  const facts = sel
    ? [
        { k: "Licence", v: "CLASS " + sel.cls, color: "var(--text-primary)" },
        { k: "Licence expiry", v: sel.exp, color: sel.expirySoon ? "var(--ochre-600)" : "var(--text-primary)" },
        { k: "First aid", v: sel.firstAid, color: "var(--text-primary)" },
        { k: "Assignment", v: sel.site.toUpperCase().slice(0, 22), color: "var(--text-primary)" },
        { k: "Employment", v: sel.employmentType, color: "var(--text-primary)" },
        { k: "Mobile", v: sel.mobile, color: "var(--text-primary)" },
      ]
    : [];

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ borderBottom: "2px solid var(--bark-800)", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="sds-eyebrow">Employee register</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
            {employees.length} LICENSED · SHOWING {employees.length}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 0.7fr 0.9fr 1.2fr 0.9fr", gap: 14, padding: "10px 0 8px", borderBottom: "1px solid var(--border-subtle)" }}>
          {["NAME", "ROLE", "LICENCE", "EXPIRY", "ASSIGNMENT", "STATUS"].map((h) => (
            <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
              {h}
            </span>
          ))}
        </div>
        {employees.map((e) => {
          const { bg, fg, dot } = statusColors(e.kind);
          return (
            <div
              key={e.id}
              onClick={() => setEmpId(e.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.3fr 0.7fr 0.9fr 1.2fr 0.9fr",
                gap: 14,
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: "pointer",
                background: e.id === selId ? "var(--sand-100)" : "transparent",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.role}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.cls}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: e.expirySoon ? "var(--ochre-600)" : "var(--text-secondary)" }}>{e.exp}</span>
              <span style={{ font: "var(--type-small)", color: "var(--text-tertiary)" }}>{e.site}</span>
              <span
                style={{
                  justifySelf: "start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  background: bg,
                  color: fg,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderRadius: 2,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
                {e.status}
              </span>
            </div>
          );
        })}
      </div>

      {sel && (
        <div style={{ width: 320, flex: "none", background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderTop: "2px solid var(--brass-500)", padding: "22px 24px" }}>
          <div style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>Personnel file</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", marginTop: 10 }}>{sel.name}</div>
          <div style={{ font: "var(--type-small)", color: "var(--text-secondary)", marginTop: 3 }}>
            {sel.role} · since {sel.since}
          </div>
          <div style={{ marginTop: 18, borderTop: "1px solid var(--border-subtle)" }}>
            {facts.map((f) => (
              <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{f.k}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: f.color, textAlign: "right" }}>{f.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>Recent shifts</div>
          {sel.shifts.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>{s.date}</span>
              <span>{s.span}</span>
              <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{s.site}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="sds-btn sds-btn--sm sds-btn--secondary">Open file</button>
            <button className="sds-btn sds-btn--sm sds-btn--ghost">Roster</button>
          </div>
        </div>
      )}
    </div>
  );
}
