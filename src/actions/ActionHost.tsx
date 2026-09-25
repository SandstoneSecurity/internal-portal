import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  CLIENT_STATUSES,
  EMPLOYEE_STATUSES,
  INTEL_SEVERITIES,
  PRIORITIES,
  ROLE_STATUSES,
  SERVICE_LINES,
  STAGES,
  type Candidate,
  type Client,
  type Employee,
  type IntelItem,
  type OpsCard,
  type OpsSubtask,
  type PortalData,
  type Role,
} from "../../shared/types";
import { send } from "../lib/api";
import { usePortalData } from "../lib/DataProvider";
import { addDays, dayMonth, initialsOf, moneyValue } from "../lib/format";
import { useConfirm } from "../components/ui/Confirm";
import { FormDrawer, type FieldSpec, type FormSpec, type FormValues } from "../components/ui/FormDrawer";
import { useToast } from "../components/ui/Toast";
import { TaskPane } from "../components/TaskPane";

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const statusOpts = (t: readonly (readonly [string, string])[]) => t.map(([l]) => ({ value: l, label: l }));

/** Parses "$840,000" back to 840000 for editing. */
const toNumber = (v: string) => moneyValue(v);

/** Legacy display dates ("14 OCT 26") can't seed a date input; ISO ones can. */
const isoOr = (iso: string | null, fallback = "") => iso ?? fallback;

export interface Actions {
  raiseWork: (o?: { columnId?: number; milestone?: boolean; dueDate?: string }) => void;
  /** Opens the task panel. */
  editWork: (card: OpsCard) => void;
  openTask: (id: number) => void;
  /** Moves a card to a column, optionally at an index within it (0 = top). */
  moveWork: (card: OpsCard, columnId: number, position?: number) => Promise<void>;
  toggleComplete: (card: OpsCard) => Promise<void>;
  quickAddWork: (columnId: number, title: string) => Promise<void>;
  patchWork: (card: OpsCard, patch: WorkPatch) => Promise<boolean>;
  deleteWork: (card: OpsCard) => Promise<boolean>;
  addSubtask: (card: OpsCard, title: string) => Promise<void>;
  patchSubtask: (card: OpsCard, sub: OpsSubtask, patch: SubtaskPatch) => Promise<boolean>;
  deleteSubtask: (card: OpsCard, sub: OpsSubtask) => Promise<void>;
  /** `card` waits on `dependsOn`. */
  addDependency: (card: OpsCard, dependsOn: number) => Promise<void>;
  removeDependency: (card: OpsCard, dependsOn: number) => Promise<void>;
  addEmployee: () => void;
  editEmployee: (e: Employee) => void;
  rosterShift: (e: Employee) => void;
  removeEmployee: (e: Employee) => Promise<boolean>;
  newClient: () => void;
  editClient: (c: Client) => void;
  addContact: (c: Client) => void;
  logActivity: (c: Client) => void;
  recordProposal: (c: Client) => void;
  closeProposal: (c: Client) => Promise<boolean>;
  closeClient: (c: Client) => Promise<boolean>;
  postRole: () => void;
  editRole: (r: Role) => void;
  withdrawRole: (r: Role) => Promise<boolean>;
  addCandidate: (o?: { roleId?: number; stage?: number }) => void;
  editCandidate: (c: Candidate) => void;
  moveCandidate: (c: Candidate, stage: number) => Promise<void>;
  logIntel: (o?: { regionKey?: string }) => void;
  deleteIntel: (i: IntelItem) => Promise<boolean>;
  /** The page's primary action (header button, "N" shortcut). */
  primaryFor: (pathname: string) => { label: string; run: () => void } | null;
}

export type WorkPatch = Partial<Pick<OpsCard, "title" | "site" | "line" | "description" | "priority" | "startDate" | "dueDate" | "milestone">> & {
  owner?: string;
};
export type SubtaskPatch = Partial<Pick<OpsSubtask, "title" | "done" | "startDate" | "dueDate">> & { owner?: string };

/** Re-derives the display fields the Worker would compute, for optimistic updates. */
function derive(k: OpsCard, done: boolean, today: string): OpsCard {
  return {
    ...k,
    late: !done && !!k.dueDate && k.dueDate < today,
    subtasks: k.subtasks.map((st) => ({ ...st, late: !st.done && !!st.dueDate && st.dueDate < today })),
  };
}

