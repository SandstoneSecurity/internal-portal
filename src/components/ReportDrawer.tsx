import { useEffect, useId, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, ExternalLink, Lightbulb } from "lucide-react";
import { ApiError, send } from "../lib/api";
import { moduleFor } from "../lib/modules";
import { Drawer } from "./ui/Overlay";
import { useToast } from "./ui/Toast";

export type ReportKind = "bug" | "feature";
type Impact = "Low" | "Medium" | "High";

const COPY = {
  bug: {
    title: "Report a bug",
    summary: "What's wrong?",
    summaryHint: "e.g. The floor plan won't upload on the Annex site",
    details: "What happened?",
    detailsHint: "What you did, step by step, and what went wrong. Paste any error message.",
    impact: "How much is it getting in the way?",
    impacts: { Low: "A minor annoyance", Medium: "Slows me down", High: "Stops my work" },
    submit: "File bug",
  },
  feature: {
    title: "Request a feature",
    summary: "What would you like?",
    summaryHint: "e.g. Export the threat register to PDF",
    details: "Why would it help?",
    detailsHint: "What you're trying to do, how you do it today, and what would be better.",
    impact: "How much would it help?",
    impacts: { Low: "Nice to have", Medium: "Would save time", High: "Needed for my work" },
    submit: "Send request",
  },
} as const;

