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
  DEAL_STAGES,
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  type Candidate,
  type CandidateEvent,
  type Client,
  type ClientContact,
  type Deal,
  type DealStage,
  type Engagement,
  type Employee,
  type IntelItem,
  type OpsCard,
  type OpsSubtask,
  type PortalData,
  type Role,
} from "../../shared/types";
import { send } from "../lib/api";
import { usePortalData } from "../lib/DataProvider";
import { addDays, aud, dayMonth, initialsOf, money } from "../lib/format";
import { useConfirm } from "../components/ui/Confirm";
import { FormDrawer, type FieldSpec, type FormSpec, type FormValues } from "../components/ui/FormDrawer";
import { useToast } from "../components/ui/Toast";
import { TaskPane } from "../components/TaskPane";

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const statusOpts = (t: readonly (readonly [string, string])[]) => t.map(([l]) => ({ value: l, label: l }));


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
  patchClient: (c: Client, patch: ClientPatch) => Promise<boolean>;
  closeClient: (c: Client) => Promise<boolean>;
  addContact: (c: Client) => void;
  editContact: (c: Client, contact: ClientContact) => void;
  logEngagement: (c: Client, e: EngagementInput) => Promise<boolean>;
  patchEngagement: (e: Engagement, patch: Partial<Pick<Engagement, "done" | "subject" | "body" | "dueDate">>) => Promise<void>;
  deleteEngagement: (e: Engagement) => Promise<boolean>;
  newDeal: (o?: { clientId?: number; stage?: DealStage }) => void;
  editDeal: (deal: Deal) => void;
  moveDeal: (deal: Deal, stage: DealStage, position?: number) => Promise<void>;
  postRole: () => void;
  editRole: (r: Role) => void;
  patchRole: (r: Role, patch: Partial<Pick<Role, "status">>) => Promise<void>;
  withdrawRole: (r: Role) => Promise<boolean>;
  addCandidate: (o?: { roleId?: number; stage?: number }) => void;
  editCandidate: (c: Candidate) => void;
  moveCandidate: (c: Candidate, stage: number) => Promise<void>;
  disqualifyCandidate: (c: Candidate, reason: string) => Promise<void>;
  requalifyCandidate: (c: Candidate) => Promise<void>;
  commentCandidate: (c: Candidate, body: string) => Promise<boolean>;
  evaluateCandidate: (c: Candidate, e: { score: number; verdict: string; body: string }) => Promise<boolean>;
  deleteCandidateEvent: (c: Candidate, ev: CandidateEvent) => Promise<void>;
  deleteCandidate: (c: Candidate) => Promise<boolean>;
  logIntel: (o?: { regionKey?: string }) => void;
  deleteIntel: (i: IntelItem) => Promise<boolean>;
  /** The page's primary action (header button, "N" shortcut). */
  primaryFor: (pathname: string) => { label: string; run: () => void } | null;
}

