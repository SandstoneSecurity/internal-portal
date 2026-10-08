import { lazy, Suspense, useRef, useState } from "react";
import { ArrowLeft, Download, Lock, Paperclip, Pencil, Plus, Search } from "lucide-react";
import { CASE_STATUSES, analyseTimeline, type CaseDetail, type CaseEvent, type Evidence, type Report } from "../../../shared/investigations";
import { useActions } from "../../actions/ActionHost";
import { Badge } from "../../components/ui/Badge";
import { Empty, RowMenu, Tabs } from "../../components/ui/Bits";
import { useConfirm } from "../../components/ui/Confirm";
import { send, sendFile } from "../../lib/api";
import { usePortal } from "../../lib/DataProvider";
import { fileSize, matches } from "../../lib/format";
import { EvidenceTab } from "./EvidenceTab";
import { caseBody, caseFields, entityForm, eventForm, evidenceForm, captureForm, linkForm, reportForm } from "./forms";
import { ENTITY_ICON, LinkChart } from "./LinkChart";
import { TimelineTab } from "./TimelineTab";
import { useCase } from "./useCase";

const CaseMap = lazy(() => import("./CaseMap"));

export const CASE_TABS = ["Overview", "Evidence", "Link chart", "Timeline", "Map", "Reports", "Audit log"] as const;
export type CaseTab = (typeof CASE_TABS)[number];
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function CaseView({ id, tab, onTab, onBack }: { id: number; tab: CaseTab; onTab: (t: CaseTab) => void; onBack: () => void }) {
  const { data: d, error, act } = useCase(id);
  const portal = usePortal();
  const actions = useActions();
  const confirm = useConfirm();
  const after = async () => {
    await act(async () => undefined);
  };

  if (error)
    return (
      <div>
        <button className="pt-ats-back" onClick={onBack}>
          <ArrowLeft size={14} /> All cases
        </button>
        <Empty index="—" title="That case isn't available." body={error} />
      </div>
    );
  if (!d) return <div className="pt-skeleton" style={{ height: 420 }} aria-busy="true" aria-label="Loading the case" />;

  const readOnly = d.status === "Closed";
  const remove = (label: string, path: string, done: string) => async () => {
    if (!(await confirm({ title: `Remove ${label}?`, body: "This is recorded in the case's audit log.", confirmLabel: "Remove", danger: true }))) return false;
    return act(() => send("DELETE", path), { title: done });
  };
  const editCase = () =>
    actions.openForm({
      eyebrow: d.ref,
      title: "Edit case",
      submitLabel: "Save case",
      fields: caseFields(portal.clients, false),
      initial: {
        clientId: String(d.clientId ?? ""),
        title: d.title,
        kind: d.kind,
        status: d.status,
        lead: d.lead,
        requestedAt: d.requestedAt ?? "",
        requestedBy: d.requestedBy,
        dueDate: d.dueDate ?? "",
        instructions: d.instructions,
        legalBasis: d.legalBasis,
        access: d.access.join(", "),
      },
      submit: async (v) => {
        await send("PATCH", `/investigations/${d.id}`, caseBody(v));
        await after();
      },
    });
  const deleteCase = async () => {
    if (
      !(await confirm({
        title: `Delete ${d.ref}?`,
        body: `${d.title}: its evidence, files, link chart, timeline, reports and audit log will be deleted for good.`,
        confirmLabel: "Delete case",
        danger: true,
      }))
    )
      return;
    if (await act(() => send("DELETE", `/investigations/${d.id}`), { title: `${d.ref} deleted` })) onBack();
  };
  const setStatus = (status: string) => void act(() => send("PATCH", `/investigations/${d.id}`, { status }), { title: status === "Closed" ? "Case closed" : `Case ${status === "Active" && d.status === "Closed" ? "reopened" : "updated"}`, desc: `${d.ref} · ${status}` });

  const findings = analyseTimeline(d.events);
  const counts: Partial<Record<CaseTab, number>> = {
    Evidence: d.evidenceItems.length,
    "Link chart": d.entities.length,
    Timeline: d.events.length,
    Map: d.events.filter((e) => e.lat !== null).length,
    Reports: d.reports.length,
  };
  const openEvent = (e: CaseEvent) => actions.openForm(eventForm(d, after, e, remove("this event", `/inv-events/${e.id}`, "Event removed")));
  const openEvidence = (e: Evidence) => actions.openForm(evidenceForm(d, after, e, remove(e.ref, `/inv-evidence/${e.id}`, `${e.ref} removed`)));

  return (
    <div className="pt-case">
      <button className="pt-ats-back" onClick={onBack}>
        <ArrowLeft size={14} /> All cases
      </button>
      <header className="pt-case__head">
        <div style={{ minWidth: 0 }}>
          <span className="pt-eyebrow">
            {d.ref} · {d.kind}
            {d.restricted && (
              <span className="pt-case__lock" title={`Only ${d.access.join(", ")} can see this case`}>
                <Lock size={11} /> Restricted
              </span>
            )}
          </span>
          <h2 className="pt-case__title">{d.title}</h2>
          <div className="pt-case__sub">
            For {d.client || "a former client"}
            {d.requestedBy ? `, requested by ${d.requestedBy}` : ""}
            {d.requestedAt ? ` on ${d.requestedAt}` : ""} · Lead {d.lead || "unassigned"}
            {d.dueDate ? ` · Report due ${d.dueDate}` : ""}
            {d.late && <span className="pt-case__late"> · OVERDUE</span>}
          </div>
        </div>
        <div className="pt-case__tools">
          <label className="pt-case__status">
            <span className="pt-meta">Status</span>
            <select value={d.status} onChange={(e) => setStatus(e.target.value)} aria-label="Case status">
              {CASE_STATUSES.map(([s]) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {!readOnly && (
            <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={editCase}>
              <Pencil size={13} /> Edit case
            </button>
          )}
          <RowMenu items={[{ label: "Delete case", onSelect: () => void deleteCase(), danger: true }]} />
        </div>
      </header>
      {readOnly && <div className="pt-case__closed">Closed {d.closedAt ? when(d.closedAt) : ""}. The case is locked as a record; set its status back to Active to change it.</div>}

      <Tabs id="case" tabs={CASE_TABS} value={tab} onChange={onTab} counts={counts} />

      {tab === "Overview" && <Overview d={d} findings={findings.length} onTab={onTab} />}
      {tab === "Evidence" && (
        <EvidenceTab
          d={d}
          act={act}
          readOnly={readOnly}
          onAdd={() => actions.openForm(evidenceForm(d, after))}
          onCapture={() => actions.openForm(captureForm(d, after))}
          onEdit={openEvidence}
        />
      )}
      {tab === "Link chart" && <ChartTab d={d} act={act} after={after} remove={remove} readOnly={readOnly} />}
      {tab === "Timeline" && <TimelineTab d={d} readOnly={readOnly} onAdd={() => actions.openForm(eventForm(d, after))} onEdit={openEvent} />}
      {tab === "Map" && (
        <Suspense fallback={<div className="pt-skeleton" style={{ height: 480 }} />}>
          <CaseMap d={d} onOpen={(e) => (readOnly ? undefined : openEvent(e))} />
        </Suspense>
      )}
      {tab === "Reports" && <ReportsTab d={d} act={act} readOnly={readOnly} onIssue={() => actions.openForm(reportForm(d, after))} />}
      {tab === "Audit log" && <LogTab d={d} />}
    </div>
  );
}

function Overview({ d, findings, onTab }: { d: CaseDetail; findings: number; onTab: (t: CaseTab) => void }) {
  const stats: [CaseTab, number, string][] = [
    ["Evidence", d.evidenceItems.length, `${d.evidenceItems.filter((e) => e.file).length} with files held`],
    ["Link chart", d.entities.length, `${d.links.length} links · ${d.links.filter((l) => !l.evidenceId).length} not yet evidenced`],
    ["Timeline", d.events.length, `${findings} ${findings === 1 ? "thing" : "things"} to look at`],
    ["Reports", d.reports.length, d.reports[0] ? `latest v${d.reports[0].version}` : "none issued"],
  ];
  return (
    <div className="pt-split pt-case__overview">
      <div style={{ minWidth: 0 }}>
        <div className="pt-case__stats">
          {stats.map(([t, n, sub]) => (
            <button key={t} className="pt-case__stat" onClick={() => onTab(t)}>
              <span className="pt-meta">{t}</span>
              <b>{n}</b>
              <span className="pt-dim">{sub}</span>
            </button>
          ))}
        </div>
        <section className="pt-case__brief">
          <h3 className="pt-meta">Instructions</h3>
          <p>{d.instructions || <span className="pt-dim">No instructions recorded. Edit the case to add what the client asked for.</span>}</p>
          <h3 className="pt-meta">Lawful basis</h3>
          <p>{d.legalBasis || <span className="pt-dim">Not recorded yet.</span>}</p>
        </section>
      </div>
      <aside className="pt-file">
        <div className="pt-file__pad">
          <span className="pt-eyebrow">Case record</span>
          <div className="pt-facts">
            {(
              [
                ["Status", d.status],
                ["Client", d.client || "—"],
                ["Requested by", d.requestedBy || "—"],
                ["Requested on", d.requestedAt ?? "—"],
                ["Lead", d.lead || "—"],
                ["Report due", d.dueDate ?? "—"],
                ["Opened", when(d.createdAt)],
                ["Opened by", d.createdBy],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="pt-fact">
                <span className="pt-fact__k">{k}</span>
                <span className="pt-fact__v">{v}</span>
              </div>
            ))}
          </div>
          <div className="pt-file__block">
            <span className="pt-meta">Who can see it</span>
            <p style={{ fontSize: 12.5, margin: "4px 0 0" }}>{d.access.length ? d.access.join(", ") : "Everyone with portal access"}</p>
          </div>
          <div className="pt-file__block">
            <span className="pt-meta">Latest activity</span>
            <ol className="pt-ev__custody">
              {d.log.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <span className="pt-reg__mono">{when(l.at)}</span>
                  <span>
                    <b>{l.action}</b> · {l.actor}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ChartTab({
  d,
  act,
  after,
  remove,
  readOnly,
}: {
  d: CaseDetail;
  act: (fn: () => Promise<unknown>, ok?: { title: string }) => Promise<boolean>;
  after: () => Promise<void>;
  remove: (label: string, path: string, done: string) => () => Promise<boolean>;
  readOnly: boolean;
}) {
  const actions = useActions();
  const [sel, setSel] = useState<{ type: "entity" | "link"; id: number } | null>(null);
  const ent = sel?.type === "entity" ? d.entities.find((e) => e.id === sel.id) : undefined;
  const link = sel?.type === "link" ? d.links.find((l) => l.id === sel.id) : undefined;
  const name = (id: number) => d.entities.find((e) => e.id === id)?.name ?? "?";
  const ev = (id: number | null) => (id ? d.evidenceItems.find((e) => e.id === id) : undefined);
  // A double-click puts it where you clicked; otherwise the chart's layout finds it a place.
  const addAt = (at?: { x: number; y: number }) => actions.openForm(entityForm(d, after, undefined, undefined, at && { x: Math.round(at.x), y: Math.round(at.y) }));
  void act;
  return (
    <div className="pt-split pt-chartwrap">
      <LinkChart d={d} selected={sel} onSelect={setSel} onAddAt={addAt} readOnly={readOnly} />
      <aside className="pt-file">
        <div className="pt-file__pad">
          {ent ? (
            <>
              <span className="pt-eyebrow">{ent.kind}</span>
              <div className="pt-file__title">{ent.name}</div>
              {ent.detail && <div className="pt-file__sub" style={{ whiteSpace: "pre-line" }}>{ent.detail}</div>}
              <div className="pt-file__block">
                <span className="pt-meta">Links</span>
                <ul className="pt-chart__rels">
                  {d.links
                    .filter((l) => l.fromId === ent.id || l.toId === ent.id)
                    .map((l) => (
                      <li key={l.id}>
                        <button className="pt-chart__rel" onClick={() => setSel({ type: "link", id: l.id })}>
                          {l.fromId === ent.id ? (
                            <>
                              <i>{l.label}</i> {name(l.toId)}
                            </>
                          ) : (
                            <>
                              {name(l.fromId)} <i>{l.label}</i> this
                            </>
                          )}
                          <span className={ev(l.evidenceId) ? "pt-tl__ev" : "pt-tl__noev"}>{ev(l.evidenceId)?.ref ?? "no evidence"}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
              <div className="pt-file__block">
                <span className="pt-meta">On the timeline</span>
                <ul className="pt-ev__used">
                  {d.events
                    .filter((e) => e.entityIds.includes(ent.id))
                    .map((e) => (
                      <li key={e.id}>
                        {e.startsAt.replace("T", " ")} · {e.title}
                      </li>
                    ))}
                </ul>
              </div>
              {!readOnly && (
                <div className="pt-file__actions">
                  <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => actions.openForm(linkForm(d, after, undefined, ent.id))} disabled={d.entities.length < 2}>
                    <Plus size={13} /> Link to…
                  </button>
                  <button
                    className="sds-btn sds-btn--sm sds-btn--ghost"
                    onClick={() => actions.openForm(entityForm(d, after, ent, async () => (await remove(ent.name, `/inv-entities/${ent.id}`, `${ent.name} removed`)()) && (setSel(null), true)))}
                  >
                    Edit
                  </button>
                </div>
              )}
            </>
          ) : link ? (
            <>
              <span className="pt-eyebrow">Link</span>
              <div className="pt-chart__linkhead">
                <b>{name(link.fromId)}</b>
                <i>{link.label}</i>
                <b>{name(link.toId)}</b>
              </div>
              <div className="pt-file__block">
                <span className="pt-meta">Shown by</span>
                <p style={{ fontSize: 13, margin: "4px 0 0" }}>{ev(link.evidenceId) ? `${ev(link.evidenceId)!.ref} · ${ev(link.evidenceId)!.title}` : <span className="pt-tl__noev">Not yet evidenced</span>}</p>
              </div>
              {link.note && <p className="pt-ev__notes">{link.note}</p>}
              {!readOnly && (
                <div className="pt-file__actions">
                  <button
                    className="sds-btn sds-btn--sm sds-btn--ghost"
                    onClick={() => actions.openForm(linkForm(d, after, link, undefined, async () => (await remove("this link", `/inv-links/${link.id}`, "Link removed")()) && (setSel(null), true)))}
                  >
                    Edit link
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="pt-eyebrow">People and things</span>
              <ul className="pt-chart__index">
                {d.entities.map((e) => {
                  const Icon = ENTITY_ICON[e.kind];
                  const n = d.links.filter((l) => l.fromId === e.id || l.toId === e.id).length;
                  return (
                    <li key={e.id}>
                      <button onClick={() => setSel({ type: "entity", id: e.id })}>
                        <Icon size={14} /> {e.name} <span className="pt-dim">{n ? `${n} ${n === 1 ? "link" : "links"}` : "unlinked"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!readOnly && (
                <div className="pt-file__actions">
                  <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => addAt()}>
                    <Plus size={13} /> Add person or thing
                  </button>
                  <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.openForm(linkForm(d, after))} disabled={d.entities.length < 2}>
                    Add link
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ReportsTab({ d, act, readOnly, onIssue }: { d: CaseDetail; act: (fn: () => Promise<unknown>, ok?: { title: string; desc?: string }) => Promise<boolean>; readOnly: boolean; onIssue: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Report | null>(null);
  if (!d.reports.length)
    return (
      <Empty
        index="00"
        title="No reports issued."
        body="Issue each version of the report here. Versions are kept as issued, never edited or deleted, each with its document and who issued it."
        action={
          !readOnly && (
            <button className="sds-btn sds-btn--md sds-btn--primary" onClick={onIssue}>
              Issue v1
            </button>
          )
        }
      />
    );
  return (
    <div className="pt-reports">
      {!readOnly && (
        <div className="pt-ev__bar" style={{ justifyContent: "flex-end" }}>
          <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={onIssue}>
            <Plus size={14} /> Issue v{d.reports[0]!.version + 1}
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Attach the report document"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && target) void act(() => sendFile(`/inv-reports/${target.id}/file`, f), { title: `Document attached to v${target.version}`, desc: f.name });
          e.target.value = "";
        }}
      />
      <ol className="pt-reports__list">
        {d.reports.map((r) => (
          <li key={r.id} className="pt-reports__item">
            <span className="pt-reports__v">v{r.version}</span>
            <div style={{ minWidth: 0 }}>
              <b>{r.title}</b>
              <div className="pt-dim" style={{ fontSize: 12 }}>
                Issued {when(r.createdAt)} by {r.createdBy}
              </div>
              {r.summary && <p className="pt-ev__notes">{r.summary}</p>}
              {r.file ? (
                <div className="pt-reports__file">
                  <a href={`/api/inv-files/${r.file.id}`} target="_blank" rel="noopener">
                    {r.file.name}
                  </a>
                  <span className="pt-dim">{fileSize(r.file.size)}</span>
                  <code title={`SHA-256 ${r.file.sha256}`}>{r.file.sha256.slice(0, 16)}…</code>
                  <a className="pt-iconbtn pt-iconbtn--sm" href={`/api/inv-files/${r.file.id}?download=1`} aria-label={`Download v${r.version}`}>
                    <Download size={13} />
                  </a>
                </div>
              ) : (
                !readOnly && (
                  <button
                    className="pt-addlink"
                    onClick={() => {
                      setTarget(r);
                      input.current?.click();
                    }}
                  >
                    <Paperclip size={12} /> Attach the document
                  </button>
                )
              )}
            </div>
            <Badge kind={r.version === d.reports[0]!.version ? "secure" : "neutral"} label={r.version === d.reports[0]!.version ? "Latest" : "Superseded"} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LogTab({ d }: { d: CaseDetail }) {
  const [q, setQ] = useState("");
  const rows = d.log.filter((l) => matches(q, l.action, l.detail, l.actor));
  const csv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const text = ["When (UTC),Who,Action,Detail", ...d.log.slice().reverse().map((l) => [l.at, l.actor, l.action, l.detail].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${d.ref}-audit-log.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="pt-ev__bar">
        <label className="pt-search" style={{ width: 260, height: 30, cursor: "text" }}>
          <Search size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the log"
            aria-label="Search the audit log"
            style={{ border: 0, outline: 0, background: "transparent", width: "100%", color: "var(--text-primary)", font: "inherit" }}
          />
        </label>
        <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={csv}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      <p className="pt-dim" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
        Every change, file opening and download, with who and when. Nothing here can be edited or removed.
      </p>
      <div className="pt-reg">
        <div className="pt-reg__head pt-log__cols">
          <span>When</span>
          <span>Who</span>
          <span>What</span>
        </div>
        {rows.map((l) => (
          <div key={l.id} className="pt-reg__row pt-log__cols" style={{ cursor: "default" }}>
            <span className="pt-reg__mono">{when(l.at)}</span>
            <span className="pt-reg__text">{l.actor}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{l.action}</b>
              {l.detail && <span className="pt-log__detail">{l.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