/** "Chrome 140 on macOS", from the user agent: enough to reproduce, nothing more. */
function browserName(): string {
  const ua = navigator.userAgent;
  const pick = (re: RegExp, name: string) => {
    const m = ua.match(re);
    return m ? `${name} ${m[1]}` : null;
  };
  const name =
    pick(/Edg\/(\d+)/, "Edge") ?? pick(/Firefox\/(\d+)/, "Firefox") ?? pick(/Chrome\/(\d+)/, "Chrome") ?? (/Safari\//.test(ua) ? pick(/Version\/(\d+)/, "Safari") : null) ?? "Unknown browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${name} on ${os}` : name;
}

/** Where reports go (from the server), and whether GitHub is connected. */
type Destination = { repo: string; project: string; connected: boolean };

/**
 * Report a bug or ask for a feature from anywhere in the portal. It opens an issue on GitHub and adds it
 * to the portal's GitHub Project, with the page it came from and the browser attached.
 */
export function ReportDrawer({ kind: opened, onClose }: { kind: ReportKind | null; onClose: () => void }) {
  const toast = useToast();
  const { pathname, search } = useLocation();
  const formId = useId();
  const [kind, setKind] = useState<ReportKind>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [expected, setExpected] = useState("");
  const [impact, setImpact] = useState<Impact>("Medium");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where it was raised from, fixed when the drawer opens.
  const [where, setWhere] = useState({ module: "", page: "", browser: "", screen: "" });
  const [dest, setDest] = useState<Destination | null>(null);

  useEffect(() => {
    if (!opened) return;
    setKind(opened);
    setErrors({});
    setFormError(null);
    setBusy(false);
    setWhere({ module: moduleFor(pathname), page: (pathname + search).slice(0, 300), browser: browserName(), screen: `${window.innerWidth}×${window.innerHeight}` });
    fetch("/api/feedback", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Destination>) : null))
      .then((d) => d && setDest(d))
      .catch(() => undefined);
    // What was typed stays if the drawer is closed by accident; it's cleared once filed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const c = COPY[kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const missing: Record<string, string> = {};
    if (!title.trim()) missing.title = "Required";
    if (!details.trim()) missing.details = "Required";
    if (Object.keys(missing).length) {
      setErrors(missing);
      setFormError("Some fields need attention.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const r = await send<{ number: number; url: string; project: { title: string; url: string } | null; warning: string | null }>("POST", "/feedback", {
        kind,
        title,
        details,
        expected: kind === "bug" ? expected : "",
        impact,
        ...where,
      });
      toast({
        title: `Issue #${r.number} filed`,
        desc: r.warning ?? `${kind === "bug" ? "Bug" : "Feature request"} added to the ${r.project?.title ?? "project"} project on GitHub.`,
        kind: r.warning ? "advisory" : "secure",
        action: { label: "Open in GitHub", run: () => window.open(r.url, "_blank", "noopener") },
      });
      setTitle("");
      setDetails("");
      setExpected("");
      setImpact("Medium");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else setFormError((err as Error).message || "Couldn't file that.");
      setBusy(false);
    }
  };

  const field = (name: string) => ({
    id: `${formId}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${formId}-${name}-note` : undefined,
  });
  const note = (name: string) =>
    errors[name] && (
      <span className="pt-field__error" id={`${formId}-${name}-note`}>
        {errors[name]}
      </span>
    );
  const cls = (name: string) => `pt-input${errors[name] ? " pt-input--invalid" : ""}`;

  return (
    <Drawer
      open={!!opened}
      onClose={onClose}
      eyebrow="Internal portal"
      title={c.title}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button type="button" className="sds-btn sds-btn--md sds-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="sds-btn sds-btn--md sds-btn--primary" disabled={busy || dest?.connected === false} aria-busy={busy}>
            {busy ? <span className="pt-spinner" aria-hidden /> : null}
            {c.submit}
          </button>
        </>
      }
    >
      <form id={formId} className="pt-form pt-report" onSubmit={submit} noValidate>
        <div className="pt-seg pt-report__kind" role="radiogroup" aria-label="Kind of report">
          {(
            [
              ["bug", "Bug", Bug],
              ["feature", "Feature idea", Lightbulb],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="pt-seg__btn pt-hue-brass" onClick={() => setKind(k)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {dest?.connected === false && (
          <div className="pt-form__intro" role="status">
            GitHub isn't connected to the portal yet, so this can't be filed. Ask an admin to add the GitHub token.
          </div>
        )}
        {formError && (
          <div className="pt-form__error" role="alert">
            {formError}
          </div>
        )}
        <div className="pt-form__grid">
          <div className="pt-field">
            <label className="pt-field__label" htmlFor={`${formId}-title`}>
              {c.summary}
              <span className="pt-field__req" aria-hidden>
                {" "}
                *
              </span>
            </label>
            <input
              {...field("title")}
              data-autofocus
              className={cls("title")}
              maxLength={110}
              placeholder={c.summaryHint}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((x) => ({ ...x, title: "" }));
              }}
            />
            {note("title")}
          </div>
          <div className="pt-field">
            <label className="pt-field__label" htmlFor={`${formId}-details`}>
              {c.details}
              <span className="pt-field__req" aria-hidden>
                {" "}
                *
              </span>
            </label>
            <textarea
              {...field("details")}
              className={`${cls("details")} pt-textarea`}
              rows={5}
              maxLength={4000}
              placeholder={c.detailsHint}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                setErrors((x) => ({ ...x, details: "" }));
              }}
            />
            {note("details")}
          </div>
          {kind === "bug" && (
            <div className="pt-field">
              <label className="pt-field__label" htmlFor={`${formId}-expected`}>
                What did you expect instead?
              </label>
              <textarea
                {...field("expected")}
                className={`${cls("expected")} pt-textarea`}
                rows={2}
                maxLength={2000}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
              {note("expected")}
            </div>
          )}
          <fieldset className="pt-field pt-report__impact">
            <legend className="pt-field__label">{c.impact}</legend>
            <div className="pt-seg" role="radiogroup" aria-label={c.impact}>
              {(["Low", "Medium", "High"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={impact === k} className={`pt-seg__btn ${k === "High" ? "pt-hue-clay" : k === "Medium" ? "pt-hue-ochre" : "pt-hue-slate"}`} onClick={() => setImpact(k)}>
                  {c.impacts[k]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <dl className="pt-report__context">
          <dt>Filed as</dt>
          <dd>
            A GitHub issue{dest ? <> in <span className="pt-mono">{dest.repo}</span>, added to the <b>{dest.project}</b> project</> : " on the portal's GitHub Project"}
            {dest && (
              <a className="pt-report__gh" href={`https://github.com/${dest.repo}/issues`} target="_blank" rel="noopener noreferrer" aria-label="Open the issues on GitHub">
                <ExternalLink size={12} />
              </a>
            )}
          </dd>
          <dt>Attached</dt>
          <dd className="pt-mono">
            {[where.module, where.page].filter(Boolean).join(" · ")}
            <br />
            {where.browser} · {where.screen}
          </dd>
        </dl>
      </form>
    </Drawer>
  );
}
