import { LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Search,
  SquareCheck,
  StickyNote,
} from "lucide-react";
import {
  CALL_OUTCOMES,
  CLIENT_STATUSES,
  DEAL_STAGES,
  type Client,
  type Deal,
  type DealStage,
  type Engagement,
  type EngagementKind,
} from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard, type DropPoint } from "../components/DragCard";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu } from "../components/ui/Bits";
import { EditableText } from "../components/ui/EditableText";
import { Avatar, CheckCircle } from "../components/ui/TaskBits";
import { usePortal } from "../lib/DataProvider";
import { aud, dueTone, friendlyDate, initialsOf, matches, money, relativeTime, siteLabel, siteUrl } from "../lib/format";
import { hueClass, personHue, type Hue } from "../lib/hues";
import { DUR, list, row, tween } from "../lib/motion";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DEAL_HUE: Record<DealStage, Hue> = {
  Enquiry: "slate",
  "Site survey": "jacaranda",
  "Proposal sent": "harbour",
  Negotiation: "ochre",
  "Closed won": "euc",
  "Closed lost": "clay",
};
const PROB = Object.fromEntries(DEAL_STAGES) as Record<DealStage, number>;
const OPEN = (d: Deal) => d.stage !== "Closed won" && d.stage !== "Closed lost";
const KIND: Record<EngagementKind, { label: string; verb: string; icon: ReactNode; hue: Hue }> = {
  note: { label: "Note", verb: "Log note", icon: <StickyNote size={14} />, hue: "brass" },
  email: { label: "Email", verb: "Log email", icon: <Mail size={14} />, hue: "harbour" },
  call: { label: "Call", verb: "Log call", icon: <Phone size={14} />, hue: "euc" },
  task: { label: "Task", verb: "Create task", icon: <SquareCheck size={14} />, hue: "ochre" },
  meeting: { label: "Meeting", verb: "Log meeting", icon: <CalendarDays size={14} />, hue: "jacaranda" },
};
const KIND_ORDER: EngagementKind[] = ["note", "email", "call", "task", "meeting"];
const PLURAL: Record<string, string> = { Lead: "Leads", Opportunity: "Opportunities", Customer: "Customers", "Former customer": "Former customers" };

