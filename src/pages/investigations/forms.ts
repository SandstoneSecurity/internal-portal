import {
  CASE_KINDS,
  CASE_STATUSES,
  CREDIBILITY,
  ENTITY_KINDS,
  EVENT_BASES,
  EVIDENCE_KINDS,
  LINK_LABELS,
  RELIABILITY,
  type CaseDetail,
  type CaseEvent,
  type Entity,
  type Evidence,
  type Link,
} from "../../../shared/investigations";
import type { Client } from "../../../shared/types";
import type { FieldSpec, FormSpec, FormValues } from "../../components/ui/FormDrawer";
import { send } from "../../lib/api";

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const evidenceOpts = (d: CaseDetail) => d.evidenceItems.map((e) => ({ value: String(e.id), label: `${e.ref} · ${e.title}` }));
const entityOpts = (d: CaseDetail) => d.entities.map((e) => ({ value: String(e.id), label: `${e.name} (${e.kind.toLowerCase()})` }));
const num = (v: unknown) => (v === "" || v === undefined || v === null ? null : Number(v));

export function caseFields(clients: Client[], creating: boolean): FieldSpec[] {
  return [
    { name: "clientId", label: "Client", type: "select", required: true, options: clients.map((c) => ({ value: String(c.id), label: c.org })) },
    { name: "title", label: "Case", required: true, max: 160, placeholder: "e.g. Copper stock losses at the Port Kembla yard" },
    { name: "kind", label: "Type", type: "select", required: true, options: opts(CASE_KINDS), half: true },
    ...(creating ? [] : [{ name: "status", label: "Status", type: "select" as const, required: true, options: CASE_STATUSES.map(([s]) => ({ value: s, label: s })), half: true }]),
    { name: "lead", label: "Lead investigator (initials)", type: "initials", half: true, placeholder: "WC" },
    { name: "requestedAt", label: "Requested on", type: "date", half: true },
    { name: "requestedBy", label: "Requested by", max: 120, placeholder: "Who at the client asked, and their role" },
    { name: "dueDate", label: "Report due", type: "date", half: true },
    { name: "instructions", label: "Instructions", type: "textarea", max: 8000, placeholder: "What the client asked for, the questions to answer, and the scope agreed." },
    {
      name: "legalBasis",
      label: "Lawful basis",
      type: "textarea",
      max: 2000,
      placeholder: "Engagement letter, consent, the legitimate purpose. Use only public, consented or otherwise lawfully obtained records.",
    },
    {
      name: "access",
      label: "Who can see this case",
      max: 2000,
      placeholder: "Leave empty for everyone with portal access, or list emails",
      hint: "With emails listed, only those people (and you) can see the case or its evidence.",
    },
  ];
}

export const caseBody = (v: FormValues) => ({
  clientId: Number(v.clientId),
  title: v.title,
  kind: v.kind,
  lead: v.lead,
  requestedAt: v.requestedAt || null,
  requestedBy: v.requestedBy,
  dueDate: v.dueDate || null,
  instructions: v.instructions,
  legalBasis: v.legalBasis,
  access: v.access,
  ...(v.status ? { status: v.status } : {}),
});

const evidenceFields: FieldSpec[] = [
  { name: "title", label: "Item", required: true, max: 200, placeholder: "e.g. Weighbridge dockets 1–14 September" },
  { name: "kind", label: "Type", type: "select", required: true, options: opts(EVIDENCE_KINDS), half: true },
  { name: "obtainedAt", label: "Obtained on", type: "date", half: true },
  { name: "source", label: "Source", max: 200, placeholder: "Where it came from: client records, ASIC, a witness", half: true },
  { name: "obtainedBy", label: "Obtained by", max: 120, placeholder: "Initials or name", half: true },
  { name: "sourceUrl", label: "Web address", max: 2000, mono: true, placeholder: "https://… (if it came from a page)" },
  { name: "reliability", label: "Source reliability", type: "select", required: true, options: RELIABILITY.map(([k, l]) => ({ value: k, label: `${k} · ${l}` })), half: true },
  { name: "credibility", label: "Information credibility", type: "select", required: true, options: CREDIBILITY.map(([k, l]) => ({ value: k, label: `${k} · ${l}` })), half: true },
  { name: "notes", label: "Analyst notes", type: "textarea", max: 8000, placeholder: "What it shows, how it was obtained, anything that limits it." },
];

