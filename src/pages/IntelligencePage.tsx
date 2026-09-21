import { useMemo, useState } from "react";
import { usePortalData } from "../lib/DataProvider";
import { statusColors } from "../lib/status";

const NSW_PATH =
  "M 5.8 63 L 466.9 59.9 L 495 45 L 527.8 34.6 L 552 50 L 580 56.7 L 610 50 L 643.8 44.1 L 672.8 22 L 713.4 15.8 L 733.7 10 L 738.3 40.3 L 722 90 L 713 126 L 709.9 144.9 L 698.9 189 L 696 216 L 675.7 252 L 655.4 296 L 632.2 310.6 L 614.8 333.9 L 603.2 368.6 L 585.8 384.3 L 580 404.5 L 577 441 L 539.4 485.1 L 527.8 522.9 L 524.9 560.7 L 526.6 598.5 L 423.4 554.4 L 377 510.3 L 319 510.3 L 266.8 497.7 L 234.9 510.3 L 203 491.4 L 156.6 459.9 L 139.2 422.1 L 87 425.3 L 40.6 390.6 L 5.8 379.3 Z";
const ACT_PATH = "M 469.8 465 L 490 452 L 500 470 L 496 500 L 478 505 L 466 488 Z";

const DOT: Record<string, string> = {
  breach: "var(--clay-400)",
  advisory: "var(--ochre-400)",
  info: "var(--slate-400)",
};
const SEVERITY_ORDER = ["breach", "advisory", "info"];

export function IntelligencePage() {
  const { data } = usePortalData();
  const [intelId, setIntelId] = useState<number | null>(null);
  if (!data) return null;
  const { feed, regions } = data;
  const selId = intelId ?? feed[0]?.id;
  const selFeed = feed.find((f) => f.id === selId);

  const markers = useMemo(
    () =>
      regions.map((r) => {
        const items = feed.filter((f) => f.regionKey === r.key);
        const worst = SEVERITY_ORDER.find((k) => items.some((f) => f.kind === k)) ?? "info";
        const on = selFeed?.regionKey === r.key;
        return {
          key: r.key,
          x: r.x,
          y: r.y,
          lpx: (((r.x + r.dx) / 760) * 100).toFixed(2),
          lpy: (((r.y + r.dy + 10) / 620) * 100).toFixed(2),
          shift: r.anchor === "end" ? "translate(-100%,-50%)" : "translate(0,-50%)",
          label: r.label.toUpperCase(),
          fill: DOT[worst],
          ring: on ? 10 : 0,
          ringW: on ? 1.5 : 0,
          firstId: items[0]?.id,
        };
      }),
    [regions, feed, selFeed]
  );

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      <div style={{ flex: 1.35, minWidth: 0, background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="sds-eyebrow">New South Wales — monitored activity</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>UPDATED 05:40 AEST</span>
        </div>
        <div style={{ position: "relative", marginTop: 14 }}>
          <svg viewBox="0 -10 760 620" style={{ width: "100%", height: "auto", display: "block" }}>
            <path d={NSW_PATH} fill="var(--sand-100)" stroke="var(--bark-300)" strokeWidth={1.5} strokeLinejoin="round" />
            <path d={ACT_PATH} fill="var(--sand-200)" stroke="var(--bark-300)" strokeWidth={1} strokeDasharray="3 3" />
            {markers.map((m) => (
              <g key={m.key} onClick={() => m.firstId && setIntelId(m.firstId)} style={{ cursor: "pointer" }}>
                <circle cx={m.x} cy={m.y} r={m.ring} fill="none" stroke="var(--brass-600)" strokeWidth={m.ringW} />
                <circle cx={m.x} cy={m.y} r={5} fill={m.fill} stroke="#fff" strokeWidth={1.5} />
              </g>
            ))}
          </svg>
          {markers.map((m) => (
            <span
              key={m.key}
              onClick={() => m.firstId && setIntelId(m.firstId)}
              style={{
                position: "absolute",
                left: `${m.lpx}%`,
                top: `${m.lpy}%`,
                transform: m.shift,
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--bark-500)",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {m.label}
            </span>
          ))}
          <span style={{ position: "absolute", left: "63.5%", top: "79%", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bark-400)" }}>ACT</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--status-breach-dot)" }} />BREACH
          </span>
          <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--status-advisory-dot)" }} />ADVISORY
          </span>
          <span style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--status-info-dot)" }} />INFORMATION
          </span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
            SOURCES · NSW POLICE MEDIA · BOM · SLED · PATROL REPORTS
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ borderBottom: "2px solid var(--bark-800)", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="sds-eyebrow">Feed</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{String(feed.length).padStart(2, "0")} ITEMS · 7 DAYS</span>
        </div>
        {feed.map((f) => {
          const on = f.id === selId;
          const { bg, fg } = statusColors(f.kind);
          return (
            <div
              key={f.id}
              onClick={() => setIntelId(f.id)}
              style={{
                padding: "14px 10px",
                borderBottom: "1px solid var(--border-subtle)",
                borderLeft: `2px solid ${on ? "var(--brass-500)" : "transparent"}`,
                cursor: "pointer",
                background: on ? "var(--sand-100)" : "transparent",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", flex: "none" }}>{f.time}</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "1px 7px",
                    background: bg,
                    color: fg,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    borderRadius: 2,
                  }}
                >
                  {f.sev}
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{f.region}</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 13.5, lineHeight: 1.5 }}>{f.headline}</div>
              <div style={{ marginTop: 4, font: "var(--type-small)", color: "var(--text-tertiary)" }}>{f.source}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
