import { useMemo, useState } from "react";
import { usePortalData } from "../lib/DataProvider";
import { statusColors } from "../lib/status";

const TABS = ["All", "Prospect", "Proposal", "Active", "Dormant"] as const;

function totalValuePA(values: string[]): string {
  const total = values.reduce((sum, v) => sum + Number(v.replace(/[^0-9.]/g, "")), 0);
  return `$${(total / 1_000_000).toFixed(2)}M P.A.`;
}

export function ClientsPage() {
  const { data } = usePortalData();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [clientId, setClientId] = useState<number | null>(null);
  if (!data) return null;
  const { clients } = data;

  const filtered = clients.filter((c) => tab === "All" || c.status === tab);
  const selId = clientId ?? filtered[0]?.id ?? clients[0]?.id;
  const sel = clients.find((c) => c.id === selId) ?? filtered[0] ?? clients[0];
  const contractValue = useMemo(() => totalValuePA(clients.map((c) => c.value)), [clients]);

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border-subtle)", marginBottom: 4 }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px 10px",
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
              {t}
            </button>
          ))}
          <span style={{ marginLeft: "auto", alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
            CONTRACT VALUE {contractValue}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.5fr 0.9fr 0.5fr 0.95fr", gap: 14, padding: "12px 0 8px", borderBottom: "2px solid var(--bark-800)" }}>
          {["ORGANISATION", "SECTOR", "SITES", "VALUE P.A.", "OWNER", "STATUS"].map((h) => (
            <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
              {h}
            </span>
          ))}
        </div>
        {filtered.map((c) => {
          const { bg, fg, dot } = statusColors(c.kind);
          return (
            <div
              key={c.id}
              onClick={() => setClientId(c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 0.5fr 0.9fr 0.5fr 0.95fr",
                gap: 14,
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid var(--border-subtle)",
                cursor: "pointer",
                background: c.id === sel?.id ? "var(--sand-100)" : "transparent",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.org}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.sector}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.sites}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.value}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{c.owner}</span>
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
                {c.status}
              </span>
            </div>
          );
        })}
      </div>

      {sel && (
        <div style={{ width: 330, flex: "none", background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderTop: "2px solid var(--brass-500)", padding: "22px 24px" }}>
          <div style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>Client record</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", marginTop: 10 }}>{sel.org}</div>
          <div style={{ font: "var(--type-small)", color: "var(--text-secondary)", marginTop: 3 }}>{sel.meta}</div>

          <div style={{ marginTop: 16, font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>Contacts</div>
          {sel.contacts.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 13 }}>{p.name}</span>
              <span style={{ font: "var(--type-small)", color: "var(--text-tertiary)" }}>{p.role}</span>
            </div>
          ))}

          {sel.deal && (
            <div style={{ marginTop: 18, border: "1px solid var(--border-subtle)", background: "var(--surface-sunken)", padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-secondary)" }}>
                  Open proposal
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--brass-700)" }}>{sel.deal.stage}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13.5 }}>{sel.deal.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                <span>{sel.deal.value}</span>
                <span>REVIEW {sel.deal.review}</span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--track-eyebrow)", color: "var(--text-tertiary)" }}>Activity</div>
          {sel.activity.map((a, i) => (
            <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{a.date}</div>
              <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{a.text}</div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="sds-btn sds-btn--sm sds-btn--secondary">Send brief</button>
            <button className="sds-btn sds-btn--sm sds-btn--ghost">Log activity</button>
          </div>
        </div>
      )}
    </div>
  );
}