export function evidenceForm(d: CaseDetail, after: () => Promise<void>, item?: Evidence, onDelete?: () => Promise<boolean>): FormSpec {
  return {
    eyebrow: item ? `${d.ref} · ${item.ref}` : d.ref,
    title: item ? item.title : "Add evidence",
    submitLabel: item ? "Save item" : "Add to register",
    intro: item ? undefined : "Graded on the Admiralty scale: how reliable the source is (A–F), and how far the information is borne out (1–6). Attach the file once the item is added.",
    fields: evidenceFields,
    initial: item
      ? { title: item.title, kind: item.kind, obtainedAt: item.obtainedAt ?? "", source: item.source, obtainedBy: item.obtainedBy, sourceUrl: item.sourceUrl, reliability: item.reliability, credibility: item.credibility, notes: item.notes }
      : { title: "", kind: "Document", obtainedAt: new Date().toISOString().slice(0, 10), source: "", obtainedBy: "", sourceUrl: "", reliability: "F", credibility: "6", notes: "" },
    submit: async (v) => {
      const b = { ...v, obtainedAt: v.obtainedAt || null };
      if (item) await send("PATCH", `/inv-evidence/${item.id}`, b);
      else await send("POST", `/investigations/${d.id}/evidence`, b);
      await after();
    },
    danger: item && onDelete ? { label: "Remove from register", run: onDelete } : undefined,
  };
}

export function captureForm(d: CaseDetail, after: (r: { ref: string; title: string }) => Promise<void>): FormSpec {
  return {
    eyebrow: d.ref,
    title: "Capture a web page",
    submitLabel: "Capture",
    intro:
      "The portal fetches the page itself and keeps exactly what came back, with its SHA-256, the address it ended up at, the response and the time, logged against the case. Public pages only: it can't see anything behind a login.",
    fields: [
      { name: "url", label: "Web address", required: true, mono: true, max: 2000, placeholder: "https://…" },
      { name: "title", label: "Title", max: 200, placeholder: "Leave empty to use the page's own title" },
      { name: "notes", label: "Why it matters", type: "textarea", max: 4000 },
    ],
    initial: { url: "", title: "", notes: "" },
    submit: async (v) => {
      const r = await send<{ ref: string; title: string }>("POST", `/investigations/${d.id}/captures`, v);
      await after(r);
    },
  };
}

export function entityForm(d: CaseDetail, after: () => Promise<void>, item?: Entity, onDelete?: () => Promise<boolean>, at?: { x: number; y: number }): FormSpec {
  return {
    eyebrow: d.ref,
    title: item ? item.name : "Add a person or thing",
    submitLabel: item ? "Save" : "Add to chart",
    fields: [
      { name: "kind", label: "What it is", type: "select", required: true, options: opts(ENTITY_KINDS), half: true },
      { name: "name", label: "Name", required: true, max: 160, placeholder: "e.g. Mark Feeney, Coastal Freight Pty Ltd, 12 Wharf Rd" },
      { name: "detail", label: "Identifying detail", type: "textarea", max: 1000, placeholder: "Date of birth, ABN, account or registration number, role" },
    ],
    initial: item ? { kind: item.kind, name: item.name, detail: item.detail } : { kind: "Person", name: "", detail: "" },
    submit: async (v) => {
      if (item) await send("PATCH", `/inv-entities/${item.id}`, v);
      else await send("POST", `/investigations/${d.id}/entities`, { ...v, ...(at ?? {}) });
      await after();
    },
    danger: item && onDelete ? { label: "Remove (and its links)", run: onDelete } : undefined,
  };
}

export function linkForm(d: CaseDetail, after: () => Promise<void>, item?: Link, from?: number, onDelete?: () => Promise<boolean>): FormSpec {
  return {
    eyebrow: d.ref,
    title: item ? "Edit link" : "Link two things",
    submitLabel: item ? "Save link" : "Add link",
    intro: "Say exactly what joins them: director of, employed by, communicated with, appeared alongside.",
    fields: [
      { name: "fromId", label: "From", type: "select", required: true, options: entityOpts(d) },
      { name: "label", label: "Relationship", required: true, max: 80, suggest: LINK_LABELS, placeholder: "e.g. director of" },
      { name: "toId", label: "To", type: "select", required: true, options: entityOpts(d) },
      { name: "evidenceId", label: "Shown by", type: "select", options: evidenceOpts(d) },
      { name: "note", label: "Note", type: "textarea", max: 1000 },
    ],
    initial: item
      ? { fromId: String(item.fromId), label: item.label, toId: String(item.toId), evidenceId: item.evidenceId ? String(item.evidenceId) : "", note: item.note }
      : { fromId: String(from ?? d.entities[0]?.id ?? ""), label: "", toId: String(d.entities.find((e) => e.id !== (from ?? d.entities[0]?.id))?.id ?? ""), evidenceId: "", note: "" },
    submit: async (v) => {
      const b = { fromId: Number(v.fromId), toId: Number(v.toId), label: v.label, evidenceId: num(v.evidenceId), note: v.note };
      if (item) await send("PATCH", `/inv-links/${item.id}`, b);
      else await send("POST", `/investigations/${d.id}/links`, b);
      await after();
    },
    danger: item && onDelete ? { label: "Remove link", run: onDelete } : undefined,
  };
}

