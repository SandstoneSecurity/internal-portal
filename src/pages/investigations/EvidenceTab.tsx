import { useRef, useState } from "react";
import { Copy, Download, Eye, Globe, Paperclip, Plus, Search } from "lucide-react";
import { CREDIBILITY, RELIABILITY, type CaseDetail, type Evidence } from "../../../shared/investigations";
import { Empty } from "../../components/ui/Bits";
import { sendFile } from "../../lib/api";
import { fileSize, matches } from "../../lib/format";
import { useToast } from "../../components/ui/Toast";

const grade = (e: Evidence) => `${e.reliability}${e.credibility}`;
const gradeTitle = (e: Evidence) =>
  `${e.reliability}: ${RELIABILITY.find(([k]) => k === e.reliability)?.[1] ?? ""}. ${e.credibility}: ${CREDIBILITY.find(([k]) => k === e.credibility)?.[1] ?? ""}.`;
const gradeTone = (e: Evidence) => (/[AB]/.test(e.reliability) && /[12]/.test(e.credibility) ? "secure" : /[EF]/.test(e.reliability) || /[56]/.test(e.credibility) ? "neutral" : "advisory");
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The evidence register: every item numbered, graded, sourced, and — where there's a file — held here with
 * its SHA-256, checked each time it's opened. A web capture keeps the page exactly as fetched.
 */