function CompanyMark({ c, size = 30 }: { c: Pick<Client, "org">; size?: number }) {
  return (
    <span className={`pt-crm-mark ${hueClass(personHue(c.org))}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {initialsOf(c.org).slice(0, 2)}
    </span>
  );
}

function useSet() {
  const [, setParams] = useSearchParams();
  return (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v);
      return n;
    });
}

// ── Companies index ─────────────────────────────────────────────────────────
type SortKey = "org" | "owner" | "status" | "sector" | "city" | "deals" | "lastActivity" | "createdAt";
const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "org", label: "Company name" },
  { key: "owner", label: "Owner", className: "pt-hide-sm" },
  { key: "status", label: "Lifecycle stage", className: "pt-crm-stagecol" },
  { key: "sector", label: "Industry", className: "pt-hide-sm" },
  { key: "city", label: "City", className: "pt-hide-sm" },
  { key: "deals", label: "Open deals", className: "pt-hide-sm" },
  { key: "lastActivity", label: "Last activity" },
  { key: "createdAt", label: "Create date", className: "pt-hide-sm" },
];
const GRID = "minmax(220px, 2.2fr) 70px 150px minmax(110px, 1fr) minmax(90px, 0.8fr) 120px 120px 110px";

function CompaniesIndex() {
  const d = usePortal();
  const actions = useActions();
  const set = useSet();
  const me = initialsOf(d.me.email);
  const views = useMemo(
    () =>
      [
        ["All companies", () => true],
        ["My companies", (c: Client) => c.owner === me],
        ...CLIENT_STATUSES.map(([st]) => [PLURAL[st] ?? st, (c: Client) => c.status === st] as const),
      ] as [string, (c: Client) => boolean][],
    [me]
  );
  const [view, setView] = useState(views[0]![0]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lastActivity", dir: -1 });
  const dealSum = (c: Client) => d.deals.filter((x) => x.clientId === c.id && OPEN(x)).reduce((n, x) => n + x.amount, 0);
  const openCount = (c: Client) => d.deals.filter((x) => x.clientId === c.id && OPEN(x)).length;
  const filter = views.find(([v]) => v === view)?.[1] ?? (() => true);
  const rows = d.clients
    .filter((c) => filter(c) && matches(q, c.org, c.domain, c.sector, c.city, c.status, c.owner))
    .sort((a, b) => {
      const val = (c: Client): string | number =>
        sort.key === "deals" ? dealSum(c) : sort.key === "lastActivity" ? c.lastActivity ?? "" : sort.key === "createdAt" ? c.createdAt ?? "" : String(c[sort.key]).toLowerCase();
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });

  if (d.clients.length === 0)
    return (
      <Empty
        index="00"
        title="No companies yet."
        body="Create a company to track its contacts, deals and every note, email, call, meeting and task in one timeline."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.newClient}>
            Create company
          </button>
        }
      />
    );

  return (
    <>
      <div className="pt-crm-views" role="tablist" aria-label="Saved views">
        {views.map(([v, fn]) => (
          <button key={v} role="tab" aria-selected={v === view} className={`pt-crm-view${v === view ? " is-active" : ""}`} onClick={() => setView(v)}>
            {v}
            <span className="pt-tabs__count">{d.clients.filter(fn).length}</span>
          </button>
        ))}
      </div>
      <div className="pt-ats-toolbar">
        <label className="pt-filter" style={{ width: 280 }}>
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, domain, industry or city" aria-label="Search companies" />
        </label>
        <span style={{ flex: 1 }} />
        <span className="pt-meta">
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </span>
      </div>
      <div className="pt-crm-table" role="table" aria-label="Companies">
        <div className="pt-crm-tr pt-crm-tr--head" role="row" style={{ gridTemplateColumns: GRID }}>
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              role="columnheader"
              aria-sort={sort.key === col.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              className={`pt-crm-th ${col.className ?? ""}`}
              onClick={() => setSort((s) => ({ key: col.key, dir: s.key === col.key ? ((-s.dir) as 1 | -1) : col.key === "org" ? 1 : -1 }))}
            >
              {col.label}
              {sort.key === col.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
            </button>
          ))}
        </div>
        <motion.div variants={list} initial="initial" animate="animate">
          {rows.map((c) => (
            <motion.div
              key={c.id}
              variants={row}
              role="row"
              tabIndex={0}
              className="pt-crm-tr"
              style={{ gridTemplateColumns: GRID }}
              onClick={() => set({ id: String(c.id) })}
              onKeyDown={(e) => e.key === "Enter" && set({ id: String(c.id) })}
            >
              <span className="pt-crm-td pt-crm-td--name" role="cell">
                <CompanyMark c={c} />
                <span style={{ minWidth: 0 }}>
                  <span className="pt-crm-name">{c.org}</span>
                  {c.domain && <span className="pt-crm-domain">{siteLabel(c.domain)}</span>}
                </span>
              </span>
              <span className="pt-crm-td pt-hide-sm" role="cell">
                <Avatar initials={c.owner} size={22} />
              </span>
              <span className="pt-crm-td pt-crm-stagecol" role="cell">
                <Badge kind={c.kind} label={c.status} />
              </span>
              <span className="pt-crm-td pt-crm-td--text pt-hide-sm" role="cell">
                {c.sector || "—"}
              </span>
              <span className="pt-crm-td pt-crm-td--text pt-hide-sm" role="cell">
                {c.city || "—"}
              </span>
              <span className="pt-crm-td pt-mono pt-hide-sm" role="cell">
                {openCount(c) ? (
                  <>
                    {money(dealSum(c))} <span className="pt-dim">· {openCount(c)}</span>
                  </>
                ) : (
                  <span className="pt-dim">—</span>
                )}
              </span>
              <span className="pt-crm-td pt-crm-td--text" role="cell">
                {c.lastActivity ? friendlyDate(c.lastActivity, d.today) : <span className="pt-dim">—</span>}
              </span>
              <span className="pt-crm-td pt-crm-td--text pt-hide-sm" role="cell">
                {c.createdAt ? friendlyDate(c.createdAt.slice(0, 10), d.today) : <span className="pt-dim">—</span>}
              </span>
            </motion.div>
          ))}
        </motion.div>
        {rows.length === 0 && <div className="pt-ats-none">No companies in this view.</div>}
      </div>
    </>
  );
}

// ── Deals board ─────────────────────────────────────────────────────────────
function DealsBoard() {
  const d = usePortal();
  const actions = useActions();
  const set = useSet();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const org = (id: number) => d.clients.find((c) => c.id === id)?.org ?? "";
  const shown = d.deals.filter((x) => matches(q, x.name, org(x.clientId), x.owner));
  const open = d.deals.filter(OPEN);
  const total = open.reduce((n, x) => n + x.amount, 0);
  const weighted = open.reduce((n, x) => n + (x.amount * PROB[x.stage]) / 100, 0);
  const won = d.deals.filter((x) => x.stage === "Closed won").reduce((n, x) => n + x.amount, 0);

  // ?deal=<id> (from search) opens that deal.
  const dealParam = Number(params.get("deal")) || null;
  useEffect(() => {
    const deal = d.deals.find((x) => x.id === dealParam);
    if (deal) {
      actions.editDeal(deal);
      set({ deal: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealParam]);

  return (
    <>
      <div className="pt-crm-totals">
        <div>
          <span className="pt-crm-totals__v">{money(total)}</span>
          <span className="pt-crm-totals__l">Total pipeline · {open.length} open</span>
        </div>
        <div>
          <span className="pt-crm-totals__v">{money(Math.round(weighted))}</span>
          <span className="pt-crm-totals__l">Weighted forecast</span>
        </div>
        <div className="pt-hue-euc">
          <span className="pt-crm-totals__v" style={{ color: "var(--hue-fg)" }}>
            {money(won)}
          </span>
          <span className="pt-crm-totals__l">Closed won</span>
        </div>
        <span style={{ flex: 1 }} />
        <label className="pt-filter" style={{ alignSelf: "center" }}>
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals" aria-label="Search deals" />
        </label>
      </div>
      {d.deals.length === 0 && d.clients.length === 0 ? (
        <Empty index="00" title="No deals yet." body="Create a company first, then add deals to track them through the pipeline." />
      ) : (
        <LayoutGroup>
          <div className="pt-kanban pt-crm-kanban">
            {DEAL_STAGES.map(([stage, prob]) => {
              const cards = shown.filter((x) => x.stage === stage);
              const sum = cards.reduce((n, x) => n + x.amount, 0);
              return (
                <section key={stage} className={`pt-kcol ${hueClass(DEAL_HUE[stage])}${over === stage ? " is-over" : ""}`} data-drop={stage} aria-label={`${stage}, ${cards.length} deals`}>
                  <header className="pt-kcol__head">
                    <span className="pt-kcol__swatch" aria-hidden />
                    <h3 className="pt-kcol__title">{stage}</h3>
                    <span className="pt-kcol__count">{cards.length}</span>
                    <span style={{ flex: 1 }} />
                    <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Create deal in ${stage}`} onClick={() => actions.newDeal({ stage })}>
                      <Plus size={15} />
                    </button>
                  </header>
                  <div className="pt-crm-colsum">
                    <span className="pt-mono">{money(sum)}</span>
                    <span className="pt-dim">{prob}% probability</span>
                  </div>
                  <div className="pt-kcol__list">
                    {cards.map((x) => {
                      const tone = OPEN(x) ? dueTone(x.closeDate, d.today, false) : "none";
                      return (
                        <DragCard
                          key={x.id}
                          id={`deal-${x.id}`}
                          label={`${x.name}, ${stage}. Drag to another stage, or press Enter to edit.`}
                          className="pt-tcard pt-crm-deal"
                          onHover={(p: DropPoint | null) => setOver(p?.target ?? null)}
                          onDrop={(p) => void actions.moveDeal(x, p.target as DealStage, p.index)}
                          onOpen={() => actions.editDeal(x)}
                        >
                          <div className="pt-crm-deal__name">{x.name}</div>
                          <button
                            type="button"
                            data-nodrag
                            className="pt-crm-deal__org"
                            onClick={(e) => {
                              e.stopPropagation();
                              set({ id: String(x.clientId), view: null });
                            }}
                          >
                            {org(x.clientId)}
                          </button>
                          <div className="pt-crm-deal__foot">
                            <span className="pt-crm-deal__amount">{aud(x.amount)}</span>
                            <span style={{ flex: 1 }} />
                            {x.closeDate && <span className={`pt-due pt-due--${tone}`}>{friendlyDate(x.closeDate, d.today)}</span>}
                            <Avatar initials={x.owner} size={20} />
                          </div>
                        </DragCard>
                      );
                    })}
                    {cards.length === 0 && <div className="pt-kcol__empty">Drop deals here</div>}
                  </div>
                  <button className="pt-kcol__add" onClick={() => actions.newDeal({ stage })}>
                    <Plus size={14} /> Create deal
                  </button>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      )}
    </>
  );
}