export type WorkPatch = Partial<Pick<OpsCard, "title" | "site" | "line" | "description" | "priority" | "startDate" | "dueDate" | "milestone">> & {
  owner?: string;
};
export type ClientPatch = Partial<Pick<Client, "org" | "sector" | "sites" | "status" | "meta" | "domain" | "phone" | "city" | "owner">> & { valuePa?: number };
export type EngagementInput = {
  kind: Engagement["kind"];
  subject?: string;
  body?: string;
  outcome?: string;
  at?: string;
  dueDate?: string | null;
  contactId?: number | null;
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
      { name: "org", label: "Company name", required: true, max: 80 },
      { name: "domain", label: "Company domain", max: 120, placeholder: "e.g. harbourline.com.au", mono: true },
      { name: "sector", label: "Industry", half: true, max: 60, placeholder: "e.g. Hospitality" },
      { name: "status", label: "Lifecycle stage", type: "select", options: statusOpts(CLIENT_STATUSES), required: true, half: true },
      { name: "owner", label: "Company owner (initials)", type: "initials", half: true },
      { name: "city", label: "City", half: true, max: 60 },
      { name: "phone", label: "Phone", half: true, mono: true, max: 30 },
      { name: "sites", label: "Sites", type: "number", half: true, mono: true },
      { name: "valuePa", label: "Annual contract value (AUD)", type: "number", mono: true },
      { name: "meta", label: "Description", type: "textarea", max: 400 },
    ];

    const contactFields: FieldSpec[] = [
      { name: "name", label: "Name", required: true, max: 80 },
      { name: "role", label: "Job title", max: 80, placeholder: "e.g. Head of facilities" },
      { name: "email", label: "Email", max: 120, placeholder: "name@company.com" },
      { name: "phone", label: "Phone", mono: true, max: 30 },
    ];

    const clientsList = d?.clients ?? [];
    const dealFields: FieldSpec[] = [
      { name: "name", label: "Deal name", required: true, max: 120, placeholder: "e.g. Concierge coverage — two towers" },
      { name: "clientId", label: "Company", type: "select", required: true, options: clientsList.map((c) => ({ value: String(c.id), label: c.org })) },
      { name: "amount", label: "Amount (AUD)", type: "number", required: true, half: true, mono: true },
      { name: "stage", label: "Deal stage", type: "select", required: true, half: true, options: DEAL_STAGES.map(([st]) => ({ value: st, label: st })) },
      { name: "closeDate", label: "Close date", type: "date", half: true },
      { name: "owner", label: "Deal owner (initials)", type: "initials", half: true },
    ];

    const roleFields: FieldSpec[] = [
      { name: "title", label: "Job title", required: true, max: 100, placeholder: "e.g. Security officer — night, CBD portfolio" },
      { name: "department", label: "Department", type: "select", options: opts(DEPARTMENTS), required: true, half: true },
      { name: "location", label: "Location", half: true, max: 80, placeholder: "e.g. Sydney CBD" },
      { name: "employmentType", label: "Employment type", type: "select", options: opts(EMPLOYMENT_TYPES), required: true, half: true },
      { name: "openings", label: "Openings", type: "number", required: true, half: true, mono: true },
      { name: "status", label: "State", type: "select", options: statusOpts(ROLE_STATUSES), required: true, half: true },
      { name: "hiringManager", label: "Hiring manager", half: true, max: 80 },
      { name: "description", label: "Description", type: "textarea", max: 6000, placeholder: "Duties, licence classes, shifts, what good looks like." },
    ];

    const candidateFields = (withRole: boolean): FieldSpec[] => [
      ...(withRole
        ? [{ name: "roleId", label: "Job", type: "select" as const, options: roles.map((r) => ({ value: String(r.id), label: r.title })), required: true }]
        : []),
      { name: "name", label: "Full name", required: true, max: 80 },
      { name: "headline", label: "Headline", max: 140, placeholder: "e.g. Crowd controller, 4 years" },
      { name: "email", label: "Email", half: true, max: 120 },
      { name: "phone", label: "Phone", half: true, mono: true, max: 30 },
      { name: "location", label: "Location", half: true, max: 80 },
      { name: "source", label: "Source", half: true, max: 60, placeholder: "e.g. Seek, referral" },
      { name: "licence", label: "Licence", half: true, mono: true, placeholder: "1A 1C", max: 40 },
      ...(withRole
        ? [{ name: "stage", label: "Stage", type: "select" as const, options: STAGES.map((st, i) => ({ value: String(i), label: st })), required: true, half: true }]
        : []),
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
          title: "Create company",
          submitLabel: "Create company",
          fields: clientFields,
          initial: { org: "", domain: "", sector: "", status: "Lead", owner: me, city: "", phone: "", sites: 1, valuePa: 0, meta: "" },
          submit: async (v) => {
            const r = await send("POST", "/clients", v);
            await done("Company created", String(v.org), `/clients?id=${r.id}`);
          },
        }),

      editClient: (c) =>
        setSpec({
          eyebrow: "Company",
          title: c.org,
          submitLabel: "Save company",
          fields: clientFields,
          initial: { org: c.org, domain: c.domain, sector: c.sector, status: c.status, owner: c.owner, city: c.city, phone: c.phone, sites: c.sites, valuePa: c.valueNum, meta: c.meta },
          submit: async (v) => {
            await send("PATCH", `/clients/${c.id}`, v);
            await done("Company saved", String(v.org));
          },
          danger: { label: "Delete company", run: () => a.closeClient(c) },
        }),

      patchClient: async (c, patch) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              clients: dd.clients.map((k) =>
                k.id === c.id
                  ? {
                      ...k,
                      ...patch,
                      ...(patch.valuePa !== undefined ? { value: aud(patch.valuePa), valueNum: patch.valuePa } : {}),
                      ...(patch.status ? { kind: CLIENT_STATUSES.find(([l]) => l === patch.status)?.[1] ?? k.kind } : {}),
                    }
                  : k
              ),
            }),
            () => send("PATCH", `/clients/${c.id}`, patch)
          );
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      closeClient: async (c) => {
        const ok = await destroy({
          title: `Delete ${c.org}?`,
          body: "The company, its contacts, deals and activity will be deleted. The audit log keeps a record.",
          confirmLabel: "Delete company",
          path: `/clients/${c.id}`,
          toast: `${c.org} deleted`,
        });
        if (ok) navigate("/clients");
        return ok;
      },

      addContact: (c) =>
        setSpec({
          eyebrow: c.org,
          title: "Add contact",
          submitLabel: "Add contact",
          fields: contactFields,
          initial: { name: "", role: "", email: "", phone: "" },
          submit: async (v) => {
            await send("POST", `/clients/${c.id}/contacts`, v);
            await done("Contact added", `${v.name} · ${c.org}`);
          },
        }),

      editContact: (c, contact) =>
        setSpec({
          eyebrow: c.org,
          title: contact.name,
          submitLabel: "Save contact",
          fields: contactFields,
          initial: { name: contact.name, role: contact.role, email: contact.email, phone: contact.phone },
          submit: async (v) => {
            await send("PATCH", `/contacts/${contact.id}`, v);
            await done("Contact saved", String(v.name));
          },
          danger: {
            label: "Remove contact",
            run: () =>
              destroy({
                title: `Remove ${contact.name}?`,
                body: `They'll be removed from ${c.org}. Logged activity stays.`,
                confirmLabel: "Remove contact",
                path: `/contacts/${contact.id}`,
                toast: `${contact.name} removed`,
              }),
          },
        }),

      logEngagement: async (c, e) => {
        const temp: Engagement = {
          id: -Date.now(),
          clientId: c.id,
          kind: e.kind,
          subject: e.subject ?? "",
          body: e.body ?? "",
          at: e.at ?? new Date().toISOString(),
          actor: d?.me.email ?? "",
          outcome: e.outcome ?? "",
          dueDate: e.dueDate ?? null,
          done: false,
          contactId: e.contactId ?? null,
        };
        try {
          await mutate(
            (dd) => ({ ...dd, clients: dd.clients.map((k) => (k.id === c.id ? { ...k, activity: [temp, ...k.activity] } : k)) }),
            () => send("POST", `/clients/${c.id}/activity`, e)
          );
          const noun = { note: "Note added", email: "Email logged", call: "Call logged", meeting: "Meeting logged", task: "Task created" }[e.kind];
          toast({ title: noun, desc: c.org, kind: "secure" });
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      patchEngagement: async (e, patch) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              clients: dd.clients.map((k) => (k.id === e.clientId ? { ...k, activity: k.activity.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) } : k)),
            }),
            () => send("PATCH", `/activity/${e.id}`, patch)
          );
        } catch (err) {
          fail(err);
        }
      },

      deleteEngagement: (e) =>
        destroy({
          title: `Delete this ${e.kind}?`,
          body: e.subject || e.body.slice(0, 120) || "It will be removed from the timeline.",
          confirmLabel: "Delete",
          path: `/activity/${e.id}`,
          toast: `${e.kind[0]!.toUpperCase()}${e.kind.slice(1)} deleted`,
        }),

      newDeal: (o) =>
        setSpec({
          eyebrow: "Deals",
          title: "Create deal",
          submitLabel: "Create deal",
          fields: dealFields,
          initial: {
            name: "",
            clientId: String(o?.clientId ?? clientsList[0]?.id ?? ""),
            amount: 0,
            stage: o?.stage ?? "Enquiry",
            closeDate: addDays(today, 30),
            owner: me,
          },
          submit: async (v) => {
            await send("POST", "/deals", { ...v, clientId: Number(v.clientId), closeDate: v.closeDate || null });
            await done("Deal created", String(v.name));
          },
        }),

      editDeal: (deal) =>
        setSpec({
          eyebrow: "Deal",
          title: deal.name,
          submitLabel: "Save deal",
          fields: dealFields,
          initial: { name: deal.name, clientId: String(deal.clientId), amount: deal.amount, stage: deal.stage, closeDate: deal.closeDate ?? "", owner: deal.owner },
          submit: async (v) => {
            await send("PATCH", `/deals/${deal.id}`, { ...v, clientId: Number(v.clientId), closeDate: v.closeDate || null });
            await done("Deal saved", String(v.name));
          },
          danger: {
            label: "Delete deal",
            run: () =>
              destroy({ title: `Delete “${deal.name}”?`, body: "The deal will be removed from the pipeline.", confirmLabel: "Delete deal", path: `/deals/${deal.id}`, toast: "Deal deleted" }),
          },
        }),

      moveDeal: async (deal, stage, position) => {
        const same = deal.stage === stage;
        const inStage = (d?.deals ?? []).filter((x) => x.stage === stage && x.id !== deal.id);
        if (same && (position === undefined || (d?.deals ?? []).filter((x) => x.stage === stage).findIndex((x) => x.id === deal.id) === Math.min(position, inStage.length))) return;
        const closed = stage === "Closed won" || stage === "Closed lost";
        try {
          await mutate(
            (dd) => {
              const rest = dd.deals.filter((x) => x.id !== deal.id);
              const moved = { ...deal, stage, closedAt: same ? deal.closedAt : closed ? new Date().toISOString() : null };
              const idx = rest.filter((x) => x.stage === stage);
              const at = Math.min(position ?? idx.length, idx.length);
              const anchor = idx[at];
              const deals = anchor ? rest.flatMap((x) => (x.id === anchor.id ? [moved, x] : [x])) : [...rest, moved];
              return {
                ...dd,
                deals,
                clients: stage === "Closed won" ? dd.clients.map((k) => (k.id === deal.clientId ? { ...k, status: "Customer", kind: "secure" } : k)) : dd.clients,
              };
            },
            () => send("PATCH", `/deals/${deal.id}`, { ...(same ? {} : { stage }), ...(position !== undefined ? { position } : {}) })
          );
          if (!same)
            toast(
              stage === "Closed won"
                ? { title: "Deal won", desc: `${deal.name} · ${money(deal.amount)}`, kind: "secure" }
                : { title: `Moved to ${stage}`, desc: deal.name, kind: stage === "Closed lost" ? "breach" : "info" }
            );
        } catch (err) {
          fail(err);
        }
      },

      postRole: () =>
        setSpec({
          eyebrow: "Recruitment",
          title: "Create job",
          submitLabel: "Create job",
          fields: roleFields,
          initial: { title: "", department: "Ops", location: "", employmentType: "Full time", openings: 1, status: "Published", hiringManager: "", description: "" },
          submit: async (v) => {
            const r = await send("POST", "/roles", v);
            await done("Job created", String(v.title), `/recruitment?role=${r.id}`);
          },
        }),

      editRole: (r) =>
        setSpec({
          eyebrow: "Job",
          title: r.title,
          submitLabel: "Save job",
          fields: roleFields,
          initial: {
            title: r.title,
            department: r.department,
            location: r.location,
            employmentType: r.employmentType,
            openings: r.openings,
            status: r.status,
            hiringManager: r.hiringManager,
            description: r.description,
          },
          submit: async (v) => {
            await send("PATCH", `/roles/${r.id}`, v);
            await done("Job saved", String(v.title));
          },
          danger: { label: "Delete job", run: () => a.withdrawRole(r) },
        }),

      patchRole: async (r, patch) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              roles: dd.roles.map((x) => (x.id === r.id ? { ...x, ...patch, kind: ROLE_STATUSES.find(([l]) => l === patch.status)?.[1] ?? x.kind } : x)),
            }),
            () => send("PATCH", `/roles/${r.id}`, patch)
          );
          toast({ title: `${r.title}: ${patch.status}`, kind: "info" });
        } catch (err) {
          fail(err);
        }
      },

      withdrawRole: async (r) => {
        const ok = await destroy({
          title: `Delete “${r.title}”?`,
          body: "The job and every candidate in its pipeline will be deleted. The audit log keeps a record.",
          confirmLabel: "Delete job",
          path: `/roles/${r.id}`,
          toast: "Job deleted",
        });
        if (ok) navigate("/recruitment");
        return ok;
      },

      addCandidate: (o) =>
        setSpec({
          eyebrow: "Recruitment",
          title: "Add candidate",
          submitLabel: "Add candidate",
          fields: candidateFields(true),
          initial: {
            roleId: String(o?.roleId ?? roles[0]?.id ?? ""),
            name: "",
            headline: "",
            email: "",
            phone: "",
            location: "",
            source: "",
            licence: "",
            stage: String(o?.stage ?? 1),
            licenceOk: false,
          },
          submit: async (v) => {
            const r = await send("POST", "/candidates", { ...v, roleId: Number(v.roleId), stage: Number(v.stage) });
            await done("Candidate added", String(v.name), `/recruitment?role=${v.roleId}&candidate=${r.id}`);
          },
        }),

      editCandidate: (c) =>
        setSpec({
          eyebrow: "Candidate",
          title: c.name,
          submitLabel: "Save candidate",
          fields: candidateFields(false),
          initial: { name: c.name, headline: c.headline, email: c.email, phone: c.phone, location: c.location, source: c.source, licence: c.lic, licenceOk: c.ok },
          submit: async (v) => {
            await send("PATCH", `/candidates/${c.id}`, v);
            await done("Candidate saved", String(v.name));
          },
          danger: { label: "Delete candidate", run: () => a.deleteCandidate(c) },
        }),

      moveCandidate: async (c, stage) => {
        if (c.stage === stage) return;
        const now = new Date().toISOString();
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) =>
                k.id === c.id
                  ? { ...k, stage, days: 0, events: [{ id: -Date.now(), at: now, actor: dd.me.email, kind: "stage" as const, body: `Moved to ${STAGES[stage]}`, score: null, verdict: null }, ...k.events] }
                  : k
              ),
              roles: c.disqualified
                ? dd.roles
                : dd.roles.map((r) => (r.id === c.roleId ? { ...r, counts: r.counts.map((n, i) => n + (i === stage ? 1 : 0) - (i === c.stage ? 1 : 0)) } : r)),
            }),
            () => send("PATCH", `/candidates/${c.id}`, { stage })
          );
          toast({ title: `${c.name} moved to ${STAGES[stage]}`, kind: stage === STAGES.length - 1 ? "secure" : "info" });
        } catch (err) {
          fail(err);
        }
      },

      disqualifyCandidate: async (c, reason) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) => (k.id === c.id ? { ...k, disqualified: true, disqualifyReason: reason } : k)),
              roles: dd.roles.map((r) => (r.id === c.roleId ? { ...r, disqualified: r.disqualified + 1, counts: r.counts.map((n, i) => n - (i === c.stage ? 1 : 0)) } : r)),
            }),
            () => send("PATCH", `/candidates/${c.id}`, { disqualified: true, disqualifyReason: reason })
          );
          toast({ title: `${c.name} disqualified`, desc: reason, kind: "breach" });
        } catch (err) {
          fail(err);
        }
      },

      requalifyCandidate: async (c) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) => (k.id === c.id ? { ...k, disqualified: false, disqualifyReason: "" } : k)),
              roles: dd.roles.map((r) => (r.id === c.roleId ? { ...r, disqualified: Math.max(0, r.disqualified - 1), counts: r.counts.map((n, i) => n + (i === c.stage ? 1 : 0)) } : r)),
            }),
            () => send("PATCH", `/candidates/${c.id}`, { disqualified: false })
          );
          toast({ title: `${c.name} requalified`, kind: "info" });
        } catch (err) {
          fail(err);
        }
      },

      commentCandidate: async (c, bodyText) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) =>
                k.id === c.id
                  ? { ...k, events: [{ id: -Date.now(), at: new Date().toISOString(), actor: dd.me.email, kind: "comment" as const, body: bodyText, score: null, verdict: null }, ...k.events] }
                  : k
              ),
            }),
            () => send("POST", `/candidates/${c.id}/comments`, { body: bodyText })
          );
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      evaluateCandidate: async (c, ev) => {
        try {
          await mutate(
            (dd) => ({
              ...dd,
              candidates: dd.candidates.map((k) => {
                if (k.id !== c.id) return k;
                const events = [
                  { id: -Date.now(), at: new Date().toISOString(), actor: dd.me.email, kind: "evaluation" as const, body: ev.body, score: ev.score, verdict: ev.verdict },
                  ...k.events,
                ];
                const scores = events.filter((x) => x.kind === "evaluation" && x.score).map((x) => x.score!);
                return { ...k, events, rating: Math.round((scores.reduce((p, q) => p + q, 0) / scores.length) * 10) / 10 };
              }),
            }),
            () => send("POST", `/candidates/${c.id}/evaluations`, ev)
          );
          toast({ title: "Scorecard submitted", desc: `${c.name} · ${ev.verdict}`, kind: "secure" });
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },

      deleteCandidateEvent: async (c, ev) => {
        if (!(await confirm({ title: `Delete this ${ev.kind}?`, body: ev.body.slice(0, 160) || "It will be removed from the profile.", confirmLabel: "Delete", danger: true }))) return;
        try {
          await mutate(
            (dd) => ({ ...dd, candidates: dd.candidates.map((k) => (k.id === c.id ? { ...k, events: k.events.filter((x) => x.id !== ev.id) } : k)) }),
            () => send("DELETE", `/candidate-events/${ev.id}`)
          );
        } catch (err) {
          fail(err);
        }
      },

      deleteCandidate: (c) =>
        destroy({
          title: `Delete ${c.name}?`,
          body: "Their profile, timeline, comments and scorecards will be deleted. The audit log keeps a record.",
          confirmLabel: "Delete candidate",
          path: `/candidates/${c.id}`,
          toast: `${c.name} deleted`,
        }),

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
          "/recruitment": { label: "Create job", run: () => a.postRole() },
          "/employees": { label: "Add employee", run: () => a.addEmployee() },
          "/clients": { label: "Create company", run: () => a.newClient() },
          "/intelligence": { label: "Log an item", run: () => a.logIntel() },
        };
        return map[pathname] ?? null;
      },
    };
    return a;
  }, [data, done, destroy, fail, mutate, toast, confirm, navigate]);

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
