import type { CSSProperties } from "react";
import type { StatusKind } from "../../shared/types";
import { statusColors } from "../lib/status";

export function Badge({ kind, label, style }: { kind: StatusKind; label: string; style?: CSSProperties }) {
  const { bg, fg, dot } = statusColors(kind);
  return (
    <span
      style={{
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
        ...style,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
      {label}
    </span>
  );
}