// ── Company record ─────────────────────────────────────────────────────────
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-crm-prop">
      <div className="pt-crm-prop__label">{label}</div>
      <div className="pt-crm-prop__value">{children}</div>
    </div>
  );
}

function Composer({ c, kind, setKind }: { c: Client; kind: EngagementKind; setKind: (k: EngagementKind) => void }) {
  const d = usePortal();
  const actions = useActions();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<string>("Connected");
  const [date, setDate] = useState(d.today);
  const [due, setDue] = useState(d.today);
  const [contactId, setContactId] = useState<string>(c.contacts[0] ? String(c.contacts[0].id) : "");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const needsSubject = kind === "task" || kind === "meeting" || kind === "email";
  const valid = kind === "note" ? !!body.trim() : kind === "call" ? !!(body.trim() || subject.trim()) : !!subject.trim();
  const contact = c.contacts.find((x) => String(x.id) === contactId);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await actions.logEngagement(c, {
      kind,
      subject: kind === "call" ? subject || `Call${contact ? ` with ${contact.name}` : ""}` : subject,
      body,
      outcome: kind === "call" ? outcome : "",
      at: kind === "meeting" ? date : undefined,
      dueDate: kind === "task" ? due : null,
      contactId: (kind === "call" || kind === "email" || kind === "meeting") && contactId ? Number(contactId) : null,
    });
    setBusy(false);
    if (ok) (setSubject(""), setBody(""));
  };

  return (
    <div className={`pt-crm-composer ${hueClass(KIND[kind].hue)}`}>
      <div className="pt-crm-composer__kinds" role="tablist" aria-label="Log activity">
        {KIND_ORDER.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} className={`pt-crm-kind ${hueClass(KIND[k].hue)}${k === kind ? " is-active" : ""}`} onClick={() => setKind(k)}>
            {KIND[k].icon}
            {KIND[k].label}
          </button>
        ))}
      </div>
      <div className="pt-crm-composer__fields">
        {(kind === "call" || kind === "email" || kind === "meeting") && c.contacts.length > 0 && (
          <label className="pt-crm-inline">
            <span>{kind === "email" ? "To" : "With"}</span>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} aria-label="Contact">
              <option value="">No contact</option>
              {c.contacts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "call" && (
          <label className="pt-crm-inline">
            <span>Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Call outcome">
              {CALL_OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
        {kind === "meeting" && (
          <label className="pt-crm-inline">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Meeting date" />
          </label>
        )}
        {kind === "task" && (
          <label className="pt-crm-inline">
            <span>Due</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Task due date" />
          </label>
        )}
      </div>
      {(needsSubject || kind === "call") && (
        <input
          className="pt-crm-subject"
          value={subject}
          maxLength={160}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={kind === "task" ? "Task title" : kind === "meeting" ? "Meeting title" : kind === "email" ? "Subject" : "Call summary (optional)"}
          aria-label={kind === "task" ? "Task title" : "Subject"}
        />
      )}
      <textarea
        ref={ref}
        className="pt-crm-body"
        rows={kind === "task" ? 2 : 3}
        value={body}
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={kind === "note" ? "Start typing to leave a note…" : kind === "task" ? "Notes (optional)" : "Describe what was discussed…"}
        aria-label="Details"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="pt-ats-card__foot">
        {kind === "email" && contact?.email ? (
          <a className="pt-ats-link" href={`mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
            <ExternalLink size={13} /> Open in mail app
          </a>
        ) : (
          <span className="pt-dim" style={{ fontSize: 12 }}>
            Ctrl/⌘ + Enter to save
          </span>
        )}
        <button className="sds-btn sds-btn--sm sds-btn--primary" disabled={!valid || busy} onClick={() => void submit()}>
          {KIND[kind].verb}
        </button>
      </div>
    </div>
  );
}

function EngagementItem({ e, c }: { e: Engagement; c: Client }) {
  const d = usePortal();
  const actions = useActions();
  const k = KIND[e.kind];
  const contact = c.contacts.find((x) => x.id === e.contactId);
  const who = initialsOf(e.actor) || "";
  const title =
    e.kind === "note"
      ? `Note${who ? ` by ${who}` : ""}`
      : e.kind === "call"
        ? `${e.subject || "Call"}${contact && !e.subject.includes(contact.name) ? ` with ${contact.name}` : ""}`
        : e.subject || k.label;
  const when = e.kind === "task" && e.dueDate ? `Due ${friendlyDate(e.dueDate, d.today)}` : e.at.length > 10 ? relativeTime(e.at) : friendlyDate(e.at, d.today);
  return (
    <motion.li layout="position" className={`pt-crm-item ${hueClass(k.hue)}${e.kind === "task" && e.done ? " is-done" : ""}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }}>
      <span className="pt-crm-item__icon">{k.icon}</span>
      <div className="pt-crm-item__card">
        <div className="pt-crm-item__head">
          {e.kind === "task" && (
            <CheckCircle size={16} done={e.done} label={e.done ? "Mark task incomplete" : "Mark task complete"} onToggle={() => e.id > 0 && void actions.patchEngagement(e, { done: !e.done })} />
          )}
          <span className="pt-crm-item__kind">{k.label}</span>
          <strong className="pt-crm-item__title">{title}</strong>
          {e.kind === "call" && e.outcome && <span className={`pt-chip ${e.outcome === "Connected" ? "pt-hue-euc" : "pt-hue-slate"}`}>{e.outcome}</span>}
          <span style={{ flex: 1 }} />
          <span className={`pt-meta${e.kind === "task" && !e.done ? ` pt-due--${dueTone(e.dueDate, d.today, false)}` : ""}`}>{when}</span>
          <RowMenu label={`Actions for this ${e.kind}`} items={[{ label: `Delete ${e.kind}`, danger: true, onSelect: () => void actions.deleteEngagement(e) }]} />
        </div>
        {e.body && <p className="pt-crm-item__body">{e.body}</p>}
        {(e.kind === "email" || e.kind === "meeting") && contact && <div className="pt-meta">With {contact.name}</div>}
      </div>
    </motion.li>
  );
}

const TIMELINE_TABS = ["Activity", "Notes", "Emails", "Calls", "Tasks", "Meetings"] as const;
const TAB_KIND: Record<string, EngagementKind | undefined> = { Notes: "note", Emails: "email", Calls: "call", Tasks: "task", Meetings: "meeting" };

function CompanyRecord({ c }: { c: Client }) {
  const d = usePortal();
  const actions = useActions();
  const set = useSet();
  const [kind, setKind] = useState<EngagementKind>("note");
  const [tab, setTab] = useState<(typeof TIMELINE_TABS)[number]>("Activity");
  const composerRef = useRef<HTMLDivElement>(null);
  const deals = d.deals.filter((x) => x.clientId === c.id);
  const openDeals = deals.filter(OPEN);
  const items = c.activity.filter((e) => !TAB_KIND[tab] || e.kind === TAB_KIND[tab]);
  const upcoming = items.filter((e) => e.kind === "task" && !e.done).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const past = items.filter((e) => !(e.kind === "task" && !e.done));
  const groups = new Map<string, Engagement[]>();
  for (const e of past) {
    const key = `${MONTHS[Number(e.at.slice(5, 7)) - 1]} ${e.at.slice(0, 4)}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const quick = (k: EngagementKind) => {
    setKind(k);
    setTab("Activity");
    composerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => composerRef.current?.querySelector<HTMLElement>("input.pt-crm-subject, textarea")?.focus(), 250);
  };
  const num = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

  return (
    <div className="pt-crm-record">
      <aside className="pt-crm-left">
        <button className="pt-ats-back" onClick={() => set({ id: null })}>
          <ArrowLeft size={14} /> Companies
        </button>
        <div className="pt-crm-ident">
          <CompanyMark c={c} size={52} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <EditableText wrap required className="pt-crm-title" value={c.org} maxLength={80} ariaLabel="Company name" onSave={(v) => void actions.patchClient(c, { org: v })} />
            {c.domain && siteUrl(c.domain) ? (
              <a className="pt-ats-link pt-crm-site" href={siteUrl(c.domain)!} target="_blank" rel="noreferrer noopener" title={c.domain}>
                <span className="pt-crm-site__text">{siteLabel(c.domain)}</span>
                <ExternalLink size={12} className="pt-crm-site__icon" />
              </a>
            ) : c.domain ? (
              <span className="pt-crm-site pt-crm-site__text pt-dim" title={c.domain}>
                {siteLabel(c.domain)}
              </span>
            ) : (
              <span className="pt-dim" style={{ fontSize: 12.5 }}>
                No domain
              </span>
            )}
          </div>
        </div>
        <div className="pt-crm-quick">
          {KIND_ORDER.map((k) => (
            <button key={k} className={`pt-crm-quick__btn ${hueClass(KIND[k].hue)}`} onClick={() => quick(k)} aria-label={KIND[k].verb}>
              <span className="pt-crm-quick__icon">{KIND[k].icon}</span>
              {KIND[k].label}
            </button>
          ))}
        </div>
        <div className="pt-crm-section">
          <div className="pt-crm-section__head">
            <span>About this company</span>
            <button className="pt-addlink" onClick={() => actions.editClient(c)}>
              Edit all
            </button>
          </div>
          <Prop label="Company owner">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar initials={c.owner} size={20} />
              <EditableText className="pt-crm-edit pt-mono" value={c.owner} maxLength={3} placeholder="Initials" ariaLabel="Company owner" onSave={(v) => void actions.patchClient(c, { owner: v.toUpperCase() })} />
            </span>
          </Prop>
          <Prop label="Lifecycle stage">
            <label className={`pt-ats-state ${hueClass(c.kind === "secure" ? "euc" : c.kind === "advisory" ? "ochre" : c.kind === "info" ? "jacaranda" : "slate")}`}>
              <span className="pt-chip__dot" />
              <select value={c.status} aria-label="Lifecycle stage" onChange={(e) => void actions.patchClient(c, { status: e.target.value })}>
                {CLIENT_STATUSES.map(([st]) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
            </label>
          </Prop>
          <Prop label="Industry">
            <EditableText className="pt-crm-edit" value={c.sector} maxLength={60} placeholder="Add industry" ariaLabel="Industry" onSave={(v) => void actions.patchClient(c, { sector: v })} />
          </Prop>
          <Prop label="Company domain">
            <EditableText className="pt-crm-edit pt-mono" value={c.domain} maxLength={120} placeholder="Add domain" ariaLabel="Company domain" onSave={(v) => void actions.patchClient(c, { domain: v })} />
          </Prop>
          <Prop label="Phone">
            <EditableText className="pt-crm-edit pt-mono" value={c.phone} maxLength={30} placeholder="Add phone" ariaLabel="Phone" onSave={(v) => void actions.patchClient(c, { phone: v })} />
          </Prop>
          <Prop label="City">
            <EditableText className="pt-crm-edit" value={c.city} maxLength={60} placeholder="Add city" ariaLabel="City" onSave={(v) => void actions.patchClient(c, { city: v })} />
          </Prop>
          <Prop label="Sites">
            <EditableText className="pt-crm-edit pt-mono" value={String(c.sites)} maxLength={4} ariaLabel="Sites" onSave={(v) => void actions.patchClient(c, { sites: num(v) })} />
          </Prop>
          <Prop label="Annual contract value">
            <EditableText className="pt-crm-edit pt-mono" value={c.value} maxLength={16} ariaLabel="Annual contract value" onSave={(v) => void actions.patchClient(c, { valuePa: num(v) })} />
          </Prop>
          <Prop label="Description">
            <EditableText multiline className="pt-crm-edit" value={c.meta} maxLength={400} placeholder="Add a description" ariaLabel="Description" onSave={(v) => void actions.patchClient(c, { meta: v })} />
          </Prop>
          <Prop label="Create date">
            <span className="pt-crm-static">{c.createdAt ? friendlyDate(c.createdAt.slice(0, 10), d.today) : "—"}</span>
          </Prop>
        </div>
        <button className="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link" style={{ alignSelf: "flex-start" }} onClick={() => void actions.closeClient(c)}>
          Delete company
        </button>
      </aside>

      <section className="pt-crm-middle">
        <div className="pt-tabs" role="tablist">
          {TIMELINE_TABS.map((t) => {
            const n = TAB_KIND[t] ? c.activity.filter((e) => e.kind === TAB_KIND[t]).length : c.activity.length;
            return (
              <button key={t} role="tab" aria-selected={t === tab} className="pt-tabs__tab" onClick={() => setTab(t)}>
                {t}
                <span className="pt-tabs__count">{n}</span>
                {t === tab && <motion.span layoutId={`tab-crm-${c.id}`} className="pt-tabs__rule" transition={tween(DUR.slow)} />}
              </button>
            );
          })}
        </div>
        <div ref={composerRef}>
          <Composer c={c} kind={TAB_KIND[tab] ?? kind} setKind={(k) => (setKind(k), TAB_KIND[tab] && setTab("Activity"))} />
        </div>
        {upcoming.length > 0 && (
          <div className="pt-crm-group">
            <div className="pt-crm-group__label">Upcoming</div>
            <ul className="pt-crm-feed">
              {upcoming.map((e) => (
                <EngagementItem key={e.id} e={e} c={c} />
              ))}
            </ul>
          </div>
        )}
        {[...groups].map(([month, es]) => (
          <div key={month} className="pt-crm-group">
            <div className="pt-crm-group__label">{month}</div>
            <ul className="pt-crm-feed">
              {es.map((e) => (
                <EngagementItem key={e.id} e={e} c={c} />
              ))}
            </ul>
          </div>
        ))}
        {items.length === 0 && <div className="pt-ats-none">Nothing logged here yet.</div>}
      </section>

      <aside className="pt-crm-right">
        <div className="pt-crm-section">
          <div className="pt-crm-section__head">
            <span>Contacts ({c.contacts.length})</span>
            <button className="pt-addlink" onClick={() => actions.addContact(c)}>
              + Add
            </button>
          </div>
          {c.contacts.map((x) => (
            <div key={x.id} className="pt-crm-contact" role="button" tabIndex={0} onClick={() => actions.editContact(c, x)} onKeyDown={(e) => e.key === "Enter" && actions.editContact(c, x)}>
              <Avatar initials={initialsOf(x.name).slice(0, 2)} size={30} />
              <div style={{ minWidth: 0 }}>
                <div className="pt-crm-contact__name">{x.name}</div>
                {x.role && <div className="pt-crm-contact__role">{x.role}</div>}
                {x.email && (
                  <a className="pt-ats-link" href={`mailto:${x.email}`} onClick={(e) => e.stopPropagation()}>
                    <Mail size={12} /> {x.email}
                  </a>
                )}
                {x.phone && (
                  <a className="pt-ats-link pt-mono" href={`tel:${x.phone.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()}>
                    <Phone size={12} /> {x.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
          {c.contacts.length === 0 && <p className="pt-dim" style={{ fontSize: 12.5, margin: 0 }}>No contacts yet.</p>}
        </div>

        <div className="pt-crm-section">
          <div className="pt-crm-section__head">
            <span>Deals ({deals.length})</span>
            <button className="pt-addlink" onClick={() => actions.newDeal({ clientId: c.id })}>
              + Add
            </button>
          </div>
          {openDeals.length > 0 && (
            <div className="pt-crm-dealsum">
              <span className="pt-mono">{money(openDeals.reduce((n, x) => n + x.amount, 0))}</span> open across {openDeals.length} {openDeals.length === 1 ? "deal" : "deals"}
            </div>
          )}
          {deals.map((x) => (
            <div key={x.id} className={`pt-crm-dealcard ${hueClass(DEAL_HUE[x.stage])}`} role="button" tabIndex={0} onClick={() => actions.editDeal(x)} onKeyDown={(e) => e.key === "Enter" && actions.editDeal(x)}>
              <div className="pt-crm-deal__name">{x.name}</div>
              <div className="pt-crm-dealcard__row">
                <span className="pt-crm-deal__amount">{aud(x.amount)}</span>
                <span className="pt-chip">
                  <span className="pt-chip__dot" />
                  {x.stage}
                </span>
              </div>
              {x.closeDate && <div className="pt-meta">Close {friendlyDate(x.closeDate, d.today)}</div>}
            </div>
          ))}
          {deals.length === 0 && <p className="pt-dim" style={{ fontSize: 12.5, margin: 0 }}>No deals yet.</p>}
        </div>
      </aside>
    </div>
  );
}

export function ClientsPage() {
  const d = usePortal();
  const [params] = useSearchParams();
  const set = useSet();
  const id = Number(params.get("id")) || null;
  const client = d.clients.find((c) => c.id === id);
  if (client) return <CompanyRecord c={client} />;
  const view = params.get("view") === "deals" ? "deals" : "companies";
  return (
    <div className="pt-crm">
      <div className="pt-tabs" role="tablist" aria-label="Objects">
        {(
          [
            ["companies", `Companies`, d.clients.length],
            ["deals", `Deals`, d.deals.filter(OPEN).length],
          ] as const
        ).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={view === k} className="pt-tabs__tab" onClick={() => set({ view: k === "deals" ? "deals" : null })}>
            {label}
            <span className="pt-tabs__count">{n}</span>
            {view === k && <motion.span layoutId="tab-crm-objects" className="pt-tabs__rule" transition={tween(DUR.slow)} />}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 18 }}>{view === "deals" ? <DealsBoard /> : <CompaniesIndex />}</div>
    </div>
  );
}
