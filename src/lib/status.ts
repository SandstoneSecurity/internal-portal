import type { StatusKind } from "../../shared/types";

export interface StatusColors {
  bg: string;
  fg: string;
  dot: string;
}

const VARS: Record<StatusKind, [string, string, string]> = {
  secure: ["--status-secure-bg", "--status-secure-fg", "--status-secure-dot"],
  advisory: ["--status-advisory-bg", "--status-advisory-fg", "--status-advisory-dot"],
  breach: ["--status-breach-bg", "--status-breach-fg", "--status-breach-dot"],
  info: ["--status-info-bg", "--status-info-fg", "--status-info-dot"],
  neutral: ["--status-neutral-bg", "--status-neutral-fg", "--status-neutral-dot"],
};

export function statusColors(kind: StatusKind): StatusColors {
  const [bg, fg, dot] = VARS[kind] ?? VARS.neutral;
  return { bg: `var(${bg})`, fg: `var(${fg})`, dot: `var(${dot})` };
}

export const DOT_ONLY: Record<StatusKind, string> = {
  breach: "var(--clay-400)",
  advisory: "var(--ochre-400)",
  info: "var(--slate-400)",
  secure: "var(--euc-500)",
  neutral: "var(--bark-300)",
};