function mapCard(d: PortalData, id: number, fn: (k: OpsCard) => OpsCard): PortalData {
  return {
    ...d,
    opsColumns: d.opsColumns.map((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? derive(fn(k), c.done, d.today) : k)) })),
  };
}

const ActionContext = createContext<Actions | null>(null);

export function ActionProvider({ children }: { children: ReactNode }) {
  const { data, refresh, mutate } = usePortalData();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [spec, setSpec] = useState<FormSpec | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const close = useCallback(() => setSpec(null), []);

  const done = useCallback(
    async (title: string, desc?: string, go?: string) => {
      await refresh();
      toast({ title, desc, kind: "secure" });
      if (go) navigate(go);
    },
    [refresh, toast, navigate]
  );

  const fail = useCallback((err: unknown) => toast({ title: "Change not saved", desc: (err as Error).message, kind: "breach" }), [toast]);

  const destroy = useCallback(
    async (o: { title: string; body: ReactNode; confirmLabel: string; path: string; toast: string }) => {
      if (!(await confirm({ title: o.title, body: o.body, confirmLabel: o.confirmLabel, danger: true }))) return false;
      try {
        await send("DELETE", o.path);
        await done(o.toast);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [confirm, done, fail]
  );

  const actions = useMemo<Actions>(() => {
    const d = data as PortalData | null;
    const today = d?.today ?? new Date().toISOString().slice(0, 10);
    const me = initialsOf(d?.me.email ?? "");
    const regions = d?.regions ?? [];
    const roles = d?.roles ?? [];
    const columns = d?.opsColumns ?? [];

    const milestoneFields: FieldSpec[] = [
      { name: "title", label: "Milestone", required: true, max: 120, placeholder: "e.g. Barangaroo contract go-live" },
      { name: "dueDate", label: "Date", type: "date", required: true, half: true },
      { name: "columnId", label: "Section", type: "select", options: columns.map((c) => ({ value: String(c.id), label: c.label })), required: true, half: true },
      { name: "site", label: "Client / site", max: 120, placeholder: "e.g. Aster Constructions" },
      { name: "line", label: "Service line", type: "select", options: opts(SERVICE_LINES), required: true, half: true },
      { name: "owner", label: "Owner (initials)", type: "initials", half: true, placeholder: "JR" },
      { name: "description", label: "Description", type: "textarea", max: 4000, placeholder: "What marks this milestone as reached?" },
    ];

    const workFields: FieldSpec[] = [
      { name: "title", label: "Task", required: true, max: 120, placeholder: "e.g. Key register audit" },
      { name: "site", label: "Client / site", max: 120, placeholder: "e.g. Castlereagh Hotels · four sites" },
      { name: "line", label: "Service line", type: "select", options: opts(SERVICE_LINES), required: true, half: true },
      { name: "priority", label: "Priority", type: "select", options: opts(PRIORITIES), required: true, half: true },
      { name: "owner", label: "Assignee (initials)", type: "initials", half: true, placeholder: "JR" },
      { name: "columnId", label: "Section", type: "select", options: columns.map((c) => ({ value: String(c.id), label: c.label })), required: true, half: true },
      { name: "startDate", label: "Start", type: "date", half: true },
      { name: "dueDate", label: "Due", type: "date", half: true },
      { name: "description", label: "Description", type: "textarea", max: 4000, placeholder: "What needs doing, and what does done look like?" },
    ];

    const employeeFields: FieldSpec[] = [
      { name: "name", label: "Full name", required: true, max: 80 },
      { name: "role", label: "Role", required: true, max: 80, placeholder: "e.g. Security officer" },
      { name: "licenceClass", label: "Licence class", required: true, half: true, mono: true, placeholder: "1A 1C", max: 20 },
      { name: "licenceExpiry", label: "Licence expiry", type: "date", required: true, half: true },
      { name: "site", label: "Assignment", required: true, max: 80, placeholder: "e.g. Kent Street tower" },
      { name: "status", label: "Status", type: "select", options: statusOpts(EMPLOYEE_STATUSES), required: true, half: true },
      { name: "employmentType", label: "Employment", type: "select", options: opts(["FULL TIME", "PART TIME", "CASUAL"]), required: true, half: true },
      { name: "since", label: "Employed since", required: true, half: true, mono: true, placeholder: "2024", max: 4 },
      { name: "mobile", label: "Mobile", half: true, mono: true, placeholder: "0400 000 000", max: 20 },
      { name: "firstAid", label: "First aid", mono: true, placeholder: "HLTAID011 · MAY 27", max: 40 },
    ];

    const clientFields: FieldSpec[] = [
      { name: "org", label: "Organisation", required: true, max: 80 },
      { name: "sector", label: "Sector", required: true, half: true, max: 60, placeholder: "e.g. Hospitality" },
      { name: "status", label: "Status", type: "select", options: statusOpts(CLIENT_STATUSES), required: true, half: true },
      { name: "sites", label: "Sites", type: "number", required: true, half: true, mono: true },
      { name: "valuePa", label: "Value per annum (AUD)", type: "number", required: true, half: true, mono: true },
      { name: "owner", label: "Account owner (initials)", type: "initials", required: true, half: true },
      { name: "meta", label: "Summary line", max: 160, placeholder: "e.g. Client since 2023 · four venues, night coverage" },
    ];

    const roleFields: FieldSpec[] = [
      { name: "title", label: "Role title", required: true, max: 100, placeholder: "e.g. Security officer — night, CBD portfolio" },
      { name: "meta", label: "Details", max: 140, placeholder: "e.g. Class 1A 1C · full time · 4 positions" },
      { name: "status", label: "Status", type: "select", options: statusOpts(ROLE_STATUSES), required: true },
    ];

    const candidateFields = (withRole: boolean): FieldSpec[] => [
      ...(withRole
        ? [{ name: "roleId", label: "Role", type: "select" as const, options: roles.map((r) => ({ value: String(r.id), label: r.title })), required: true }]
        : []),
      { name: "name", label: "Candidate", required: true, max: 80 },
      { name: "licence", label: "Licence", required: true, half: true, mono: true, placeholder: "1A 1C CURRENT", max: 40 },
      { name: "stage", label: "Stage", type: "select", options: STAGES.map((s, i) => ({ value: String(i), label: s })), required: true, half: true },
      { name: "source", label: "Source", required: true, max: 60, placeholder: "e.g. Seek, referral" },
      { name: "licenceOk", label: "Licence verified as current (SLED)", type: "checkbox" },
    ];

    const workBody = (v: FormValues) => ({
      title: v.title,
      site: v.site,
      line: v.line,
      priority: v.priority,
      owner: v.owner,
      startDate: v.startDate || null,
      dueDate: v.dueDate || null,
      description: v.description,
      milestone: v.milestone === true || v.milestone === "true",
      ...(v.columnId ? { columnId: Number(v.columnId) } : {}),
    });

    const moveCard = (dd: PortalData, card: OpsCard, columnId: number, position?: number): PortalData => {
      const now = new Date().toISOString();
      return {
        ...dd,
        opsColumns: dd.opsColumns.map((c) => {
          const rest = c.cards.filter((k) => k.id !== card.id);
          if (c.id !== columnId) return { ...c, cards: rest };
          const moved = derive(
            { ...card, columnId, completedAt: c.done ? card.completedAt ?? now : null },
            c.done,
            dd.today
          );
          const at = Math.min(position ?? rest.length, rest.length);
          return { ...c, cards: [...rest.slice(0, at), moved, ...rest.slice(at)] };
        }),
      };
    };

    const a: Actions = {
      raiseWork: (o) =>
        setSpec({
          eyebrow: "Operations",
          title: o?.milestone ? "Add milestone" : "Raise work",
          submitLabel: o?.milestone ? "Add milestone" : "Create task",
          fields: o?.milestone ? milestoneFields : workFields,
          initial: {
            title: "",
            site: "",
            line: "Ops",
            priority: "None",
            owner: me,
            startDate: o?.milestone ? "" : today,
            dueDate: o?.dueDate ?? addDays(today, 7),
            description: "",
            milestone: o?.milestone ? "true" : "",
            columnId: String(o?.columnId ?? columns.find((c) => !c.done)?.id ?? ""),
          },
          submit: async (v) => {
            const r = await send("POST", "/work", workBody(v));
            await done(`${r.ref} ${o?.milestone ? "milestone added" : "created"}`, String(v.title), `/operations?card=${r.id}`);
          },
        }),

      editWork: (card) => setTaskId(card.id),
      openTask: (id) => setTaskId(id),

      moveWork: async (card, columnId, position) => {
        const from = columns.find((c) => c.id === card.columnId);
        const col = columns.find((c) => c.id === columnId);
        const same = card.columnId === columnId;
        if (same) {
          const rest = (from?.cards ?? []).filter((k) => k.id !== card.id);
          const current = (from?.cards ?? []).findIndex((k) => k.id === card.id);
          if (position === undefined || Math.min(position, rest.length) === current) return;
        }
        try {
          await mutate(
            (dd) => moveCard(dd, card, columnId, position),
            () => send("PATCH", `/work/${card.id}`, { ...(same ? {} : { columnId }), ...(position !== undefined ? { position } : {}) })
          );
          if (!same)
            toast(
              col?.done
                ? { title: `${card.ref} completed`, desc: card.title, kind: "secure" }
                : { title: `${card.ref} moved to ${col?.label ?? "a new section"}`, kind: "info" }
            );
        } catch (err) {
          fail(err);
        }
      },

      toggleComplete: async (card) => {
        const current = columns.find((c) => c.id === card.columnId);
        const target = current?.done ? columns.find((c) => !c.done) : columns.find((c) => c.done);
        if (!target) return;
        await a.moveWork(card, target.id, target.done ? 0 : undefined);
      },

      quickAddWork: async (columnId, title) => {
        const col = columns.find((c) => c.id === columnId);
        const temp: OpsCard = {
          id: -Date.now(),
          columnId,
          ref: "OP-…",
          title,
          site: "",
          line: "Ops",
          description: "",
          priority: "None",
          due: "",
          startDate: null,
          dueDate: null,
          createdAt: new Date().toISOString(),
          completedAt: col?.done ? new Date().toISOString() : null,
          late: false,
          who: "",
          milestone: false,
          blockedBy: [],
          subtasks: [],
        };
        try {
          await mutate(
            (dd) => ({ ...dd, opsColumns: dd.opsColumns.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, temp] } : c)) }),
            () => send("POST", "/work", { title, columnId })
          );
        } catch (err) {
          fail(err);
        }
      },

      patchWork: async (card, patch) => {
        const body: Record<string, unknown> = { ...patch };
        try {
          await mutate(
            (dd) =>
              mapCard(dd, card.id, (k) => ({
                ...k,
                ...patch,
                ...(patch.owner !== undefined ? { who: patch.owner.toUpperCase() } : {}),
                ...(patch.dueDate !== undefined ? { due: patch.dueDate ? `DUE ${dayMonth(patch.dueDate)}` : "" } : {}),
              })),
            () => send("PATCH", `/work/${card.id}`, body)
          );
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      deleteWork: async (card) => {
        const ok = await destroy({
          title: `Delete ${card.ref}?`,
          body: (
            <>
              “{card.title}”{card.subtasks.length ? ` and its ${card.subtasks.length} subtasks` : ""} will be removed from the board. The audit log keeps a
              record of the deletion.
            </>
          ),
          confirmLabel: "Delete task",
          path: `/work/${card.id}`,
          toast: `${card.ref} deleted`,
        });
        if (ok) setTaskId(null);
        return ok;
      },

      addSubtask: async (card, title) => {
        const temp: OpsSubtask = { id: -Date.now(), cardId: card.id, title, done: false, who: "", startDate: null, dueDate: null, late: false };
        try {
          await mutate(
            (dd) => mapCard(dd, card.id, (k) => ({ ...k, subtasks: [...k.subtasks, temp] })),
            () => send("POST", `/work/${card.id}/subtasks`, { title })
          );
        } catch (err) {
          fail(err);
        }
      },

      patchSubtask: async (card, sub, patch) => {
        try {
          await mutate(
            (dd) =>
              mapCard(dd, card.id, (k) => ({
                ...k,
                subtasks: k.subtasks.map((st) =>
                  st.id === sub.id ? { ...st, ...patch, ...(patch.owner !== undefined ? { who: patch.owner.toUpperCase() } : {}) } : st
                ),
              })),
            () => send("PATCH", `/subtasks/${sub.id}`, patch)
          );
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      addDependency: async (card, dependsOn) => {
        if (card.id === dependsOn || card.blockedBy.includes(dependsOn)) return;
        const pre = columns.flatMap((c) => c.cards).find((k) => k.id === dependsOn);
        try {
          await mutate(
            (dd) => mapCard(dd, card.id, (k) => ({ ...k, blockedBy: [...k.blockedBy, dependsOn] })),
            () => send("POST", `/work/${card.id}/dependencies`, { dependsOn })
          );
          toast({ title: `${card.ref} now waits on ${pre?.ref ?? "another task"}`, desc: pre?.title, kind: "info" });
        } catch (err) {
          fail(err);
        }
      },

      removeDependency: async (card, dependsOn) => {
        try {
          await mutate(
            (dd) => mapCard(dd, card.id, (k) => ({ ...k, blockedBy: k.blockedBy.filter((x) => x !== dependsOn) })),
            () => send("DELETE", `/work/${card.id}/dependencies/${dependsOn}`)
          );
        } catch (err) {
          fail(err);
        }
      },

      deleteSubtask: async (card, sub) => {
        try {
          await mutate(
            (dd) => mapCard(dd, card.id, (k) => ({ ...k, subtasks: k.subtasks.filter((st) => st.id !== sub.id) })),
            () => send("DELETE", `/subtasks/${sub.id}`)
          );
          toast({ title: "Subtask removed", desc: sub.title, kind: "info" });
        } catch (err) {
          fail(err);
        }
      },

      addEmployee: () =>
        setSpec({
          eyebrow: "Employees",
          title: "Add employee",
          submitLabel: "Add to register",
          fields: employeeFields,
          initial: {
            name: "",
            role: "Security officer",
            licenceClass: "1A",
            licenceExpiry: addDays(today, 365),
            site: "",
            status: "Rostered",
            employmentType: "FULL TIME",
            since: today.slice(0, 4),
            mobile: "",
            firstAid: "",
          },
          submit: async (v) => {
            const r = await send("POST", "/employees", v);
            await done("Employee added", String(v.name), `/employees?id=${r.id}`);
          },
        }),

      editEmployee: (e) =>
        setSpec({
          eyebrow: "Personnel file",
          title: e.name,
          submitLabel: "Save file",
          fields: employeeFields,
          intro: e.expDate ? undefined : "This record predates dated licences — confirm the expiry date below.",
          initial: {
            name: e.name,
            role: e.role,
            licenceClass: e.cls,
            licenceExpiry: isoOr(e.expDate),
            site: e.site,
            status: e.status,
            employmentType: e.employmentType,
            since: e.since,
            mobile: e.mobile === "—" ? "" : e.mobile,
            firstAid: e.firstAid === "—" ? "" : e.firstAid,
          },
          submit: async (v) => {
            await send("PATCH", `/employees/${e.id}`, v);
            await done("Personnel file saved", String(v.name));
          },
          danger: { label: "Remove from register", run: () => a.removeEmployee(e) },
        }),

      rosterShift: (e) =>
        setSpec({
          eyebrow: `Roster · ${e.name}`,
          title: "Roster a shift",
          submitLabel: "Add shift",
          fields: [
            { name: "date", label: "Date", type: "date", required: true, half: true },
            { name: "span", label: "Hours", required: true, half: true, mono: true, placeholder: "1800–0600", max: 20 },
            { name: "site", label: "Site", required: true, mono: true, placeholder: "KENT ST", max: 40 },
          ],
          initial: { date: today, span: "1800–0600", site: e.site },
          submit: async (v) => {
            await send("POST", `/employees/${e.id}/shifts`, v);
            await done("Shift rostered", `${e.name} · ${v.span} at ${v.site}`);
          },
        }),

      removeEmployee: (e) =>
        destroy({
          title: `Remove ${e.name}?`,
          body: "Their personnel file and shift history will be deleted. The audit log keeps a record of the removal.",
          confirmLabel: "Remove",
          path: `/employees/${e.id}`,
          toast: `${e.name} removed`,
        }),

      newClient: () =>
        setSpec({
          eyebrow: "Clients",
          title: "New account",
          submitLabel: "Open account",
          fields: clientFields,
          initial: { org: "", sector: "", status: "Prospect", sites: 1, valuePa: 0, owner: me, meta: "" },
          submit: async (v) => {
            const r = await send("POST", "/clients", v);
            await done("Account opened", String(v.org), `/clients?id=${r.id}`);
          },
        }),

      editClient: (c) =>
        setSpec({
          eyebrow: "Client record",
          title: c.org,
          submitLabel: "Save account",
          fields: clientFields,
          initial: { org: c.org, sector: c.sector, status: c.status, sites: c.sites, valuePa: toNumber(c.value), owner: c.owner, meta: c.meta },
          submit: async (v) => {
            await send("PATCH", `/clients/${c.id}`, v);
            await done("Account saved", String(v.org));
          },
          danger: { label: "Close account", run: () => a.closeClient(c) },
        }),

      addContact: (c) =>
        setSpec({
          eyebrow: c.org,
          title: "Add contact",
          submitLabel: "Add contact",
          fields: [
            { name: "name", label: "Name", required: true, max: 80 },
            { name: "role", label: "Role", required: true, max: 80, placeholder: "e.g. Head of facilities" },
          ],
          initial: { name: "", role: "" },
          submit: async (v) => {
            await send("POST", `/clients/${c.id}/contacts`, v);
            await done("Contact added", `${v.name} · ${c.org}`);
          },
        }),

      logActivity: (c) =>
        setSpec({
          eyebrow: c.org,
          title: "Log activity",
          submitLabel: "Log activity",
          fields: [{ name: "text", label: "What happened", type: "textarea", required: true, max: 400, placeholder: "e.g. Quarterly review held on site; order book issue 4 agreed." }],
          initial: { text: "" },
          submit: async (v) => {
            await send("POST", `/clients/${c.id}/activity`, v);
            await done("Activity logged", c.org);
          },
        }),

      recordProposal: (c) =>
        setSpec({
          eyebrow: c.org,
          title: c.deal ? "Update proposal" : "Record proposal",
          submitLabel: c.deal ? "Save proposal" : "Record proposal",
          fields: [
            { name: "name", label: "Proposal", required: true, max: 120 },
            { name: "value", label: "Value (AUD)", type: "number", required: true, half: true, mono: true },
            { name: "stage", label: "Stage", type: "select", required: true, half: true, options: opts(["SCOPING", "DRAFTING", "SUBMITTED", "NEGOTIATING"]) },
            { name: "review", label: "Review date", type: "date", required: true, half: true },
          ],
          initial: c.deal
            ? { name: c.deal.name, value: toNumber(c.deal.value), stage: c.deal.stage, review: addDays(today, 14) }
            : { name: "", value: 0, stage: "SCOPING", review: addDays(today, 14) },
          submit: async (v) => {
            await send("PUT", `/clients/${c.id}/deal`, v);
            await done("Proposal recorded", `${v.name} · ${c.org}`);
          },
          danger: c.deal ? { label: "Close proposal", run: () => a.closeProposal(c) } : undefined,
        }),

      closeProposal: (c) =>
        destroy({
          title: "Close this proposal?",
          body: `“${c.deal?.name}” will be removed from ${c.org}'s record.`,
          confirmLabel: "Close proposal",
          path: `/clients/${c.id}/deal`,
          toast: "Proposal closed",
        }),

      closeClient: (c) =>
        destroy({
          title: `Close ${c.org}?`,
          body: "The account, its contacts, proposal and activity will be deleted. The audit log keeps a record of the closure.",
          confirmLabel: "Close account",
          path: `/clients/${c.id}`,
          toast: `${c.org} closed`,
        }),

      postRole: () =>
        setSpec({
          eyebrow: "Recruitment",
          title: "Post a role",
          submitLabel: "Post role",
          fields: roleFields,
          initial: { title: "", meta: "", status: "Open" },
          submit: async (v) => {
            const r = await send("POST", "/roles", v);
            await done("Role posted", String(v.title), `/recruitment?role=${r.id}`);
          },
        }),

      editRole: (r) =>
        setSpec({
          eyebrow: "Recruitment",
          title: r.title,
          submitLabel: "Save role",
          fields: roleFields,
          initial: { title: r.title, meta: r.meta, status: r.status },
          submit: async (v) => {
            await send("PATCH", `/roles/${r.id}`, v);
            await done("Role saved", String(v.title));
          },
          danger: { label: "Withdraw role", run: () => a.withdrawRole(r) },
        }),

      withdrawRole: (r) =>
        destroy({
          title: `Withdraw “${r.title}”?`,
          body: "The role and its candidate pipeline will be deleted. The audit log keeps a record.",
          confirmLabel: "Withdraw role",
          path: `/roles/${r.id}`,
          toast: "Role withdrawn",
        }),

      addCandidate: (o) =>
        setSpec({
          eyebrow: "Recruitment",
          title: "Add candidate",
          submitLabel: "Add to pipeline",
          fields: candidateFields(true),
          initial: {
            roleId: String(o?.roleId ?? roles[0]?.id ?? ""),
            name: "",
            licence: "1A CURRENT",
            stage: String(o?.stage ?? 0),
            source: "",
            licenceOk: true,
          },
          submit: async (v) => {
            await send("POST", "/candidates", { ...v, roleId: Number(v.roleId), stage: Number(v.stage) });
            await done("Candidate added", String(v.name), `/recruitment?role=${v.roleId}`);
          },
        }),

      editCandidate: (c) =>
        setSpec({
          eyebrow: "Candidate",
          title: c.name,
          submitLabel: "Save candidate",
          fields: candidateFields(false),
          initial: { name: c.name, licence: c.lic, stage: String(c.stage), source: c.source, licenceOk: c.ok },
          submit: async (v) => {
            await send("PATCH", `/candidates/${c.id}`, { ...v, stage: Number(v.stage) });
            await done("Candidate saved", String(v.name));
          },
          danger: {
            label: "Withdraw candidate",
            run: () =>
              destroy({
                title: `Withdraw ${c.name}?`,
                body: "They'll be removed from this role's pipeline.",
                confirmLabel: "Withdraw",
                path: `/candidates/${c.id}`,
                toast: `${c.name} withdrawn`,
              }),
          },
        }),

      moveCandidate: async (c, stage) => {
        if (c.stage === stage) return;
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) => (k.id === c.id ? { ...k, stage, days: 0 } : k)),
              roles: dd.roles.map((r) =>
                r.id === c.roleId ? { ...r, counts: r.counts.map((n, i) => n + (i === stage ? 1 : 0) - (i === c.stage ? 1 : 0)) } : r
              ),
            }),
            () => send("PATCH", `/candidates/${c.id}`, { stage })
          );
          toast({ title: `${c.name} moved to ${STAGES[stage]}`, kind: "info" });
        } catch (err) {
          fail(err);
        }
      },

      logIntel: (o) =>
        setSpec({
          eyebrow: "Intelligence",
          title: "Log an item",
          submitLabel: "Log item",
          fields: [
            { name: "severity", label: "Severity", type: "select", options: statusOpts(INTEL_SEVERITIES), required: true, half: true },
            { name: "regionKey", label: "Region", type: "select", options: regions.map((r) => ({ value: r.key, label: r.label })), required: true, half: true },
            { name: "headline", label: "Report", type: "textarea", required: true, max: 400, placeholder: "What was observed, where, and what was done." },
            { name: "source", label: "Source", required: true, max: 120, placeholder: "e.g. Patrol report · OP-231" },
          ],
          initial: { severity: "Advisory", regionKey: o?.regionKey ?? regions[0]?.key ?? "", headline: "", source: "" },
          submit: async (v) => {
            const r = await send("POST", "/intel", v);
            await done("Item logged", `${v.severity} · ${regions.find((x) => x.key === v.regionKey)?.label ?? ""}`, `/intelligence?item=${r.id}`);
          },
        }),

      deleteIntel: (i) =>
        destroy({
          title: "Remove this item from the feed?",
          body: <>“{i.headline.slice(0, 120)}{i.headline.length > 120 ? "…" : ""}”</>,
          confirmLabel: "Remove item",
          path: `/intel/${i.id}`,
          toast: "Item removed",
        }),

      primaryFor: (pathname) => {
        const map: Record<string, { label: string; run: () => void }> = {
          "/": { label: "Raise work", run: () => a.raiseWork() },
          "/operations": { label: "Raise work", run: () => a.raiseWork() },
          "/recruitment": { label: "Post a role", run: () => a.postRole() },
          "/employees": { label: "Add employee", run: () => a.addEmployee() },
          "/clients": { label: "New account", run: () => a.newClient() },
          "/intelligence": { label: "Log an item", run: () => a.logIntel() },
        };
        return map[pathname] ?? null;
      },
    };
    return a;
  }, [data, done, destroy, fail, mutate, toast]);

  return (
    <ActionContext.Provider value={actions}>
      {children}
      <FormDrawer spec={spec} onClose={close} />
      <TaskPane id={taskId} onClose={() => setTaskId(null)} />
    </ActionContext.Provider>
  );
}

export function useActions(): Actions {
  const ctx = useContext(ActionContext);
  if (!ctx) throw new Error("useActions outside ActionProvider");
  return ctx;
}