export function eventForm(d: CaseDetail, after: () => Promise<void>, item?: CaseEvent, onDelete?: () => Promise<boolean>, preset?: Partial<CaseEvent>): FormSpec {
  const given = item?.located === "given";
  return {
    eyebrow: d.ref,
    title: item ? "Edit event" : "Add to the timeline",
    submitLabel: item ? "Save event" : "Add event",
    intro: item ? undefined : "Documented: borne out by evidence. Claimed: what someone says happened, tested against the documented events.",
    fields: [
      { name: "title", label: "What happened", required: true, max: 200, placeholder: "e.g. White Hilux enters the yard" },
      { name: "basis", label: "Basis", type: "select", required: true, options: opts(EVENT_BASES), half: true },
      { name: "evidenceId", label: "Shown by", type: "select", options: evidenceOpts(d), half: true },
      { name: "startsAt", label: "From", type: "datetime", required: true, half: true },
      { name: "endsAt", label: "Until (optional)", type: "datetime", half: true },
      { name: "place", label: "Where", max: 160, placeholder: "Suburb or address, e.g. Port Kembla", hint: "A suburb places it on the map; or give exact coordinates." },
      { name: "lat", label: "Latitude", type: "number", step: 0.000001, half: true, mono: true },
      { name: "lng", label: "Longitude", type: "number", step: 0.000001, half: true, mono: true },
      { name: "entityIds", label: "Who and what was involved", type: "multi", options: entityOpts(d) },
      { name: "detail", label: "Detail", type: "textarea", max: 4000 },
    ],
    initial: item
      ? {
          title: item.title,
          basis: item.basis,
          evidenceId: item.evidenceId ? String(item.evidenceId) : "",
          startsAt: item.startsAt,
          endsAt: item.endsAt ?? "",
          place: item.place,
          lat: given ? item.lat ?? "" : "",
          lng: given ? item.lng ?? "" : "",
          entityIds: item.entityIds.join(","),
          detail: item.detail,
        }
      : {
          title: "",
          basis: preset?.basis ?? "Documented",
          evidenceId: "",
          startsAt: preset?.startsAt ?? "",
          endsAt: "",
          place: "",
          lat: "",
          lng: "",
          entityIds: (preset?.entityIds ?? []).join(","),
          detail: "",
        },
    submit: async (v) => {
      const b = {
        title: v.title,
        basis: v.basis,
        evidenceId: num(v.evidenceId),
        startsAt: v.startsAt,
        endsAt: v.endsAt || null,
        place: v.place,
        lat: num(v.lat),
        lng: num(v.lng),
        entityIds: String(v.entityIds ?? "")
          .split(",")
          .filter(Boolean)
          .map(Number),
        detail: v.detail,
      };
      if (item) await send("PATCH", `/inv-events/${item.id}`, b);
      else await send("POST", `/investigations/${d.id}/events`, b);
      await after();
    },
    danger: item && onDelete ? { label: "Remove event", run: onDelete } : undefined,
  };
}

export function reportForm(d: CaseDetail, after: () => Promise<void>): FormSpec {
  const next = (d.reports[0]?.version ?? 0) + 1;
  return {
    eyebrow: d.ref,
    title: `Issue report v${next}`,
    submitLabel: `Issue v${next}`,
    intro: "Each version is kept as issued: it can't be edited or deleted. Attach the document to it once issued.",
    fields: [
      { name: "title", label: "Title", required: true, max: 200, placeholder: next === 1 ? "e.g. Interim findings" : "e.g. Final report" },
      { name: "summary", label: "Summary of findings", type: "textarea", max: 8000 },
    ],
    initial: { title: "", summary: "" },
    submit: async (v) => {
      await send("POST", `/investigations/${d.id}/reports`, v);
      await after();
    },
  };
}
