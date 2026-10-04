// Background checks run for clients: a file per subject (a person or a company), holding the checks
// ordered and what each one found. Shared so the Worker and the portal derive status the same way.
import type { StatusKind } from "./types";

export const CHECK_SUBJECTS = ["Individual", "Company"] as const;
export type CheckSubject = (typeof CHECK_SUBJECTS)[number];

export const CHECK_PURPOSES = [
  "Pre-employment",
  "Contractor or supplier",
  "Tenant",
  "Investment or acquisition",
  "Litigation support",
  "Protective security",
  "Other",
] as const;

export interface CheckType {
  key: string;
  label: string;
  /** Who it can be run on. */
  on: CheckSubject | "Both";
  /** Where the answer comes from. */
  source: string;
}

export const CHECK_TYPES: readonly CheckType[] = [
  { key: "identity", label: "Identity", on: "Individual", source: "100-point ID sighted; documents confirmed through the Document Verification Service" },
  { key: "police", label: "National police check", on: "Individual", source: "ACIC National Police Checking Service, through an accredited body" },
  { key: "right_to_work", label: "Right to work", on: "Individual", source: "VEVO, Department of Home Affairs" },
  { key: "employment", label: "Employment history", on: "Individual", source: "Former employers, confirmed directly" },
  { key: "references", label: "Referees", on: "Individual", source: "Referee interviews" },
  { key: "qualifications", label: "Qualifications and licences", on: "Individual", source: "Issuing body or licence register (e.g. NSW security licence)" },
  { key: "wwcc", label: "Working with Children Check", on: "Individual", source: "NSW Office of the Children's Guardian" },
  { key: "insolvency", label: "Bankruptcy and insolvency", on: "Individual", source: "AFSA National Personal Insolvency Index" },
  { key: "company", label: "Company and ABN records", on: "Company", source: "ASIC company extract and the Australian Business Register" },
  { key: "ownership", label: "Ownership and control", on: "Company", source: "ASIC officeholder and shareholder records" },
  { key: "directorships", label: "Directorships and banned persons", on: "Both", source: "ASIC registers, including banned and disqualified persons" },
  { key: "litigation", label: "Court and litigation records", on: "Both", source: "State and federal court and tribunal lists" },
  { key: "sanctions", label: "Sanctions and PEP screening", on: "Both", source: "DFAT Consolidated List; politically exposed persons screening" },
  { key: "media", label: "Adverse media", on: "Both", source: "News archives and open-source search" },
  { key: "online", label: "Online and social media", on: "Both", source: "Review of public profiles and posts" },
  { key: "credit", label: "Credit history", on: "Both", source: "A credit reporting body, with written consent" },
];

export const checkType = (key: string): CheckType => CHECK_TYPES.find((t) => t.key === key) ?? { key, label: key, on: "Both", source: "" };
export const appliesTo = (t: CheckType, subject: CheckSubject) => t.on === "Both" || t.on === subject;

export const CHECK_PACKAGES = [
  { key: "standard", label: "Standard pre-employment", checks: ["identity", "police", "right_to_work", "employment", "references"] },
  { key: "security", label: "Security officer", checks: ["identity", "police", "right_to_work", "employment", "references", "qualifications"] },
  {
    key: "executive",
    label: "Executive or senior hire",
    checks: ["identity", "police", "right_to_work", "employment", "references", "qualifications", "insolvency", "directorships", "litigation", "sanctions", "media", "online"],
  },
  { key: "company", label: "Company due diligence", checks: ["company", "ownership", "directorships", "litigation", "sanctions", "media", "credit"] },
  { key: "none", label: "None yet (add them on the file)", checks: [] },
] as const;
export type CheckPackage = (typeof CHECK_PACKAGES)[number]["key"];

/** What a single check found. */
export const CHECK_RESULTS = [
  ["pending", "Pending", "neutral"],
  ["clear", "Clear", "secure"],
  ["flag", "Flagged", "breach"],
  ["unverified", "Unable to verify", "advisory"],
] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number][0];
export const resultLabel = (r: CheckResult) => CHECK_RESULTS.find(([k]) => k === r)?.[1] ?? r;

export interface BackgroundCheckItem {
  id: number;
  kind: string;
  result: CheckResult;
  finding: string;
  /** When it got a result (ISO), or null while pending. */
  completedAt: string | null;
}

export type CheckStatus = "Awaiting consent" | "In progress" | "Ready to report" | "Report sent";
export type CheckOutcome = "Clear" | "Clear with gaps" | "Adverse findings";

export interface BackgroundCheck {
  id: number;
  ref: string;
  clientId: number | null;
  /** The client's name, or "" if the client has gone. */
  client: string;
  subject: string;
  subjectKind: CheckSubject;
  purpose: string;
  /** What identifies the subject: date of birth, address, licence or ABN. */
  details: string;
  /** When signed consent came in (ISO date); null until it has. */
  consentDate: string | null;
  dueDate: string | null;
  owner: string;
  notes: string;
  createdAt: string;
  /** When the report went to the client; null while the file is open. */
  closedAt: string | null;
  items: BackgroundCheckItem[];
  status: CheckStatus;
  statusKind: StatusKind;
  /** Once every check has a result. */
  outcome: CheckOutcome | null;
  outcomeKind: StatusKind;
  late: boolean;
}

/** Status, outcome and lateness from the stored fields; used by the Worker and for optimistic updates. */
export function deriveCheck(
  c: Omit<BackgroundCheck, "status" | "statusKind" | "outcome" | "outcomeKind" | "late">,
  today: string
): BackgroundCheck {
  const done = c.items.length > 0 && c.items.every((i) => i.result !== "pending");
  const outcome: CheckOutcome | null = !done
    ? null
    : c.items.some((i) => i.result === "flag")
      ? "Adverse findings"
      : c.items.some((i) => i.result === "unverified")
        ? "Clear with gaps"
        : "Clear";
  const outcomeKind: StatusKind = outcome === "Adverse findings" ? "breach" : outcome === "Clear with gaps" ? "advisory" : outcome ? "secure" : "neutral";
  const [status, statusKind]: [CheckStatus, StatusKind] = c.closedAt
    ? ["Report sent", "neutral"]
    : c.subjectKind === "Individual" && !c.consentDate
      ? ["Awaiting consent", "advisory"]
      : done
        ? ["Ready to report", "secure"]
        : ["In progress", "info"];
  return { ...c, status, statusKind, outcome, outcomeKind, late: !c.closedAt && !!c.dueDate && c.dueDate < today };
}

export const checkRef = (id: number) => `BC-${String(id).padStart(4, "0")}`;
