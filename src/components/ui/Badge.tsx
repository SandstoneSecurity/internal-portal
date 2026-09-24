import type { StatusKind } from "../../../shared/types";

/** A badge asserts state (secure / advisory / breach / info / neutral). If nothing is being asserted, use a tag. */
export function Badge({ kind, label, pulse = false }: { kind: StatusKind; label: string; pulse?: boolean }) {
  return (
    <span className={`pt-badge pt-badge--${kind}`}>
      <span className={`pt-badge__dot${pulse ? " pt-badge__dot--pulse" : ""}`} />
      {label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="pt-tag">{children}</span>;
}
