import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CircleAlert,
  CircleCheck,
  Columns3,
  Download,
  ExternalLink,
  FileText,
  List as ListIcon,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import { DISQUALIFY_REASONS, HIRED_STAGE, ROLE_STATUSES, STAGES, VERDICTS, type Candidate, type CandidateEvent, type CandidateFile, type Role } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { DragCard, type DropPoint } from "../components/DragCard";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu } from "../components/ui/Bits";
import { Drawer } from "../components/ui/Overlay";
import { Avatar } from "../components/ui/TaskBits";
import { usePortal } from "../lib/DataProvider";
import { fileSize, friendlyDate, initialsOf, matches, relativeTime } from "../lib/format";
import { hueClass, type Hue } from "../lib/hues";
import { DUR, list, row, tween } from "../lib/motion";

/** One colour per pipeline stage, earliest to hired. */
const STAGE_HUE: Hue[] = ["slate", "jacaranda", "harbour", "ochre", "brass", "euc", "euc"];
const JOB_TABS = ["All", "Published", "Draft", "On hold", "Closed"] as const;

const initials = (name: string) => initialsOf(name).slice(0, 2);

// ── Small parts ──────────────────────────────────────────────────────────────
function Stars({ value, size = 13, label }: { value: number | null; size?: number; label?: string }) {
  const v = value ?? 0;
  return (
    <span className="pt-stars" aria-label={label ?? (value ? `Rated ${value} of 5` : "Not rated yet")} title={value ? `${value} / 5` : "Not rated yet"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(v) ? "is-on" : undefined} />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="pt-stars pt-stars--input" role="radiogroup" aria-label="Score" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} of 5`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
        >
          <Star size={20} className={i <= (hover || value) ? "is-on" : undefined} />
        </button>
      ))}
    </span>
  );
}

function LicenceTag({ c }: { c: Candidate }) {
  return (
    <span className={`pt-ats-lic${c.ok ? " is-ok" : ""}`} title={c.ok ? "Licence verified as current (SLED)" : "Licence not yet verified"}>
      {c.ok ? <CircleCheck size={12} /> : <CircleAlert size={12} />}
      {c.lic || "No licence"}
    </span>
  );
}

// ── Jobs list ────────────────────────────────────────────────────────────────
function JobsList({ today }: { today: string }) {
  const d = usePortal();
  const actions = useActions();
  const [, setParams] = useSearchParams();
  const [tab, setTab] = useState<(typeof JOB_TABS)[number]>("All");
  const [q, setQ] = useState("");
  const counts = Object.fromEntries(JOB_TABS.map((t) => [t, t === "All" ? d.roles.length : d.roles.filter((r) => r.status === t).length]));
  const shown = d.roles.filter((r) => (tab === "All" || r.status === tab) && matches(q, r.title, r.department, r.location, r.hiringManager));
  const active = d.candidates.filter((c) => !c.disqualified);
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 864e5).toISOString();
  const open = (roleId: number, stage?: number) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("role", String(roleId));
      n.delete("candidate");
      if (stage !== undefined) n.set("stage", String(stage));
      else n.delete("stage");
      return n;
    });

  if (d.roles.length === 0)
    return (
      <Empty
        index="00"
        title="No jobs yet."
        body="Create a job to start a hiring pipeline. Candidates move from sourced through phone screen, SLED licence check, interview and offer to hired, with scorecards and comments along the way."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.postRole}>
            Create job
          </button>
        }
      />
    );

  const stats = [
    { label: "Published jobs", value: d.roles.filter((r) => r.status === "Published").length, hue: "euc" as Hue },
    { label: "Active candidates", value: active.length, hue: "jacaranda" as Hue },
    { label: "In interview", value: active.filter((c) => c.stage === 4).length, hue: "brass" as Hue },
    { label: "Offers out", value: active.filter((c) => c.stage === 5).length, hue: "euc" as Hue },
    { label: "Hired", value: active.filter((c) => c.stage === HIRED_STAGE).length, hue: "euc" as Hue },
  ];

  return (
    <div className="pt-ats">
      <div className="pt-ats-stats">
        {stats.map((s) => (
          <div key={s.label} className={`pt-ats-stat ${hueClass(s.hue)}`}>
            <span className="pt-ats-stat__value">{s.value}</span>
            <span className="pt-ats-stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="pt-ats-toolbar">
        <div className="pt-tabs" role="tablist" style={{ borderBottom: 0, marginBottom: 0 }}>
          {JOB_TABS.map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className="pt-tabs__tab" onClick={() => setTab(t)}>
              {t}
              <span className="pt-tabs__count">{counts[t]}</span>
              {t === tab && <motion.span layoutId="tab-jobs" className="pt-tabs__rule" transition={tween(DUR.slow)} />}
            </button>
          ))}
        </div>
        <label className="pt-filter">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" aria-label="Search jobs" />
        </label>
      </div>

      <motion.div className="pt-ats-jobs" variants={list} initial="initial" animate="animate">
        {shown.map((r) => {
          const pool = d.candidates.filter((c) => c.roleId === r.id);
          const fresh = pool.filter((c) => c.appliedAt && c.appliedAt >= weekAgo).length;
          return (
            <motion.article key={r.id} variants={row} className="pt-ats-job">
              <div className="pt-ats-job__main">
                <div className="pt-ats-job__titlerow">
                  <button className="pt-ats-job__title" onClick={() => open(r.id)}>
                    {r.title}
                  </button>
                  <Badge kind={r.kind} label={r.status} />
                  <span style={{ flex: 1 }} />
                  <RowMenu
                    label={`Actions for ${r.title}`}
                    items={[
                      { label: "Open pipeline", onSelect: () => open(r.id) },
                      { label: "Edit job", onSelect: () => actions.editRole(r) },
                      { label: "Add candidate", onSelect: () => actions.addCandidate({ roleId: r.id }) },
                      ...ROLE_STATUSES.filter(([st]) => st !== r.status).map(([st]) => ({
                        label: st === "Published" ? "Publish" : `Set to ${st}`,
                        onSelect: () => void actions.patchRole(r, { status: st }),
                      })),
                      { label: "Delete job", danger: true, onSelect: () => void actions.withdrawRole(r) },
                    ]}
                  />
                </div>
                <div className="pt-ats-job__meta">
                  {[r.department, r.location, r.employmentType, `${r.openings} ${r.openings === 1 ? "opening" : "openings"}`, r.hiringManager && `Hiring manager ${r.hiringManager}`]
                    .filter(Boolean)
                    .join(" · ")}
                  {r.createdAt && <span> · created {relativeTime(r.createdAt)}</span>}
                </div>
              </div>
              <div className="pt-ats-job__stages" role="list" aria-label="Candidates by stage">
                {STAGES.map((st, i) => (
                  <button
                    key={st}
                    role="listitem"
                    className={`pt-ats-job__stage ${hueClass(STAGE_HUE[i]!)}${r.counts[i] ? "" : " is-zero"}`}
                    onClick={() => open(r.id, i)}
                    title={`${r.counts[i]} in ${st}`}
                  >
                    <span className="pt-ats-job__count">{r.counts[i]}</span>
                    <span className="pt-ats-job__stagename">{st}</span>
                  </button>
                ))}
              </div>
              <div className="pt-ats-job__side">
                <span className="pt-ats-job__total">{pool.length}</span>
                <span className="pt-dim">candidates</span>
                {fresh > 0 && <span className="pt-chip pt-hue-jacaranda">{fresh} new this week</span>}
              </div>
            </motion.article>
          );
        })}
        {shown.length === 0 && <div className="pt-kcol__empty" style={{ padding: 28 }}>No jobs match.</div>}
      </motion.div>
    </div>
  );
}

// ── Candidate profile ───────────────────────────────────────────────────────
const EVENT_ICON: Record<string, JSX.Element> = {
  created: <UserPlus size={13} />,
  stage: <ArrowRight size={13} />,
  comment: <MessageSquare size={13} />,
  evaluation: <Star size={13} />,
  disqualified: <Ban size={13} />,
  requalified: <CircleCheck size={13} />,
};
const EVENT_LABEL: Record<string, string> = {
  created: "Added",
  stage: "Stage change",
  comment: "Comment",
  evaluation: "Scorecard",
  disqualified: "Disqualified",
  requalified: "Requalified",
};

function EventItem({ c, ev, deletable }: { c: Candidate; ev: CandidateEvent; deletable: boolean }) {
  const actions = useActions();
  return (
    <li className={`pt-ats-event pt-ats-event--${ev.kind}`}>
      <span className="pt-ats-event__icon">{EVENT_ICON[ev.kind]}</span>
      <div className="pt-ats-event__body">
        <div className="pt-ats-event__head">
          <strong>{EVENT_LABEL[ev.kind]}</strong>
          {ev.kind === "evaluation" && (
            <>
              <Stars value={ev.score} size={12} />
              {ev.verdict && <span className={`pt-chip ${ev.verdict === "No hire" ? "pt-hue-clay" : "pt-hue-euc"}`}>{ev.verdict}</span>}
            </>
          )}
          <span className="pt-meta" style={{ marginLeft: "auto" }}>
            {initialsOf(ev.actor) || "—"} · {relativeTime(ev.at)}
          </span>
          {deletable && ev.id > 0 && (
            <button className="pt-iconbtn pt-iconbtn--sm pt-ats-event__del" aria-label={`Delete ${ev.kind}`} onClick={() => void actions.deleteCandidateEvent(c, ev)}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {ev.body && <p>{ev.body}</p>}
      </div>
    </li>
  );
}

function Scorecard({ c }: { c: Candidate }) {
  const actions = useActions();
  const [score, setScore] = useState(0);
  const [verdict, setVerdict] = useState<string>("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!score || !verdict) return;
    setBusy(true);
    const ok = await actions.evaluateCandidate(c, { score, verdict, body });
    setBusy(false);
    if (ok) (setScore(0), setVerdict(""), setBody(""));
  };
  return (
    <div className="pt-ats-card">
      <div className="pt-ats-card__title">Add your scorecard</div>
      <div className="pt-ats-score">
        <StarInput value={score} onChange={setScore} />
        <span className="pt-seg" role="radiogroup" aria-label="Verdict">
          {VERDICTS.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={verdict === v} className={`pt-seg__btn ${v === "No hire" ? "pt-hue-clay" : "pt-hue-euc"}`} onClick={() => setVerdict(v)}>
              {v}
            </button>
          ))}
        </span>
      </div>
      <textarea className="pt-edit pt-ats-textarea" rows={3} placeholder="Strengths, concerns, licence and reference notes…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Scorecard notes" />
      <div className="pt-ats-card__foot">
        <span className="pt-dim" style={{ fontSize: 12 }}>
          {!score || !verdict ? "Pick a score and a verdict." : ""}
        </span>
        <button className="sds-btn sds-btn--sm sds-btn--primary" disabled={!score || !verdict || busy} onClick={() => void submit()}>
          Submit scorecard
        </button>
      </div>
    </div>
  );
}

function CommentBox({ c }: { c: Candidate }) {
  const actions = useActions();
  const [body, setBody] = useState("");
  const post = async () => {
    const t = body.trim();
    if (!t) return;
    setBody("");
    if (!(await actions.commentCandidate(c, t))) setBody(t);
  };
  return (
    <div className="pt-ats-card pt-ats-comment">
      <textarea
        className="pt-edit pt-ats-textarea"
        rows={2}
        placeholder="Leave a comment for the hiring team…  (Ctrl/⌘ + Enter to post)"
        aria-label="Comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void post();
          }
        }}
      />
      <div className="pt-ats-card__foot">
        <span />
        <button className="sds-btn sds-btn--sm sds-btn--primary" disabled={!body.trim()} onClick={() => void post()}>
          Comment
        </button>
      </div>
    </div>
  );
}

const PROFILE_TABS = ["Overview", "CV", "Timeline", "Scorecards", "Comments"] as const;

function CandidateProfile({ c, role }: { c: Candidate; role: Role }) {
  const actions = useActions();
  const d = usePortal();
  const [tab, setTab] = useState<(typeof PROFILE_TABS)[number]>("Overview");
  useEffect(() => setTab("Overview"), [c.id]);
  const evals = c.events.filter((e) => e.kind === "evaluation");
  const comments = c.events.filter((e) => e.kind === "comment");
  const next = c.stage < HIRED_STAGE ? c.stage + 1 : null;
  const hue = STAGE_HUE[c.stage]!;
  const verdicts = VERDICTS.map((v) => [v, evals.filter((e) => e.verdict === v).length] as const);
  const tabCount: Record<string, number | undefined> = { CV: c.files.length || undefined, Scorecards: evals.length, Comments: comments.length };

  return (
    <motion.div key={c.id} className="pt-ats-profile" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0, transition: tween(DUR.base) }}>
      <header className="pt-ats-profile__head">
        <Avatar initials={initials(c.name)} size={48} title={c.name} />
        <div className="pt-ats-profile__who">
          <h2>{c.name}</h2>
          <div className="pt-ats-profile__headline">{c.headline || "No headline"}</div>
          <div className="pt-ats-profile__facts">
            {[c.location, c.source && `via ${c.source}`, c.appliedAt && `added ${relativeTime(c.appliedAt)}`].filter(Boolean).join(" · ")}
          </div>
          <div className="pt-ats-profile__contact">
            {c.email && (
              <a href={`mailto:${c.email}`} className="pt-ats-link">
                <Mail size={13} /> {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="pt-ats-link">
                <Phone size={13} /> {c.phone}
              </a>
            )}
          </div>
        </div>
        <div className="pt-ats-profile__rating">
          <Stars value={c.rating} size={15} />
          <span className="pt-meta">{c.rating ? `${c.rating} · ${evals.length} ${evals.length === 1 ? "scorecard" : "scorecards"}` : "Not rated"}</span>
        </div>
        <RowMenu
          label={`More actions for ${c.name}`}
          items={[
            { label: "Edit profile", onSelect: () => actions.editCandidate(c) },
            { label: "Delete candidate", danger: true, onSelect: () => void actions.deleteCandidate(c) },
          ]}
        />
      </header>

      {c.disqualified ? (
        <div className="pt-ats-dq" role="status">
          <Ban size={15} />
          <span>
            Disqualified{c.disqualifyReason ? ` — ${c.disqualifyReason}` : ""}
          </span>
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => void actions.requalifyCandidate(c)}>
            Requalify
          </button>
        </div>
      ) : (
        <div className="pt-ats-actions">
          <label className={`pt-ats-stagepick ${hueClass(hue)}`}>
            <span className="pt-chip__dot" />
            <select value={c.stage} aria-label="Stage" onChange={(e) => void actions.moveCandidate(c, Number(e.target.value))}>
              {STAGES.map((st, i) => (
                <option key={st} value={i}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          {next !== null && (
            <button className="sds-btn sds-btn--sm sds-btn--primary pt-ats-next" onClick={() => void actions.moveCandidate(c, next)}>
              Move to {STAGES[next]} <ArrowRight size={14} />
            </button>
          )}
          <span style={{ flex: 1 }} />
          <DisqualifyMenu c={c} />
        </div>
      )}

      <ol className="pt-ats-stepper" aria-label="Pipeline progress">
        {STAGES.map((st, i) => (
          <li key={st} className={`${hueClass(STAGE_HUE[i]!)}${i < c.stage ? " is-past" : ""}${i === c.stage ? " is-current" : ""}`}>
            <span className="pt-ats-stepper__bar" />
            <span className="pt-ats-stepper__label">{st}</span>
          </li>
        ))}
      </ol>

      <div className="pt-tabs" role="tablist">
        {PROFILE_TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className="pt-tabs__tab" onClick={() => setTab(t)}>
            {t}
            {tabCount[t] !== undefined && <span className="pt-tabs__count">{tabCount[t]}</span>}
            {t === tab && <motion.span layoutId={`tab-cand-${role.id}`} className="pt-tabs__rule" transition={tween(DUR.slow)} />}
          </button>
        ))}
      </div>

      <div className="pt-ats-profile__body">
        {tab === "Overview" && (
          <>
            <dl className="pt-ats-facts">
              <dt>Job</dt>
              <dd>{role.title}</dd>
              <dt>Stage</dt>
              <dd>
                {STAGES[c.stage]} <span className="pt-dim">· {c.days === 0 ? "since today" : `${c.days} ${c.days === 1 ? "day" : "days"}`}</span>
              </dd>
              <dt>Licence</dt>
              <dd style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LicenceTag c={c} />
                {!c.ok && (
                  <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => actions.editCandidate(c)}>
                    Mark as verified
                  </button>
                )}
              </dd>
              <dt>Email</dt>
              <dd>{c.email || <span className="pt-dim">—</span>}</dd>
              <dt>Phone</dt>
              <dd className="pt-mono">{c.phone || <span className="pt-dim">—</span>}</dd>
              <dt>Location</dt>
              <dd>{c.location || <span className="pt-dim">—</span>}</dd>
              <dt>CV</dt>
              <dd>
                {c.files[0] ? (
                  <button className="pt-ats-link pt-ats-cvlink" onClick={() => setTab("CV")}>
                    <Paperclip size={13} /> {c.files[0].filename} <span className="pt-dim">· {fileSize(c.files[0].size)}</span>
                  </button>
                ) : (
                  <span className="pt-dim">None on file</span>
                )}
              </dd>
              <dt>Source</dt>
              <dd>{c.source || <span className="pt-dim">—</span>}</dd>
              <dt>Added</dt>
              <dd>{c.appliedAt ? friendlyDate(c.appliedAt.slice(0, 10), d.today) : <span className="pt-dim">—</span>}</dd>
            </dl>
            {comments[0] && (
              <div className="pt-ats-latest">
                <div className="pt-deps__label">Latest comment</div>
                <p>“{comments[0].body}”</p>
              </div>
            )}
          </>
        )}
        {tab === "CV" && <CvPanel files={c.files} name={c.name} />}
        {tab === "Timeline" && (
          <ul className="pt-ats-timeline">
            {c.events.map((ev) => (
              <EventItem key={ev.id} c={c} ev={ev} deletable={false} />
            ))}
            {c.events.length === 0 && <li className="pt-dim">Nothing yet.</li>}
          </ul>
        )}
        {tab === "Scorecards" && (
          <>
            {evals.length > 0 && (
              <div className="pt-ats-summary">
                <div>
                  <span className="pt-ats-summary__big">{c.rating}</span>
                  <Stars value={c.rating} size={15} />
                </div>
                <div className="pt-ats-summary__verdicts">
                  {verdicts.map(([v, n]) => (
                    <span key={v} className={`pt-chip ${v === "No hire" ? "pt-hue-clay" : "pt-hue-euc"}`}>
                      {v} · {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Scorecard c={c} />
            <ul className="pt-ats-timeline">
              {evals.map((ev) => (
                <EventItem key={ev.id} c={c} ev={ev} deletable />
              ))}
            </ul>
          </>
        )}
        {tab === "Comments" && (
          <>
            <CommentBox c={c} />
            <ul className="pt-ats-timeline">
              {comments.map((ev) => (
                <EventItem key={ev.id} c={c} ev={ev} deletable />
              ))}
              {comments.length === 0 && <li className="pt-dim" style={{ fontSize: 13 }}>No comments yet.</li>}
            </ul>
          </>
        )}
      </div>
    </motion.div>
  );
}

const fileUrl = (f: CandidateFile, download = false) => `/api/files/${f.id}${download ? "?download=1" : ""}`;
const isPdf = (f: CandidateFile) => /^application\/pdf\b/i.test(f.mime);
const canPreview = (f: CandidateFile) => isPdf(f) || /^image\/(png|jpeg|gif|webp)\b/i.test(f.mime);

/** The CV shown in place, like a résumé tab in an ATS, with any older files listed underneath. */
function CvPanel({ files, name }: { files: CandidateFile[]; name: string }) {
  const [shownId, setShownId] = useState(files[0]?.id);
  const shown = files.find((f) => f.id === shownId) ?? files[0];
  if (!shown) {
    return (
      <div className="pt-ats-cv__none">
        <FileText size={20} />
        <p>No CV on file.</p>
        <span className="pt-dim">CVs sent through the careers page appear here automatically.</span>
      </div>
    );
  }
  return (
    <div className="pt-ats-cv">
      <div className="pt-ats-cv__bar">
        <FileText size={16} className="pt-ats-cv__icon" />
        <span className="pt-ats-cv__name">
          <span className="pt-ats-cv__file" title={shown.filename}>
            {shown.filename}
          </span>
          <span className="pt-meta">
            {fileSize(shown.size)} · received {relativeTime(shown.uploadedAt)}
          </span>
        </span>
        <a className="sds-btn sds-btn--sm sds-btn--secondary" href={fileUrl(shown)} target="_blank" rel="noopener">
          <ExternalLink size={14} /> Open
        </a>
        <a className="sds-btn sds-btn--sm sds-btn--ghost" href={fileUrl(shown, true)} download={shown.filename}>
          <Download size={14} /> Download
        </a>
      </div>
      {canPreview(shown) ? (
        isPdf(shown) ? (
          <iframe key={shown.id} className="pt-ats-cv__frame" src={`${fileUrl(shown)}#view=FitH&navpanes=0`} title={`CV for ${name}`} />
        ) : (
          <img className="pt-ats-cv__img" src={fileUrl(shown)} alt={`CV for ${name}`} />
        )
      ) : (
        <div className="pt-ats-cv__none">
          <p>This file type can’t be previewed here.</p>
          <span className="pt-dim">Download it to open in Word or another app.</span>
        </div>
      )}
      {files.length > 1 && (
        <div>
          <div className="pt-deps__label">All files</div>
          <ul className="pt-ats-cv__list">
            {files.map((f) => (
              <li key={f.id}>
                <button className={`pt-ats-link${f.id === shown.id ? " is-current" : ""}`} aria-current={f.id === shown.id} onClick={() => setShownId(f.id)}>
                  <Paperclip size={13} /> {f.filename}
                </button>
                <span className="pt-meta">
                  {fileSize(f.size)} · {relativeTime(f.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DisqualifyMenu({ c }: { c: Candidate }) {
  const actions = useActions();
  return (
    <RowMenu
      label={`Disqualify ${c.name}`}
      triggerClass="sds-btn sds-btn--sm sds-btn--ghost pt-danger-link pt-ats-dqbtn"
      trigger={
        <>
          <Ban size={14} /> Disqualify
        </>
      }
      items={DISQUALIFY_REASONS.map((r) => ({ label: r, onSelect: () => void actions.disqualifyCandidate(c, r), danger: true }))}
    />
  );
}

// ── Job view ─────────────────────────────────────────────────────────────────
function JobView({ role }: { role: Role }) {
  const d = usePortal();
  const actions = useActions();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [q, setQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const stageParam = params.get("stage");
  const stage: number | "all" | "dq" = stageParam === "dq" ? "dq" : stageParam && /^\d$/.test(stageParam) ? Number(stageParam) : "all";
  const candId = Number(params.get("candidate")) || null;

  const pool = d.candidates.filter((c) => c.roleId === role.id);
  const active = pool.filter((c) => !c.disqualified);
  const inView = (stage === "dq" ? pool.filter((c) => c.disqualified) : stage === "all" ? active : active.filter((c) => c.stage === stage)).filter((c) =>
    matches(q, c.name, c.headline, c.email, c.source, c.location)
  );
  const selected = pool.find((c) => c.id === candId) ?? (view === "list" ? inView[0] : undefined);

  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v);
      return n;
    });

  const pickStage = (s: number | "all" | "dq") => set({ stage: s === "all" ? null : String(s), candidate: null });
  // The pipeline opens profiles in a drawer, so don't carry a list selection across (it would pop open).
  const switchView = (v: "list" | "pipeline") => {
    if (v === view) return;
    if (v === "pipeline") set({ candidate: null });
    setView(v);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nextC = inView[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (nextC) {
      set({ candidate: String(nextC.id) });
      (document.querySelector(`[data-cand="${nextC.id}"]`) as HTMLElement | null)?.focus();
    }
  };

  return (
    <div className="pt-ats">
      <div className="pt-ats-jobhead">
        <button className="pt-ats-back" onClick={() => set({ role: null, stage: null, candidate: null })}>
          <ArrowLeft size={14} /> All jobs
        </button>
        <div className="pt-ats-jobhead__row">
          <div style={{ minWidth: 0 }}>
            <h2 className="pt-ats-jobhead__title">{role.title}</h2>
            <div className="pt-ats-job__meta">
              {[role.department, role.location, role.employmentType, `${role.openings} ${role.openings === 1 ? "opening" : "openings"}`, role.hiringManager && `Hiring manager ${role.hiringManager}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <label className={`pt-ats-state ${hueClass(role.kind === "secure" ? "euc" : role.kind === "advisory" ? "ochre" : role.kind === "info" ? "jacaranda" : "slate")}`}>
            <span className="pt-chip__dot" />
            <select value={role.status} aria-label="Job state" onChange={(e) => void actions.patchRole(role, { status: e.target.value })}>
              {ROLE_STATUSES.map(([st]) => (
                <option key={st}>{st}</option>
              ))}
            </select>
          </label>
          <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.editRole(role)}>
            Edit job
          </button>
          <button className="sds-btn sds-btn--sm sds-btn--primary" onClick={() => actions.addCandidate({ roleId: role.id, stage: typeof stage === "number" ? stage : 1 })}>
            <Plus size={14} /> Add candidate
          </button>
        </div>
      </div>

      <nav className="pt-ats-pipebar" aria-label="Pipeline stages">
        <button className={`pt-ats-pipebar__all${stage === "all" ? " is-active" : ""}`} onClick={() => pickStage("all")}>
          <span className="pt-ats-pipebar__n">{active.length}</span>
          <span>All active</span>
        </button>
        {STAGES.map((st, i) => (
          <button key={st} className={`pt-ats-pipebar__seg ${hueClass(STAGE_HUE[i]!)}${stage === i ? " is-active" : ""}`} onClick={() => pickStage(i)}>
            <span className="pt-ats-pipebar__n">{role.counts[i]}</span>
            <span>{st}</span>
          </button>
        ))}
        <button className={`pt-ats-pipebar__dq${stage === "dq" ? " is-active" : ""}`} onClick={() => pickStage("dq")}>
          <span className="pt-ats-pipebar__n">{role.disqualified}</span>
          <span>Disqualified</span>
        </button>
      </nav>

      <div className="pt-ats-toolbar">
        <label className="pt-filter">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates" aria-label="Search candidates" />
        </label>
        <span style={{ flex: 1 }} />
        <span className="pt-seg" role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={view === "list"} className="pt-seg__btn pt-hue-slate" onClick={() => switchView("list")}>
            <ListIcon size={14} /> List
          </button>
          <button type="button" role="radio" aria-checked={view === "pipeline"} className="pt-seg__btn pt-hue-slate" onClick={() => switchView("pipeline")}>
            <Columns3 size={14} /> Pipeline
          </button>
        </span>
      </div>

      {view === "list" ? (
        <div className="pt-ats-split">
          <div className="pt-ats-list" role="listbox" aria-label="Candidates">
            {inView.map((c, i) => (
              <button
                key={c.id}
                role="option"
                aria-selected={selected?.id === c.id}
                data-cand={c.id}
                className={`pt-ats-row${selected?.id === c.id ? " is-selected" : ""}`}
                onClick={() => set({ candidate: String(c.id) })}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Avatar initials={initials(c.name)} size={34} />
                <span className="pt-ats-row__main">
                  <span className="pt-ats-row__name">
                    {c.name}
                    {c.files.length > 0 && <Paperclip size={12} className="pt-ats-row__clip" aria-label="CV on file" />}
                  </span>
                  <span className="pt-ats-row__sub">{c.headline || c.lic}</span>
                </span>
                <span className="pt-ats-row__side">
                  {stage === "all" || stage === "dq" ? (
                    <span className={`pt-chip ${hueClass(c.disqualified ? "clay" : STAGE_HUE[c.stage]!)}`}>{c.disqualified ? "Disqualified" : STAGES[c.stage]}</span>
                  ) : (
                    <span className="pt-meta">{c.days}d in stage</span>
                  )}
                  <Stars value={c.rating} size={11} />
                </span>
              </button>
            ))}
            {inView.length === 0 && (
              <div className="pt-ats-none">
                {q ? "No candidates match." : stage === "dq" ? "Nobody has been disqualified." : "No candidates here yet."}
                {!q && stage !== "dq" && (
                  <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => actions.addCandidate({ roleId: role.id, stage: typeof stage === "number" ? stage : 1 })}>
                    Add candidate
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="pt-ats-detail">
            <AnimatePresence mode="wait">
              {selected ? (
                <CandidateProfile key={selected.id} c={selected} role={role} />
              ) : (
                <div className="pt-ats-none" style={{ height: "100%" }}>
                  Select a candidate to see their profile.
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <>
          <LayoutGroup>
            <div className="pt-kanban pt-ats-kanban">
              {STAGES.map((label, i) => {
                const cards = active.filter((c) => c.stage === i && matches(q, c.name, c.headline, c.email, c.source));
                return (
                  <section key={label} className={`pt-kcol ${hueClass(STAGE_HUE[i]!)}${over === String(i) ? " is-over" : ""}`} data-drop={i} aria-label={`${label}, ${cards.length} candidates`}>
                    <header className="pt-kcol__head">
                      <span className="pt-kcol__swatch" aria-hidden />
                      <h3 className="pt-kcol__title">{label}</h3>
                      <span className="pt-kcol__count">{cards.length}</span>
                      <span style={{ flex: 1 }} />
                      <button className="pt-iconbtn pt-iconbtn--sm" aria-label={`Add candidate at ${label}`} onClick={() => actions.addCandidate({ roleId: role.id, stage: i })}>
                        <Plus size={15} />
                      </button>
                    </header>
                    <div className="pt-kcol__list">
                      {cards.map((c) => (
                        <DragCard
                          key={c.id}
                          id={`cand-${c.id}`}
                          label={`${c.name}, ${label}. Drag to another stage, or press Enter to open.`}
                          className="pt-tcard pt-ats-kcard"
                          onHover={(p: DropPoint | null) => setOver(p?.target ?? null)}
                          onDrop={(p) => void actions.moveCandidate(c, Number(p.target))}
                          onOpen={() => set({ candidate: String(c.id) })}
                        >
                          <div className="pt-ats-kcard__top">
                            <Avatar initials={initials(c.name)} size={28} />
                            <div style={{ minWidth: 0 }}>
                              <div className="pt-ats-row__name">{c.name}</div>
                              <div className="pt-ats-row__sub">{c.headline}</div>
                            </div>
                          </div>
                          <div className="pt-ats-kcard__foot">
                            <LicenceTag c={c} />
                            <span style={{ flex: 1 }} />
                            <Stars value={c.rating} size={11} />
                            <span className="pt-meta" title="Days in this stage">
                              {c.days}d
                            </span>
                          </div>
                        </DragCard>
                      ))}
                      {cards.length === 0 && <div className="pt-kcol__empty">Drop candidates here</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          </LayoutGroup>
          <Drawer open={!!candId && !!selected} onClose={() => set({ candidate: null })} eyebrow={`${role.title}`} title={selected?.name ?? ""} width={720}>
            {selected && <CandidateProfile c={selected} role={role} />}
          </Drawer>
        </>
      )}
    </div>
  );
}

export function RecruitmentPage() {
  const d = usePortal();
  const [params] = useSearchParams();
  const roleId = Number(params.get("role")) || null;
  const role = useMemo(() => d.roles.find((r) => r.id === roleId), [d.roles, roleId]);
  return role ? <JobView role={role} /> : <JobsList today={d.today} />;
}
