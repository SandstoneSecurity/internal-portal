import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { Wordmark } from "./Wordmark";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  count?: string;
  alert?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Control", icon: "layout-dashboard" },
  { to: "/operations", label: "Operations", icon: "route" },
  { to: "/recruitment", label: "Recruitment", icon: "user-plus" },
  { to: "/employees", label: "Employees", icon: "users" },
  { to: "/clients", label: "Clients", icon: "building-2" },
  { to: "/intelligence", label: "Intelligence", icon: "map-pin" },
];

export function Shell({
  pageTitle,
  pageMeta,
  pageAction,
  navCounts,
  children,
}: {
  pageTitle: string;
  pageMeta: string;
  pageAction: string;
  navCounts?: Partial<Record<string, string>>;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "var(--font-text)", color: "var(--text-primary)" }}>
      <aside
        style={{
          width: 232,
          flex: "none",
          background: "var(--bark-800)",
          borderRight: "1px solid var(--border-inverse)",
          display: "flex",
          flexDirection: "column",
          padding: "28px 0 0",
        }}
      >
        <div style={{ padding: "0 24px 28px" }}>
          <Wordmark size="sm" inverse />
          <div
            style={{
              font: "var(--type-eyebrow)",
              textTransform: "uppercase",
              letterSpacing: "var(--track-eyebrow)",
              color: "var(--brass-300)",
              marginTop: 10,
            }}
          >
            Admin
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column" }}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 24px",
                background: isActive ? "var(--bark-700)" : "transparent",
                borderLeft: `2px solid ${isActive ? "var(--brass-500)" : "transparent"}`,
                color: isActive ? "var(--sand-50)" : "var(--bark-200)",
                fontFamily: "var(--font-text)",
                fontSize: 13,
                textAlign: "left",
                width: "100%",
                textDecoration: "none",
              })}
            >
              <Icon name={n.icon} size={16} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {navCounts?.[n.to] ? (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bark-300)" }}>
                  {navCounts[n.to]}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: 24, borderTop: "1px solid var(--border-inverse)" }}>
          <div
            style={{
              font: "var(--type-eyebrow)",
              textTransform: "uppercase",
              letterSpacing: "var(--track-eyebrow)",
              color: "var(--bark-300)",
            }}
          >
            Control room
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              color: "var(--sand-100)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            <Icon name="phone" size={14} />
            02 8000 0000
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 12,
              padding: "2px 8px",
              background: "var(--status-secure-bg)",
              color: "var(--status-secure-fg)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 2,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--status-secure-dot)" }} />
            Staffed
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "20px 32px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-raised)",
            flex: "none",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "var(--text-xl)" }}>
              {pageTitle}
            </h1>
            <div style={{ font: "var(--type-small)", color: "var(--text-tertiary)", marginTop: 2 }}>{pageMeta}</div>
          </div>
          <input
            placeholder="Search sites, people, clients"
            style={{
              marginLeft: "auto",
              width: 280,
              height: 34,
              padding: "0 12px",
              border: "1px solid var(--field-border)",
              borderRadius: "var(--radius-sm)",
              background: "#fff",
              fontFamily: "var(--font-text)",
              fontSize: 13,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button className="sds-btn sds-btn--md sds-btn--primary">{pageAction}</button>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--radius-sm)",
              background: "var(--sand-300)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--bark-700)",
            }}
          >
            JR
          </div>
        </header>

        <main style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>{children}</main>
      </div>
    </div>
  );
}