export function EvidenceTab({
  d,
  act,
  onAdd,
  onCapture,
  onEdit,
  readOnly,
}: {
  d: CaseDetail;
  act: (fn: () => Promise<unknown>, ok?: { title: string; desc?: string }) => Promise<boolean>;
  onAdd: () => void;
  onCapture: () => void;
  onEdit: (e: Evidence) => void;
  readOnly: boolean;
}) {
  const [q, setQ] = useState("");
  const [selId, setSel] = useState<number | null>(d.evidenceItems[0]?.id ?? null);
  const shown = d.evidenceItems.filter((e) => matches(q, e.ref, e.title, e.kind, e.source, e.notes, e.sourceUrl, e.file?.name, e.file?.sha256));
  const sel = d.evidenceItems.find((e) => e.id === selId) ?? shown[0];

  if (!d.evidenceItems.length)
    return (
      <Empty
        index="00"
        title="The evidence register is empty."
        body="Add each item as it comes in: documents, photos, statements, record searches. Attach its file to keep it here with its SHA-256, or capture a web page so a finding traces back to exactly what was online."
        action={
          !readOnly && (
            <>
              <button className="sds-btn sds-btn--md sds-btn--primary" onClick={onAdd}>
                Add evidence
              </button>
              <button className="sds-btn sds-btn--md sds-btn--secondary" onClick={onCapture}>
                Capture a web page
              </button>
            </>
          )
        }
      />
    );

  return (
    <div className="pt-split pt-ev">
      <div style={{ minWidth: 0 }}>
        <div className="pt-ev__bar">
          <label className="pt-search" style={{ width: 240, height: 30, cursor: "text" }}>
            <Search size={13} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search evidence or a hash"
              aria-label="Search evidence"
              style={{ border: 0, outline: 0, background: "transparent", width: "100%", color: "var(--text-primary)", font: "inherit" }}
            />
          </label>
          {!readOnly && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={onCapture}>
                <Globe size={14} /> Capture page
              </button>
              <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={onAdd}>
                <Plus size={14} /> Add evidence
              </button>
            </div>
          )}
        </div>
        <div className="pt-reg">
          <div className="pt-reg__head pt-ev__cols">
            <span>Ref</span>
            <span>Item</span>
            <span>Grade</span>
            <span>Obtained</span>
            <span>File</span>
          </div>
          {shown.map((e) => (
            <div
              key={e.id}
              className="pt-reg__row pt-ev__cols"
              aria-selected={e.id === sel?.id}
              tabIndex={0}
              data-evidence={e.ref}
              onClick={() => setSel(e.id)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setSel(e.id))}
            >
              <span className="pt-reg__mono">{e.ref}</span>
              <span style={{ minWidth: 0 }}>
                <span className="pt-reg__name" style={{ display: "block" }}>
                  {e.title}
                </span>
                <span className="pt-reg__sub">
                  {e.kind}
                  {e.source ? ` · ${e.source}` : ""}
                </span>
              </span>
              <span className={`pt-ev__grade is-${gradeTone(e)}`} title={gradeTitle(e)}>
                {grade(e)}
              </span>
              <span className="pt-reg__mono">{e.obtainedAt ?? "—"}</span>
              <span className="pt-reg__mono" title={e.file ? `SHA-256 ${e.file.sha256}` : undefined}>
                {e.file ? `${e.file.sha256.slice(0, 8)}…` : <span className="pt-dim">—</span>}
              </span>
            </div>
          ))}
          {!shown.length && <div style={{ padding: "16px 12px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>Nothing matches.</div>}
        </div>
      </div>
      {sel && <EvidenceFile key={sel.id} d={d} e={sel} act={act} onEdit={() => onEdit(sel)} readOnly={readOnly} />}
    </div>
  );
}

function EvidenceFile({ d, e, act, onEdit, readOnly }: { d: CaseDetail; e: Evidence; act: (fn: () => Promise<unknown>, ok?: { title: string; desc?: string }) => Promise<boolean>; onEdit: () => void; readOnly: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const usedIn = [
    ...d.links.filter((l) => l.evidenceId === e.id).map((l) => `${d.entities.find((x) => x.id === l.fromId)?.name} — ${l.label} → ${d.entities.find((x) => x.id === l.toId)?.name}`),
    ...d.events.filter((x) => x.evidenceId === e.id).map((x) => `${x.startsAt.replace("T", " ")} · ${x.title}`),
  ];
  // The item's chain of custody: every log line about it.
  const custody = d.log.filter((l) => l.action.includes(e.ref) || l.detail.includes(e.ref)).slice().reverse();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", desc: "SHA-256 on the clipboard", kind: "secure" });
    } catch {
      /* clipboard refused: nothing to do */
    }
  };
  const attach = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    await act(() => sendFile(`/inv-evidence/${e.id}/file`, f), { title: `File attached to ${e.ref}`, desc: f.name });
    setBusy(false);
  };
  const isText = e.file && /^(text\/|application\/(xhtml\+xml|json|xml))/.test(e.file.mime);
  return (
    <aside className="pt-file">
      <div className="pt-file__pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="pt-eyebrow">
            {d.ref} · {e.ref}
          </span>
          <span className={`pt-ev__grade is-${gradeTone(e)}`} title={gradeTitle(e)}>
            {grade(e)}
          </span>
        </div>
        <div className="pt-file__title">{e.title}</div>
        <div className="pt-file__sub">
          {e.kind}
          {e.source ? ` · ${e.source}` : ""}
        </div>
        <p className="pt-ev__gradeline">{gradeTitle(e)}</p>

        {e.capture && (
          <div className="pt-ev__capture">
            <span className="pt-meta">Captured {when(e.capture.fetchedAt)}</span>
            <a href={e.capture.url} target="_blank" rel="noopener noreferrer">
              {e.capture.url}
            </a>
            {e.capture.finalUrl !== e.capture.url && <span className="pt-dim">→ {e.capture.finalUrl}</span>}
            <span className="pt-reg__mono">
              HTTP {e.capture.status} · {e.capture.contentType}
            </span>
          </div>
        )}
        {!e.capture && e.sourceUrl && (
          <a className="pt-ev__url" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">
            {e.sourceUrl}
          </a>
        )}

        <div className="pt-file__block">
          <span className="pt-meta">File</span>
          {e.file ? (
            <div className="pt-ev__filebox">
              <div className="pt-ev__fname">
                {e.file.name} <span className="pt-dim">· {fileSize(e.file.size)}</span>
              </div>
              <div className="pt-ev__hash">
                <code>SHA-256 {e.file.sha256}</code>
                <button className="pt-iconbtn pt-iconbtn--sm" onClick={() => void copy(e.file!.sha256)} aria-label="Copy SHA-256" title="Copy SHA-256">
                  <Copy size={12} />
                </button>
              </div>
              <div className="pt-ev__fileacts">
                <a className="sds-btn sds-btn--sm sds-btn--secondary" href={`/api/inv-files/${e.file.id}${isText ? "?as=text" : ""}`} target="_blank" rel="noopener">
                  <Eye size={13} /> {isText ? "View source" : "View"}
                </a>
                <a className="sds-btn sds-btn--sm sds-btn--ghost" href={`/api/inv-files/${e.file.id}?download=1`}>
                  <Download size={13} /> Download
                </a>
              </div>
              <p className="pt-dim" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
                Checked against its SHA-256 each time it's opened; each opening is logged.
              </p>
            </div>
          ) : readOnly ? (
            <p className="pt-dim" style={{ fontSize: 12.5, margin: "4px 0 0" }}>
              No file.
            </p>
          ) : (
            <>
              <button className="sds-btn sds-btn--sm sds-btn--secondary" style={{ marginTop: 6 }} disabled={busy} onClick={() => input.current?.click()}>
                <Paperclip size={13} /> {busy ? "Attaching…" : "Attach file"}
              </button>
              <input ref={input} type="file" hidden onChange={(ev) => void attach(ev.target.files?.[0])} aria-label={`Attach a file to ${e.ref}`} />
              <p className="pt-dim" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
                Up to 20 MB. Once attached it can't be swapped: add a new item instead.
              </p>
            </>
          )}
        </div>

        <div className="pt-facts">
          <div className="pt-fact">
            <span className="pt-fact__k">Obtained</span>
            <span className="pt-fact__v">
              {e.obtainedAt ?? "—"}
              {e.obtainedBy ? ` · ${e.obtainedBy}` : ""}
            </span>
          </div>
          <div className="pt-fact">
            <span className="pt-fact__k">Registered</span>
            <span className="pt-fact__v">{when(e.createdAt)}</span>
          </div>
          <div className="pt-fact">
            <span className="pt-fact__k">By</span>
            <span className="pt-fact__v">{e.createdBy}</span>
          </div>
        </div>

        {e.notes && (
          <div className="pt-file__block">
            <span className="pt-meta">Analyst notes</span>
            <p className="pt-ev__notes">{e.notes}</p>
          </div>
        )}
        {usedIn.length > 0 && (
          <div className="pt-file__block">
            <span className="pt-meta">Relied on in</span>
            <ul className="pt-ev__used">
              {usedIn.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="pt-file__block">
          <span className="pt-meta">Chain of custody</span>
          <ol className="pt-ev__custody">
            {custody.map((l) => (
              <li key={l.id}>
                <span className="pt-reg__mono">{when(l.at)}</span>
                <span>
                  <b>{l.action}</b> · {l.actor}
                </span>
                {l.detail && <span className="pt-dim pt-ev__cdetail">{l.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
        {!readOnly && (
          <div className="pt-file__actions">
            <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={onEdit}>
              Edit item
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
